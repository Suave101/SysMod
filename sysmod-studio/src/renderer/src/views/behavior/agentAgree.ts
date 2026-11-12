/**
 * Compiles a behavior model into an AADL Soar_Agent component whose AGREE annex says exactly what
 * the agent does in one robot loop, so JKind can prove facts about every run of agent.soar.
 *
 * One AGREE step is one robot loop, with the semantics of behaviorSimulator.ts (checked against
 * real Soar; see docs/verification/soar-semantics.md):
 *  - Each input the rules test is a pair of integers: its kind (absent, number or word) and a code
 *    that places the reading among the constants the rules compare it with. Odd codes are equal to
 *    a constant, even codes lie between two of them. Every test is then an integer comparison that
 *    gives the same answer Soar's compare_symbols would, so nothing is lost.
 *  - A reading that changes within the same gap (3500 → 3600) is a new WME to Soar, which makes
 *    rules fire again. A free input, <input>_changes, says whether that happened.
 *  - When equal operators tie, Soar picks at random. The free input "tie" names the choice, so a
 *    proof covers every choice ("any choice", not a probability).
 *  - Commands follow the bridge's cycle: done one loop later, then removed by the clear operator.
 *  - Each command value is an int constant; last_<device> is the last value the robot was sent.
 *    When one loop sends a device two values, the free input pick_<device> says which ran last.
 *
 * The robot sends numbers as decimals (setNumber), so a number reading is always a decimal.
 */
import { AgreeType, parseAgreeAnnex } from '../utils/agree/agreeParser';
import { ContractError, evaluateNumber, MathExpr, mathToLustre, Scope, toMath } from '../utils/agree/lustreGenerator';
import { Action, BehaviorModel, Condition, MODE_INPUT, sameConstant, soarConstant, SoarConstant } from './behaviorModel';
import { compareSymbols } from './behaviorSimulator';
import { soarName } from './soarNames';

import type { AgentProperty, CommandRef } from './agentProperties';
export type { AgentProperty, CommandRef };

export interface AgentObligation {
  /** The guarantee's name in the annex */
  name: string;
  description: string;
  template: AgentProperty['kind'];
  /** holds: "valid" is the good answer. reachable: "falsifiable" means yes, it can happen, and the counterexample shows how */
  expect: 'holds' | 'reachable';
}

export interface InputEncoding {
  attribute: string;
  /** Prefix of its AGREE names: <variable>_kind, <variable>_code, ... */
  variable: string;
  /** Number constants the rules compare it with, ascending */
  numbers: number[];
  /** Word constants, in Soar's (strcmp) order */
  words: string[];
  /** True when a rule tests it positively, so a changed reading can make rules fire again */
  tracked: boolean;
  /** What the robot can send, when the diagram says; without it the proof covers any value */
  domain?: ReadingDomain;
}

/**
 * What the robot can send for one reading, from the diagram (readingDomains in soarBridgeCode).
 * "Not sent" is always possible too: a reading only one language's code sends, or a loop before
 * the bridge has a value.
 */
export interface ReadingDomain {
  /** numbers: any decimal. words: only these words. none: the robot never sends it */
  kind: 'numbers' | 'words' | 'none';
  words?: string[];
  /** Where it comes from, for comments and warnings: "the beam break beambreak8" */
  source: string;
}

export interface DeviceEncoding {
  name: string;
  /** last_<device>: the last value the robot was sent */
  variable: string;
  values: { value: SoarConstant; constant: string; code: number; sends: string }[];
  /** Free input that orders two values sent in one loop */
  pick?: string;
}

export interface AgentPort {
  name: string;
  type: 'int' | 'bool';
  description: string;
}

export interface AgentAgree {
  aadl: string;
  /** The annex body: the text between annex agree {** and **} */
  annex: string;
  ports: AgentPort[];
  inputs: InputEncoding[];
  operators: { name: string; constant: string; value: number; variable: string }[];
  devices: DeviceEncoding[];
  obligations: AgentObligation[];
  warnings: string[];
}

/** The four modes the generated robot code sends (matchMode in Robot.java and robot.py) */
export const ROBOT_MODES = ['disabled', 'autonomous', 'teleop', 'test'];

export const READING = { absent: 0, number: 1, word: 2 } as const;
/** The winner value of the standard clear operator */
export const CLEAR_WINNER = -1;

const sanitize = (raw: string): string =>
  raw.replace(/^-/, 'minus_').replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'blank';

/** A constant as students typed it: closed, 4500, 0.5, 1.0 */
export const showConstant = (c: SoarConstant): string =>
  c.kind === 'string' ? c.value : c.kind === 'float' && Number.isInteger(c.value) ? c.value.toFixed(1) : String(c.value);

const COMPARISON_WORDS = { '==': 'equals', '!=': 'does not equal', '>': 'is greater than', '<': 'is less than' };

const describeCondition = (c: Condition): string =>
  c.input === MODE_INPUT && c.comparison === '==' && !c.negated
    ? `robot mode is ${showConstant(c.value)}`
    : `${c.negated ? 'not ' : ''}${c.input} ${COMPARISON_WORDS[c.comparison]} ${showConstant(c.value)}`;

/** Where a number reading falls among the constants: 2i+1 when it equals the i-th, 2i when just below it */
function codeAmong<T>(sorted: T[], value: T, compare: (a: T, b: T) => number): number {
  let below = 0;
  for (let i = 0; i < sorted.length; i++) {
    const order = compare(value, sorted[i]);
    if (order === 0) return 2 * i + 1;
    if (order > 0) below = i + 1;
  }
  return 2 * below;
}

const compareWords = (a: string, b: string): number => compareSymbols({ kind: 'string', value: a }, { kind: 'string', value: b });

/** A reading as the AGREE model sees it: kind and code (see the file comment) */
export function encodeReading(input: InputEncoding, value: SoarConstant | undefined): { kind: number; code: number } {
  if (!value) return { kind: READING.absent, code: 0 };
  if (value.kind === 'string') return { kind: READING.word, code: codeAmong(input.words, value.value, compareWords) };
  return { kind: READING.number, code: codeAmong(input.numbers, value.value, (a, b) => Math.sign(a - b)) };
}

/** A kind and code back in words, for counterexamples: "blocked", "between 3000.0 and 4500.0" */
export function describeReading(input: InputEncoding, kind: number, code: number): string {
  if (kind === READING.absent) return 'not sent';
  const list = kind === READING.number ? input.numbers.map((n) => showConstant({ kind: 'float', value: n })) : input.words;
  const noun = kind === READING.number ? 'a number' : 'a word';
  if (code % 2 === 1) return list[(code - 1) / 2] ?? `${noun} (code ${code})`;
  if (kind === READING.word && input.domain?.kind === 'words') {
    const inGap = (input.domain.words || []).filter((w) => codeAmong(input.words, w, compareWords) === code);
    if (inGap.length) return inGap.join(' or ');
  }
  const above = list[code / 2 - 1];
  const below = list[code / 2];
  if (above === undefined && below === undefined) return noun;
  if (above === undefined) return `${noun} less than ${below}`;
  if (below === undefined) return `${noun} greater than ${above}`;
  return `${noun} between ${above} and ${below}`;
}

const or = (terms: string[]): string => (terms.length ? terms.join(' or ') : 'false');
const and = (terms: string[]): string => (terms.length ? terms.join(' and ') : 'true');
const sum = (terms: string[]): string => (terms.length ? terms.map((t) => `(if ${t} then 1 else 0)`).join(' + ') : '0');

const ANNEX_HEADER = `-- Generated by SysMod Studio from the behavior blocks. One step is one robot loop:
-- the robot marks last loop's commands done and writes its readings, Soar makes one
-- decision, and the robot runs the commands it sent. See "How SysMod models a Soar agent".`;

/** Builds the Soar_Agent component and its AGREE annex from the behavior model */
export function compileAgentAgree(model: BehaviorModel, properties: AgentProperty[] = [], domains: Map<string, ReadingDomain> = new Map()): AgentAgree {
  const warnings = [...model.warnings];
  const used = new Set<string>();
  /** Picks a base name whose derived names are all free, and reserves them */
  const claim = (base: string, derived: (b: string) => string[] = (b) => [b]): string => {
    let name = base;
    for (let i = 2; derived(name).some((n) => used.has(n.toLowerCase())); i++) name = `${base}_${i}`;
    derived(name).forEach((n) => used.add(n.toLowerCase()));
    return name;
  };
  ['reading_absent', 'reading_number', 'reading_word', 'cmd_none', 'sysmod_clear', 'tie', 'required_count', 'any_best', 'any_normal', 'pool_size',
    'clear_proposed', 'keeps_current', 'chooses', 'winner', 'selected', 'stays', 'operator_commands_sent', 'operator_commands_pending',
    ...ROBOT_MODES.map((m) => `in_mode_${sanitize(m)}`)].forEach((n) => used.add(n));

  // ── Inputs ──
  const allConditions = [...model.operators.flatMap((o) => o.conditions), ...model.applies.flatMap((a) => a.conditions), ...model.elaborations.flatMap((e) => e.conditions)];
  const attributes = [...new Set([MODE_INPUT, ...allConditions.map((c) => c.input)])];
  const inputs = new Map<string, InputEncoding>();
  attributes.forEach((attribute) => {
    const tested = allConditions.filter((c) => c.input === attribute);
    const numbers = [...new Set(tested.filter((c) => c.value.kind !== 'string').map((c) => c.value.value as number))].sort((a, b) => a - b);
    const words = [...new Set([...(attribute === MODE_INPUT ? ROBOT_MODES : []), ...tested.filter((c) => c.value.kind === 'string').map((c) => c.value.value as string)])].sort(compareWords);
    const variable = claim(`in_${sanitize(attribute)}`, (b) => [b, `${b}_kind`, `${b}_code`, `${b}_changes`, `${b}_same`, `${b}_new`]);
    const domain = attribute === MODE_INPUT ? undefined : domains.get(attribute);
    inputs.set(attribute, { attribute, variable, numbers, words, tracked: tested.some((c) => !c.negated), ...(domain ? { domain } : {}) });
    if (!domain) return;
    // Tests that can never match what the robot sends are almost always a typo in the blocks
    const said = new Set<string>();
    const warn = (text: string): void => {
      if (!said.has(text)) warnings.push(text);
      said.add(text);
    };
    if (domain.kind === 'none') {
      warn(`${attribute} is ${domain.source}, which sends no reading, so rules that test it never match.`);
      return;
    }
    tested.forEach((c) => {
      const shown = showConstant(c.value);
      if (domain.kind === 'numbers' && c.value.kind === 'string') {
        warn(`${attribute} is ${domain.source}, which sends a number, but a rule compares it with the word “${shown}”.`);
      } else if (domain.kind === 'words' && c.value.kind !== 'string') {
        warn(`${attribute} is ${domain.source}, which sends ${domain.words?.join(' or ')}, but a rule compares it with the number ${shown}.`);
      } else if (domain.kind === 'words' && c.comparison === '==' && !domain.words?.includes(c.value.value as string)) {
        warn(`${attribute} is ${domain.source}, which only sends ${domain.words?.join(' or ')}, never “${shown}”.`);
      }
    });
  });
  const input = (attribute: string): InputEncoding => inputs.get(attribute) as InputEncoding;

  const test = (c: Condition): string => {
    const enc = input(c.input);
    const kind = `${enc.variable}_kind`;
    const code = `${enc.variable}_code`;
    let holds: string;
    if (c.input === MODE_INPUT && c.comparison === '==' && c.value.kind === 'string' && ROBOT_MODES.includes(c.value.value)) {
      holds = `in_mode_${sanitize(c.value.value)}`;
    } else if (c.value.kind === 'string') {
      const at = 2 * enc.words.indexOf(c.value.value) + 1;
      const equal = `(${kind} = reading_word and ${code} = ${at})`;
      holds = {
        '==': equal,
        '!=': `(${kind} <> reading_absent and not ${equal})`,
        '>': `(${kind} = reading_word and ${code} > ${at})`,
        // A number compared with a word always counts as "less than" (compare_symbols)
        '<': `(${kind} = reading_number or (${kind} = reading_word and ${code} < ${at}))`,
      }[c.comparison];
    } else {
      const at = 2 * enc.numbers.indexOf(c.value.value) + 1;
      // A whole-number constant is a different symbol from every decimal reading
      const equal = c.value.kind === 'float' ? `(${kind} = reading_number and ${code} = ${at})` : 'false';
      holds = {
        '==': equal,
        '!=': c.value.kind === 'float' ? `(${kind} <> reading_absent and not ${equal})` : `(${kind} <> reading_absent)`,
        '>': `(${kind} = reading_number and ${code} > ${at})`,
        '<': `(${kind} = reading_word or (${kind} = reading_number and ${code} < ${at}))`,
      }[c.comparison];
    }
    return c.negated ? `(not ${holds})` : holds;
  };
  const conditions = (list: Condition[]): string => and(list.map(test));
  /** True when none of the readings the rule matched changed: Soar keeps the same rule instance */
  const same = (list: Condition[]): string => and([...new Set(list.filter((c) => !c.negated).map((c) => c.input))].map((a) => `not ${input(a).variable}_new`));
  const when = (list: Condition[]): string => (list.length ? `when ${list.map(describeCondition).join(', and ')}` : 'no conditions');

  // ── Names for rules ──
  const operators = model.operators.map((o, i) => {
    const constant = claim(`op_${sanitize(o.name)}`, (b) => [b, `${b}_proposed`, `${b}_same`, `${b}_in_pool`]);
    return { name: o.name, constant, value: i + 1, variable: constant, operator: o };
  });
  const applies = model.applies.map((a) => ({ rule: a, base: claim(`apply_${sanitize(a.operator)}_${sanitize(a.name)}`, (b) => [`${b}_matches`, `${b}_same`, `${b}_tracked`, `${b}_fires`]) }));
  const elaborations = model.elaborations.map((e) => ({ rule: e, base: claim(`elab_${sanitize(e.name)}`, (b) => [`${b}_matches`, `${b}_same`, `${b}_fires`, `${b}_pending`]) }));
  const hasCommand = (actions: Action[]): boolean => actions.some((a) => a.kind === 'command');

  // ── Commands ──
  const devices: DeviceEncoding[] = [];
  const sources = new Map<string, string[]>();
  const addCommands = (actions: Action[], fires: string): void =>
    actions.forEach((a) => {
      if (a.kind !== 'command') return;
      let device = devices.find((d) => d.name === a.name);
      if (!device) {
        const piece = claim(sanitize(a.name), (b) => [`last_${b}`, `pick_${b}`]);
        device = { name: a.name, variable: `last_${piece}`, values: [] };
        device.pick = `pick_${piece}`;
        devices.push(device);
      }
      let value = device.values.find((v) => sameConstant(v.value, a.value));
      if (!value) {
        const piece = claim(`${device.variable.slice('last_'.length)}_${sanitize(showConstant(a.value))}`, (b) => [`cmd_${b}`, `sends_${b}`]);
        value = { value: a.value, constant: `cmd_${piece}`, code: device.values.length + 1, sends: `sends_${piece}` };
        device.values.push(value);
      }
      const list = sources.get(value.sends) || [];
      if (!list.includes(fires)) list.push(fires);
      sources.set(value.sends, list);
    });
  applies.forEach(({ rule, base }) => addCommands(rule.actions, `${base}_fires`));
  elaborations.forEach(({ rule, base }) => addCommands(rule.actions, `${base}_fires`));
  devices.forEach((d) => {
    if (d.values.length < 2) d.pick = undefined;
  });

  // ── Properties ──
  const findCommand = (ref: CommandRef): { device: DeviceEncoding; value: DeviceEncoding['values'][number] } | undefined => {
    const device = devices.find((d) => d.name === soarName(ref.device, 'device'));
    const target = soarConstant(ref.value);
    const value = device?.values.find((v) => sameConstant(v.value, target));
    return device && value ? { device, value } : undefined;
  };
  const commandText = (ref: CommandRef): string => `${soarName(ref.device, 'device')} is set to ${showConstant(soarConstant(ref.value))}`;
  const obligations: AgentObligation[] = [];
  const guarantees: string[] = [];
  properties.forEach((p, i) => {
    const name = claim(`${sanitize(p.kind)}_${i + 1}`);
    let description: string;
    let expr: string;
    const missing = (ref: CommandRef): void => {
      warnings.push(`No rule sets ${soarName(ref.device, 'device')} to ${showConstant(soarConstant(ref.value))}, so property ${i + 1} is about something that never happens.`);
    };
    if (p.kind === 'never-together') {
      const first = findCommand(p.first);
      const second = findCommand(p.second);
      if (!first) missing(p.first);
      if (!second) missing(p.second);
      description = `${commandText(p.first)} never at the same time as ${commandText(p.second)}`;
      const is = (c: ReturnType<typeof findCommand>): string => (c ? `${c.device.variable} = ${c.value.constant}` : 'false');
      expr = `not (${is(first)} and ${is(second)})`;
    } else if (p.kind === 'only-in-mode') {
      const command = findCommand(p.command);
      if (!command) missing(p.command);
      const mode = p.mode.trim().toLowerCase();
      if (!ROBOT_MODES.includes(mode)) warnings.push(`The robot never sends the mode “${p.mode}”; use ${ROBOT_MODES.join(', ')}.`);
      description = `${commandText(p.command)} only in ${mode}`;
      const inMode = ROBOT_MODES.includes(mode) ? `in_mode_${sanitize(mode)}` : 'false';
      expr = `${command ? command.value.sends : 'false'} => ${inMode}`;
    } else {
      const command = findCommand(p.command);
      if (!command) missing(p.command);
      description = `Can ${commandText(p.command).replace(' is set', ' be set')}? If this guarantee fails, the counterexample shows how`;
      expr = `not ${command ? command.value.sends : 'false'}`;
    }
    obligations.push({ name, description, template: p.kind, expect: p.kind === 'can-happen' ? 'reachable' : 'holds' });
    guarantees.push(`guarantee ${name} "${description.replace(/"/g, "'")}" :\n  ${expr};`);
  });

  // ── The annex ──
  const lines: string[] = [ANNEX_HEADER];
  const ports: AgentPort[] = [];
  const section = (title: string): void => {
    lines.push('', `-- ---- ${title} ----`);
  };

  section('Readings');
  lines.push(
    '-- Each reading the rules test is a kind and a code. An odd code equals one of the constants',
    '-- the rules compare it with; an even code lies between two of them.',
    `const reading_absent : int = ${READING.absent};`,
    `const reading_number : int = ${READING.number};`,
    `const reading_word : int = ${READING.word};`,
  );
  inputs.forEach((enc) => {
    const v = enc.variable;
    const constants = [
      ...enc.numbers.map((n, i) => `${2 * i + 1} = ${showConstant({ kind: 'float', value: n })}`),
      ...(enc.words.length ? [`words: ${enc.words.map((w, i) => `${2 * i + 1} = ${w}`).join(', ')}`] : []),
    ];
    lines.push('', `-- ${enc.attribute}${constants.length ? ` (${enc.numbers.length ? 'numbers: ' : ''}${constants.join(', ')})` : ''}`);
    ports.push({ name: `${v}_kind`, type: 'int', description: `${enc.attribute}: not sent, a number or a word` });
    ports.push({ name: `${v}_code`, type: 'int', description: `${enc.attribute}: where it falls among the constants` });
    if (enc.attribute === MODE_INPUT) {
      ROBOT_MODES.forEach((m) => lines.push(`eq in_mode_${sanitize(m)} : bool = ${v}_kind = reading_word and ${v}_code = ${2 * enc.words.indexOf(m) + 1};`));
      lines.push(`assume "The robot sends one of its four modes every loop" :\n  ${or(ROBOT_MODES.map((m) => `in_mode_${sanitize(m)}`))};`);
    } else {
      const absent = `(${v}_kind = reading_absent and ${v}_code = 0)`;
      const number = `(${v}_kind = reading_number and ${v}_code >= 0 and ${v}_code <= ${2 * enc.numbers.length})`;
      const domain = enc.domain;
      if (!domain) {
        lines.push(`assume "${enc.attribute} is not sent, a number or a word" :\n  ${absent} or\n  ${number} or\n  (${v}_kind = reading_word and ${v}_code >= 0 and ${v}_code <= ${2 * enc.words.length});`);
      } else if (domain.kind === 'none') {
        lines.push(`assume "${enc.attribute} is never sent: it is ${domain.source}, which has no reading" :\n  ${absent};`);
      } else if (domain.kind === 'numbers') {
        lines.push(`assume "${enc.attribute} is not sent or a number: it is ${domain.source}" :\n  ${absent} or\n  ${number};`);
      } else {
        const words = domain.words || [];
        const codes = [...new Set(words.map((w) => codeAmong(enc.words, w, compareWords)))].sort((a, b) => a - b);
        lines.push(
          `-- ${domain.source}: ${words.map((w) => `${w} = code ${codeAmong(enc.words, w, compareWords)}`).join(', ')}`,
          `assume "${enc.attribute} is not sent, or ${words.join(' or ')}: it is ${domain.source}" :\n  ${absent} or\n  (${v}_kind = reading_word and (${or(codes.map((c) => `${v}_code = ${c}`))}));`,
        );
      }
    }
    if (enc.tracked) {
      ports.push({ name: `${v}_changes`, type: 'bool', description: `${enc.attribute}: changed to another value with the same code` });
      // Only a gap that holds more than one possible value can change without changing its code
      let gap = `${v}_code mod 2 = 0`;
      if (enc.domain?.kind === 'words') {
        const counts = new Map<number, number>();
        (enc.domain.words || []).forEach((w) => {
          const c = codeAmong(enc.words, w, compareWords);
          if (c % 2 === 0) counts.set(c, (counts.get(c) || 0) + 1);
        });
        const shared = [...counts].filter(([, n]) => n > 1).map(([c]) => `${v}_code = ${c}`);
        gap = shared.length ? `(${or(shared)})` : 'false';
      }
      lines.push(
        `eq ${v}_same : bool = false -> (pre(${v}_kind) = ${v}_kind and pre(${v}_code) = ${v}_code);`,
        `-- A new value is a new working-memory element, so rules that tested it can fire again`,
        `eq ${v}_new : bool = ${v}_kind <> reading_absent and (not ${v}_same or (${v}_changes and ${gap}));`,
      );
    }
  });

  section('Operators');
  operators.forEach(({ name, constant, value, operator }) => {
    lines.push(
      '',
      `-- ${name} (${operator.priority.toLowerCase()}): proposed ${when(operator.conditions)}`,
      `const ${constant} : int = ${value};`,
      `eq ${constant}_proposed : bool = ${conditions(operator.conditions)};`,
      `eq ${constant}_same : bool = ${same(operator.conditions)};`,
    );
  });

  section('Elaborations (sent once each time they start to match)');
  elaborations.forEach(({ rule, base }) => {
    lines.push(
      '',
      `-- ${rule.name}: ${when(rule.conditions)}`,
      `eq ${base}_matches : bool = ${conditions(rule.conditions)};`,
      `eq ${base}_same : bool = ${same(rule.conditions)};`,
      `eq ${base}_fires : bool = ${base}_matches and (true -> (not pre(${base}_matches) or not ${base}_same));`,
    );
    if (hasCommand(rule.actions)) {
      lines.push(
        `-- Its commands stay on the output link until the clear operator removes them or it stops matching`,
        `eq ${base}_pending : bool = if winner = sysmod_clear then ${base}_fires else (${base}_fires or (prev(${base}_pending, false) and ${base}_matches));`,
      );
    }
  });

  section('Choosing an operator');
  const byPriority = (p: string): typeof operators => operators.filter((o) => o.operator.priority === p);
  const proposed = (list: typeof operators): string[] => list.map((o) => `${o.constant}_proposed`);
  lines.push(
    `const sysmod_clear : int = ${CLEAR_WINNER};`,
    `eq required_count : int = ${sum(proposed(byPriority('REQUIRE')))};`,
    `eq any_best : bool = ${or(proposed(byPriority('BEST')))};`,
    `eq any_normal : bool = ${or(proposed(byPriority('NORMAL')))};`,
  );
  operators.forEach((o) => {
    const tier = { REQUIRE: ' and false', BEST: '', NORMAL: ' and not any_best', WORST: ' and not any_best and not any_normal' }[o.operator.priority];
    lines.push(`eq ${o.constant}_in_pool : bool = ${o.constant}_proposed${tier};`);
  });
  const pendingElaborations = elaborations.filter((e) => hasCommand(e.rule.actions));
  lines.push(
    `eq pool_size : int = ${sum(operators.map((o) => `${o.constant}_in_pool`))};`,
    '-- The clear operator is better than every other, so it runs as soon as a sent command is done',
    `eq clear_proposed : bool = false -> (${or(['pre(operator_commands_pending)', ...pendingElaborations.map((e) => `(pre(${e.base}_pending) and ${e.base}_matches and not ${e.base}_fires)`)])});`,
    '-- The selected operator stays while it is still among the best and its proposal is unchanged',
    `eq keeps_current : bool = ${or(operators.map((o) => `(prev(selected, 0) = ${o.constant} and ${o.constant}_in_pool and ${o.constant}_same)`))};`,
    '-- Soar picks at random between equal operators; the input "tie" is that choice',
    'eq chooses : bool = required_count = 0 and not clear_proposed and not keeps_current and pool_size > 1;',
  );
  const required = byPriority('REQUIRE');
  const requiredWinner = required.reduceRight((rest, o) => `if ${o.constant}_proposed then ${o.constant} else ${rest}`, '0');
  const tieWinner = operators.length > 1 ? operators.map((o) => `if tie = ${o.constant} and ${o.constant}_in_pool then ${o.constant}`).join(' else ') + ' else ' : '';
  const poolWinner = operators.reduceRight((rest, o) => `if ${o.constant}_in_pool then ${o.constant} else ${rest}`, '0');
  lines.push(
    '-- 0: none (two required operators at once, or nothing proposed)',
    'eq winner : int =',
    '  if required_count > 1 then 0',
    `  else if required_count = 1 then (${requiredWinner})`,
    '  else if clear_proposed then sysmod_clear',
    '  else if keeps_current then prev(selected, 0)',
    `  else ${tieWinner}${poolWinner};`,
    '-- The operator still selected when the decision ends (the clear operator retracts once it runs)',
    'eq selected : int = if winner = sysmod_clear then 0 else winner;',
    `eq stays : bool = winner <> 0 and winner = prev(selected, 0) and (${or(operators.map((o) => `(winner = ${o.constant} and ${o.constant}_same)`))});`,
  );
  if (operators.length > 1) ports.push({ name: 'tie', type: 'int', description: 'Which operator Soar picks when equal operators tie' });

  section('Apply rules (fire when their operator is newly selected, or a reading they matched changes)');
  applies.forEach(({ rule, base }) => {
    const owners = operators.filter((o) => o.name === rule.operator);
    lines.push(
      '',
      `-- ${rule.name}, for ${rule.operator}: ${when(rule.conditions)}`,
      `eq ${base}_matches : bool = ${conditions(rule.conditions)};`,
      `eq ${base}_same : bool = ${same(rule.conditions)};`,
      `eq ${base}_tracked : bool = (${or(owners.map((o) => `selected = ${o.constant}`))}) and ${base}_matches;`,
      `eq ${base}_fires : bool = ${base}_tracked and not (stays and prev(${base}_tracked, false) and ${base}_same);`,
    );
  });
  lines.push(
    '',
    `eq operator_commands_sent : bool = ${or(applies.filter((a) => hasCommand(a.rule.actions)).map((a) => `${a.base}_fires`))};`,
    'eq operator_commands_pending : bool = if winner = sysmod_clear then false else (prev(operator_commands_pending, false) or operator_commands_sent);',
  );

  section('Commands the robot receives');
  lines.push('const cmd_none : int = 0;');
  devices.forEach((d) => {
    lines.push('', `-- ${d.name}`);
    d.values.forEach((v) => {
      lines.push(`const ${v.constant} : int = ${v.code};`, `eq ${v.sends} : bool = ${or(sources.get(v.sends) || [])};`);
    });
    const picked = d.pick ? d.values.map((v) => `if ${d.pick} = ${v.constant} and ${v.sends} then ${v.constant} else `).join('') : '';
    const any = d.values.map((v) => `if ${v.sends} then ${v.constant} else `).join('');
    lines.push(`-- The last value ${d.name} was sent`, `eq ${d.variable} : int = ${picked}${any}prev(${d.variable}, cmd_none);`);
    if (d.pick) ports.push({ name: d.pick, type: 'int', description: `Which value ${d.name} runs last when one loop sends it two` });
  });

  if (guarantees.length) {
    section('Properties');
    lines.push(...guarantees);
  }

  const annex = lines.join('\n');
  const aadl = [
    'package SysMod_Soar_Agent',
    'public',
    '  with Base_Types;',
    '',
    '  -- The robot\'s Soar agent (agent.soar), one robot loop per step. Generated by SysMod Studio.',
    '  system Soar_Agent',
    ...(ports.length ? ['    features', ...ports.map((p) => `      ${p.name} : in data port Base_Types::${p.type === 'int' ? 'Integer' : 'Boolean'}; -- ${p.description}`)] : []),
    '    annex agree {**',
    ...annex.split('\n').map((l) => (l ? `      ${l}` : '')),
    '    **};',
    '  end Soar_Agent;',
    'end SysMod_Soar_Agent;',
    '',
  ].join('\n');

  return {
    aadl,
    annex,
    ports,
    inputs: [...inputs.values()],
    operators: operators.map(({ name, constant, value, variable }) => ({ name, constant, value, variable })),
    devices,
    obligations,
    warnings,
  };
}

// ── Lustre for JKind ──

export interface AgentProgram {
  lustre: string;
  consts: Map<string, number | boolean>;
  ports: AgentPort[];
  eqs: { name: string; type: AgreeType; expr: MathExpr }[];
  assumptions: { description: string; expr: MathExpr }[];
  /** Each guarantee is a Lustre property named by lustreName */
  guarantees: { name: string; lustreName: string; description: string; expr: MathExpr }[];
  errors: ContractError[];
}

/** Lustre names carry the component, so counterexample signals read agent.<name> */
export const agentLustreName = (name: string): string => `agent__${name}`;
const annexName = (lustreName: string): string => lustreName.replace(/^agent__/, '');

/**
 * Compiles the annex to Lustre through SysMod's AGREE parser, the same way device contracts are,
 * so what JKind proves is the text the student can read. The guarantees are proved under the
 * assumptions, as AGREE does for a single component.
 */
export function compileAgentLustre(agent: AgentAgree): AgentProgram {
  const errors: ContractError[] = [];
  const parsed = parseAgreeAnnex(agent.annex);
  parsed.errors.forEach((e) => errors.push({ ...e, scope: 'Soar_Agent' }));

  const names = new Map<string, MathExpr>();
  agent.ports.forEach((p) => names.set(p.name, { kind: 'var', name: agentLustreName(p.name) }));
  parsed.statements.forEach((s) => {
    if (s.kind === 'eq') names.set(s.name, { kind: 'var', name: agentLustreName(s.name) });
  });
  const scope: Scope = { name: 'Soar_Agent', resolve: (path) => (path.length === 1 ? names.get(path[0]) : undefined) };

  const consts = new Map<string, number | boolean>();
  const constLines: string[] = [];
  const eqs: AgentProgram['eqs'] = [];
  const assumptions: AgentProgram['assumptions'] = [];
  const guarantees: AgentProgram['guarantees'] = [];
  // Constants first: AGREE lets a name be used above its declaration
  const ordered = [...parsed.statements.filter((s) => s.kind === 'const'), ...parsed.statements.filter((s) => s.kind !== 'const')];
  ordered.forEach((s, i) => {
    if (s.kind === 'const') {
      const expr = toMath(s.expr, scope, errors);
      const value = s.type === 'bool' ? expr.kind === 'bool' && expr.value : evaluateNumber(expr);
      consts.set(s.name, value as number | boolean);
      names.set(s.name, { kind: 'const', name: agentLustreName(s.name), label: s.name, value: typeof value === 'number' ? value : undefined });
      constLines.push(`const ${agentLustreName(s.name)} : ${s.type} = ${mathToLustre(expr)};`);
    } else if (s.kind === 'eq') {
      eqs.push({ name: s.name, type: s.type, expr: toMath(s.expr, scope, errors) });
    } else if (s.kind === 'assume') {
      assumptions.push({ description: s.description, expr: toMath(s.expr, scope, errors) });
    } else if (s.kind === 'guarantee') {
      const name = s.name || `guarantee_${i}`;
      guarantees.push({ name, lustreName: agentLustreName(name), description: s.description, expr: toMath(s.expr, scope, errors) });
    } else {
      errors.push({ scope: 'Soar_Agent', line: s.line, message: `"${s.kind}" isn't used in a component's own contract` });
    }
  });

  const declare = (name: string, type: string): string => `${agentLustreName(name)} : ${type}`;
  let lustre = '-- Generated by SysMod Studio for JKind: the Soar agent, one robot loop per step\n\n';
  if (constLines.length) lustre += `${constLines.join('\n')}\n\n`;
  lustre += `node main(\n  ${agent.ports.map((p) => declare(p.name, p.type)).join(';\n  ') || 'agent__tick : bool'}\n) returns ();\n`;
  const locals = [...eqs.map((e) => declare(e.name, e.type)), ...guarantees.map((g) => declare(g.name, 'bool'))];
  if (locals.length) lustre += `var\n  ${locals.join(';\n  ')};\n`;
  lustre += 'let\n  --%MAIN;\n';
  eqs.forEach((e) => (lustre += `  ${agentLustreName(e.name)} = ${mathToLustre(e.expr)};\n`));
  guarantees.forEach((g) => (lustre += `  ${g.lustreName} = ${mathToLustre(g.expr)};\n`));
  assumptions.forEach((a) => (lustre += `  assert ${mathToLustre(a.expr)};\n`));
  guarantees.forEach((g) => (lustre += `  --%PROPERTY ${g.lustreName};\n`));
  lustre += 'tel;\n';

  return { lustre, consts, ports: agent.ports, eqs, assumptions, guarantees, errors };
}

// ── Commands and counterexamples in the student's words ──

/** Every command the rules can send, for the property picker: { device, value } as a CommandRef */
export function agentCommands(agent: AgentAgree): CommandRef[] {
  return agent.devices.flatMap((d) => d.values.map((v) => ({ device: d.name, value: showConstant(v.value) })));
}

export interface TraceLoop {
  /** disabled, autonomous, teleop or test */
  mode?: string;
  /** Each reading the rules test (not the mode), in words */
  readings: { attribute: string; text: string; changed: boolean }[];
  /** What Soar did this loop, such as "hold" or "clears finished commands" */
  decision: string;
  /** True when Soar picked at random between equal operators */
  chose: boolean;
  stalled: boolean;
  /** Commands the robot received, such as "intake → closed" */
  sent: string[];
  /** The last value each device was sent so far */
  last: { device: string; value: string }[];
  /** Whether the property was true at this loop */
  holds?: boolean;
}

/**
 * Replays a JKind counterexample through the AGREE equations and describes each loop. Only the
 * inputs are taken from JKind; everything else is recomputed, so it shows what the agent does.
 */
export function agentTrace(
  agent: AgentAgree,
  program: AgentProgram,
  signals: { name: string; values: (number | boolean)[] }[],
  steps: number,
  guarantee?: string,
): TraceLoop[] {
  const byName = new Map(signals.map((s) => [s.name, s.values]));
  const run = new AgentRun(program);
  const opName = (value: number): string => agent.operators.find((o) => o.value === value)?.name ?? `operator ${value}`;
  const loops: TraceLoop[] = [];
  for (let k = 0; k < steps; k++) {
    run.step((name) => byName.get(agentLustreName(name))?.[k] ?? (agent.ports.find((p) => p.name === name)?.type === 'bool' ? false : 0));
    const value = (name: string): number | boolean => run.get(name, k);
    const winner = value('winner') as number;
    const stalled = (value('required_count') as number) > 1;
    const decision =
      winner === CLEAR_WINNER
        ? 'clears finished commands'
        : winner === 0
          ? stalled
            ? 'stalls: two required operators'
            : 'nothing proposed'
          : `${opName(winner)}${value('stays') ? ' (still selected)' : ''}`;
    loops.push({
      mode: ROBOT_MODES.find((m) => value(`in_mode_${sanitize(m)}`) === true),
      readings: agent.inputs
        .filter((i) => i.attribute !== MODE_INPUT)
        .map((i) => ({
          attribute: i.attribute,
          text: describeReading(i, value(`${i.variable}_kind`) as number, value(`${i.variable}_code`) as number),
          changed: i.tracked && value(`${i.variable}_new`) === true,
        })),
      decision,
      chose: value('chooses') === true,
      stalled,
      sent: agent.devices.flatMap((d) => d.values.filter((v) => value(v.sends) === true).map((v) => `${d.name} → ${showConstant(v.value)}`)),
      last: agent.devices.flatMap((d) => {
        const code = value(d.variable) as number;
        const v = d.values.find((x) => x.code === code);
        return v ? [{ device: d.name, value: showConstant(v.value) }] : [];
      }),
      holds: guarantee ? value(guarantee) === true : undefined,
    });
  }
  return loops;
}

// ── Running the equations ──

type Value = number | boolean;

/**
 * Runs the compiled equations one step at a time, the way JKind reads them. The tests use it to
 * check, loop by loop, that the AGREE model does what the reference simulator does. Inputs are
 * asked for only when needed, so a test can choose one (such as the tie) from other values.
 */
export class AgentRun {
  private history: Map<string, Value>[] = [];
  private eqs: Map<string, MathExpr>;
  private provide: (name: string, get: (name: string) => Value) => Value = () => 0;

  constructor(private readonly program: AgentProgram) {
    this.eqs = new Map(program.eqs.map((e) => [e.name, e.expr]));
    program.guarantees.forEach((g) => this.eqs.set(g.name, g.expr));
  }

  get steps(): number {
    return this.history.length;
  }

  /** Runs the next step. provide() gives an input's value; it may read other values of this step */
  step(provide: (name: string, get: (name: string) => Value) => Value): void {
    this.provide = provide;
    const k = this.history.length;
    this.history.push(new Map());
    // Evaluate everything now, so later steps can read this one
    this.eqs.forEach((_, name) => this.get(name, k));
    this.program.ports.forEach((p) => this.get(p.name, k));
  }

  /** A value at a step (the latest by default) */
  get(name: string, k = this.history.length - 1): Value {
    const known = this.history[k].get(name);
    if (known !== undefined) return known;
    const expr = this.eqs.get(name);
    let value: Value;
    if (expr) value = this.evaluate(expr, k);
    else if (this.program.consts.has(name)) value = this.program.consts.get(name) as Value;
    else if (k === this.history.length - 1) value = this.provide(name, (n) => this.get(n, k));
    else throw new Error(`No value for ${name} at step ${k}`);
    this.history[k].set(name, value);
    return value;
  }

  /** True when every assumption holds at this step */
  assumptionsHold(k = this.history.length - 1): boolean {
    return this.program.assumptions.every((a) => this.evaluate(a.expr, k) === true);
  }

  evaluate(expr: MathExpr, k: number): Value {
    switch (expr.kind) {
      case 'bool':
      case 'number':
        return expr.value;
      case 'const':
      case 'var':
        return this.get(annexName(expr.name), k);
      case 'unary': {
        if (expr.op === 'pre') {
          if (k === 0) throw new Error('pre at the first step');
          return this.evaluate(expr.operand, k - 1);
        }
        const v = this.evaluate(expr.operand, k);
        return expr.op === 'not' ? !v : -(v as number);
      }
      case 'prev':
        return k === 0 ? this.evaluate(expr.initial, 0) : this.evaluate(expr.value, k - 1);
      case 'ite':
        return this.evaluate(expr.cond, k) ? this.evaluate(expr.then, k) : this.evaluate(expr.else, k);
      case 'binary': {
        const { op } = expr;
        if (op === '->') return k === 0 ? this.evaluate(expr.left, k) : this.evaluate(expr.right, k);
        const l = this.evaluate(expr.left, k);
        if (op === 'and') return l === true && this.evaluate(expr.right, k) === true;
        if (op === 'or') return l === true || this.evaluate(expr.right, k) === true;
        if (op === '=>') return l !== true || this.evaluate(expr.right, k) === true;
        const r = this.evaluate(expr.right, k);
        switch (op) {
          case '=':
          case '<=>':
            return l === r;
          case '<>':
          case 'xor':
            return l !== r;
          case '<':
            return (l as number) < (r as number);
          case '<=':
            return (l as number) <= (r as number);
          case '>':
            return (l as number) > (r as number);
          case '>=':
            return (l as number) >= (r as number);
          case '+':
            return (l as number) + (r as number);
          case '-':
            return (l as number) - (r as number);
          case '*':
            return (l as number) * (r as number);
          case '/':
            return (l as number) / (r as number);
          case 'div':
            return Math.trunc((l as number) / (r as number));
          case 'mod':
            return (l as number) % (r as number);
        }
        throw new Error(`Unknown operator ${op}`);
      }
    }
  }
}
