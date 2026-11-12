/**
 * Checks the behavior editor's Soar generator, then loads every generated program into real Soar
 * when one is available:
 *   SOAR_HOME=/path/to/SoarSuite/bin      (Linux, as in CI)
 *   SOAR_WSL_HOME=/mnt/d/.../bin          (Windows, through WSL; SOAR_WSL_DISTRO picks the distro)
 * Run with "npm run test:behavior".
 */
import { spawnSync } from 'node:child_process';
import * as Blockly from 'blockly';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setDeviceOptions } from '../src/renderer/src/views/behavior/blocks';
import { generateSoar, soarName, soarValue } from '../src/renderer/src/views/behavior/soarGenerator';
import { soarTestValue } from '../src/renderer/src/views/behavior/soarNames';
import { behaviorDevices, exampleBehavior } from '../src/renderer/src/views/behavior/robotDevices';
import { readBlocksFile, writeBlocksFile } from '../src/renderer/src/views/behavior/blockFiles';
import { renameInBehavior, subsystemCommands, subsystemGroups } from '../src/renderer/src/views/utils/subsystems';
import { generateAadlCode, generateJavaCode, generatePythonCode } from '../src/renderer/src/views/utils/codeGenerators';
import { buildBehaviorModel, SoarConstant } from '../src/renderer/src/views/behavior/behaviorModel';
import { BehaviorSimulator, Inputs } from '../src/renderer/src/views/behavior/behaviorSimulator';
import { compare, compareAgent, OracleLoop, randomProgram, randomTraces } from './behaviorConformance';
import { agentCommands, compileAgentAgree, compileAgentLustre, describeReading, encodeReading, READING, ReadingDomain } from '../src/renderer/src/views/behavior/agentAgree';
import { readingDomains } from '../src/renderer/src/views/utils/soarBridgeCode';
import { renameInProperties } from '../src/renderer/src/views/behavior/agentProperties';
import { domainProgram, domainProgramDomains, intakeProgram, intakeProperties, requiredRefireProgram } from './agentFixtures';

let failures = 0;
function check(name: string, ok: boolean, detail: unknown = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === '' ? '' : `\n     ${typeof detail === 'string' ? detail.replace(/\n/g, '\n     ') : JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

// ── Building block states by hand, the way the editor saves them ──
type B = { type: string; fields?: Record<string, string>; inputs?: Record<string, { block: B }>; next?: { block: B }; x?: number; y?: number };
const device = (attribute: string): { block: B } => ({ block: { type: 'hardware_input', fields: { hardware_input: attribute } } });
const val = (v: string): { block: B } => ({ block: { type: 'hardware_state', fields: { state: v } } });
const chain = (...blocks: B[]): { block: B } => {
  const [first, ...rest] = blocks;
  return { block: rest.length ? { ...first, next: chain(...rest) } : first };
};
const program = (...blocks: B[]) => ({ blocks: { languageVersion: 0, blocks: blocks.map((b, i) => ({ x: 20, y: 20 + i * 200, ...b })) } });
const cond = (attribute: string, op: string, v: string, negated = false): B => ({
  type: negated ? 'soar_wme_negated_condition' : 'soar_wme_condition',
  fields: { Operator: op },
  inputs: { WorkingMemoryElement: device(attribute), Value: val(v) },
});
const setOutput = (attribute: string, v: string): B => ({ type: 'soar_set_output', inputs: { hardware_input: device(attribute), hardware_state: val(v) } });

const programs: Record<string, string> = {};

// 1. The example program
setDeviceOptions([]);
const example = generateSoar(exampleBehavior([]));
programs.example = example;
check('the example proposes an operator from a sensor reading', example.includes('sp {propose*grab-game-piece\n   (state <s> ^superstate nil)\n   (<s> ^io.input-link.intake-sensor blocked)\n-->\n   (<s> ^operator <o> + =)\n   (<o> ^name grab-game-piece)\n}'), example);
check('the apply rule binds the output link before commanding the subsystem', example.includes('sp {apply*grab-game-piece*hold-piece\n   (state <s> ^operator <o>)\n   (<o> ^name grab-game-piece)\n   (<s> ^io.output-link <ol>)\n-->\n   (<ol> ^intake <cmd1>)\n   (<cmd1> ^state closed)\n}'), example);
check('an empty workspace generates only comments', !generateSoar(null).includes('sp {') && !generateSoar(program()).includes('sp {'));

// 2. Names and values become valid Soar
check('names keep letters, digits, - and _', soarName('Grab Game Piece!', 'x') === 'Grab-Game-Piece' && soarName('  ', 'fallback') === 'fallback' && soarName('3rd shot', 'x') === 'x-3rd-shot');
check('values become numbers, symbols or |quoted| strings', soarValue('42') === '42' && soarValue('-1.5') === '-1.5' && soarValue('closed') === 'closed' && soarValue('Fully Open') === '|Fully Open|' && soarValue('a|b') === '|a\\|b|');

// 3. Every block and choice
const everything = generateSoar(
  program(
    {
      type: 'soar_propose_operator',
      fields: { propose_operator_name: 'Score High', PREFERENCE: 'BEST' },
      inputs: {
        LHS: chain(cond('shooter', '>', '3000'), cond('intake', '!=', 'empty', true), { type: 'soar_state_check', fields: { agent_state: 'autonomous' } }),
        RHS: chain(
          { type: 'soar_apply_rule', fields: { apply_operator_name: 'spin up' }, inputs: { apply_operator_conditions: chain(cond('arm', '<', '10')), apply_operator_actions: chain(setOutput('shooter', '4500'), setOutput('feeder', 'Run Forward')) } },
          { type: 'soar_apply_rule', fields: { apply_operator_name: 'note' }, inputs: { apply_operator_actions: chain({ type: 'soar_wme_modify', fields: { ACTION_TYPE: 'ADD' }, inputs: { ATTRIBUTE: device('scored'), VALUE: val('yes') } }) } },
        ),
      },
    },
    { type: 'soar_propose_operator', fields: { propose_operator_name: 'stow', PREFERENCE: 'WORST' } },
    { type: 'soar_propose_operator', fields: { propose_operator_name: 'estop', PREFERENCE: 'REQUIRE' }, inputs: { LHS: chain(cond('estop', '==', 'true')) } },
    {
      type: 'soar_elaboration_rule',
      fields: { ELAB_NAME: 'piece ready' },
      inputs: { LHS: chain(cond('beam-break', '==', 'blocked')), RHS: chain(setOutput('led', 'green'), { type: 'soar_wme_modify', fields: { ACTION_TYPE: 'REMOVE' }, inputs: { ATTRIBUTE: device('waiting'), VALUE: val('yes') } }) },
    },
  ),
);
programs.everything = everything;
check('comparisons and negation become Soar tests', everything.includes('(<s> ^io.input-link.shooter > 3000.0)') && everything.includes('-(<s> ^io.input-link.intake <> empty)') && everything.includes('(<s> ^io.input-link.arm < 10.0)'), everything);
check(
  'whole numbers in tests become decimals, to match the robot’s float readings; commands keep them',
  everything.includes('(<cmd1> ^state 4500)') && soarTestValue('3') === '3.0' && soarTestValue('-2') === '-2.0' && soarTestValue('1.5') === '1.5' && soarTestValue('closed') === 'closed',
  everything,
);
check('robot mode is read from the match state on the input link', everything.includes('(<s> ^io.input-link.match.mode autonomous)'), everything);
check(
  'robot mode is lowercase, like the robot writes it',
  generateSoar(program({ type: 'soar_propose_operator', fields: { propose_operator_name: 'x' }, inputs: { LHS: chain({ type: 'soar_state_check', fields: { agent_state: 'AUTONOMOUS' } }) } })).includes('^io.input-link.match.mode autonomous)'),
);
check('agents with rules end with the standard clear and wait rules', everything.includes('sp {sysmod*propose*clear-commands') && everything.includes('sp {sysmod*prefer*clear-commands') && everything.includes('sp {sysmod*propose*wait'));
check('no rule matches every state', !/\^type state/.test(everything), everything);
check('priorities become operator preferences', everything.includes('(<s> ^operator <o> + > =)') && everything.includes('(<s> ^operator <o> + < =)') && everything.includes('(<s> ^operator <o> !)'), everything);
check('apply rules are named after their operator', everything.includes('sp {apply*Score-High*spin-up') && everything.includes('sp {apply*Score-High*note'));
check('multi-word values are quoted', everything.includes('(<cmd2> ^state |Run Forward|)'), everything);
check('each command is an identifier with its own variable', everything.includes('   (<ol> ^shooter <cmd1>)\n   (<cmd1> ^state 4500)\n   (<ol> ^feeder <cmd2>)\n'), everything);
check('remember and forget add and remove facts', everything.includes('(<s> ^scored yes +)') && everything.includes('(<s> ^waiting yes -)'));
check('elaborations that command devices bind the output link too', /sp \{elaborate\*piece-ready\n {3}\(state <s> \^superstate nil\)\n {3}\(<s> \^io\.output-link <ol>\)/.test(everything), everything);
check('a rule with no actions says so instead of breaking', everything.includes('sp {propose*stow') && !/-->\n\}/.test(everything));

// 4. Loose blocks
const loose = generateSoar(program(cond('beam', '==', 'blocked'), setOutput('claw', 'open'), { type: 'hardware_input', fields: { hardware_input: 'arm' } }));
programs.loose = loose;
check('blocks outside a rule are left out', !loose.includes('(<s>') && !loose.includes('(<ol>') && !loose.includes('arm'), loose);

// 5. A device that has left the diagram
setDeviceOptions([{ label: 'Claw', attribute: 'claw' }]);
const gone = generateSoar(program({ type: 'soar_propose_operator', fields: { propose_operator_name: 'old' }, inputs: { LHS: chain(cond('removed-motor', '==', 'on')) } }));
check('a device no longer on the diagram keeps its name', gone.includes('^io.input-link.removed-motor on'), gone);
{
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(program({ type: 'hardware_input', fields: { hardware_input: 'removed-motor' } }, { type: 'hardware_input', fields: { hardware_input: 'claw' } }), ws);
  const labels = ws.getTopBlocks(true).map((b) => b.getField('hardware_input')?.getText());
  ws.dispose();
  check('the device block shows a missing device as “not on diagram”, not as another device', JSON.stringify(labels) === JSON.stringify(['removed-motor (not on diagram)', 'Claw']), labels);
}

// 6. Device list
type TestNode = Parameters<typeof behaviorDevices>[0][number];
const node = (id: string, deviceType: string) => ({ id, position: { x: 0, y: 0 }, data: { label: id, deviceType, category: 'Sensors' } }) as TestNode;
const frame = (id: string, label: string) => ({ id, type: 'SubsystemNode', position: { x: 0, y: 0 }, data: { label, deviceType: 'Subsystem', category: 'Subsystem' } }) as TestNode;
const inFrame = (n: TestNode, parentId: string) => ({ ...n, parentId }) as TestNode;
const diagram = [
  frame('subsystem1', 'Intake'),
  frame('subsystem2', 'Claw Arm'),
  node('pdh1', 'PDH'),
  inFrame(node('beambreak2', 'BeamBreak'), 'subsystem1'),
  inFrame(node('krakenx603', 'KrakenX60'), 'subsystem1'),
  node('core4', 'SystemCore'),
];
const devices = behaviorDevices(diagram.filter((n) => n.data.deviceType !== 'Subsystem'), subsystemGroups(diagram));
check(
  'devices come from the diagram’s subsystem frames, sensors and actuators',
  JSON.stringify(devices.map((d) => d.attribute)) === JSON.stringify(['intake', 'claw-arm', 'beambreak2', 'krakenx603']) && devices[2].label.endsWith('· in Intake'),
  devices,
);
check('nothing is built in when the diagram is empty', behaviorDevices([], []).length === 0);
const exampleOnRobot = generateSoar(exampleBehavior(devices));
check('the example uses the robot’s own sensor and subsystem', exampleOnRobot.includes('^io.input-link.beambreak2 blocked') && exampleOnRobot.includes('(<ol> ^intake <cmd1>)'), exampleOnRobot);

// 7. Opening files, including SoarBlocks workspaces
const opPref = (name: string): B => ({ type: 'soar_propose_operator', fields: { propose_operator_name: name } });
const legacyPref = (type: string, name: string): B => ({ type: 'soar_preference', fields: { PREFERENCE_TYPE: type, OPERATOR_NAME: name } });
const soarBlocksFile = program(
  // A SoarBlocks operator has no priority field, and its device names are the old CLAW, ARM and DRIVE_BASE values
  { ...opPref('ScoreHigh'), inputs: { LHS: chain(cond('Claw', '==', 'OPEN')) } },
  opPref('Stow'),
  { type: 'soar_preference', fields: { PREFERENCE_TYPE: 'BETTER', OPERATOR_NAME: 'ScoreHigh' }, next: { block: { ...legacyPref('WORSE', 'Stow'), next: { block: legacyPref('REJECT', 'Stow') } } } },
  legacyPref('ACCEPTABLE', 'Missing'),
);
const opened = readBlocksFile(JSON.stringify(soarBlocksFile));
const openedCode = generateSoar(opened.state);
programs.soarblocks = openedCode;
check('SoarBlocks preferences become Operator priorities', openedCode.includes('sp {propose*ScoreHigh\n   (state <s> ^superstate nil)\n   (<s> ^io.input-link.Claw OPEN)\n-->\n   (<s> ^operator <o> + > =)') && /propose\*Stow[\s\S]*?\^operator <o> \+ </.test(openedCode), openedCode);
const leftOver = (opened.state as { blocks: { blocks: B[] } }).blocks.blocks.filter((b) => b.type === 'soar_preference');
check(
  'preferences that can’t move stay on the canvas, and say why',
  leftOver.length === 2 && leftOver.some((b) => b.fields?.PREFERENCE_TYPE === 'REJECT' && !b.next) && opened.notes.length === 4 && opened.notes.some((n) => n.includes('Missing')),
  { leftOver, notes: opened.notes },
);
check('old preference blocks generate nothing', !openedCode.includes('Missing') && !/^\s*\(<s> \^operator <o> -\)/m.test(openedCode), openedCode);

const xml = `<xml xmlns="https://developers.google.com/blockly/xml"><block type="soar_propose_operator" x="10" y="10"><field name="propose_operator_name">FromXml</field><statement name="LHS"><block type="soar_state_check"><field name="agent_state">teleop</field></block></statement></block></xml>`;
let xmlCode = '';
try {
  xmlCode = generateSoar(readBlocksFile(xml).state);
} catch (error) {
  xmlCode = String(error);
}
check('Blockly XML files open too', xmlCode.includes('sp {propose*FromXml') && xmlCode.includes('(<s> ^io.input-link.match.mode teleop)'), xmlCode);

const saved = writeBlocksFile(exampleBehavior([]));
check('saved files open again unchanged', generateSoar(readBlocksFile(saved).state) === example);

const openError = (text: string): string => {
  try {
    readBlocksFile(text);
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};
check(
  'bad files are refused with a reason',
  /not JSON/.test(openError('hello')) && /no blocks/.test(openError('{"a":1}')) && /controls_if/.test(openError(JSON.stringify(program({ type: 'controls_if' })))),
  [openError('hello'), openError('{"a":1}'), openError(JSON.stringify(program({ type: 'controls_if' })))],
);

// 8. Subsystems: what the agent sends each one, and the robot code they become
const commanding = program({
  type: 'soar_propose_operator',
  fields: { propose_operator_name: 'score' },
  inputs: {
    RHS: chain(
      { type: 'soar_apply_rule', fields: { apply_operator_name: 'a' }, inputs: { apply_operator_actions: chain(setOutput('intake', 'closed'), setOutput('claw-arm', 'Run Forward'), setOutput('intake', 'open'), setOutput('intake', 'closed')) } },
      // Disabled blocks, like in Soar, send nothing
      { type: 'soar_apply_rule', enabled: false, fields: { apply_operator_name: 'b' }, inputs: { apply_operator_actions: chain(setOutput('intake', 'stowed')) } } as B,
    ),
  },
}, setOutput('intake', 'loose'));
const commands = subsystemCommands(commanding);
check('each subsystem’s commands come from the set blocks inside rules', JSON.stringify(commands.get('intake')) === '["closed","open"]' && JSON.stringify(commands.get('claw-arm')) === '["Run Forward"]', [...commands]);

const groups = subsystemGroups([...diagram, frame('subsystem3', 'class'), frame('subsystem4', 'Intake!')], commanding);
check(
  'subsystems get unique, legal class and field names',
  JSON.stringify(groups.map((g) => [g.className, g.javaField, g.pythonField])) === JSON.stringify([['Intake', 'intake', 'intake'], ['ClawArm', 'clawArm', 'claw_arm'], ['ClassSubsystem', 'classSubsystem', 'subsystem_class'], ['Intake2', 'intake2', 'intake2']]),
  groups.map((g) => [g.className, g.javaField, g.pythonField]),
);
check('a subsystem’s devices are the ones in its frame', JSON.stringify(groups[0].memberIds) === '["beambreak2","krakenx603"]' && groups[1].memberIds.length === 0);

const robotNodes = diagram.filter((n) => n.data.deviceType !== 'Subsystem').concat([node('servo9', 'PWMServo')]);
const robotGroups = subsystemGroups(diagram, commanding);
const java = generateJavaCode(robotNodes, [], robotGroups);
check(
  'Java makes each subsystem a SubsystemBase that owns its devices',
  java.includes('  public static class Intake extends SubsystemBase {\n    private final TalonFX krakenx603 = new TalonFX(') &&
    java.includes('    private final DigitalInput beambreak2 = new DigitalInput(') &&
    java.includes('    public Intake() {\n      // Supply current limits') &&
    java.includes('  private final Intake intake = new Intake();') &&
    java.includes('  private final Servo servo9 = new Servo(') &&
    !/class Intake[\s\S]*servo9[\s\S]*private final Intake intake/.test(java),
  java,
);
check(
  'Java subsystems get a setState case for each Soar command',
  java.includes('      switch (state) {\n        case "closed":\n          // TODO: what Intake does for "closed"\n          break;\n        case "open":') && java.includes('case "Run Forward":'),
  java,
);
check('Java runs the command scheduler when there are subsystems', java.includes('CommandScheduler.getInstance().run();') && java.includes('import edu.wpi.first.wpilibj2.command.SubsystemBase;'));
check('Java without subsystems is unchanged in shape', !generateJavaCode(robotNodes, []).includes('SubsystemBase'));

const python = generatePythonCode(robotNodes, [], robotGroups);
check(
  'Python makes each subsystem a commands2.Subsystem that owns its devices',
  python.includes('class Intake(commands2.Subsystem):') &&
    python.includes('        self.krakenx603 = phoenix6.hardware.TalonFX(') &&
    python.includes('        self.intake = Intake()') &&
    python.includes('        self.claw_arm = ClawArm()') &&
    python.indexOf('class Intake') < python.indexOf('class MyRobot'),
  python,
);
check(
  'Python subsystems get a set_state branch for each Soar command',
  python.includes('        if state == "closed":\n            pass  # TODO') && python.includes('        elif state == "open":') && python.includes('if state == "Run Forward":'),
  python,
);

const aadl = generateAadlCode(robotNodes, [], undefined, robotGroups);
check('the AADL model says which subsystem each device is in', aadl.includes('subsystem Intake') && aadl.includes('--   Intake: beambreak2, krakenx603') && aadl.includes('--   Claw Arm: no devices yet'), aadl);

const renamed = renameInBehavior(commanding, 'intake', 'roller-intake');
check('renaming a subsystem moves its blocks to the new name', JSON.stringify(subsystemCommands(renamed).get('roller-intake')) === '["closed","open"]' && !subsystemCommands(renamed).has('intake') && renameInBehavior(commanding, 'nothing', 'x') === commanding);
programs.subsystems = generateSoar(renamed);

// 9. Robot code that runs the agent through the FRC-Soar bridge
const bridgeState = program(
  {
    type: 'soar_propose_operator',
    fields: { propose_operator_name: 'hold', PREFERENCE: 'NORMAL' },
    inputs: {
      LHS: chain({ type: 'soar_state_check', fields: { agent_state: 'autonomous' } }, cond('beambreak2', '==', 'blocked')),
      RHS: chain({
        type: 'soar_apply_rule',
        fields: { apply_operator_name: 'grip' },
        inputs: { apply_operator_actions: chain(setOutput('intake', 'closed'), setOutput('krakenx603', '0.5'), setOutput('servo9', '0.7'), setOutput('beambreak2', 'on'), setOutput('mystery', 'go')) },
      }),
    },
  },
  {
    type: 'soar_propose_operator',
    fields: { propose_operator_name: 'relax', PREFERENCE: 'WORST' },
    inputs: { RHS: chain({ type: 'soar_apply_rule', fields: { apply_operator_name: 'open' }, inputs: { apply_operator_actions: chain(setOutput('intake', 'open'), setOutput('krakenx603', '0')) } }) },
  },
);
const bridgeAgent = { commands: subsystemCommands(bridgeState) };
const bridgeGroups = subsystemGroups(diagram, bridgeState);
const bridgeJava = generateJavaCode(robotNodes, [], bridgeGroups, bridgeAgent);
const bridgePython = generatePythonCode(robotNodes, [], bridgeGroups, bridgeAgent);
check(
  'Java creates the bridge from agent.soar in the deploy folder and starts it, reporting a failure',
  bridgeJava.includes('import frc.soar.SoarBridge;') &&
    bridgeJava.includes('  private final SoarBridge soar = new SoarBridge(new File(Filesystem.getDeployDirectory(), "agent.soar").getPath());') &&
    bridgeJava.includes('    try {\n      soar.start();\n    } catch (IllegalStateException e) {\n      DriverStation.reportError('),
  bridgeJava,
);
check(
  'Java subsystems take their commands and send their state and sensors',
  bridgeJava.includes('      soar.onCommand("intake", c -> setState(c.getString("state")));') &&
    bridgeJava.includes('      soar.onCommand("krakenx603", c -> krakenx603.set(c.getDouble("state")));') &&
    bridgeJava.includes('      soar.setString("intake", state);') &&
    bridgeJava.includes('      soar.setString("beambreak2", beambreak2.get() ? "clear" : "blocked");') &&
    bridgeJava.includes('      soar.setNumber("krakenx603", krakenx603.getVelocity().getValueAsDouble());') &&
    bridgeJava.includes('    intake.connectSoar(soar);') &&
    bridgeJava.includes('      intake.sendSoarInputs(soar);'),
  bridgeJava,
);
check(
  'Java handles every name the agent commands: robot-level devices, sensors and unknown names get handlers',
  bridgeJava.includes('    soar.onCommand("servo9", c -> servo9.set(c.getDouble("state")));') &&
    bridgeJava.includes('soar.onCommand("beambreak2", c -> {});  // TODO') &&
    bridgeJava.includes('soar.onCommand("mystery", c -> {});  // TODO: the agent commands ^mystery, which isn’t on the diagram'),
  bridgeJava,
);
check(
  'Java sends inputs first, runs the scheduler, then dispatches, each loop',
  /soar\.setString\("match\.mode", matchMode\(\)\);[\s\S]*soar\.sendInputs\(\);[\s\S]*CommandScheduler\.getInstance\(\)\.run\(\);[\s\S]*soar\.dispatchCommands\(\);/.test(bridgeJava) &&
    bridgeJava.includes('private static String matchMode() {'),
  bridgeJava,
);
check('without an agent, Java has no bridge', !generateJavaCode(robotNodes, [], bridgeGroups).includes('SoarBridge') && !generatePythonCode(robotNodes, [], bridgeGroups).includes('soarbridge'));
check(
  'Python creates the bridge and wires the same handlers and inputs',
  bridgePython.includes('import soarbridge') &&
    bridgePython.includes('self.soar = soarbridge.SoarHardwareInterface(productions_path=os.path.join(wpilib.getDeployDirectory(), "agent.soar"))') &&
    bridgePython.includes('        soar.on_command("intake", lambda c: self.set_state(c.get_string("state")))') &&
    bridgePython.includes('        soar.on_command("krakenx603", lambda c: self.krakenx603.set(c.get_number("state")))') &&
    bridgePython.includes('        soar.set_string("beambreak2", "clear" if self.beambreak2.get() else "blocked")') &&
    bridgePython.includes('        self.soar.on_command("servo9", lambda c: self.servo9.set(c.get_number("state")))') &&
    bridgePython.includes('self.soar.on_command("mystery", lambda c: None)') &&
    bridgePython.includes('def match_mode() -> str:'),
  bridgePython,
);
check('subsystems remember the last state the agent set', bridgeJava.includes('    this.state = state;') && bridgePython.includes('        self.state = state'));
const bridgeDir = path.resolve('out/test/bridge');
fs.mkdirSync(bridgeDir, { recursive: true });
fs.writeFileSync(path.join(bridgeDir, 'Robot.java'), bridgeJava);
fs.writeFileSync(path.join(bridgeDir, 'robot.py'), bridgePython);
fs.writeFileSync(path.join(bridgeDir, 'agent.soar'), generateSoar(bridgeState));

// 10. The behavior model and reference simulator (checked against real Soar below)
const str = (value: string): SoarConstant => ({ kind: 'string', value });
const flt = (value: number): SoarConstant => ({ kind: 'float', value });
const holdProgram = program(
  {
    type: 'soar_propose_operator',
    fields: { propose_operator_name: 'hold', PREFERENCE: 'NORMAL' },
    inputs: {
      LHS: chain({ type: 'soar_state_check', fields: { agent_state: 'Autonomous' } }, cond('beam', '==', 'blocked')),
      RHS: chain({ type: 'soar_apply_rule', fields: { apply_operator_name: 'close' }, inputs: { apply_operator_actions: chain(setOutput('intake', 'closed')) } }),
    },
  },
  { type: 'soar_elaboration_rule', fields: { ELAB_NAME: 'led' }, inputs: { LHS: chain(cond('speed', '>', '3000')), RHS: chain(setOutput('led', 'green')) } },
);
const holdModel = buildBehaviorModel(holdProgram);
check(
  'the model reads rules the way the generator writes them',
  holdModel.operators.length === 1 &&
    holdModel.operators[0].conditions.some((c) => c.input === 'match.mode' && c.value.kind === 'string' && c.value.value === 'autonomous') &&
    holdModel.applies[0].operator === 'hold' &&
    // 3000 in a test is written as 3000.0 to match the robot's float readings
    holdModel.elaborations[0].conditions[0].value.kind === 'float',
  holdModel,
);
{
  const sim = new BehaviorSimulator(holdModel);
  const loop = (beam: string, speed: number) => sim.step({ 'match.mode': str('autonomous'), beam: str(beam), speed: flt(speed) });
  const l0 = loop('blocked', 0);
  const l1 = loop('blocked', 0);
  const l2 = loop('blocked', 0);
  check(
    'an operator sends its command, the next loop clears it, and the loop after sends it again',
    JSON.stringify(l0.issued) === '[{"name":"intake","value":{"kind":"string","value":"closed"}}]' && l0.selected === 'hold' &&
      l1.issued.length === 0 && l1.selected === 'sysmod-clear-commands' && l1.endSelected === undefined &&
      l2.issued.length === 1 && l2.selected === 'hold',
    [l0, l1, l2],
  );
  const e0 = loop('clear', 3500);
  const e1 = loop('clear', 3500);
  const e2 = loop('clear', 3600);
  check(
    'an elaboration sends once per match, and again when the reading it matched changes',
    e0.issued.some((c) => c.name === 'led') && !e1.issued.some((c) => c.name === 'led') && e2.issued.some((c) => c.name === 'led'),
    [e0, e1, e2],
  );
}
{
  const equalsOne = buildBehaviorModel(program({ type: 'soar_propose_operator', fields: { propose_operator_name: 'one' }, inputs: { LHS: chain(cond('count', '==', '1')) } }));
  check('“equals 1” matches the robot’s reading 1.0', new BehaviorSimulator(equalsOne).step({ 'match.mode': str('teleop'), count: flt(1) }).selected === 'one');
  // Soar itself still tells int 1 from float 1.0; the simulator must too, for agents written by hand
  const intModel = { ...equalsOne, operators: [{ ...equalsOne.operators[0], conditions: [{ input: 'count', comparison: '==' as const, value: { kind: 'int' as const, value: 1 }, negated: false }] }] };
  check('a float reading never equals an int constant, as in Soar', new BehaviorSimulator(intModel).step({ 'match.mode': str('teleop'), count: flt(1) }).selected === undefined);
}

// 11. The AGREE model of the agent (agentAgree.ts): its equations, run step by step, must do what
// the simulator does. test-proofs.ts proves properties of it with JKind.
{
  const intake = buildBehaviorModel(intakeProgram);
  const agent = compileAgentAgree(intake, intakeProperties.map((p) => p.property));
  const lustre = compileAgentLustre(agent);
  check('the agent’s AGREE annex parses with no errors', lustre.errors.length === 0 && agent.warnings.length === 0, [lustre.errors, agent.warnings]);
  check(
    'the annex names operators, readings and commands the way students wrote them',
    agent.annex.includes('const op_hold : int = 1;') &&
      agent.annex.includes('-- hold (best): proposed when robot mode is autonomous, and beam-break equals blocked') &&
      agent.annex.includes('const cmd_intake_closed : int = 1;') &&
      agent.annex.includes('eq last_intake : int =') &&
      agent.annex.includes('guarantee only_in_mode_1 "intake is set to closed only in autonomous"') &&
      agent.aadl.includes('in_beam_break_kind : in data port Base_Types::Integer;') &&
      agent.aadl.includes('tie : in data port Base_Types::Integer;'),
    agent.aadl,
  );
  const speed = agent.inputs.find((i) => i.attribute === 'shooter-speed');
  check(
    'readings become codes among the constants and back',
    !!speed &&
      encodeReading(speed, flt(3000)).code === 1 &&
      encodeReading(speed, flt(3600)).code === 2 &&
      encodeReading(speed, str('fast')).kind === READING.word &&
      describeReading(speed, READING.number, 2) === 'a number greater than 3000.0' &&
      describeReading(speed, READING.number, 0) === 'a number less than 3000.0',
    speed,
  );
  check(
    'the property picker lists every command the rules send',
    JSON.stringify(agentCommands(agent)) === JSON.stringify([{ device: 'intake', value: 'closed' }, { device: 'intake', value: 'open' }, { device: 'shooter', value: '4500' }, { device: 'led', value: 'green' }]),
    agentCommands(agent),
  );
  const renamed = renameInProperties(intakeProperties.map((p) => p.property), 'intake', 'roller');
  check(
    'renaming a subsystem moves its properties to the new name',
    renamed[0].kind === 'only-in-mode' && renamed[0].command.device === 'roller' && renamed[5].kind === 'never-together' && renamed[5].first.device === 'roller' && renamed[5].second.device === 'shooter',
    renamed,
  );
  const missing = compileAgentAgree(intake, [{ kind: 'can-happen', command: { device: 'intake', value: 'jammed' } }]);
  check('a property about a command no rule sends says so', missing.warnings.some((w) => w.includes('No rule sets intake to jammed')), missing.warnings);
  const agentDir = path.resolve('out/test/agent');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'agent.aadl'), agent.aadl);
  fs.writeFileSync(path.join(agentDir, 'agent.lus'), lustre.lustre);

  // A required operator keeps the selection, so its apply rule must fire again on a new reading
  const refire = buildBehaviorModel(requiredRefireProgram);
  const targets = [20, 20, 30, 40, 40, 5, 50].map((target): Inputs => ({ 'match.mode': str('teleop'), target: flt(target) }));
  const refireSim = new BehaviorSimulator(refire);
  const turret = targets.map((inputs) => refireSim.step(inputs).issued.filter((c) => c.name === 'turret').length).join('');
  check('a required operator’s apply rule fires again when the reading it tested changes', turret === '1011001', turret);
  const refireCheck = compareAgent(refire, [targets], 1);
  check('the AGREE model agrees on it', refireCheck.mismatches.length === 0, refireCheck.mismatches.join('\n'));
  const intakeTraces = randomTraces(intake, 7, 5, 60);
  const intakeCheck = compareAgent(intake, intakeTraces, 7, intakeProperties.map((p) => p.property));
  check(`the AGREE model agrees with the simulator on the intake program (${intakeCheck.loops} loops)`, intakeCheck.mismatches.length === 0, intakeCheck.mismatches.join('\n'));

  const agentPrograms = Number(process.env.AGENT_PROGRAMS || 300);
  const seed0 = Number(process.env.CONFORMANCE_SEED || 1000);
  let loops = 0;
  let ties = 0;
  const failures: string[] = [];
  for (let i = 0; i < agentPrograms; i++) {
    // Every third program may have two required operators, which stall
    const model = buildBehaviorModel(randomProgram(seed0 + i, { stall: i % 3 === 0 }));
    const result = compareAgent(model, randomTraces(model, seed0 + i, 3, 40), seed0 + i);
    loops += result.loops;
    ties += result.ties;
    if (result.mismatches.length) failures.push(`program ${seed0 + i}${i % 3 === 0 ? ' (stall)' : ''}: ${result.mismatches[0]}`);
  }
  check(`the AGREE model agrees with the simulator on ${agentPrograms} random programs (${loops} loops, ${ties} ties)`, failures.length === 0, failures.slice(0, 3).join('\n'));

  // Reading domains from the diagram (readingDomains in soarBridgeCode)
  const diagram = [
    { id: 'beambreak8', position: { x: 0, y: 0 }, data: { deviceType: 'BeamBreak', label: 'Beam' } },
    { id: 'krakenx607', position: { x: 0, y: 0 }, data: { deviceType: 'KrakenX60', label: 'Shooter motor' } },
    { id: 'pdh1', position: { x: 0, y: 0 }, data: { deviceType: 'PDH', label: 'PDH' } },
    { id: 'solenoid1', position: { x: 0, y: 0 }, data: { deviceType: 'SolenoidValve', label: 'Valve' } },
  ] as unknown as Parameters<typeof readingDomains>[0];
  const groups = [
    { label: 'Claw', attribute: 'claw', commands: ['open', 'closed'] },
    { label: 'Shooter', attribute: 'shooter', commands: ['idle', '4500'] },
  ] as unknown as Parameters<typeof readingDomains>[1];
  const domains = readingDomains(diagram, groups);
  check(
    'each diagram device and subsystem gets the values it can send',
    JSON.stringify(domains.get('beambreak8')?.words) === '["blocked","clear"]' && domains.get('krakenx607')?.kind === 'numbers' && domains.get('pdh1')?.kind === 'none' &&
      JSON.stringify(domains.get('solenoid1')?.words) === '["false","true"]' && JSON.stringify(domains.get('claw')?.words) === '["none","open","closed"]' && !domains.has('shooter'),
    JSON.stringify([...domains]),
  );

  // Every random program again, with random domains, and traces that only send those values
  let domainLoops = 0;
  const domainFailures: string[] = [];
  const domainPrograms = Math.ceil(agentPrograms / 3);
  for (let i = 0; i < domainPrograms; i++) {
    const seed = seed0 + 5000 + i;
    const model = buildBehaviorModel(randomProgram(seed, { stall: i % 3 === 0 }));
    let r = seed;
    const roll = (): number => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
    const random = new Map<string, ReadingDomain>();
    compileAgentAgree(model).inputs.forEach((enc) => {
      if (enc.attribute === 'match.mode') return;
      const k = roll();
      if (k < 0.2) random.set(enc.attribute, { kind: 'none', source: 'a test device' });
      else if (k < 0.45) random.set(enc.attribute, { kind: 'numbers', source: 'a test device' });
      else if (k < 0.85) {
        // Some tested words, plus two words that share the gap just above one of them
        const base = enc.words.filter(() => roll() < 0.6);
        const anchor = enc.words[0] ?? 'm';
        random.set(enc.attribute, { kind: 'words', words: [...base, `${anchor}~a`, `${anchor}~b`, 'zzz'], source: 'a test device' });
      }
    });
    const result = compareAgent(model, randomTraces(model, seed, 3, 40, random), seed, [], random);
    domainLoops += result.loops;
    if (result.mismatches.length) domainFailures.push(`program ${seed}: ${result.mismatches[0]}`);
  }
  check(`with domains from the diagram, the AGREE model still agrees on ${domainPrograms} random programs (${domainLoops} loops)`, domainFailures.length === 0, domainFailures.slice(0, 3).join('\n'));

  const jam = compileAgentAgree(buildBehaviorModel(domainProgram), [], domainProgramDomains);
  const jamBeam = jam.inputs.find((i) => i.attribute === 'beam-break');
  check(
    'a reading in a gap reads back as the word the device sends',
    !!jamBeam && describeReading(jamBeam, READING.word, encodeReading(jamBeam, { kind: 'string', value: 'clear' }).code) === 'clear',
    JSON.stringify(jamBeam),
  );
  check(
    'tests that can never match what a device sends are warned about',
    jam.warnings.some((w) => w.includes('never “jammed”')) && jam.warnings.some((w) => w.includes('word “stalled”')),
    JSON.stringify(jam.warnings),
  );
  check('the domains are assumptions in the annex', /assume "beam-break is not sent, or blocked or clear/.test(jam.annex) && /assume "shooter-speed is not sent or a number/.test(jam.annex), jam.annex);
}

// ── Real Soar ──
const linuxHome = process.env.SOAR_HOME;
const wslHome = process.env.SOAR_WSL_HOME;
/** A path as the Soar CLI sees it: unchanged on Linux, /mnt/<drive>/... through WSL */
const soarPath = (p: string): string => (linuxHome ? p : p.replace(/^([A-Za-z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/'));

/**
 * Sources one file into a fresh Soar agent, which runs every command in it. Only the source
 * command is piped: the CLI reads stdin while a run is going, so a piped "exit" would interrupt
 * a run partway. The CLI exits on its own at the end of input.
 */
function runSoar(file: string): string | undefined {
  if (!linuxHome && !wslHome) return undefined;
  const input = `source "${soarPath(file)}"\n`;
  const script = `cd "${linuxHome || wslHome}" && LD_LIBRARY_PATH=. ./soar`;
  const run = linuxHome
    ? spawnSync('bash', ['-c', script], { input, encoding: 'utf8', timeout: 60000 })
    : spawnSync('wsl.exe', ['-d', process.env.SOAR_WSL_DISTRO || 'Debian', '--', 'bash', '-c', script], { input, encoding: 'utf8', timeout: 60000 });
  return `${run.stdout || ''}${run.stderr || ''}${run.error ? String(run.error) : ''}`;
}

const outDir = path.resolve('out/test/soar');
fs.mkdirSync(outDir, { recursive: true });
const files = Object.entries(programs).map(([name, code]) => {
  const file = path.join(outDir, `${name}.soar`);
  fs.writeFileSync(file, code);
  return { name, file, rules: (code.match(/^sp \{/gm) || []).length };
});
if (!process.env.SOAR_HOME && !process.env.SOAR_WSL_HOME) {
  console.log('skip real Soar check (set SOAR_HOME, or SOAR_WSL_HOME on Windows)');
} else {
  files.forEach(({ name, file, rules }) => {
    const output = runSoar(file) as string;
    const total = /Total: (\d+) productions? sourced\./.exec(output)?.[1];
    // An empty file sources without a total, which is fine as long as nothing failed
    const loaded = rules === 0 ? total === undefined || total === '0' : Number(total) === rules;
    check(`Soar 9.6.5 loads all ${rules} rules of the ${name} program`, loaded && !/Error|Ignoring production|failed/i.test(output), output.slice(0, 1500));
  });

  // ── Running agents, not just loading them ──
  // The robot program: hold a piece in autonomous when the beam break sees one, stow the arm
  // whenever nothing better applies (an operator with no conditions), and light the LED from an
  // elaboration.
  const robotProgram = generateSoar(
    program(
      {
        type: 'soar_propose_operator',
        fields: { propose_operator_name: 'hold', PREFERENCE: 'BEST' },
        inputs: {
          LHS: chain({ type: 'soar_state_check', fields: { agent_state: 'autonomous' } }, cond('beam-break', '==', 'blocked')),
          RHS: chain({ type: 'soar_apply_rule', fields: { apply_operator_name: 'close' }, inputs: { apply_operator_actions: chain(setOutput('ground-intake', 'closed')) } }),
        },
      },
      {
        type: 'soar_propose_operator',
        fields: { propose_operator_name: 'stow', PREFERENCE: 'WORST' },
        inputs: { RHS: chain({ type: 'soar_apply_rule', fields: { apply_operator_name: 'stow-arm' }, inputs: { apply_operator_actions: chain(setOutput('arm', 'stowed')) } }) },
      },
      { type: 'soar_elaboration_rule', fields: { ELAB_NAME: 'led' }, inputs: { LHS: chain(cond('beam-break', '==', 'blocked')), RHS: chain(setOutput('led', 'green')) } },
    ),
  );
  const agentFile = path.join(outDir, 'robot.soar');
  fs.writeFileSync(agentFile, robotProgram);

  /**
   * Runs the agent like the FRC-Soar bridge would: the input link gets ^match.mode and a beam
   * break, and a test-only stand-in for the robot marks each new command ^status complete.
   * I2 is the input link and I3 the output link; the first identifier wm add creates is I4.
   */
  const runAgent = (mode: string, decisions: number): string => {
    const harness = path.join(outDir, `run-${mode}.soar`);
    fs.writeFileSync(
      harness,
      `trace 0
source "${soarPath(agentFile)}"
wm add I2 ^match *
wm add I4 ^mode ${mode}
wm add I2 ^beam-break blocked
sp {test*robot*propose
   (state <s> ^superstate nil ^io.output-link.<a> <c>)
  -(<c> ^status)
-->
   (<s> ^operator <o> + =)
   (<o> ^name test-robot ^cmd <c>)
}
sp {test*robot*prefer
   (state <s> ^superstate nil ^operator <r> + ^operator { <o> <> <r> } +)
   (<r> ^name test-robot)
  -(<o> ^name test-robot)
  -(<o> ^name sysmod-clear-commands)
-->
   (<s> ^operator <r> > <o>)
}
sp {test*robot*apply
   (state <s> ^operator <o>)
   (<o> ^name test-robot ^cmd <c>)
-->
   (<c> ^status complete)
}
run ${decisions} -d
print --stack
fc apply*hold*close
fc apply*stow*stow-arm
fc sysmod*apply*clear-commands
fc test*robot*apply
stats
`,
    );
    return runSoar(harness) as string;
  };
  const fires = (output: string, rule: string): number => Number(new RegExp(`(\\d+):\\s+${rule.replace(/\*/g, '\\*')}`).exec(output)?.[1] ?? -1);
  // Tracing is off, so the only states printed are print --stack's, which starts with the top state
  const depth = (output: string): number => (output.match(/==>S:/g) || []).length - 1;
  const wmSize = (output: string): number => Number(/WM size: (\d+) current/.exec(output)?.[1] ?? -1);

  const auto = runAgent('autonomous', 200);
  check(
    'a running agent never stacks substates, even with an operator that has no conditions',
    depth(auto) <= 2 && !/Goal stack depth exceeded|max-goal-depth/i.test(auto),
    auto.slice(-2500),
  );
  check(
    'in autonomous, the best operator commands the subsystem, and keeps doing so while its conditions hold',
    fires(auto, 'apply*hold*close') > 10 && fires(auto, 'apply*stow*stow-arm') === 0,
    auto.slice(-2500),
  );
  check(
    'the robot sees every command as an identifier it can mark done, and the agent clears each one',
    fires(auto, 'test*robot*apply') > 10 && fires(auto, 'sysmod*apply*clear-commands') >= fires(auto, 'test*robot*apply') - 2,
    auto.slice(-2500),
  );
  check('working memory stays small over 200 decisions', wmSize(auto) > 0 && wmSize(auto) < 60, auto.slice(-1200));

  // ── Conformance: the reference simulator against real Soar, loop by loop ──
  /** Runs traces through real Soar with soar_oracle.py, the bridge's loop through Soar's own SML */
  const runOracle = (agent: string, traces: Inputs[][]): OracleLoop[][] => {
    const request = path.join(outDir, 'oracle-request.json');
    // An input the robot doesn't send is null, so the oracle removes it (JSON drops undefined)
    fs.writeFileSync(request, JSON.stringify({ agent: soarPath(agent), seed: 1, traces }, (_k, v) => (v === undefined ? null : v)));
    const python = process.env.SOAR_PYTHON || 'python3';
    const bin = linuxHome || wslHome;
    const script = `cd "${bin}" && LD_LIBRARY_PATH=. ${python} -I "${soarPath(path.resolve('scripts/soar_oracle.py'))}" "${bin}" "${soarPath(request)}"`;
    const run = linuxHome
      ? spawnSync('bash', ['-c', script], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 })
      : spawnSync('wsl.exe', ['-d', process.env.SOAR_WSL_DISTRO || 'Debian', '--', 'bash', '-c', script], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    if (run.status !== 0) throw new Error(`soar_oracle.py failed:\n${run.stderr || run.error}`);
    return JSON.parse(run.stdout).traces;
  };

  const twoRequired = program(
    { type: 'soar_propose_operator', fields: { propose_operator_name: 'first', PREFERENCE: 'REQUIRE' }, inputs: { RHS: chain({ type: 'soar_apply_rule', fields: { apply_operator_name: 'a' }, inputs: { apply_operator_actions: chain(setOutput('intake', 'closed')) } }) } },
    { type: 'soar_propose_operator', fields: { propose_operator_name: 'second', PREFERENCE: 'REQUIRE' }, inputs: { LHS: chain(cond('beam', '==', 'blocked')) } },
  );
  const looseApply = program(
    { type: 'soar_propose_operator', fields: { propose_operator_name: '' }, inputs: { LHS: chain(cond('beam', '==', 'blocked')) } },
    { type: 'soar_apply_rule', fields: { apply_operator_name: 'loose' }, inputs: { apply_operator_actions: chain(setOutput('led', 'on')) } },
  );
  const wordsCompared = program({
    type: 'soar_propose_operator',
    fields: { propose_operator_name: 'words' },
    inputs: { LHS: chain(cond('beam', '>', 'blocked')), RHS: chain({ type: 'soar_apply_rule', fields: { apply_operator_name: 'a' }, inputs: { apply_operator_actions: chain(setOutput('intake', '1.5')) } }) },
  });
  const fixed: [string, object][] = [
    ['hold', holdProgram],
    ['robot', JSON.parse(JSON.stringify((() => {
      // The runtime check's program, rebuilt as blocks
      return program(
        { type: 'soar_propose_operator', fields: { propose_operator_name: 'hold', PREFERENCE: 'BEST' }, inputs: { LHS: chain({ type: 'soar_state_check', fields: { agent_state: 'autonomous' } }, cond('beam-break', '==', 'blocked')), RHS: chain({ type: 'soar_apply_rule', fields: { apply_operator_name: 'close' }, inputs: { apply_operator_actions: chain(setOutput('ground-intake', 'closed')) } }) } },
        { type: 'soar_propose_operator', fields: { propose_operator_name: 'stow', PREFERENCE: 'WORST' }, inputs: { RHS: chain({ type: 'soar_apply_rule', fields: { apply_operator_name: 'stow-arm' }, inputs: { apply_operator_actions: chain(setOutput('arm', 'stowed')) } }) } },
        { type: 'soar_elaboration_rule', fields: { ELAB_NAME: 'led' }, inputs: { LHS: chain(cond('beam-break', '==', 'blocked')), RHS: chain(setOutput('led', 'green')) } },
      );
    })()))],
    ['bridge', bridgeState],
    ['commanding', commanding],
    ['two-required', twoRequired],
    ['loose-apply', looseApply],
    ['words-compared', wordsCompared],
    // Soar ignores a rule that duplicates another; does that hold when the conditions are reordered?
    [
      'duplicates-reordered',
      program(
        {
          type: 'soar_propose_operator',
          fields: { propose_operator_name: 'grab' },
          inputs: {
            RHS: chain(
              { type: 'soar_apply_rule', fields: { apply_operator_name: 'a' }, inputs: { apply_operator_conditions: chain(cond('beam', '==', 'blocked'), cond('arm', '==', 'up')), apply_operator_actions: chain(setOutput('shooter', 'open')) } },
              { type: 'soar_apply_rule', fields: { apply_operator_name: 'b' }, inputs: { apply_operator_conditions: chain(cond('arm', '==', 'up'), cond('beam', '==', 'blocked')), apply_operator_actions: chain(setOutput('shooter', 'open')) } },
              { type: 'soar_apply_rule', fields: { apply_operator_name: 'c' }, inputs: { apply_operator_actions: chain(setOutput('led', 'on'), setOutput('intake', 'closed')) } },
              { type: 'soar_apply_rule', fields: { apply_operator_name: 'd' }, inputs: { apply_operator_actions: chain(setOutput('intake', 'closed'), setOutput('led', 'on')) } },
            ),
          },
        },
        { type: 'soar_elaboration_rule', fields: { ELAB_NAME: 'x' }, inputs: { LHS: chain(cond('beam', '==', 'blocked')), RHS: chain(setOutput('led', 'red')) } },
        { type: 'soar_elaboration_rule', fields: { ELAB_NAME: 'y' }, inputs: { LHS: chain(cond('beam', '==', 'blocked')), RHS: chain(setOutput('led', 'red')) } },
      ),
    ],
  ];
  const randomCount = Number(process.env.CONFORMANCE_PROGRAMS || 30);
  // CONFORMANCE_ONLY=random-50,hold reruns just those programs while investigating
  const only = (process.env.CONFORMANCE_ONLY || '').split(',').filter(Boolean);
  const suite: [string, object][] = [...fixed, ...Array.from({ length: randomCount }, (_, i): [string, object] => [`random-${i}`, randomProgram(Number(process.env.CONFORMANCE_SEED || 1000) + i)])].filter(
    ([name]) => only.length === 0 || only.includes(name),
  );
  let totalLoops = 0;
  let totalTies = 0;
  const problems: string[] = [];
  suite.forEach(([name, state], i) => {
    const model = buildBehaviorModel(state);
    const agentFile = path.join(outDir, `conformance-${name}.soar`);
    fs.writeFileSync(agentFile, generateSoar(state));
    const traces = randomTraces(model, 7 + i, 3, 40);
    const result = compare(model, traces, runOracle(agentFile, traces));
    totalLoops += result.loops;
    totalTies += result.ties;
    const shown = (v: unknown): string => JSON.stringify(v, (_k, x) => (x === undefined ? null : x));
    result.mismatches.forEach((m) =>
      problems.push(`${name} (out/test/soar/conformance-${name}.soar), trace ${m.trace}, loop ${m.loop}: ${m.what}\n  inputs ${shown(m.inputs)}\n  previous ${shown(traces[m.trace][m.loop - 1] ?? null)}`),
    );
  });
  check(
    `the simulator matches real Soar on ${suite.length} programs (${totalLoops} loops, ${totalTies} ties)`,
    problems.length === 0,
    problems.slice(0, 8).join('\n') + (problems.length > 8 ? `\n…and ${problems.length - 8} more` : ''),
  );

  const teleop = runAgent('teleop', 60);
  check(
    'outside autonomous, the operator gated on robot mode stays quiet and the fallback runs',
    fires(teleop, 'apply*hold*close') === 0 && fires(teleop, 'apply*stow*stow-arm') > 0 && depth(teleop) <= 2,
    teleop.slice(-2500),
  );
}

console.log(failures ? `${failures} FAILED` : 'All behavior checks passed');
process.exit(failures ? 1 : 0);
