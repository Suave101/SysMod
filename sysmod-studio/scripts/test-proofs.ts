/**
 * Proves the FRC standard contracts on a fully wired robot with the bundled JKind, through the
 * same runner the app uses. Run with "npm run test:proofs" after "npm run build:jkind".
 */
import * as fs from 'node:fs';
import Module from 'node:module';
import { buildContracts } from '../src/renderer/src/views/utils/agree/frcContracts';
import { generateLustre, MathExpr } from '../src/renderer/src/views/utils/agree/lustreGenerator';
import { parseJKindXml } from '../src/renderer/src/views/utils/agree/jkindResults';
import { explainProofs } from '../src/renderer/src/views/utils/agree/proofExplainer';
import { mathToText } from '../src/renderer/src/views/utils/agree/proofNotation';
import { renderJudgeReportHtml } from '../src/renderer/src/views/utils/agree/judgeReport';
import { generateAadlCode } from '../src/renderer/src/views/utils/aadlGenerator';

// The runner only needs electron for app.isPackaged and IPC registration
const moduleWithLoad = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request: string, ...rest: unknown[]) {
  if (request === 'electron') return { app: { isPackaged: false }, ipcMain: { handle() {} } };
  return originalLoad.call(this, request, ...rest);
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runJKind } = require('../src/main/jkind') as typeof import('../src/main/jkind');

type TestNode = Parameters<typeof generateLustre>[0][number];
type TestEdge = Parameters<typeof generateLustre>[1][number];

const node = (id: string, deviceType: string): TestNode =>
  ({ id, position: { x: 0, y: 0 }, data: { label: id, deviceType, category: 'Power & Protection' } }) as TestNode;
const wire = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): TestEdge =>
  ({ id, source, sourceHandle, target, targetHandle }) as TestEdge;

const nodes = [
  node('battery1', 'Battery12V'), node('breaker2', 'MainBreaker120A'), node('pdh3', 'PDH'), node('rio4', 'roboRIO'),
  node('radio5', 'RadioSwitch'), node('kraken6', 'KrakenX60'), node('servo7', 'PWMServo'), node('ph8', 'PneumaticsHub'),
  node('comp9', 'Compressor'), node('switch10', 'PressureSwitch'), node('vrm11', 'VRM'), node('ll12', 'Limelight'),
];
const edges = [
  wire('a', 'battery1', 'pwr-battery-out', 'breaker2', 'pwr-battery-in'),
  wire('b', 'breaker2', 'pwr-pdh-out', 'pdh3', 'pwr-12v-in'),
  wire('c', 'pdh3', 'pwr-low-out', 'rio4', 'pwr-12v-in'),
  wire('d', 'pdh3', 'pwr-low-out', 'radio5', 'pwr-12v-in'),
  wire('e', 'pdh3', 'pwr-high-out', 'kraken6', 'pwr-12v-in'),
  wire('f', 'rio4', 'pwm-out', 'servo7', 'pwm-in'),
  wire('g', 'pdh3', 'pwr-high-out', 'ph8', 'pwr-12v-in'),
  wire('h', 'ph8', 'comp-out', 'comp9', 'comp-in'),
  wire('i', 'switch10', 'press-out', 'ph8', 'press-in'),
  wire('j', 'pdh3', 'pwr-low-out', 'vrm11', 'pwr-12v-in'),
  wire('k', 'vrm11', 'pwr-regulated-out', 'll12', 'pwr-12v-in'),
];

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n     ${detail}`}`);
  if (!ok) failures++;
}

async function prove(testEdges: TestEdge[], custom: Record<string, string> = {}) {
  const program = generateLustre(nodes, testEdges, buildContracts(nodes, testEdges, custom));
  const run = await runJKind(program.lustre, 120);
  return { program, run, results: parseJKindXml(run.xml || '', program.obligations) };
}

async function main(): Promise<void> {
  const wired = await prove(edges);
  check('JKind runs', wired.run.success, wired.run.error);
  check('standard contracts have no errors', wired.program.errors.length === 0, JSON.stringify(wired.program.errors));
  const unproved = wired.results.filter((r) => r.answer !== 'valid');
  check(
    `fully wired robot proves all ${wired.program.obligations.length} obligations`,
    wired.results.length === wired.program.obligations.length && unproved.length === 0,
    JSON.stringify(unproved.map((r) => [r.property, r.answer])),
  );

  const unpowered = await prove(edges.filter((e) => e.id !== 'c'));
  const servo = unpowered.results.find((r) => r.property.startsWith('servo7__assume'));
  check('servo assumption fails when the roboRIO is unpowered', servo?.answer === 'falsifiable', JSON.stringify(servo));

  const custom = await prove(edges, { System: 'lemma "Servo is idle during brownout" : rio4.pwr_12v_in < 6.75 => servo7.pwm_in = 0.0;' });
  const lemma = custom.results.find((r) => r.obligation?.source === 'Your contract');
  check('student lemma is proved from the standard contracts', lemma?.answer === 'valid', JSON.stringify(lemma));

  const aadl = generateAadlCode(nodes, edges, buildContracts(nodes, edges, {}));
  check('AADL embeds the contracts', aadl.includes('with Base_Types;') && aadl.includes('annex agree {**'));

  // Proof explanations for the Judge Report
  check('JKind reports the facts each proof used', wired.results.every((r) => r.ivc && r.ivc.length > 0), JSON.stringify(wired.results.map((r) => [r.property, r.ivc])));
  const explained = explainProofs(custom.program, custom.results);
  const byProperty = (prefix: string) => explained.find((p) => p.obligation.property.startsWith(prefix));
  const kraken = byProperty('kraken6__assume');
  check('motor supply bound is proved by a chain of limits', kraken?.method === 'bounds', kraken?.method);
  check(
    'the chain runs from the motor through the PDH and breaker to the battery',
    ['kraken6__pwr_12v_in', 'pdh3__guarantee', 'breaker2__guarantee', 'battery1__guarantee'].every((v) =>
      kraken?.lines.some((l) => l.reason.kind === 'fact' && l.reason.fact.variable.startsWith(v)),
    ),
  );
  check('the motor proof cites the PDH supply proof it builds on', !!kraken?.dependsOn.includes('pdh3__assume_4'), JSON.stringify(kraken?.dependsOn));
  check('the brownout lemma is proved by following the PWM wire', byProperty('system__lemma_1')?.method === 'substitution', byProperty('system__lemma_1')?.method);
  check('the compressor lemma is proved by following its wires', byProperty('system__lemma_0')?.method === 'substitution', byProperty('system__lemma_0')?.method);
  check('every proved property is explained', explained.length === custom.results.filter((r) => r.answer === 'valid').length);
  check(
    'proofs come after the proofs they build on',
    explained.every((p, i) => p.dependsOn.every((d) => explained.findIndex((q) => q.obligation.property === d) < i)),
  );
  const nameOf = (v: string): string => (custom.program.ports[v] ? `${custom.program.ports[v].component}.${custom.program.ports[v].port}` : v);
  const theorem = mathToText(kraken?.obligation.expr as MathExpr, nameOf);
  check('theorems print as math', theorem === '0 ≤ kraken6.pwr_12v_in(t) ≤ 16', theorem);

  const html = renderJudgeReportHtml({
    team: { number: '0000', name: 'Test Team' },
    generatedAt: new Date(0),
    program: custom.program,
    results: custom.results,
    proofs: explained,
    rules: { passed: true, score: 100, issues: [] },
    componentCount: nodes.length,
    wireCount: edges.length,
  });
  fs.mkdirSync('out/test', { recursive: true });
  fs.writeFileSync('out/test/judge-report.html', html);
  check(
    'the Judge Report renders every proof',
    html.startsWith('<!doctype html>') && explained.every((_, i) => html.includes(`id="proof-${i + 1}"`)) && html.includes('∎') && html.includes('Team 0000'),
  );

  console.log(failures ? `${failures} FAILED` : 'All proof checks passed');
  process.exit(failures ? 1 : 0);
}

main();
