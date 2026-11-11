/**
 * Opening and saving behavior block files.
 *
 * Saved files are Blockly's JSON workspace format, so they open in SoarBlocks and other Blockly
 * tools too. Opening also accepts Blockly XML, and upgrades SoarBlocks workspaces: each old
 * preference block becomes the priority on the Operator it names.
 */
import * as Blockly from 'blockly';
import { BLOCKS, LEGACY_PREFERENCES } from './blocks';
import { soarName } from './soarGenerator';

interface BlockJson {
  type: string;
  fields?: Record<string, unknown>;
  next?: { block?: BlockJson };
  [key: string]: unknown;
}

interface WorkspaceJson {
  blocks?: { languageVersion?: number; blocks?: BlockJson[] };
  [key: string]: unknown;
}

export interface OpenedBlocks {
  state: WorkspaceJson;
  /** Plain-language notes about what changed while opening, for the student to read */
  notes: string[];
}

/** Turns Blockly XML into the JSON format by loading it into a workspace that isn't on screen */
function xmlToState(text: string): WorkspaceJson {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(text), workspace);
    return Blockly.serialization.workspaces.save(workspace) as WorkspaceJson;
  } finally {
    workspace.dispose();
  }
}

/** Follows a stack of blocks joined top to bottom */
function stack(first: BlockJson): BlockJson[] {
  const blocks: BlockJson[] = [];
  for (let block: BlockJson | undefined = first; block; block = block.next?.block) blocks.push(block);
  return blocks;
}

/** Joins blocks back into one stack, keeping the first block's place on the canvas */
function restack(blocks: BlockJson[]): BlockJson {
  const copies = blocks.map(({ next: _next, ...rest }) => ({ ...rest }) as BlockJson);
  for (let i = 0; i < copies.length - 1; i++) copies[i].next = { block: copies[i + 1] };
  return { ...copies[0], x: blocks[0].x, y: blocks[0].y };
}

/**
 * Moves SoarBlocks preference blocks onto the Operators they name. A preference that can't move
 * (reject, or no Operator by that name) stays on the canvas, where it says what to do instead.
 */
export function upgradeSoarBlocks(state: WorkspaceJson): OpenedBlocks {
  const topBlocks = state.blocks?.blocks || [];
  const operators = new Map<string, BlockJson>();
  topBlocks
    .filter((b) => b.type === 'soar_propose_operator')
    .forEach((b) => operators.set(soarName(String(b.fields?.propose_operator_name ?? ''), 'operator'), b));

  const notes: string[] = [];
  const kept: BlockJson[] = [];
  for (const top of topBlocks) {
    if (top.type !== 'soar_preference') {
      kept.push(top);
      continue;
    }
    const left = stack(top).filter((pref) => {
      const name = soarName(String(pref.fields?.OPERATOR_NAME ?? ''), 'operator');
      const type = String(pref.fields?.PREFERENCE_TYPE ?? 'ACCEPTABLE');
      const priority = LEGACY_PREFERENCES.find(([, value]) => value === type)?.[2];
      const operator = operators.get(name);
      if (operator && priority) {
        operator.fields = { ...operator.fields, PREFERENCE: priority };
        notes.push(`The “${name}” operator’s old preference is now its priority (${priority.toLowerCase()}).`);
        return false;
      }
      notes.push(
        priority
          ? `An old preference names “${name}”, but there is no Operator by that name. It was left on the canvas.`
          : `The old “reject” preference for “${name}” has no matching priority. It was left on the canvas.`,
      );
      return true;
    });
    if (left.length) kept.push(restack(left));
  }

  if (!state.blocks || notes.length === 0) return { state, notes };
  return { state: { ...state, blocks: { ...state.blocks, blocks: kept } }, notes };
}

/**
 * Reads a saved behavior file: Blockly JSON from SysMod or SoarBlocks, or Blockly XML.
 * Throws a plain-language error when the file isn't one of those.
 */
export function readBlocksFile(text: string): OpenedBlocks {
  const trimmed = text.trim();
  let state: WorkspaceJson;
  if (trimmed.startsWith('<')) {
    try {
      state = xmlToState(trimmed);
    } catch (error) {
      throw new Error(`This XML file isn't a Blockly workspace (${(error as Error).message}).`);
    }
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('This file is not JSON or Blockly XML.');
    }
    if (!parsed || typeof parsed !== 'object' || !('blocks' in parsed)) {
      throw new Error('This JSON file has no blocks in it.');
    }
    state = parsed as WorkspaceJson;
  }

  // Check every block type is one this editor has before touching the canvas. Blockly's own
  // blocks (loops, math) are registered too, but generate no Soar, so they count as unknown.
  const unknown = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    const record = value as Record<string, unknown>;
    if (typeof record.type === 'string' && !(record.type in BLOCKS)) unknown.add(record.type);
    Object.values(record).forEach(visit);
  };
  visit(state.blocks?.blocks);
  if (unknown.size) throw new Error(`This file uses blocks the Behavior editor doesn't have: ${[...unknown].join(', ')}.`);

  return upgradeSoarBlocks(state);
}

/** The editor's blocks, ready to write to a file */
export function writeBlocksFile(state: object | null): string {
  return `${JSON.stringify(state || { blocks: { languageVersion: 0, blocks: [] } }, null, 2)}\n`;
}
