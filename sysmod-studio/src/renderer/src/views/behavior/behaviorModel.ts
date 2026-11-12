/**
 * The behavior blocks as a small, Blockly-free model: the rules, their conditions and their
 * actions, exactly as soarGenerator.ts turns them into Soar. The reference simulator
 * (behaviorSimulator.ts) runs this model, and later phases compile it into AGREE and PRISM, so
 * every verification result talks about the same thing agent.soar does.
 *
 * It is built from Blockly's JSON (the saved editor state), the same way subsystemCommands is,
 * so it can run anywhere without the editor. It mirrors the generator's choices:
 *  - names go through soarName and values through soarValue
 *  - a missing device is "device" and a missing value is "true"
 *  - disabled blocks are skipped, and only blocks inside a rule count
 *  - an Apply block belongs to the Operator around it
 * See docs/verification/soar-semantics.md for how the model runs.
 */
import { soarName, soarValue } from './soarNames';

/** A constant as Soar sees it. Soar tells the int 1 and the float 1.0 apart */
export type SoarConstant = { kind: 'int'; value: number } | { kind: 'float'; value: number } | { kind: 'string'; value: string };

export type Comparison = '==' | '!=' | '>' | '<';

export interface Condition {
  /** Input-link attribute, such as beambreak8, or match.mode for the robot mode */
  input: string;
  comparison: Comparison;
  value: SoarConstant;
  /** "if not": true when no input matches */
  negated: boolean;
}

export type Action = { kind: 'command'; name: string; value: SoarConstant } | { kind: 'fact'; name: string; value: SoarConstant; remove: boolean };

export type Priority = 'NORMAL' | 'BEST' | 'WORST' | 'REQUIRE';

export interface ApplyRule {
  /** The operator name it tests, (<o> ^name ...); not the block it sits in */
  operator: string;
  name: string;
  conditions: Condition[];
  actions: Action[];
}

export interface Operator {
  name: string;
  priority: Priority;
  conditions: Condition[];
}

export interface Elaboration {
  name: string;
  conditions: Condition[];
  actions: Action[];
}

export interface BehaviorModel {
  operators: Operator[];
  /** Every apply rule; it fires for whichever selected operator has its operator name */
  applies: ApplyRule[];
  elaborations: Elaboration[];
  /** Things the model can't represent faithfully, in plain words */
  warnings: string[];
}

/** The robot mode condition reads this input-link path */
export const MODE_INPUT = 'match.mode';

interface BlockJson {
  type?: string;
  enabled?: boolean;
  disabledReasons?: string[];
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockJson }>;
  next?: { block?: BlockJson };
}

const isEnabled = (b: BlockJson): boolean => b.enabled !== false && !(b.disabledReasons && b.disabledReasons.length > 0);

/** A value as the generator writes it (soarValue), read back the way Soar's parser would */
export function soarConstant(raw: unknown): SoarConstant {
  const text = soarValue(raw == null ? '' : String(raw));
  if (/^-?\d+$/.test(text)) return { kind: 'int', value: Number(text) };
  if (/^-?\d+\.\d+$/.test(text)) return { kind: 'float', value: Number(text) };
  // |quoted| symbols are strings without the bars, with \| unescaped
  if (text.startsWith('|') && text.endsWith('|')) return { kind: 'string', value: text.slice(1, -1).replace(/\\\|/g, '|') };
  return { kind: 'string', value: text };
}

/** Follows a statement stack, skipping disabled blocks like Blockly's generator does */
function stack(first: BlockJson | undefined): BlockJson[] {
  const out: BlockJson[] = [];
  for (let b = first; b; b = b.next?.block) if (isEnabled(b)) out.push(b);
  return out;
}

/** A value input's block; a disabled one counts as missing, as in the generator */
const child = (b: BlockJson, input: string): BlockJson | undefined => {
  const c = b.inputs?.[input]?.block;
  return c && isEnabled(c) ? c : undefined;
};

/** A statement input's first block, disabled or not: stack() skips just the disabled ones */
const statement = (b: BlockJson, input: string): BlockJson | undefined => b.inputs?.[input]?.block;

/** The device block in an input, as the generator names it ("device" when it's missing) */
const deviceName = (b: BlockJson, input: string): string => {
  const d = child(b, input);
  return d ? soarName(String(d.fields?.hardware_input ?? ''), 'device') : 'device';
};

/** The value block in an input ("true" when it's missing) */
const valueOf = (b: BlockJson, input: string): SoarConstant => {
  const v = child(b, input);
  return v ? soarConstant(v.fields?.state) : soarConstant('true');
};

const COMPARISONS: Comparison[] = ['==', '!=', '>', '<'];

function conditions(first: BlockJson | undefined): Condition[] {
  return stack(first).flatMap((b): Condition[] => {
    if (b.type === 'soar_wme_condition' || b.type === 'soar_wme_negated_condition') {
      const op = String(b.fields?.Operator ?? '==');
      // The generator writes a whole number in a test as a decimal (soarTestValue)
      const value = valueOf(b, 'Value');
      return [{ input: deviceName(b, 'WorkingMemoryElement'), comparison: (COMPARISONS.includes(op as Comparison) ? op : '==') as Comparison, value: value.kind === 'int' ? { kind: 'float', value: value.value } : value, negated: b.type === 'soar_wme_negated_condition' }];
    }
    if (b.type === 'soar_state_check') {
      return [{ input: MODE_INPUT, comparison: '==', value: soarConstant(String(b.fields?.agent_state ?? '').toLowerCase()), negated: false }];
    }
    return [];
  });
}

function actions(first: BlockJson | undefined): Action[] {
  return stack(first).flatMap((b): Action[] => {
    if (b.type === 'soar_set_output') return [{ kind: 'command', name: deviceName(b, 'hardware_input'), value: valueOf(b, 'hardware_state') }];
    if (b.type === 'soar_wme_modify') return [{ kind: 'fact', name: deviceName(b, 'ATTRIBUTE'), value: valueOf(b, 'VALUE'), remove: b.fields?.ACTION_TYPE === 'REMOVE' }];
    return [];
  });
}

const PRIORITIES: Priority[] = ['NORMAL', 'BEST', 'WORST', 'REQUIRE'];

/** Builds the model from the editor's saved state (Blockly JSON) */
export function buildBehaviorModel(state: unknown): BehaviorModel {
  const top = ((state as { blocks?: { blocks?: BlockJson[] } } | null)?.blocks?.blocks || []).filter(isEnabled);
  const model: BehaviorModel = { operators: [], applies: [], elaborations: [], warnings: [] };
  const applyRule = (a: BlockJson, operator: string): ApplyRule => ({
    operator,
    name: soarName(String(a.fields?.apply_operator_name ?? ''), 'apply'),
    conditions: conditions(statement(a, 'apply_operator_conditions')),
    actions: actions(statement(a, 'apply_operator_actions')),
  });

  top.forEach((b) => {
    if (b.type === 'soar_propose_operator') {
      const priority = String(b.fields?.PREFERENCE ?? 'NORMAL');
      const name = soarName(String(b.fields?.propose_operator_name ?? ''), 'operator');
      model.operators.push({
        name,
        priority: (PRIORITIES.includes(priority as Priority) ? priority : 'NORMAL') as Priority,
        conditions: conditions(statement(b, 'LHS')),
      });
      stack(statement(b, 'RHS'))
        .filter((a) => a.type === 'soar_apply_rule')
        .forEach((a) => model.applies.push(applyRule(a, name)));
    } else if (b.type === 'soar_elaboration_rule') {
      model.elaborations.push({ name: soarName(String(b.fields?.ELAB_NAME ?? ''), 'elaboration'), conditions: conditions(statement(b, 'LHS')), actions: actions(statement(b, 'RHS')) });
    } else if (b.type === 'soar_apply_rule') {
      // An Apply block on its own tests an operator named "operator", the generator's fallback
      model.applies.push(applyRule(b, 'operator'));
    }
    // Loose conditions and actions generate nothing
  });

  // Soar ignores a production that duplicates one it already has, apart from its name ("Ignoring
  // ... because it is a duplicate of ..."), so only the first of identical rules runs. Order
  // matters: the same conditions or actions in another order make a different rule (checked
  // against Soar 9.6.5 by the duplicates-reordered conformance program)
  const signature = (conds: Condition[], acts: Action[], head: string): string =>
    `${head}|${conds.map((c) => JSON.stringify(c)).join(';')}|${acts.map((a) => JSON.stringify(a)).join(';')}`;
  const dedupe = <T>(rules: T[], key: (r: T) => string, describe: (r: T) => string): T[] => {
    const seen = new Map<string, T>();
    return rules.filter((r) => {
      const k = key(r);
      const first = seen.get(k);
      if (first) {
        model.warnings.push(`${describe(r)} does exactly what ${describe(first)} does, so Soar ignores it.`);
        return false;
      }
      seen.set(k, r);
      return true;
    });
  };
  model.operators = dedupe(model.operators, (o) => signature(o.conditions, [], `op:${o.name}:${o.priority}`), (o) => `Operator “${o.name}”`);
  model.applies = dedupe(model.applies, (a) => signature(a.conditions, a.actions, `apply:${a.operator}`), (a) => `Apply “${a.name}” in “${a.operator}”`);
  model.elaborations = dedupe(model.elaborations, (e) => signature(e.conditions, e.actions, 'elaborate'), (e) => `Elaborate “${e.name}”`);

  const names = model.operators.map((o) => o.name);
  names.filter((n, i) => names.indexOf(n) !== i).forEach((n) => model.warnings.push(`Two operators are named “${n}”. Soar treats their apply rules as belonging to both.`));
  if (model.operators.filter((o) => o.priority === 'REQUIRE').length > 1) {
    model.warnings.push('More than one operator is required. When two are proposed at once, Soar can’t pick either, and the behavior stalls.');
  }
  return model;
}

/** Every input-link attribute the rules test, with the constants they compare against */
export function testedInputs(model: BehaviorModel): Map<string, SoarConstant[]> {
  const found = new Map<string, SoarConstant[]>();
  const add = (c: Condition): void => {
    const list = found.get(c.input) || [];
    if (!list.some((v) => sameConstant(v, c.value))) list.push(c.value);
    found.set(c.input, list);
  };
  model.operators.forEach((o) => o.conditions.forEach(add));
  model.applies.forEach((a) => a.conditions.forEach(add));
  model.elaborations.forEach((e) => e.conditions.forEach(add));
  return found;
}

/** Soar symbol identity: the same type and the same value */
export const sameConstant = (a: SoarConstant, b: SoarConstant): boolean => a.kind === b.kind && a.value === b.value;
