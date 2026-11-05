/**
 * Proves the FRC standard contracts on a fully wired robot with the bundled JKind, through the
 * same runner the app uses. Run with "npm run test:proofs" after "npm run build:jkind".
 */
import Module from 'node:module';
import { buildContracts } from '../src/renderer/src/views/utils/agree/frcContracts';
import { generateLustre } from '../src/renderer/src/views/utils/agree/lustreGenerator';
import { parseJKindXml } from '../src/renderer/src/views/utils/agree/jkindResults';
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

  console.log(failures ? `${failures} FAILED` : 'All proof checks passed');
  process.exit(failures ? 1 : 0);
}

main();
