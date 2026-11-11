/**
 * Subsystems: labeled frames on the architecture diagram, like "Intake" or "Drivetrain", that
 * group the devices inside them. A device belongs to a subsystem when it sits in the frame
 * (React Flow's parentId).
 *
 * One subsystem shows up in three places:
 *  - the behavior editor, as a device the Soar agent reads and commands (^io.input-link.intake,
 *    ^io.output-link.intake)
 *  - Robot.java and robot.py, as a subsystem class that owns its devices and has a setState
 *    method with one case for each command the agent sends it
 *  - the AADL model, where each device says which subsystem it is in
 */
import type { Node } from '@xyflow/react';
import type { FRCNodeData } from '../store/useRobotStore';
import { soarName, subsystemAttribute } from '../behavior/soarNames';

export const SUBSYSTEM_TYPE = 'Subsystem';
/** The React Flow node type that draws the frame */
export const SUBSYSTEM_NODE = 'SubsystemNode';

export const isSubsystem = (node: Pick<Node<FRCNodeData>, 'data'>): boolean => node.data?.deviceType === SUBSYSTEM_TYPE;

export interface SubsystemGroup {
  id: string;
  label: string;
  /** The Soar attribute, such as claw-arm */
  attribute: string;
  /** Java and Python class name, such as ClawArm */
  className: string;
  /** Java field, such as clawArm */
  javaField: string;
  /** Python attribute, such as claw_arm */
  pythonField: string;
  /** Ids of the devices in the frame, in diagram order */
  memberIds: string[];
  /** Commands the Soar agent sends this subsystem, in the order they first appear */
  commands: string[];
}

const JAVA_KEYWORDS = new Set(
  ('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if ' +
    'implements import instanceof int interface long native new package private protected public return short static strictfp super switch ' +
    'synchronized this throw throws transient try void volatile while true false null var record yield').split(' '),
);
const PYTHON_KEYWORDS = new Set(
  ('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda ' +
    'nonlocal not or pass raise return try while with yield self').split(' '),
);
// Class names already used in the generated files
const TAKEN_CLASSES = new Set(['Robot', 'MyRobot', 'TimedRobot', 'SubsystemBase', 'Subsystem', 'String', 'Object']);

const words = (label: string): string[] => label.split(/[^A-Za-z0-9]+/).filter(Boolean);
const pascal = (label: string): string => words(label).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

/** Makes a name unique against the names already taken, by adding 2, 3 and so on */
function unique(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${name}${i}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** A label nobody has used yet, for a new subsystem */
export function uniqueSubsystemLabel(nodes: Node<FRCNodeData>[], base = 'Subsystem'): string {
  const taken = new Set(nodes.filter(isSubsystem).map((n) => subsystemAttribute(n.data.label)));
  if (!taken.has(subsystemAttribute(base)) && base !== 'Subsystem') return base;
  for (let i = base === 'Subsystem' ? 1 : 2; ; i++) {
    const label = `${base} ${i}`;
    if (!taken.has(subsystemAttribute(label))) return label;
  }
}

/** The subsystem frames on the diagram, with their devices and the names generated code uses */
export function subsystemGroups(nodes: Node<FRCNodeData>[], behaviorState: unknown = null): SubsystemGroup[] {
  const commands = subsystemCommands(behaviorState);
  // Device ids are field names in the generated code too, so subsystems can't reuse them
  const deviceIds = nodes.filter((n) => !isSubsystem(n)).map((n) => n.id.toLowerCase());
  const classes = new Set([...TAKEN_CLASSES].map((c) => c.toLowerCase()));
  const javaFields = new Set(deviceIds);
  const pythonFields = new Set([...deviceIds, 'ph', 'compressor', 'limelight_table']);

  return nodes.filter(isSubsystem).map((frame) => {
    const label = frame.data.label?.trim() || 'Subsystem';
    let className = pascal(label) || 'Subsystem';
    if (/^\d/.test(className)) className = `Subsystem${className}`;
    if (JAVA_KEYWORDS.has(className.toLowerCase()) || PYTHON_KEYWORDS.has(className)) className = `${className}Subsystem`;
    className = unique(className, classes);
    let javaField = className[0].toLowerCase() + className.slice(1);
    if (JAVA_KEYWORDS.has(javaField)) javaField = `${javaField}Subsystem`;
    let pythonField = words(label).map((w) => w.toLowerCase()).join('_') || 'subsystem';
    if (/^\d/.test(pythonField) || PYTHON_KEYWORDS.has(pythonField)) pythonField = `subsystem_${pythonField}`;
    const attribute = subsystemAttribute(label);
    return {
      id: frame.id,
      label,
      attribute,
      className,
      javaField: unique(javaField, javaFields),
      pythonField: unique(pythonField, pythonFields),
      memberIds: nodes.filter((n) => n.parentId === frame.id && !isSubsystem(n)).map((n) => n.id),
      commands: commands.get(attribute) || [],
    };
  });
}

/** Which subsystem each device is in */
export function subsystemOfDevice(groups: SubsystemGroup[]): Map<string, SubsystemGroup> {
  const owner = new Map<string, SubsystemGroup>();
  groups.forEach((g) => g.memberIds.forEach((id) => owner.set(id, g)));
  return owner;
}

// ── Reading the behavior blocks (Blockly's JSON), without loading Blockly ──

interface BlockJson {
  type?: string;
  enabled?: boolean;
  disabledReasons?: string[];
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockJson }>;
  next?: { block?: BlockJson };
}

const RULE_TYPES = ['soar_propose_operator', 'soar_apply_rule', 'soar_elaboration_rule'];
const isEnabled = (b: BlockJson): boolean => b.enabled !== false && !(b.disabledReasons && b.disabledReasons.length > 0);

/**
 * Every value the Soar agent sets each device or subsystem to with a "set … to …" block, keyed by
 * attribute. Like the Soar generator, it skips blocks outside a rule and disabled blocks.
 */
export function subsystemCommands(state: unknown): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const visit = (block: BlockJson | undefined, inRule: boolean): void => {
    if (!block) return;
    if (isEnabled(block)) {
      if (block.type === 'soar_set_output' && inRule) {
        const device = block.inputs?.hardware_input?.block;
        if (device && isEnabled(device)) {
          const attribute = soarName(String(device.fields?.hardware_input ?? ''), 'device');
          const valueBlock = block.inputs?.hardware_state?.block;
          const value = valueBlock && isEnabled(valueBlock) ? String(valueBlock.fields?.state ?? '').trim() || 'true' : 'true';
          const list = found.get(attribute) || [];
          if (!list.includes(value)) list.push(value);
          found.set(attribute, list);
        }
      }
      const nowInRule = inRule || RULE_TYPES.includes(block.type || '');
      Object.values(block.inputs || {}).forEach((input) => visit(input.block, nowInRule));
    }
    visit(block.next?.block, inRule);
  };
  const blocks = (state as { blocks?: { blocks?: BlockJson[] } } | null)?.blocks?.blocks || [];
  blocks.forEach((b) => visit(b, false));
  return found;
}

/**
 * Renaming a subsystem changes its Soar attribute, so the behavior blocks that use the old name
 * are moved to the new one. Returns the same state when nothing used it.
 */
export function renameInBehavior<T>(state: T, from: string, to: string): T {
  if (!state || from === to) return state;
  let changed = false;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    Object.entries(record).forEach(([key, v]) => (copy[key] = walk(v)));
    const fields = copy.fields as Record<string, unknown> | undefined;
    if (copy.type === 'hardware_input' && fields?.hardware_input === from) {
      copy.fields = { ...fields, hardware_input: to };
      changed = true;
    }
    return copy;
  };
  const next = walk(state) as T;
  return changed ? next : state;
}
