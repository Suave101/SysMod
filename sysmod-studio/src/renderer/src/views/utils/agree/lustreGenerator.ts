import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../../store/useRobotStore';
import { getDevicePorts, getWireFamily, isMismatchedWire, toAadlIdentifier, WireFamily, WIRE_VALUE_TYPES } from '../aadlGenerator';
import { AgreeError, AgreeExpr, AgreeStatement, parseAgreeAnnex } from './agreeParser';
import { AgreeContracts, ContractSource } from './frcContracts';

export type ObligationKind = 'assumption' | 'lemma';

/**
 * An AGREE expression with every name resolved: ports and eq variables become Lustre
 * variables and constants keep their value. Lustre text and human-readable proofs are both
 * printed from this, so they always describe the same formula.
 */
export type MathExpr =
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; text: string; value: number }
  | { kind: 'const'; name: string; label: string; value?: number }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: 'not' | '-' | 'pre'; operand: MathExpr }
  | { kind: 'binary'; op: string; left: MathExpr; right: MathExpr }
  | { kind: 'prev'; value: MathExpr; initial: MathExpr }
  | { kind: 'ite'; cond: MathExpr; then: MathExpr; else: MathExpr };

/** What a Lustre property means, so a JKind result can be explained in SysMod's terms */
export interface ProofObligation {
  property: string;
  kind: ObligationKind;
  component: string;
  deviceType?: string;
  description: string;
  source: string;
  expr: MathExpr;
}

/**
 * A fact the proofs may rely on: a wire on the diagram, a component's guarantee, an eq
 * definition or a system assert. Each one is a Lustre local named in the --%IVC annotation,
 * so JKind can report exactly which facts each proof needed.
 */
export interface ProofFact {
  variable: string;
  kind: 'wire' | 'guarantee' | 'definition' | 'assertion';
  component: string;
  deviceType?: string;
  description: string;
  source: string;
  expr: MathExpr;
  /** Assumption properties that must have held for this guarantee to apply */
  requires: string[];
}

/** A port's Lustre variable, traced back to the diagram */
export interface PortVariable {
  component: string;
  deviceType: string;
  port: string;
  handle: string;
  family: WireFamily;
}

export interface ContractError extends AgreeError {
  scope: string;
}

export interface LustreProgram {
  lustre: string;
  obligations: ProofObligation[];
  facts: ProofFact[];
  ports: Record<string, PortVariable>;
  errors: ContractError[];
  warnings: string[];
}

type LabelledStatement = AgreeStatement & { source: string };

/** Parses each source on its own, so line numbers in errors match what the student typed */
function parseSources(sources: ContractSource[], scope: string, errors: ContractError[]): LabelledStatement[] {
  const seen = new Set<string>();
  return sources.flatMap(({ label, text }) => {
    const annex = parseAgreeAnnex(text);
    annex.errors.forEach((e) => errors.push({ ...e, scope: `${scope}: ${label}` }));
    return annex.statements
      .filter((s) => {
        if (s.kind !== 'eq' && s.kind !== 'const') return true;
        if (seen.has(s.name)) {
          errors.push({ scope: `${scope}: ${label}`, line: s.line, message: `"${s.name}" is already defined for ${scope}` });
          return false;
        }
        seen.add(s.name);
        return true;
      })
      .map((s) => ({ ...s, source: label }));
  });
}

const HISTORICALLY_NODE = `node historically(signal : bool) returns (holds : bool);
let
  holds = signal and (true -> pre holds);
tel;
`;

const BINARY_OPERATORS: Record<string, string> = { '<=>': '=' };

export interface Scope {
  name: string;
  resolve: (path: string[]) => MathExpr | undefined;
}

export function toMath(expr: AgreeExpr, scope: Scope, errors: ContractError[]): MathExpr {
  switch (expr.kind) {
    case 'bool':
      return expr;
    case 'number':
      return { kind: 'number', text: expr.text, value: Number(expr.text) };
    case 'id': {
      const resolved = scope.resolve(expr.path);
      if (!resolved) {
        errors.push({ scope: scope.name, line: expr.line, message: `Unknown name "${expr.path.join('.')}"` });
        return { kind: 'var', name: expr.path.join('__') };
      }
      return resolved;
    }
    case 'unary':
      return { kind: 'unary', op: expr.op, operand: toMath(expr.operand, scope, errors) };
    case 'binary':
      return { kind: 'binary', op: expr.op, left: toMath(expr.left, scope, errors), right: toMath(expr.right, scope, errors) };
    case 'prev':
      return { kind: 'prev', value: toMath(expr.value, scope, errors), initial: toMath(expr.initial, scope, errors) };
    case 'ite':
      return { kind: 'ite', cond: toMath(expr.cond, scope, errors), then: toMath(expr.then, scope, errors), else: toMath(expr.else, scope, errors) };
  }
}

export function mathToLustre(expr: MathExpr): string {
  switch (expr.kind) {
    case 'bool':
      return expr.value ? 'true' : 'false';
    case 'number':
      return expr.text;
    case 'const':
    case 'var':
      return expr.name;
    case 'unary':
      return expr.op === 'pre' ? `(pre ${mathToLustre(expr.operand)})` : `(${expr.op === 'not' ? 'not ' : '-'}${mathToLustre(expr.operand)})`;
    case 'binary':
      return `(${mathToLustre(expr.left)} ${BINARY_OPERATORS[expr.op] || expr.op} ${mathToLustre(expr.right)})`;
    case 'prev':
      return `(${mathToLustre(expr.initial)} -> pre (${mathToLustre(expr.value)}))`;
    case 'ite':
      return `(if ${mathToLustre(expr.cond)} then ${mathToLustre(expr.then)} else ${mathToLustre(expr.else)})`;
  }
}

/** The value of a constant expression, or undefined if it depends on anything else */
export function evaluateNumber(expr: MathExpr): number | undefined {
  if (expr.kind === 'number') return expr.value;
  if (expr.kind === 'const') return expr.value;
  if (expr.kind === 'unary' && expr.op === '-') {
    const v = evaluateNumber(expr.operand);
    return v === undefined ? undefined : -v;
  }
  if (expr.kind === 'binary' && ['+', '-', '*', '/'].includes(expr.op)) {
    const l = evaluateNumber(expr.left);
    const r = evaluateNumber(expr.right);
    if (l === undefined || r === undefined) return undefined;
    return expr.op === '+' ? l + r : expr.op === '-' ? l - r : expr.op === '*' ? l * r : r === 0 ? undefined : l / r;
  }
  return undefined;
}

const variable = (name: string): MathExpr => ({ kind: 'var', name });
const equals = (left: MathExpr, right: MathExpr): MathExpr => ({ kind: 'binary', op: '=', left, right });

/**
 * Builds one Lustre program that proves the diagram's contracts compositionally, the way AGREE
 * checks a system implementation: each device's guarantees are assumed whenever its own
 * assumptions have always held, and JKind must then prove every device's assumptions and every
 * system lemma from the wiring.
 */
export function generateLustre(nodes: Node<FRCNodeData>[], edges: Edge[], contracts: AgreeContracts): LustreProgram {
  const errors: ContractError[] = [];
  const warnings: string[] = [];
  const obligations: ProofObligation[] = [];
  const facts: ProofFact[] = [];
  const ports: Record<string, PortVariable> = {};

  const constants: string[] = [];
  const inputs: string[] = [];
  const locals: string[] = [];
  const equations: string[] = [];
  const assertions: string[] = [];
  const properties: string[] = [];

  const parsedTypes = new Map<string, LabelledStatement[]>();
  Object.entries(contracts.deviceTypes).forEach(([type, sources]) => {
    parsedTypes.set(type, parseSources(sources, type, errors));
  });

  // Constants belong to the device type, not to each instance of it
  const typeConstants = new Map<string, Map<string, MathExpr>>();
  parsedTypes.forEach((statements, type) => {
    const names = new Map<string, MathExpr>();
    typeConstants.set(type, names);
    statements.forEach((s) => {
      if (s.kind !== 'const') return;
      const lustreName = `${toAadlIdentifier(type)}__${s.name}`;
      const scope: Scope = { name: `${type}: ${s.source}`, resolve: (path) => (path.length === 1 ? names.get(path[0]) : undefined) };
      const value = toMath(s.expr, scope, errors);
      names.set(s.name, { kind: 'const', name: lustreName, label: s.name, value: evaluateNumber(value) });
      constants.push(`const ${lustreName} : ${s.type} = ${mathToLustre(value)};`);
    });
  });

  // A connected input takes its source's value; inputs with no wire, or several, stay free
  const validEdges = edges.filter((e) => !isMismatchedWire(e));
  const instanceIds = new Map(nodes.map((n) => [n.id, toAadlIdentifier(n.id)]));
  const portName = (nodeId: string, handle: string): string => `${instanceIds.get(nodeId)}__${toAadlIdentifier(handle)}`;

  const instanceNames = new Map<string, Map<string, MathExpr>>();
  nodes.forEach((node) => {
    const type = node.data?.deviceType;
    const names = new Map<string, MathExpr>(typeConstants.get(type) || []);
    instanceNames.set(instanceIds.get(node.id) as string, names);
    const devicePorts = getDevicePorts(type);

    [...devicePorts.in.map((h) => ({ h, isIn: true })), ...devicePorts.out.map((h) => ({ h, isIn: false }))].forEach(({ h, isIn }) => {
      const family = getWireFamily(h);
      if (!family) return;
      const name = portName(node.id, h);
      names.set(toAadlIdentifier(h), variable(name));
      ports[name] = { component: node.id, deviceType: type, port: toAadlIdentifier(h), handle: h, family };
      const declaration = `${name} : ${WIRE_VALUE_TYPES[family]}`;
      const feeds = isIn ? validEdges.filter((e) => e.target === node.id && e.targetHandle === h) : [];
      if (feeds.length === 1) {
        const sourceName = portName(feeds[0].source, feeds[0].sourceHandle as string);
        locals.push(declaration);
        equations.push(`${name} = ${sourceName};`);
        facts.push({
          variable: name,
          kind: 'wire',
          component: node.id,
          deviceType: type,
          description: `Wire from ${feeds[0].source} to ${node.id}`,
          source: 'Diagram',
          expr: equals(variable(name), variable(sourceName)),
          requires: [],
        });
      } else {
        inputs.push(declaration);
        if (feeds.length > 1 && !['can', 'eth', 'usb', 'i2c', 'mxp', 'dio'].includes(family)) {
          warnings.push(`${node.id}.${h} has ${feeds.length} wires, so the checker treats it as unconstrained`);
        }
      }
    });
  });

  nodes.forEach((node) => {
    const type = node.data?.deviceType;
    const statements = parsedTypes.get(type);
    if (!statements) return;
    const instance = instanceIds.get(node.id) as string;
    const names = instanceNames.get(instance) as Map<string, MathExpr>;

    statements.forEach((s) => {
      if (s.kind === 'eq') names.set(s.name, variable(`${instance}__${s.name}`));
    });
    const resolve = (path: string[]): MathExpr | undefined => (path.length === 1 ? names.get(path[0]) : undefined);

    const assumeVars: string[] = [];
    const guaranteeFacts: ProofFact[] = [];
    statements.forEach((s, idx) => {
      const scope: Scope = { name: `${type}: ${s.source}`, resolve };
      if (s.kind === 'eq') {
        const name = `${instance}__${s.name}`;
        const expr = toMath(s.expr, scope, errors);
        locals.push(`${name} : ${s.type}`);
        equations.push(`${name} = ${mathToLustre(expr)};`);
        facts.push({ variable: name, kind: 'definition', component: node.id, deviceType: type, description: `Definition of ${s.name}`, source: s.source, expr: equals(variable(name), expr), requires: [] });
      } else if (s.kind === 'assume' || s.kind === 'guarantee') {
        const name = `${instance}__${s.kind}_${s.name || idx}`;
        const expr = toMath(s.expr, scope, errors);
        locals.push(`${name} : bool`);
        equations.push(`${name} = ${mathToLustre(expr)};`);
        if (s.kind === 'assume') {
          assumeVars.push(name);
          properties.push(name);
          obligations.push({ property: name, kind: 'assumption', component: node.id, deviceType: type, description: s.description, source: s.source, expr });
        } else {
          guaranteeFacts.push({ variable: name, kind: 'guarantee', component: node.id, deviceType: type, description: s.description, source: s.source, expr, requires: [] });
        }
      } else if (s.kind !== 'const') {
        errors.push({ scope: scope.name, line: s.line, message: `"${s.kind}" belongs in the system contract, not a device type` });
      }
    });

    const assumptions = assumeVars.length > 0 ? `historically(${assumeVars.join(' and ')})` : 'true';
    guaranteeFacts.forEach((g) => {
      assertions.push(`assert ${assumptions} => ${g.variable};`);
      facts.push({ ...g, requires: assumeVars });
    });
  });

  if (contracts.system.length > 0) {
    const statements = parseSources(contracts.system, 'System', errors);
    const resolve = (path: string[]): MathExpr | undefined =>
      path.length === 2 ? instanceNames.get(toAadlIdentifier(path[0]))?.get(path[1]) : undefined;
    statements.forEach((s, idx) => {
      const scope: Scope = { name: `System: ${s.source}`, resolve };
      if (s.kind === 'lemma' || s.kind === 'assert') {
        const name = `system__${s.kind}_${s.name || idx}`;
        const expr = toMath(s.expr, scope, errors);
        locals.push(`${name} : bool`);
        equations.push(`${name} = ${mathToLustre(expr)};`);
        if (s.kind === 'assert') {
          assertions.push(`assert ${name};`);
          facts.push({ variable: name, kind: 'assertion', component: 'System', description: s.description, source: s.source, expr, requires: [] });
        } else {
          properties.push(name);
          obligations.push({ property: name, kind: 'lemma', component: 'System', description: s.description, source: s.source, expr });
        }
      } else {
        errors.push({ scope: scope.name, line: s.line, message: `Only lemma and assert statements are supported in the system contract` });
      }
    });
  }

  if (properties.length === 0) warnings.push('No assumptions or lemmas to prove. Add an assume to a device type or a lemma to the system.');

  let lustre = `-- Generated by SysMod Studio for JKind\n\n`;
  if (constants.length > 0) lustre += `${constants.join('\n')}\n\n`;
  lustre += `${HISTORICALLY_NODE}\n`;
  lustre += `node main(\n  ${inputs.join(';\n  ') || 'sysmod__tick : bool'}\n) returns ();\n`;
  if (locals.length > 0) lustre += `var\n  ${locals.join(';\n  ')};\n`;
  lustre += `let\n  --%MAIN;\n`;
  // Lets "jkind -ivc" report which wires and guarantees each proof actually used
  if (facts.length > 0) lustre += `  --%IVC ${facts.map((f) => f.variable).join(', ')};\n`;
  [...equations, ...assertions].forEach((line) => (lustre += `  ${line}\n`));
  properties.forEach((p) => (lustre += `  --%PROPERTY ${p};\n`));
  lustre += `tel;\n`;

  // Each instance of a device type checks the same contract, so the same mistake would repeat per instance
  const uniqueErrors = errors.filter((e, idx) => errors.findIndex((o) => o.scope === e.scope && o.line === e.line && o.message === e.message) === idx);
  return { lustre, obligations, facts, ports, errors: uniqueErrors, warnings };
}
