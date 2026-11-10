/**
 * Turns JKind's "valid" answers into proofs a person can read.
 *
 * JKind proves each property with an SMT solver, which gives a yes or no, not an argument.
 * Run with -ivc, it also reports an inductive validity core: the smallest set of wires and
 * contract guarantees that the proof needs. This module rebuilds a step-by-step argument from
 * that set, as a two-column proof (statement | reason):
 *
 *  - substitution: following the wires turns one guarantee into exactly the statement
 *  - bounds: a chain of =, <= and >= facts bounds a value, then arithmetic finishes it
 *  - solver: anything else lists the facts used, and the step from them to the statement is
 *    the solver's check, which the proof says plainly
 *
 * The explanation never decides whether a property holds. JKind does; this only shows why.
 */
import { ProofResult } from './jkindResults';
import { evaluateNumber, LustreProgram, mathToLustre, MathExpr, ProofFact, ProofObligation } from './lustreGenerator';

export type ProofReason =
  /** A wire on the diagram, a contract guarantee, a definition or a system assert */
  | { kind: 'fact'; fact: ProofFact }
  /** Following a chain of =, <= and >= lines; "cases" when one line is an either/or */
  | { kind: 'chain'; from: number[]; cases: boolean }
  /** A comparison between two numbers */
  | { kind: 'arithmetic' }
  /** Replacing ports in one line with what is wired to them */
  | { kind: 'substitute'; into: number; using: number[] }
  /** Putting earlier lines together */
  | { kind: 'combine'; from: number[] }
  /** The step JKind's SMT solver checked */
  | { kind: 'solver'; from: number[] };

export interface ProofLine {
  statement: MathExpr;
  reason: ProofReason;
}

export type ProofMethod = 'substitution' | 'bounds' | 'solver';

export interface ExplainedProof {
  obligation: ProofObligation;
  result: ProofResult;
  method: ProofMethod;
  lines: ProofLine[];
  /** True when the statement or a fact compares different moments in time */
  temporal: boolean;
  /** Assumption properties whose guarantees this proof uses, which are proved separately */
  dependsOn: string[];
  /** Every fact the proof relies on */
  facts: ProofFact[];
}

const COMPARISONS = new Set(['<', '<=', '>', '>=', '=']);
const FLIPPED: Record<string, string> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' };

const num = (value: number): MathExpr => ({ kind: 'number', text: String(value), value });
const compare = (left: MathExpr, op: string, right: MathExpr): MathExpr => ({ kind: 'binary', op, left, right });

export function conjuncts(expr: MathExpr): MathExpr[] {
  return expr.kind === 'binary' && expr.op === 'and' ? [...conjuncts(expr.left), ...conjuncts(expr.right)] : [expr];
}

function disjuncts(expr: MathExpr): MathExpr[] {
  return expr.kind === 'binary' && expr.op === 'or' ? [...disjuncts(expr.left), ...disjuncts(expr.right)] : [expr];
}

export function variablesOf(expr: MathExpr, into = new Set<string>()): Set<string> {
  switch (expr.kind) {
    case 'var':
      into.add(expr.name);
      break;
    case 'unary':
      variablesOf(expr.operand, into);
      break;
    case 'binary':
      variablesOf(expr.left, into);
      variablesOf(expr.right, into);
      break;
    case 'prev':
      variablesOf(expr.value, into);
      variablesOf(expr.initial, into);
      break;
    case 'ite':
      variablesOf(expr.cond, into);
      variablesOf(expr.then, into);
      variablesOf(expr.else, into);
      break;
  }
  return into;
}

export function isTemporal(expr: MathExpr): boolean {
  switch (expr.kind) {
    case 'unary':
      return expr.op === 'pre' || isTemporal(expr.operand);
    case 'binary':
      return expr.op === '->' || isTemporal(expr.left) || isTemporal(expr.right);
    case 'prev':
      return true;
    case 'ite':
      return isTemporal(expr.cond) || isTemporal(expr.then) || isTemporal(expr.else);
    default:
      return false;
  }
}

function sameExpr(a: MathExpr, b: MathExpr): boolean {
  const av = evaluateNumber(a);
  const bv = evaluateNumber(b);
  if (av !== undefined || bv !== undefined) return av === bv;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'bool':
      return a.value === (b as typeof a).value;
    case 'var':
      return a.name === (b as typeof a).name;
    case 'unary':
      return a.op === (b as typeof a).op && sameExpr(a.operand, (b as typeof a).operand);
    case 'binary': {
      const other = b as typeof a;
      return a.op === other.op && sameExpr(a.left, other.left) && sameExpr(a.right, other.right);
    }
    case 'prev': {
      const other = b as typeof a;
      return sameExpr(a.value, other.value) && sameExpr(a.initial, other.initial);
    }
    case 'ite': {
      const other = b as typeof a;
      return sameExpr(a.cond, other.cond) && sameExpr(a.then, other.then) && sameExpr(a.else, other.else);
    }
    default:
      return false;
  }
}

function substitute(expr: MathExpr, replace: (name: string) => string): MathExpr {
  switch (expr.kind) {
    case 'var':
      return { kind: 'var', name: replace(expr.name) };
    case 'unary':
      return { ...expr, operand: substitute(expr.operand, replace) };
    case 'binary':
      return { ...expr, left: substitute(expr.left, replace), right: substitute(expr.right, replace) };
    case 'prev':
      return { kind: 'prev', value: substitute(expr.value, replace), initial: substitute(expr.initial, replace) };
    case 'ite':
      return { kind: 'ite', cond: substitute(expr.cond, replace), then: substitute(expr.then, replace), else: substitute(expr.else, replace) };
    default:
      return expr;
  }
}

/** Numbers lines and reuses a line when the same statement comes up again */
class LineBook {
  readonly lines: ProofLine[] = [];
  private readonly index = new Map<string, number>();

  add(statement: MathExpr, reason: ProofReason): number {
    const key = mathToLustre(statement);
    const existing = this.index.get(key);
    if (existing !== undefined) return existing;
    this.lines.push({ statement, reason });
    this.index.set(key, this.lines.length - 1);
    return this.lines.length - 1;
  }

  keyOf(line: number): string {
    return mathToLustre(this.lines[line].statement);
  }
}

interface Wire {
  source: string;
  fact: ProofFact;
}

function wiresOf(facts: ProofFact[]): Map<string, Wire> {
  const wires = new Map<string, Wire>();
  facts.forEach((f) => {
    if (f.kind === 'wire' && f.expr.kind === 'binary' && f.expr.right.kind === 'var') wires.set(f.variable, { source: f.expr.right.name, fact: f });
  });
  return wires;
}

/** Follows a port back through wires to where its value comes from */
function traceWire(name: string, wires: Map<string, Wire>): { name: string; path: ProofFact[] } {
  const path: ProofFact[] = [];
  let current = name;
  while (wires.has(current) && path.length < 64) {
    const wire = wires.get(current) as Wire;
    path.push(wire.fact);
    current = wire.source;
  }
  return { name: current, path };
}

// ── Method 1: the statement is one guarantee, seen through the wires ──────────────────────

function proveBySubstitution(theorem: MathExpr, facts: ProofFact[]): ProofLine[] | undefined {
  const wires = wiresOf(facts);
  const resolved = (name: string): string => traceWire(name, wires).name;
  const target = substitute(theorem, resolved);

  for (const fact of facts) {
    if (fact.kind === 'wire') continue;
    const match = conjuncts(fact.expr).find((part) => sameExpr(substitute(part, resolved), target));
    if (!match) continue;

    const book = new LineBook();
    const wireLines: number[] = [];
    // A port named in both the statement and the guarantee needs no wire to connect them
    const theoremVars = variablesOf(theorem);
    const matchVars = variablesOf(match);
    [...theoremVars, ...matchVars].filter((name) => !(theoremVars.has(name) && matchVars.has(name))).forEach((name) => {
      traceWire(name, wires).path.forEach((wire) => wireLines.push(book.add(wire.expr, { kind: 'fact', fact: wire })));
    });
    const factLine = book.add(match, { kind: 'fact', fact });
    if (wireLines.length === 0 && book.keyOf(factLine) === mathToLustre(theorem)) return book.lines;
    book.add(theorem, { kind: 'substitute', into: factLine, using: [...new Set(wireLines)] });
    return book.lines;
  }
  return undefined;
}

// ── Method 2: chains of bounds, the shape of every power-supply property ──────────────────

type Direction = 'upper' | 'lower';

interface Step {
  statement: MathExpr;
  fact: ProofFact;
}

interface Bound {
  value: number;
  strict: boolean;
  steps: Step[];
  cases: boolean;
}

/** A comparison with the variable on the left, or undefined if the atom doesn't mention it alone */
function orient(atom: MathExpr, name: string): { op: string; other: MathExpr } | undefined {
  if (atom.kind !== 'binary' || !COMPARISONS.has(atom.op)) return undefined;
  if (atom.left.kind === 'var' && atom.left.name === name) return { op: atom.op, other: atom.right };
  if (atom.right.kind === 'var' && atom.right.name === name) return { op: FLIPPED[atom.op], other: atom.left };
  return undefined;
}

function better(a: Bound | undefined, b: Bound | undefined, direction: Direction): Bound | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.value !== b.value) return (direction === 'upper' ? a.value < b.value : a.value > b.value) ? a : b;
  if (a.strict !== b.strict) return a.strict ? a : b;
  return a.steps.length <= b.steps.length ? a : b;
}

function findBound(name: string, direction: Direction, facts: ProofFact[], wires: Map<string, Wire>, visiting: Set<string>): Bound | undefined {
  if (visiting.has(name)) return undefined;
  visiting.add(name);
  let best: Bound | undefined;

  const boundOf = (expr: MathExpr): Bound | undefined => {
    const value = evaluateNumber(expr);
    if (value !== undefined) return { value, strict: false, steps: [], cases: false };
    return expr.kind === 'var' ? findBound(expr.name, direction, facts, wires, visiting) : undefined;
  };

  const wire = wires.get(name);
  if (wire) {
    const sub = boundOf({ kind: 'var', name: wire.source });
    if (sub) best = better(best, { ...sub, steps: [{ statement: wire.fact.expr, fact: wire.fact }, ...sub.steps] }, direction);
  }

  facts.forEach((fact) => {
    if (fact.kind === 'wire') return;
    conjuncts(fact.expr).forEach((atom) => {
      const oriented = orient(atom, name);
      if (oriented) {
        const { op, other } = oriented;
        const fits = op === '=' || (direction === 'upper' ? op === '<' || op === '<=' : op === '>' || op === '>=');
        if (!fits) return;
        const sub = boundOf(other);
        if (sub) {
          best = better(best, { value: sub.value, strict: sub.strict || op === '<' || op === '>', steps: [{ statement: atom, fact }, ...sub.steps], cases: sub.cases }, direction);
        }
        return;
      }

      // Either/or, like the main breaker: out = in, or out = 0. The bound is the worse case.
      const branches = disjuncts(atom);
      if (branches.length < 2) return;
      const subs = branches.map((branch) => {
        const o = orient(branch, name);
        return o && o.op === '=' ? boundOf(o.other) : undefined;
      });
      if (subs.some((s) => !s)) return;
      const worst = (subs as Bound[]).reduce((a, b) => (direction === 'upper' ? (b.value > a.value ? b : a) : b.value < a.value ? b : a));
      best = better(
        best,
        { value: worst.value, strict: worst.strict, steps: [{ statement: atom, fact }, ...(subs as Bound[]).flatMap((s) => s.steps)], cases: true },
        direction,
      );
    });
  });

  visiting.delete(name);
  return best;
}

interface Target {
  atom: MathExpr;
  name: string;
  direction: Direction;
  limit: number;
  strict: boolean;
}

function boundTargets(theorem: MathExpr): Target[] | undefined {
  const targets: Target[] = [];
  for (const atom of conjuncts(theorem)) {
    if (atom.kind !== 'binary' || !COMPARISONS.has(atom.op) || atom.op === '=') return undefined;
    const name = atom.left.kind === 'var' ? atom.left.name : atom.right.kind === 'var' ? atom.right.name : undefined;
    if (!name) return undefined;
    const oriented = orient(atom, name) as { op: string; other: MathExpr };
    const limit = evaluateNumber(oriented.other);
    if (limit === undefined) return undefined;
    targets.push({ atom, name, limit, direction: oriented.op.startsWith('<') ? 'upper' : 'lower', strict: oriented.op.length === 1 });
  }
  return targets;
}

function proveByBounds(theorem: MathExpr, facts: ProofFact[]): ProofLine[] | undefined {
  const targets = boundTargets(theorem);
  if (!targets) return undefined;
  const wires = wiresOf(facts);

  const book = new LineBook();
  const conclusions: number[] = [];
  for (const target of targets) {
    const bound = findBound(target.name, target.direction, facts, wires, new Set());
    if (!bound) return undefined;
    const isUpper = target.direction === 'upper';
    const tighter = isUpper ? bound.value < target.limit : bound.value > target.limit;
    const enough = tighter || (bound.value === target.limit && (!target.strict || bound.strict));
    if (!enough) return undefined;

    const stepLines = bound.steps.map((step) => book.add(step.statement, { kind: 'fact', fact: step.fact }));
    const op = (isUpper ? '<' : '>') + (bound.strict ? '' : '=');
    const variable: MathExpr = { kind: 'var', name: target.name };
    const derived = book.add(compare(variable, op, num(bound.value)), { kind: 'chain', from: [...new Set(stepLines)], cases: bound.cases });
    if (bound.value === target.limit) {
      conclusions.push(derived);
    } else {
      const arithmetic = book.add(compare(num(bound.value), isUpper ? '<' : '>', num(target.limit)), { kind: 'arithmetic' });
      conclusions.push(book.add(target.atom, { kind: 'combine', from: [derived, arithmetic] }));
    }
  }

  const last = conclusions[conclusions.length - 1];
  if (conclusions.length > 1 || book.keyOf(last) !== mathToLustre(theorem)) {
    book.add(theorem, { kind: 'combine', from: conclusions });
  }
  return book.lines;
}

// ── Method 3: list the facts, and say the solver did the last step ────────────────────────

/** Orders facts by how they connect to the statement, so the list reads outward from it */
function orderFacts(theorem: MathExpr, facts: ProofFact[]): ProofFact[] {
  const ordered: ProofFact[] = [];
  const reached = variablesOf(theorem);
  const remaining = [...facts];
  while (remaining.length > 0) {
    const index = remaining.findIndex((f) => [...variablesOf(f.expr)].some((v) => reached.has(v)));
    const [next] = remaining.splice(index >= 0 ? index : 0, 1);
    variablesOf(next.expr).forEach((v) => reached.add(v));
    ordered.push(next);
  }
  return ordered;
}

function proveBySolver(theorem: MathExpr, facts: ProofFact[]): ProofLine[] {
  const book = new LineBook();
  const from = orderFacts(theorem, facts).map((fact) => book.add(fact.expr, { kind: 'fact', fact }));
  book.add(theorem, { kind: 'solver', from });
  return book.lines;
}

/** Without an IVC from JKind, keep the facts that share variables with the statement, directly or through other facts */
function connectedFacts(theorem: MathExpr, facts: ProofFact[]): ProofFact[] {
  const reached = variablesOf(theorem);
  const kept = new Set<ProofFact>();
  let grew = true;
  while (grew) {
    grew = false;
    facts.forEach((f) => {
      if (kept.has(f)) return;
      const vars = variablesOf(f.expr);
      if ([...vars].some((v) => reached.has(v))) {
        kept.add(f);
        vars.forEach((v) => reached.add(v));
        grew = true;
      }
    });
  }
  return facts.filter((f) => kept.has(f));
}

export function explainProof(obligation: ProofObligation, result: ProofResult, program: Pick<LustreProgram, 'facts'>): ExplainedProof {
  const byVariable = new Map(program.facts.map((f) => [f.variable, f]));
  const facts = result.ivc
    ? result.ivc.map((v) => byVariable.get(v)).filter((f): f is ProofFact => !!f)
    : connectedFacts(obligation.expr, program.facts);

  const theorem = obligation.expr;
  const temporal = isTemporal(theorem) || facts.some((f) => isTemporal(f.expr));
  let method: ProofMethod = 'substitution';
  let lines = proveBySubstitution(theorem, facts);
  if (!lines && !temporal) {
    method = 'bounds';
    lines = proveByBounds(theorem, facts);
  }
  if (!lines) {
    method = 'solver';
    lines = proveBySolver(theorem, facts);
  }

  const cited = new Set(lines.flatMap((l) => (l.reason.kind === 'fact' ? [l.reason.fact] : [])));
  const dependsOn = [...new Set([...cited].flatMap((f) => f.requires))].filter((p) => p !== obligation.property);
  return { obligation, result, method, lines, temporal, dependsOn, facts };
}

/**
 * Explains every proved obligation, ordered so that a proof comes after the proofs it builds
 * on. Proofs that depend on each other in a loop keep their original order; JKind proved them
 * together by induction over time.
 */
export function explainProofs(program: Pick<LustreProgram, 'facts' | 'obligations'>, results: ProofResult[]): ExplainedProof[] {
  // JKind reports in the order it finishes; start from the diagram's order instead
  const position = (r: ProofResult): number => program.obligations.findIndex((o) => o.property === r.property);
  const explained = results
    .filter((r) => r.answer === 'valid' && r.obligation)
    .sort((a, b) => position(a) - position(b))
    .map((r) => explainProof(r.obligation as ProofObligation, r, program));

  const ordered: ExplainedProof[] = [];
  const placed = new Set<string>();
  const pending = [...explained];
  while (pending.length > 0) {
    const ready = pending.findIndex((p) => p.dependsOn.every((d) => placed.has(d) || !pending.some((q) => q.obligation.property === d)));
    const [next] = pending.splice(ready >= 0 ? ready : 0, 1);
    placed.add(next.obligation.property);
    ordered.push(next);
  }
  return ordered;
}
