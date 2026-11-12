/**
 * A reference simulator for SysMod Soar agents: it runs a BehaviorModel one robot loop at a time,
 * the way the FRC-Soar bridge runs agent.soar (docs/verification/soar-semantics.md):
 *
 *   loop k:  the robot marks loop k-1's commands ^status complete, writes this loop's inputs,
 *            Soar runs ONE decision (elaborate and propose, decide, apply, output), and the robot
 *            carries out every command the decision issued.
 *
 * The conformance tests (scripts/test-behavior.ts) compare it against real Soar 9.6.5 on fixed
 * and random programs, so the AGREE and PRISM translations built from the same semantics can be
 * trusted to describe what really runs on the robot.
 *
 * Soar details it reproduces:
 *  - A rule instance is the rule plus the input WMEs its positive conditions matched. When a tested
 *    input changes value, the old instance retracts and a new one fires. Negated conditions don't
 *    bind WMEs, so they don't take part.
 *  - Operator commands are o-supported: they stay until the standard clear rule removes them.
 *    Elaboration commands are i-supported: sent once per match, gone when the match ends.
 *  - The selected operator stays selected while it is still among the winners. The clear operator
 *    is better than every other operator, so it takes a decision as soon as a command is done.
 *  - Equal operators tie. The simulator reports the candidates and lets the caller choose, so a
 *    test can follow the choice real Soar made and a proof can range over every choice.
 */
import { Action, BehaviorModel, Comparison, Condition, Operator, Priority, sameConstant, SoarConstant } from './behaviorModel';

/** One loop's input link: attribute -> value, or undefined when the robot doesn't send it */
export type Inputs = Record<string, SoarConstant | undefined>;

export interface Command {
  id: number;
  name: string;
  value: SoarConstant;
  /** 'o': an operator's apply rule made it; 'i': an elaboration did */
  support: 'o' | 'i';
  /** For i-supported commands, the elaboration instance that holds it */
  holder?: string;
  /** True once the robot has carried it out (it then has ^status) */
  done: boolean;
}

export interface LoopResult {
  /** Commands the robot receives this loop */
  issued: { name: string; value: SoarConstant }[];
  /** The operator newly selected at the top state this decision, if the selection changed */
  selected?: string;
  /** The operator selected at the end of the decision (undefined when none) */
  endSelected?: string;
  /** When equal operators tied, every name that could have been chosen */
  tie?: string[];
  /** Constraint failure: more than one required operator was proposed */
  impasse?: boolean;
}

/** Picks among tied candidates; gets the candidates' operator names */
export type TieChooser = (names: string[]) => string;

const CLEAR = 'sysmod-clear-commands';

interface Candidate {
  key: string;
  name: string;
  priority: Priority | 'CLEAR';
  operator?: Operator;
}

export class BehaviorSimulator {
  private values = new Map<string, SoarConstant>();
  private versions = new Map<string, number>();
  private nextVersion = 1;
  private commands: Command[] = [];
  private nextCommand = 1;
  private selected?: Candidate;
  private activeElaborations = new Set<string>();
  private activeApplies = new Set<string>();

  constructor(private readonly model: BehaviorModel) {}

  /** Pending commands on the output link, for inspection */
  get outputLink(): readonly Command[] {
    return this.commands;
  }

  /** Runs one robot loop: inputs in, one decision, commands out */
  step(inputs: Inputs, chooseTie: TieChooser = (names) => names[0]): LoopResult {
    // ── Input phase: last loop's commands are done; this loop's inputs replace the old ones ──
    this.commands.forEach((c) => (c.done = true));
    this.writeInputs(inputs);
    const issued: Command[] = [];

    // ── Elaborate and propose ──
    // Elaborations: retract instances that no longer match (their commands go with them), fire new ones
    const elabMatches = new Map<string, Action[]>();
    this.model.elaborations.forEach((e, i) => {
      if (this.matches(e.conditions)) elabMatches.set(`e${i}${this.instanceKey(e.conditions)}`, e.actions);
    });
    [...this.activeElaborations].filter((k) => !elabMatches.has(k)).forEach((k) => {
      this.activeElaborations.delete(k);
      this.commands = this.commands.filter((c) => c.holder !== k);
    });
    elabMatches.forEach((actions, key) => {
      if (this.activeElaborations.has(key)) return;
      this.activeElaborations.add(key);
      actions.forEach((a) => a.kind === 'command' && issued.push(this.addCommand(a.name, a.value, 'i', key)));
    });

    const candidates: Candidate[] = this.model.operators.flatMap((o, i) =>
      this.matches(o.conditions) ? [{ key: `o${i}${this.instanceKey(o.conditions)}`, name: o.name, priority: o.priority, operator: o }] : [],
    );
    // One clear operator per finished command
    this.commands.filter((c) => c.done).forEach((c) => candidates.push({ key: `clear${c.id}`, name: CLEAR, priority: 'CLEAR' }));

    // ── Decide ──
    const before = this.selected?.key;
    const decision = this.decide(candidates, chooseTie);
    this.selected = decision.winner;
    const changed = this.selected && this.selected.key !== before;
    if (!this.selected || !before || this.selected.key !== before) this.activeApplies.clear();

    // ── Apply ──
    let endSelected = this.selected?.name;
    if (this.selected?.priority === 'CLEAR') {
      // Removes every finished command; with them gone the clear proposals retract, so the
      // operator is no longer selected when the decision ends
      this.commands = this.commands.filter((c) => !c.done);
      this.selected = undefined;
      endSelected = undefined;
    } else if (this.selected) {
      const op = this.selected;
      const matched = new Set<string>();
      this.model.applies.forEach((a, i) => {
        if (a.operator !== op.name || !this.matches(a.conditions)) return;
        const key = `${op.key}|a${i}${this.instanceKey(a.conditions)}`;
        matched.add(key);
        if (!this.activeApplies.has(key)) a.actions.forEach((act) => act.kind === 'command' && issued.push(this.addCommand(act.name, act.value, 'o')));
      });
      this.activeApplies = matched;
    }

    return {
      issued: issued.map((c) => ({ name: c.name, value: c.value })),
      ...(changed ? { selected: this.selected?.name ?? decision.winner?.name } : {}),
      endSelected,
      ...(decision.tie ? { tie: decision.tie } : {}),
      ...(decision.impasse ? { impasse: true } : {}),
    };
  }

  private writeInputs(inputs: Inputs): void {
    const names = new Set([...this.values.keys(), ...Object.keys(inputs)]);
    names.forEach((name) => {
      const next = inputs[name];
      const now = this.values.get(name);
      if (!next) {
        this.values.delete(name);
        this.versions.delete(name);
      } else if (!now || !sameConstant(now, next)) {
        // A changed value is a new WME, so rules that tested the old one match anew
        this.values.set(name, next);
        this.versions.set(name, this.nextVersion++);
      }
    });
  }

  /** The WMEs a rule instance is built from: the versions of its positively tested inputs */
  private instanceKey(conditions: Condition[]): string {
    return conditions
      .filter((c) => !c.negated)
      .map((c) => `:${c.input}@${this.versions.get(c.input) ?? 0}`)
      .join('');
  }

  private matches(conditions: Condition[]): boolean {
    return conditions.every((c) => {
      const value = this.values.get(c.input);
      const holds = value !== undefined && test(value, c.comparison, c.value);
      return c.negated ? !holds : holds;
    });
  }

  private addCommand(name: string, value: SoarConstant, support: 'o' | 'i', holder?: string): Command {
    const command: Command = { id: this.nextCommand++, name, value, support, holder, done: false };
    this.commands.push(command);
    return command;
  }

  /**
   * Soar's preference semantics for the generated preferences: required (!) wins; the clear
   * operator is better than every other; then best (>), then not worst (<); everything left is
   * indifferent (=), and the current operator stays if it is still a winner.
   */
  private decide(candidates: Candidate[], chooseTie: TieChooser): { winner?: Candidate; tie?: string[]; impasse?: boolean } {
    const required = candidates.filter((c) => c.priority === 'REQUIRE');
    if (required.length > 1) return { impasse: true };
    if (required.length === 1) return { winner: required[0] };
    let pool = candidates;
    if (pool.some((c) => c.priority === 'CLEAR')) pool = pool.filter((c) => c.priority === 'CLEAR');
    if (pool.some((c) => c.priority === 'BEST')) pool = pool.filter((c) => c.priority === 'BEST');
    if (pool.some((c) => c.priority !== 'WORST')) pool = pool.filter((c) => c.priority !== 'WORST');
    if (pool.length === 0) return {};
    const current = this.selected && pool.find((c) => c.key === this.selected?.key);
    if (current) return { winner: current };
    if (pool.length === 1) return { winner: pool[0] };
    const names = pool.map((c) => c.name);
    const choice = chooseTie(names);
    return { winner: pool.find((c) => c.name === choice) ?? pool[0], tie: names };
  }
}

const bytes = new TextEncoder();

/**
 * Soar's compare_symbols (rete.cpp), with the input as the first argument: numbers by value (int
 * and float alike), words in strcmp order, and any other mix counts as "less than".
 */
export function compareSymbols(value: SoarConstant, constant: SoarConstant): number {
  if (value.kind !== 'string' && constant.kind !== 'string') return Math.sign(value.value - constant.value);
  if (value.kind === 'string' && constant.kind === 'string') {
    const a = bytes.encode(value.value);
    const b = bytes.encode(constant.value);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return Math.sign(a.length - b.length);
  }
  return -1;
}

/** A Soar test between an input value and a rule's constant */
export function test(value: SoarConstant, comparison: Comparison, constant: SoarConstant): boolean {
  switch (comparison) {
    case '==':
      // Symbol identity: the int 1 and the float 1.0 are different symbols
      return sameConstant(value, constant);
    case '!=':
      return !sameConstant(value, constant);
    case '>':
      return compareSymbols(value, constant) > 0;
    case '<':
      return compareSymbols(value, constant) < 0;
  }
}
