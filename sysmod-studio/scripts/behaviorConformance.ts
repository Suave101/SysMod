/**
 * Conformance between the reference simulator (behaviorSimulator.ts) and real Soar.
 *
 * For each program: generate agent.soar, build the behavior model, make random input traces,
 * run them through real Soar with scripts/soar_oracle.py (the FRC-Soar bridge's loop, through
 * Soar's own SML interface) and through the simulator, and compare every loop: the commands
 * issued, the operator newly selected, and the operator still selected at the end. Ties follow
 * the choice real Soar made, after checking it was one of the simulator's candidates.
 */
import { buildBehaviorModel, MODE_INPUT, SoarConstant, testedInputs } from '../src/renderer/src/views/behavior/behaviorModel';
import { BehaviorSimulator, Inputs, LoopResult } from '../src/renderer/src/views/behavior/behaviorSimulator';
import { AgentProperty, AgentRun, CLEAR_WINNER, compileAgentAgree, compileAgentLustre, encodeReading, ReadingDomain } from '../src/renderer/src/views/behavior/agentAgree';
import { sameConstant } from '../src/renderer/src/views/behavior/behaviorModel';

export interface OracleLoop {
  issued: [string, string, string | null][];
  selected: string[];
  end: string | null;
}

/** A small seeded random number generator (mulberry32), so failures can be replayed */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];

// ── Random programs, as Blockly JSON ──

type Block = { type: string; fields?: Record<string, string>; inputs?: Record<string, { block: Block }>; next?: { block: Block }; disabledReasons?: string[] };

const device = (name: string) => ({ block: { type: 'hardware_input', fields: { hardware_input: name } } as Block });
const value = (v: string) => ({ block: { type: 'hardware_state', fields: { state: v } } as Block });
const chain = (blocks: Block[]): { block: Block } | undefined =>
  blocks.length ? { block: blocks.slice(1).length ? { ...blocks[0], next: chain(blocks.slice(1)) } : blocks[0] } : undefined;
const withInput = (b: Block, name: string, stack: Block[]): Block => {
  const c = chain(stack);
  return c ? { ...b, inputs: { ...(b.inputs || {}), [name]: c } } : b;
};

const STRING_INPUTS = { beam: ['blocked', 'clear'], arm: ['up', 'down'] };
const NUMBER_INPUTS = { speed: ['3000', '10', '1.5'] };
const COMMANDS = ['intake', 'shooter', 'led', 'arm-motor'];
const COMMAND_VALUES = ['closed', 'open', '4500', '0.5', 'Run Forward', 'true'];
const MODES = ['disabled', 'autonomous', 'teleop', 'test'];

function randomCondition(rnd: () => number): Block {
  if (rnd() < 0.25) return { type: 'soar_state_check', fields: { agent_state: pick(rnd, MODES) } };
  const numeric = rnd() < 0.4;
  const attr = numeric ? 'speed' : pick(rnd, Object.keys(STRING_INPUTS) as (keyof typeof STRING_INPUTS)[]);
  const values = numeric ? NUMBER_INPUTS.speed : STRING_INPUTS[attr as keyof typeof STRING_INPUTS];
  // Mostly sensible comparisons, sometimes a relational test on a word, to pin down Soar's rule
  const op = numeric ? pick(rnd, ['==', '!=', '>', '<', '>', '<']) : rnd() < 0.1 ? pick(rnd, ['>', '<']) : pick(rnd, ['==', '==', '!=']);
  const b: Block = {
    type: rnd() < 0.2 ? 'soar_wme_negated_condition' : 'soar_wme_condition',
    fields: { Operator: op },
    inputs: { WorkingMemoryElement: device(attr), Value: value(pick(rnd, values)) },
  };
  return rnd() < 0.05 ? { ...b, disabledReasons: ['MANUALLY_DISABLED'] } : b;
}

const randomActions = (rnd: () => number, count: number): Block[] =>
  Array.from({ length: count }, () =>
    rnd() < 0.2
      ? { type: 'soar_wme_modify', fields: { ACTION_TYPE: rnd() < 0.5 ? 'ADD' : 'REMOVE' }, inputs: { ATTRIBUTE: device('scored'), VALUE: value('yes') } }
      : { type: 'soar_set_output', inputs: { hardware_input: device(pick(rnd, COMMANDS)), hardware_state: value(pick(rnd, COMMAND_VALUES)) } },
  );

/**
 * A random behavior program. By default it has at most one required operator, so it never stalls
 * by design (real Soar's stall isn't one decision per loop); stall: true allows more
 */
export function randomProgram(seed: number, options: { stall?: boolean } = {}): object {
  const rnd = random(seed);
  const blocks: Block[] = [];
  let required = false;
  const operators = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < operators; i++) {
    let priority = pick(rnd, ['NORMAL', 'NORMAL', 'NORMAL', 'BEST', 'WORST', 'REQUIRE']);
    if (priority === 'REQUIRE' && required && !options.stall) priority = 'NORMAL';
    required ||= priority === 'REQUIRE';
    const applies = Array.from({ length: 1 + Math.floor(rnd() * 2) }, (_, j) =>
      withInput(
        withInput({ type: 'soar_apply_rule', fields: { apply_operator_name: `a${j}` } }, 'apply_operator_conditions', rnd() < 0.3 ? [randomCondition(rnd)] : []),
        'apply_operator_actions',
        randomActions(rnd, 1 + Math.floor(rnd() * 2)),
      ),
    );
    const op = withInput(
      withInput({ type: 'soar_propose_operator', fields: { propose_operator_name: `op${i}`, PREFERENCE: priority } }, 'LHS', Array.from({ length: Math.floor(rnd() * 3) }, () => randomCondition(rnd))),
      'RHS',
      applies,
    );
    blocks.push(rnd() < 0.04 ? { ...op, disabledReasons: ['MANUALLY_DISABLED'] } : op);
  }
  const elaborations = Math.floor(rnd() * 3);
  for (let i = 0; i < elaborations; i++) {
    blocks.push(
      withInput(
        withInput({ type: 'soar_elaboration_rule', fields: { ELAB_NAME: `e${i}` } }, 'LHS', Array.from({ length: Math.floor(rnd() * 3) }, () => randomCondition(rnd))),
        'RHS',
        randomActions(rnd, 1),
      ),
    );
  }
  return { blocks: { languageVersion: 0, blocks: blocks.map((b, i) => ({ ...b, x: 10, y: 10 + i * 150 })) } };
}

// ── Random input traces ──

const constantToInput = (c: SoarConstant): SoarConstant => c;

/**
 * Input values for every attribute the rules test: the constants they compare against, the same
 * numbers as floats (the robot sends readings as floats), nearby numbers, an unrelated word, and
 * sometimes nothing at all. Values tend to stay put between loops, like real sensors.
 */
export function randomTraces(model: ReturnType<typeof buildBehaviorModel>, seed: number, count: number, loops: number, domains?: Map<string, ReadingDomain>): Inputs[][] {
  const rnd = random(seed);
  const tested = testedInputs(model);
  tested.set(MODE_INPUT, MODES.map((m) => ({ kind: 'string', value: m })));
  const choices = new Map<string, (SoarConstant | undefined)[]>();
  tested.forEach((constants, attr) => {
    const options: (SoarConstant | undefined)[] = constants.map(constantToInput);
    constants.forEach((c) => {
      if (c.kind !== 'string') options.push({ kind: 'float', value: c.value }, { kind: 'float', value: c.value + 1 }, { kind: 'float', value: c.value - 1 });
    });
    if (attr !== MODE_INPUT) options.push({ kind: 'string', value: 'other' }, undefined);
    // With a domain from the diagram, only the values that device can send
    const domain = attr === MODE_INPUT ? undefined : domains?.get(attr);
    if (domain?.kind === 'none') choices.set(attr, [undefined]);
    else if (domain?.kind === 'numbers') choices.set(attr, options.filter((o) => o?.kind !== 'string'));
    else if (domain?.kind === 'words') choices.set(attr, [...(domain.words || []).map((w): SoarConstant => ({ kind: 'string', value: w })), undefined]);
    else choices.set(attr, options);
  });
  return Array.from({ length: count }, () => {
    const now: Inputs = {};
    return Array.from({ length: loops }, (_, loop) => {
      choices.forEach((options, attr) => {
        if (loop === 0 || rnd() < 0.3) now[attr] = pick(rnd, options);
      });
      return { ...now };
    });
  });
}

// ── Comparison ──

const sameValue = (c: SoarConstant, kind: string, text: string | null): boolean =>
  c.kind === kind && (c.kind === 'string' ? c.value === text : Number(text) === c.value);

const describe = (c: SoarConstant): string => `${c.kind}:${c.value}`;

export interface Mismatch {
  trace: number;
  loop: number;
  what: string;
  inputs: Inputs;
  soar: OracleLoop;
  simulator: LoopResult;
}

/** Replays real Soar's loops through the simulator; returns the first disagreement in each trace */
export function compare(model: ReturnType<typeof buildBehaviorModel>, traces: Inputs[][], oracle: OracleLoop[][]): { mismatches: Mismatch[]; loops: number; ties: number } {
  const mismatches: Mismatch[] = [];
  let loops = 0;
  let ties = 0;
  traces.forEach((trace, t) => {
    const sim = new BehaviorSimulator(model);
    for (let l = 0; l < trace.length; l++) {
      const soar = oracle[t][l];
      let tieProblem = '';
      const result = sim.step(trace[l], (names) => {
        ties++;
        const chosen = soar.selected[0];
        if (!chosen || !names.includes(chosen)) tieProblem = `Soar chose ${chosen ?? 'nothing'}, not one of [${names.join(', ')}]`;
        return chosen && names.includes(chosen) ? chosen : names[0];
      });
      loops++;
      const simIssued = result.issued.map((c) => `${c.name}=${describe(c.value)}`).sort();
      const soarIssued = soar.issued.map(([name, kind, text]) => `${name}=${kind}:${kind === 'string' ? text : Number(text)}`).sort();
      const issuedMatch =
        simIssued.length === soarIssued.length && result.issued.every((c) => soar.issued.some(([name, kind, text]) => name === c.name && sameValue(c.value, kind, text))) && simIssued.join() === soarIssued.join();
      const selectedMatch = (soar.selected[0] ?? undefined) === result.selected && soar.selected.length <= 1;
      const endMatch = (soar.end ?? undefined) === result.endSelected;
      const what = [
        tieProblem,
        issuedMatch ? '' : `issued: Soar [${soarIssued.join(', ')}] vs simulator [${simIssued.join(', ')}]`,
        selectedMatch ? '' : `selected: Soar [${soar.selected.join(', ')}] vs simulator ${result.selected ?? '(no change)'}`,
        endMatch ? '' : `selected at end: Soar ${soar.end ?? '(none)'} vs simulator ${result.endSelected ?? '(none)'}`,
      ].filter(Boolean);
      if (what.length) {
        mismatches.push({ trace: t, loop: l, what: what.join('; '), inputs: trace[l], soar, simulator: result });
        break;
      }
    }
  });
  return { mismatches, loops, ties };
}

// ── The AGREE model against the simulator ──

const CLEAR_NAME = 'sysmod-clear-commands';

/**
 * Runs the AGREE equations (agentAgree.ts, evaluated step by step as JKind reads them) beside the
 * simulator on the same traces and compares every loop: the commands sent, the operator newly
 * selected and still selected, a stall, whether Soar had to choose, and the last value each device
 * was sent. Every assumption must hold on the traces. Ties take a random choice, given to both.
 */
export function compareAgent(
  model: ReturnType<typeof buildBehaviorModel>,
  traces: Inputs[][],
  seed: number,
  properties: AgentProperty[] = [],
  domains?: Map<string, ReadingDomain>,
): { mismatches: string[]; loops: number; ties: number } {
  const agent = compileAgentAgree(model, properties, domains);
  const program = compileAgentLustre(agent);
  if (program.errors.length) return { mismatches: program.errors.map((e) => `annex line ${e.line}: ${e.message}`), loops: 0, ties: 0 };
  const choose = random(seed);
  const mismatches: string[] = [];
  let loops = 0;
  let ties = 0;
  const opName = (value: number): string | undefined =>
    value === CLEAR_WINNER ? CLEAR_NAME : value === 0 ? undefined : agent.operators.find((o) => o.value === value)?.name;

  traces.forEach((trace, t) => {
    const sim = new BehaviorSimulator(model);
    const run = new AgentRun(program);
    const last = new Map<string, number>();
    let previous: Inputs = {};
    for (let l = 0; l < trace.length; l++) {
      const inputs = trace[l];
      let choice: string | undefined;
      const result = sim.step(inputs, (names) => {
        choice = names[Math.floor(choose() * names.length)];
        return choice;
      });
      loops++;
      const firstSent = new Map<string, SoarConstant>();
      result.issued.forEach((c) => {
        if (!firstSent.has(c.name)) firstSent.set(c.name, c.value);
      });
      run.step((name, get) => {
        for (const enc of agent.inputs) {
          const reading = inputs[enc.attribute];
          if (name === `${enc.variable}_kind`) return encodeReading(enc, reading).kind;
          if (name === `${enc.variable}_code`) return encodeReading(enc, reading).code;
          if (name === `${enc.variable}_changes`) {
            const before = previous[enc.attribute];
            return !!reading && !!before && !sameConstant(reading, before);
          }
        }
        if (name === 'tie') {
          const op = choice && choice !== CLEAR_NAME ? agent.operators.find((o) => o.name === choice && get(`${o.constant}_in_pool`) === true) : undefined;
          return op ? op.value : 0;
        }
        const device = agent.devices.find((d) => d.pick === name);
        if (device) {
          const first = firstSent.get(device.name);
          return first ? (device.values.find((v) => sameConstant(v.value, first))?.code ?? 0) : 0;
        }
        throw new Error(`No value for input ${name}`);
      });

      const what: string[] = [];
      if (!run.assumptionsHold()) what.push('an assumption is false on a real trace');
      const simIssued = [...new Set(result.issued.map((c) => `${c.name}=${describe(c.value)}`))].sort();
      const agreeIssued = agent.devices.flatMap((d) => d.values.filter((v) => run.get(v.sends) === true).map((v) => `${d.name}=${describe(v.value)}`)).sort();
      if (simIssued.join() !== agreeIssued.join()) what.push(`issued: simulator [${simIssued.join(', ')}] vs AGREE [${agreeIssued.join(', ')}]`);
      const winner = run.get('winner') as number;
      const newly = winner !== 0 && run.get('stays') !== true ? opName(winner) : undefined;
      if (newly !== result.selected) what.push(`selected: simulator ${result.selected ?? '(no change)'} vs AGREE ${newly ?? '(no change)'}`);
      const end = opName(run.get('selected') as number);
      if (end !== result.endSelected) what.push(`selected at end: simulator ${result.endSelected ?? '(none)'} vs AGREE ${end ?? '(none)'}`);
      if (!!result.impasse !== ((run.get('required_count') as number) > 1)) what.push(`stall: simulator ${!!result.impasse} vs AGREE ${!result.impasse}`);
      const simChooses = !!result.tie && result.tie[0] !== CLEAR_NAME;
      if (simChooses) ties++;
      if (simChooses !== run.get('chooses')) what.push(`tie: simulator ${simChooses} vs AGREE ${run.get('chooses')}`);
      agent.devices.forEach((d) => {
        const first = firstSent.get(d.name);
        if (first) last.set(d.name, d.values.find((v) => sameConstant(v.value, first))?.code ?? -99);
        const expected = last.get(d.name) ?? 0;
        if (run.get(d.variable) !== expected) what.push(`last ${d.name}: expected ${expected}, AGREE ${run.get(d.variable)}`);
      });
      if (what.length) {
        mismatches.push(`trace ${t} loop ${l}: ${what.join('; ')}\n       inputs ${JSON.stringify(inputs)}\n       before ${JSON.stringify(previous)}`);
        break;
      }
      previous = inputs;
    }
  });
  return { mismatches, loops, ties };
}
