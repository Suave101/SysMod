/**
 * Checks the Hardware Validation Engine: CAN bus load, current limits and port/ID conflicts.
 * Run with "npm run test:hardware". It needs no Java.
 */
import { analyzeHardware, CAN_FRAMES_PER_SECOND, HardwareAnalysis } from '../src/renderer/src/views/utils/hardwareValidation';
import { verifySystemProperties } from '../src/renderer/src/views/utils/systemVerifier';
import { generateJavaCode, generatePythonCode } from '../src/renderer/src/views/utils/codeGenerators';
import { connectionProblem } from '../src/renderer/src/views/utils/connectionRules';

type TestNode = Parameters<typeof analyzeHardware>[0][number];
type TestEdge = Parameters<typeof analyzeHardware>[1][number];

const node = (id: string, deviceType: string, data: Partial<TestNode['data']> = {}): TestNode =>
  ({ id, position: { x: 0, y: 0 }, data: { label: id, deviceType, category: 'Power & Protection', ...data } }) as TestNode;
const wire = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string, data?: Record<string, unknown>): TestEdge =>
  ({ id, source, sourceHandle, target, targetHandle, data }) as TestEdge;
const pdhWire = (id: string, target: string, channelType: 'high' | 'low' | 'switched', channelNum: number): TestEdge =>
  wire(id, 'pdh', `pwr-${channelType}-out`, target, 'pwr-12v-in', { channelType, channelNum });

let failures = 0;
function check(name: string, ok: boolean, detail: unknown = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === '' ? '' : `\n     ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}
const issueIds = (h: HardwareAnalysis): string[] => h.issues.map((i) => i.id);

// A small, healthy robot
const base = [
  node('battery', 'Battery12V'), node('breaker', 'MainBreaker120A'), node('pdh', 'PDH'), node('rio', 'roboRIO'),
  node('radio', 'RadioSwitch'), node('m1', 'KrakenX60', { canId: 1, currentLimit: 40 }), node('m2', 'KrakenX60', { canId: 2, currentLimit: 40 }),
];
const baseWires = [
  wire('a', 'battery', 'pwr-battery-out', 'breaker', 'pwr-battery-in'),
  wire('b', 'breaker', 'pwr-pdh-out', 'pdh', 'pwr-12v-in'),
  pdhWire('p0', 'm1', 'high', 0), pdhWire('p1', 'm2', 'high', 1), pdhWire('p20', 'rio', 'low', 20), pdhWire('p21', 'radio', 'low', 21),
  wire('c1', 'rio', 'can-start', 'm1', 'can-in'), wire('c2', 'm1', 'can-out', 'm2', 'can-in'), wire('c3', 'm2', 'can-out', 'pdh', 'can-term'),
];

const healthy = analyzeHardware(base, baseWires);
check('a healthy robot has no hardware issues', healthy.issues.length === 0, issueIds(healthy));
check('the roboRIO CAN bus is found with its 4 talking devices', healthy.canBuses.length === 1 && healthy.canBuses[0].devices.length === 4, healthy.canBuses);
const expectedFrames = CAN_FRAMES_PER_SECOND.roboRIO + 2 * CAN_FRAMES_PER_SECOND.KrakenX60 + CAN_FRAMES_PER_SECOND.PDH;
check('bus load adds up each device', healthy.canBuses[0].framesPerSecond === expectedFrames, healthy.canBuses[0].framesPerSecond);
check('the main breaker carries every channel', healthy.mainBreaker.loadA === 40 + 40 + 2 + 1.5, healthy.mainBreaker.loadA);

// ── CAN bus saturation ──
const sparks = Array.from({ length: 20 }, (_, i) => node(`s${i}`, 'SparkMaxNEO', { canId: 10 + i }));
const sparkChain = sparks.map((s, i) => wire(`sc${i}`, i === 0 ? 'm2' : sparks[i - 1].id, 'can-out', s.id, 'can-in'));
const busy = analyzeHardware([...base, ...sparks], [...baseWires.filter((w) => w.id !== 'c3'), ...sparkChain, wire('end', 's19', 'can-out', 'pdh', 'can-term')]);
const saturated = busy.issues.find((i) => i.id.startsWith('can-load-'));
check('22 motors saturate a 1 Mbit/s CAN bus', saturated?.severity === 'error' && busy.canBuses[0].utilization >= 0.9, busy.canBuses[0].utilization);

const canivore = [node('cv', 'CANivore'), ...Array.from({ length: 12 }, (_, i) => node(`k${i}`, 'KrakenX60', { canId: 20 + i }))];
const fdChain = canivore.slice(1).map((k, i) => wire(`fd${i}`, i === 0 ? 'cv' : canivore[i].id, i === 0 ? 'can-fd-start' : 'can-out', k.id, 'can-in'));
const fd = analyzeHardware([...base, ...canivore], [...baseWires, ...fdChain]);
const fdBus = fd.canBuses.find((b) => b.isFd);
check('a CANivore CAN FD bus is found separately', !!fdBus && fd.canBuses.length === 2, fd.canBuses.map((b) => b.name));
check('CAN FD carries the same traffic with less load', !!fdBus && fdBus.utilization < 0.3 && !fd.issues.some((i) => i.id === `can-load-${fdBus.id}`), fdBus?.utilization);

// ── Current limits ──
const hot = analyzeHardware(base.map((n) => (n.id === 'm1' ? node('m1', 'KrakenX60', { canId: 1, currentLimit: 60 }) : n)), baseWires);
check('a 60 A limit on a 40 A breaker is flagged', hot.issues.some((i) => i.id === 'current-motor-limit-m1' && i.severity === 'warning'), issueIds(hot));

const vrmRobot = [...base, node('vrm', 'VRM'), node('ll', 'Limelight')];
const vrmWires = [...baseWires, pdhWire('p22', 'vrm', 'low', 22), wire('v', 'vrm', 'pwr-regulated-out', 'll', 'pwr-12v-in')];
const vrm = analyzeHardware(vrmRobot, vrmWires);
check('a Limelight overloads the 2 A VRM output', vrm.issues.some((i) => i.id === 'current-regulator-vrm'), issueIds(vrm));
check('regulator loads roll up to their PDH channel', vrm.channels.find((c) => c.nodeId === 'vrm')?.loadA === 0.1 + 4, vrm.channels.find((c) => c.nodeId === 'vrm'));

const pneumatic = [...base, node('ph', 'PneumaticsHub', { canId: 1 }), node('comp', 'Compressor'), node('coproc', 'Coprocessor')];
const pneumaticWires = [...baseWires.filter((w) => w.id !== 'p21'), pdhWire('p21', 'ph', 'low', 21), wire('cmp', 'ph', 'comp-out', 'comp', 'comp-in'), pdhWire('p23', 'coproc', 'switched', 23)];
const ph = analyzeHardware(pneumatic, pneumaticWires);
check('a compressor through the Pneumatic Hub counts against its channel', ph.channels.find((c) => c.nodeId === 'ph')?.loadA === 12.5, ph.channels.find((c) => c.nodeId === 'ph'));
check('12.5 A on a 15 A channel is not an overload', !ph.issues.some((i) => i.id.startsWith('current-channel')), issueIds(ph));

const swerve = Array.from({ length: 8 }, (_, i) => node(`d${i}`, 'KrakenX60', { canId: 30 + i, currentLimit: 40 }));
const drive = analyzeHardware([...base, ...swerve], [...baseWires, ...swerve.map((d, i) => pdhWire(`dp${i}`, d.id, 'high', 2 + i))]);
const breaker = drive.issues.find((i) => i.id === 'current-main-breaker');
check('10 motors at 40 A can trip the 120 A main breaker', breaker?.severity === 'warning' && drive.mainBreaker.loadA > 240, drive.mainBreaker.loadA);

// ── Duplicate and invalid IDs ──
const dupCan = analyzeHardware(base.map((n) => (n.id === 'm2' ? node('m2', 'KrakenX60', { canId: 1 }) : n)), baseWires);
check('two Talon FX on one bus with CAN ID 1 are a conflict', dupCan.issues.some((i) => i.title === 'Duplicate CAN ID' && i.nodeIds?.length === 2), issueIds(dupCan));
const mixed = analyzeHardware([...base, node('enc', 'CANcoder', { canId: 1 })], [...baseWires, wire('c4', 'm2', 'can-out', 'enc', 'can-in')]);
check('a CANcoder may share ID 1 with a Talon FX', !mixed.issues.some((i) => i.title === 'Duplicate CAN ID'), issueIds(mixed));
const spark = analyzeHardware(
  [...base, node('n1', 'SparkMaxNEO', { canId: 5 }), node('n2', 'NEOVortex', { canId: 5 })],
  [...baseWires, wire('c5', 'm2', 'can-out', 'n1', 'can-in'), wire('c6', 'n1', 'can-out', 'n2', 'can-in')],
);
check('a SPARK MAX and SPARK Flex share the SPARK ID space', spark.issues.some((i) => i.title === 'Duplicate CAN ID'), issueIds(spark));
const unwired = analyzeHardware([...base, node('u1', 'Pigeon2', { canId: 7 }), node('u2', 'Pigeon2', { canId: 7 })], baseWires);
check('unwired devices with the same ID are still flagged', unwired.issues.some((i) => i.title === 'Duplicate CAN ID'), issueIds(unwired));
const range = analyzeHardware(base.map((n) => (n.id === 'm2' ? node('m2', 'KrakenX60', { canId: 63 }) : n)), baseWires);
check('CAN ID 63 is out of range', range.issues.some((i) => i.id === 'id-can-range-m2'), issueIds(range));

const sensors = analyzeHardware([...base, node('ls', 'LimitSwitch', { dioPort: 3 }), node('bb', 'BeamBreak', { dioPort: 3 }), node('sv1', 'PWMServo', { pwmPort: 0 }), node('sv2', 'PWMServo', { pwmPort: 0 })], baseWires);
check('two sensors on DIO 3 are a conflict', sensors.issues.some((i) => i.title === 'Duplicate DIO Port'), issueIds(sensors));
check('two servos on PWM 0 are a conflict', sensors.issues.some((i) => i.title === 'Duplicate PWM Port'), issueIds(sensors));
const dio12 = analyzeHardware([...base, node('ls', 'LimitSwitch', { dioPort: 12 })], baseWires);
check('DIO 12 is out of range', dio12.issues.some((i) => i.id === 'id-dio-range-ls'), issueIds(dio12));

const pdhDup = analyzeHardware(base, baseWires.map((w) => (w.id === 'p1' ? pdhWire('p1', 'm2', 'high', 0) : w)));
check('two devices on PDH channel 0 are a conflict', pdhDup.issues.some((i) => i.title === 'Duplicate PDH Channel'), issueIds(pdhDup));

// ── Integration with the FRC rule checks ──
const report = verifySystemProperties(base, baseWires.map((w) => (w.id === 'p1' ? pdhWire('p1', 'm2', 'high', 0) : w)));
check('hardware issues reach the Problems list, tagged for alerts', report.issues.some((i) => i.title === 'Duplicate PDH Channel' && i.category === 'ids'));
check('duplicate CAN IDs are reported once', verifySystemProperties(base.map((n) => (n.id === 'm2' ? node('m2', 'KrakenX60', { canId: 1 }) : n)), baseWires).issues.filter((i) => i.title === 'Duplicate CAN ID').length === 1);

// ── Generated robot code uses the limits from the diagram ──
const codeRobot = [
  node('tfx', 'KrakenX60', { canId: 3, currentLimit: 35 }),
  node('max', 'SparkMaxNEO', { canId: 4, currentLimit: 30 }),
  node('flex', 'NEOVortex', { canId: 5, currentLimit: 50 }),
  node('old', 'Falcon500', { canId: 0 }),
];
const python = generatePythonCode(codeRobot, []);
check('Python sets the Talon FX supply limit from the diagram', python.includes('self.tfx = phoenix6.hardware.TalonFX(3)') && python.includes('.with_supply_current_limit(35)') && python.includes('.with_supply_current_limit_enable(True)'), python);
check('Python sets SPARK smart current limits with REVLib 2025', python.includes('self.max = rev.SparkMax(4, rev.SparkLowLevel.MotorType.kBrushless)') && python.includes('max_config.smartCurrentLimit(30)') && python.includes('flex_config = rev.SparkFlexConfig()') && python.includes('flex_config.smartCurrentLimit(50)'), python);
check('a motor with no limit set gets the 40 A default', python.includes('self.old = phoenix6.hardware.TalonFX(0)') && python.split('.with_supply_current_limit(40)').length === 2, python);

const java = generateJavaCode(codeRobot, []);
check('Java sets the Talon FX supply limit from the diagram', java.includes('private final TalonFX tfx = new TalonFX(3);') && java.includes('tfx.getConfigurator().apply(new CurrentLimitsConfigs()') && java.includes('.withSupplyCurrentLimit(35)'), java);
check('Java sets SPARK smart current limits with REVLib 2025', java.includes('new SparkMax(4, MotorType.kBrushless)') && java.includes('maxConfig.smartCurrentLimit(30);') && java.includes('new SparkFlex(5, MotorType.kBrushless)') && java.includes('flex.configure(flexConfig, ResetMode.kResetSafeParameters, PersistMode.kPersistParameters);'), java);
check('Java imports only what it uses', java.includes('import com.revrobotics.spark.config.SparkFlexConfig;') && !java.includes('Pigeon2') && !java.includes('CANSparkMax'), java);
check('CAN ID 0 is kept, not replaced with 1', java.includes('new TalonFX(0)'), java);

// ── Wires that can't be drawn ──
const plug = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({ source, sourceHandle, target, targetHandle });
check('power can’t plug into a CAN port', /power port can’t connect to a CAN port/.test(connectionProblem(plug('pdh', 'pwr-high-out', 'm1', 'can-in'), base, baseWires) || ''));
check('CAN into CAN is allowed', connectionProblem(plug('m1', 'can-out', 'm2', 'can-in'), base, []) === undefined);
check('a component can’t be wired to itself', !!connectionProblem(plug('m1', 'can-out', 'm1', 'can-in'), base, []));

const net = [node('radio', 'RadioSwitch'), node('ll1', 'Limelight'), node('ll2', 'Limelight'), node('sw', 'NetworkSwitch'), ...[1, 2, 3, 4, 5].map((i) => node(`cam${i}`, 'Coprocessor'))];
const auxUsed = [wire('e1', 'radio', 'eth-aux', 'll1', 'eth-in')];
check('an Ethernet port holds one cable', /already has a cable/.test(connectionProblem(plug('radio', 'eth-aux', 'll2', 'eth-in'), net, auxUsed) || ''));
check('a device’s Ethernet port holds one cable', !!connectionProblem(plug('radio', 'eth-aux2', 'll1', 'eth-in'), net, auxUsed));
const switchFull = [1, 2, 3, 4].map((i) => wire(`s${i}`, 'sw', 'eth-out', `cam${i}`, 'eth-in'));
check('a switch takes four devices', connectionProblem(plug('sw', 'eth-out', 'cam4', 'eth-in'), net, switchFull.slice(0, 3)) === undefined);
check('a fifth device on a switch is refused', /All 4 Ethernet ports/.test(connectionProblem(plug('sw', 'eth-out', 'cam5', 'eth-in'), net, switchFull) || ''));

// ── SystemCore ──
const core = [
  node('battery', 'Battery12V'), node('breaker', 'MainBreaker120A'), node('pdh', 'PDH'), node('core', 'SystemCore'), node('radio', 'RadioSwitch'), node('rsl', 'RSL'),
  node('k1', 'KrakenX60', { canId: 1 }), node('k2', 'KrakenX60', { canId: 1 }),
];
const coreWires = [
  wire('a', 'battery', 'pwr-battery-out', 'breaker', 'pwr-battery-in'), wire('b', 'breaker', 'pwr-pdh-out', 'pdh', 'pwr-12v-in'),
  pdhWire('p20', 'core', 'low', 20), pdhWire('p21', 'radio', 'low', 21), pdhWire('p0', 'k1', 'high', 0), pdhWire('p1', 'k2', 'high', 1),
  wire('r', 'core', 'rsl-out', 'rsl', 'rsl-in'), wire('eth', 'core', 'eth-out', 'radio', 'eth-rio'),
  wire('c0', 'core', 'can-0', 'k1', 'can-in'), wire('t0', 'k1', 'can-out', 'pdh', 'can-term'),
  wire('c1', 'core', 'can-1', 'k2', 'can-in'),
];
const coreHw = analyzeHardware(core, coreWires);
check('SystemCore buses are separate and named', coreHw.canBuses.map((b) => b.name).sort().join() === 'SystemCore CAN 0,SystemCore CAN 1', coreHw.canBuses.map((b) => b.name));
check('the same CAN ID on two different SystemCore buses is fine', !coreHw.issues.some((i) => i.title === 'Duplicate CAN ID'), issueIds(coreHw));
const coreReport = verifySystemProperties(core, coreWires);
const coreIds = coreReport.issues.map((i) => i.id);
check('a wired SystemCore robot has no controller errors', !coreReport.issues.some((i) => i.severity === 'error'), coreReport.issues.filter((i) => i.severity === 'error'));
check('a SystemCore bus that doesn’t end at the PDH is reminded to terminate', coreIds.includes('can-term-can-1') && !coreIds.includes('can-term-can-0'), coreIds);
check('SystemCore isn’t flagged as legacy', !coreIds.includes('legacy-roborio'));

const smartIo = analyzeHardware([...core, node('ls', 'LimitSwitch', { dioPort: 2 }), node('servo', 'PWMServo', { pwmPort: 2 })], coreWires);
check('DIO and PWM share SystemCore’s Smart I/O numbers', smartIo.issues.some((i) => i.title === 'Duplicate Smart I/O Port'), issueIds(smartIo));
const rioIo = analyzeHardware([...base, node('ls', 'LimitSwitch', { dioPort: 2 }), node('servo', 'PWMServo', { pwmPort: 2 })], baseWires);
check('roboRIO DIO 2 and PWM 2 are different ports', !rioIo.issues.some((i) => i.title.startsWith('Duplicate')), issueIds(rioIo));
const sio6 = analyzeHardware([...core, node('ls', 'LimitSwitch', { dioPort: 6 })], coreWires);
check('Smart I/O 6 is out of range', sio6.issues.some((i) => i.id === 'id-dio-range-ls' && i.title === 'Invalid Smart I/O Port'), issueIds(sio6));

const sensors7 = Array.from({ length: 7 }, (_, i) => node(`d${i}`, 'LimitSwitch', { dioPort: i % 6 }));
const tooMany = verifySystemProperties([...core, ...sensors7], [...coreWires, ...sensors7.map((s, i) => wire(`dw${i}`, s.id, 'dio-out', 'core', 'dio-in'))]);
check('more than 6 Smart I/O devices is an error', tooMany.issues.some((i) => i.id === 'rio-limit-Smart I/O'), tooMany.issues.map((i) => i.id));
check('a navX can’t plug into SystemCore', verifySystemProperties([...core, node('navx', 'NavX2')], coreWires).issues.some((i) => i.id === 'no-mxp-navx'));
check('two controllers is an error', verifySystemProperties([...core, node('rio', 'roboRIO')], coreWires).issues.some((i) => i.id === 'multiple-controllers'));
check('a roboRIO robot gets the 2027 notice', verifySystemProperties(base, baseWires).issues.some((i) => i.id === 'legacy-roborio' && i.severity === 'info'));

console.log(failures ? `${failures} FAILED` : 'All hardware checks passed');
process.exit(failures ? 1 : 0);
