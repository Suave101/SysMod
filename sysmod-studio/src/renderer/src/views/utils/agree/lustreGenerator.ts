import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../../store/useRobotStore';
import { getDevicePorts, getWireFamily, isMismatchedWire, toAadlIdentifier, WIRE_VALUE_TYPES } from '../aadlGenerator';
import { AgreeError, AgreeExpr, AgreeStatement, parseAgreeAnnex } from './agreeParser';
import { AgreeContracts, ContractSource } from './frcContracts';

export type ObligationKind = 'assumption' | 'lemma';

/** What a Lustre property means, so a JKind result can be explained in SysMod's terms */
export interface ProofObligation {
  property: string;
  kind: ObligationKind;
  component: string;
  description: string;
  source: string;
}

export interface ContractError extends AgreeError {
  scope: string;
}

export interface LustreProgram {
  lustre: string;
  obligations: ProofObligation[];
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

interface Scope {
  name: string;
  resolve: (path: string[]) => string | undefined;
}

function toLustre(expr: AgreeExpr, scope: Scope, errors: ContractError[]): string {
  switch (expr.kind) {
    case 'bool':
      return expr.value ? 'true' : 'false';
    case 'number':
      return expr.text;
    case 'id': {
      const resolved = scope.resolve(expr.path);
      if (!resolved) {
        errors.push({ scope: scope.name, line: expr.line, message: `Unknown name "${expr.path.join('.')}"` });
        return expr.path.join('__');
      }
      return resolved;
    }
    case 'unary':
      return expr.op === 'pre'
        ? `(pre ${toLustre(expr.operand, scope, errors)})`
        : `(${expr.op === 'not' ? 'not ' : '-'}${toLustre(expr.operand, scope, errors)})`;
    case 'binary':
      return `(${toLustre(expr.left, scope, errors)} ${BINARY_OPERATORS[expr.op] || expr.op} ${toLustre(expr.right, scope, errors)})`;
    case 'prev':
      return `(${toLustre(expr.initial, scope, errors)} -> pre (${toLustre(expr.value, scope, errors)}))`;
    case 'ite':
      return `(if ${toLustre(expr.cond, scope, errors)} then ${toLustre(expr.then, scope, errors)} else ${toLustre(expr.else, scope, errors)})`;
  }
}

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
  const typeConstants = new Map<string, Map<string, string>>();
  parsedTypes.forEach((statements, type) => {
    const names = new Map<string, string>();
    typeConstants.set(type, names);
    statements.forEach((s) => {
      if (s.kind !== 'const') return;
      const lustreName = `${toAadlIdentifier(type)}__${s.name}`;
      names.set(s.name, lustreName);
      const scope: Scope = { name: `${type}: ${s.source}`, resolve: (path) => (path.length === 1 ? names.get(path[0]) : undefined) };
      constants.push(`const ${lustreName} : ${s.type} = ${toLustre(s.expr, scope, errors)};`);
    });
  });

  // A connected input takes its source's value; inputs with no wire, or several, stay free
  const validEdges = edges.filter((e) => !isMismatchedWire(e));
  const instanceIds = new Map(nodes.map((n) => [n.id, toAadlIdentifier(n.id)]));
  const portName = (nodeId: string, handle: string): string => `${instanceIds.get(nodeId)}__${toAadlIdentifier(handle)}`;

  const instanceNames = new Map<string, Map<string, string>>();
  nodes.forEach((node) => {
    const type = node.data?.deviceType;
    const names = new Map<string, string>(typeConstants.get(type) || []);
    instanceNames.set(instanceIds.get(node.id) as string, names);
    const ports = getDevicePorts(type);

    [...ports.in.map((h) => ({ h, isIn: true })), ...ports.out.map((h) => ({ h, isIn: false }))].forEach(({ h, isIn }) => {
      const family = getWireFamily(h);
      if (!family) return;
      const name = portName(node.id, h);
      names.set(toAadlIdentifier(h), name);
      const declaration = `${name} : ${WIRE_VALUE_TYPES[family]}`;
      const feeds = isIn ? validEdges.filter((e) => e.target === node.id && e.targetHandle === h) : [];
      if (feeds.length === 1) {
        locals.push(declaration);
        equations.push(`${name} = ${portName(feeds[0].source, feeds[0].sourceHandle as string)};`);
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
    const names = instanceNames.get(instance) as Map<string, string>;

    statements.forEach((s) => {
      if (s.kind === 'eq') names.set(s.name, `${instance}__${s.name}`);
    });
    const resolve = (path: string[]): string | undefined => (path.length === 1 ? names.get(path[0]) : undefined);

    const assumeVars: string[] = [];
    const guaranteeVars: string[] = [];
    statements.forEach((s, idx) => {
      const scope: Scope = { name: `${type}: ${s.source}`, resolve };
      if (s.kind === 'eq') {
        locals.push(`${instance}__${s.name} : ${s.type}`);
        equations.push(`${instance}__${s.name} = ${toLustre(s.expr, scope, errors)};`);
      } else if (s.kind === 'assume' || s.kind === 'guarantee') {
        const variable = `${instance}__${s.kind}_${s.name || idx}`;
        locals.push(`${variable} : bool`);
        equations.push(`${variable} = ${toLustre(s.expr, scope, errors)};`);
        (s.kind === 'assume' ? assumeVars : guaranteeVars).push(variable);
        if (s.kind === 'assume') {
          properties.push(variable);
          obligations.push({ property: variable, kind: 'assumption', component: node.id, description: s.description, source: s.source });
        }
      } else if (s.kind !== 'const') {
        errors.push({ scope: scope.name, line: s.line, message: `"${s.kind}" belongs in the system contract, not a device type` });
      }
    });

    const assumptions = assumeVars.length > 0 ? `historically(${assumeVars.join(' and ')})` : 'true';
    guaranteeVars.forEach((g) => assertions.push(`assert ${assumptions} => ${g};`));
  });

  if (contracts.system.length > 0) {
    const statements = parseSources(contracts.system, 'System', errors);
    const resolve = (path: string[]): string | undefined =>
      path.length === 2 ? instanceNames.get(toAadlIdentifier(path[0]))?.get(path[1]) : undefined;
    statements.forEach((s, idx) => {
      const scope: Scope = { name: `System: ${s.source}`, resolve };
      if (s.kind === 'lemma' || s.kind === 'assert') {
        const variable = `system__${s.kind}_${s.name || idx}`;
        locals.push(`${variable} : bool`);
        equations.push(`${variable} = ${toLustre(s.expr, scope, errors)};`);
        if (s.kind === 'assert') {
          assertions.push(`assert ${variable};`);
        } else {
          properties.push(variable);
          obligations.push({ property: variable, kind: 'lemma', component: 'System', description: s.description, source: s.source });
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
  [...equations, ...assertions].forEach((line) => (lustre += `  ${line}\n`));
  properties.forEach((p) => (lustre += `  --%PROPERTY ${p};\n`));
  lustre += `tel;\n`;

  // Each instance of a device type checks the same contract, so the same mistake would repeat per instance
  const uniqueErrors = errors.filter((e, idx) => errors.findIndex((o) => o.scope === e.scope && o.line === e.line && o.message === e.message) === idx);
  return { lustre, obligations, errors: uniqueErrors, warnings };
}
