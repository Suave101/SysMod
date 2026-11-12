/**
 * Behavior programs the AGREE tests share: test-behavior.ts runs them through the AGREE equations
 * beside the simulator, and test-proofs.ts proves their properties with JKind.
 */
import { AgentProperty, ReadingDomain } from '../src/renderer/src/views/behavior/agentAgree';

type B = { type: string; fields?: Record<string, string>; inputs?: Record<string, { block: B }>; next?: { block: B } };

const chain = (...blocks: B[]): { block: B } => {
  const [first, ...rest] = blocks;
  return { block: rest.length ? { ...first, next: chain(...rest) } : first };
};
const program = (...blocks: B[]) => ({ blocks: { languageVersion: 0, blocks: blocks.map((b, i) => ({ x: 20, y: 20 + i * 200, ...b })) } });
const cond = (attribute: string, op: string, value: string): B => ({
  type: 'soar_wme_condition',
  fields: { Operator: op },
  inputs: { WorkingMemoryElement: { block: { type: 'hardware_input', fields: { hardware_input: attribute } } }, Value: { block: { type: 'hardware_state', fields: { state: value } } } },
});
const mode = (m: string): B => ({ type: 'soar_state_check', fields: { agent_state: m } });
const set = (attribute: string, value: string): B => ({
  type: 'soar_set_output',
  inputs: { hardware_input: { block: { type: 'hardware_input', fields: { hardware_input: attribute } } }, hardware_state: { block: { type: 'hardware_state', fields: { state: value } } } },
});
const operator = (name: string, priority: string, conditions: B[], ...applies: [string, B[], B[]][]): B => ({
  type: 'soar_propose_operator',
  fields: { propose_operator_name: name, PREFERENCE: priority },
  inputs: {
    ...(conditions.length ? { LHS: chain(...conditions) } : {}),
    RHS: chain(
      ...applies.map(([apply, conds, actions]): B => ({
        type: 'soar_apply_rule',
        fields: { apply_operator_name: apply },
        inputs: { ...(conds.length ? { apply_operator_conditions: chain(...conds) } : {}), apply_operator_actions: chain(...actions) },
      })),
    ),
  },
});

/**
 * An intake and shooter. In autonomous, a blocked beam break makes "hold" (best) close the intake.
 * In teleop, "release" opens it. "spin" runs the shooter whenever it is slow, in any mode, so it
 * ties with release. An elaboration turns the LED green while the shooter is fast.
 */
export const intakeProgram = program(
  operator('hold', 'BEST', [mode('autonomous'), cond('beam-break', '==', 'blocked')], ['close', [], [set('intake', 'closed')]]),
  operator('release', 'NORMAL', [mode('teleop')], ['open', [], [set('intake', 'open')]]),
  operator('spin', 'NORMAL', [cond('shooter-speed', '<', '3000')], ['spin-up', [], [set('shooter', '4500')]]),
  { type: 'soar_elaboration_rule', fields: { ELAB_NAME: 'ready' }, inputs: { LHS: chain(cond('shooter-speed', '>', '3000')), RHS: chain(set('led', 'green')) } },
);

/** Properties of intakeProgram, with the answer JKind must give */
export const intakeProperties: { property: AgentProperty; answer: 'valid' | 'falsifiable' }[] = [
  { property: { kind: 'only-in-mode', command: { device: 'intake', value: 'closed' }, mode: 'autonomous' }, answer: 'valid' },
  { property: { kind: 'only-in-mode', command: { device: 'intake', value: 'open' }, mode: 'teleop' }, answer: 'valid' },
  // spin has no mode test, so the shooter can start in any mode
  { property: { kind: 'only-in-mode', command: { device: 'shooter', value: '4500' }, mode: 'teleop' }, answer: 'falsifiable' },
  { property: { kind: 'can-happen', command: { device: 'intake', value: 'closed' } }, answer: 'falsifiable' },
  { property: { kind: 'can-happen', command: { device: 'led', value: 'green' } }, answer: 'falsifiable' },
  // The intake stays closed after autonomous while the shooter spins up
  { property: { kind: 'never-together', first: { device: 'intake', value: 'closed' }, second: { device: 'shooter', value: '4500' } }, answer: 'falsifiable' },
];

/**
 * Rules that test readings the diagram's devices never send: the beam break only sends blocked or
 * clear, and the shooter speed is a number. "unjam" and "stop" can only run on those impossible
 * readings, so with the domains they can't happen, and without them they can.
 */
export const domainProgram = program(
  operator('feed', 'NORMAL', [cond('beam-break', '==', 'blocked')], ['run-feed', [], [set('intake', 'closed')]]),
  operator('unjam', 'NORMAL', [cond('beam-break', '==', 'jammed')], ['reverse', [], [set('intake', 'reverse')]]),
  operator('stop', 'NORMAL', [cond('shooter-speed', '==', 'stalled')], ['halt', [], [set('led', 'red')]]),
);

export const domainProgramDomains = new Map<string, ReadingDomain>([
  ['beam-break', { kind: 'words', words: ['blocked', 'clear'], source: 'a BeamBreak on the diagram' }],
  ['shooter-speed', { kind: 'numbers', source: 'a KrakenX60 on the diagram' }],
]);

/** Properties of domainProgram: [answer without domains, answer with them] */
export const domainProperties: { property: AgentProperty; answers: ['valid' | 'falsifiable', 'valid' | 'falsifiable'] }[] = [
  { property: { kind: 'can-happen', command: { device: 'intake', value: 'closed' } }, answers: ['falsifiable', 'falsifiable'] },
  { property: { kind: 'can-happen', command: { device: 'intake', value: 'reverse' } }, answers: ['falsifiable', 'valid'] },
  { property: { kind: 'can-happen', command: { device: 'led', value: 'red' } }, answers: ['falsifiable', 'valid'] },
];

/**
 * A required operator holds the selection, so the clear operator never runs and the selection
 * stays. Its apply rule must fire again each time the speed it tested changes.
 */
export const requiredRefireProgram = program(
  operator('track', 'REQUIRE', [mode('teleop')], ['aim', [cond('target', '>', '10')], [set('turret', '1')]]),
  operator('idle', 'NORMAL', [], ['rest', [], [set('led', 'off')]]),
);
