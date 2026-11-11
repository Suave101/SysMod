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
import { behaviorDevices, exampleBehavior } from '../src/renderer/src/views/behavior/robotDevices';
import { readBlocksFile, writeBlocksFile } from '../src/renderer/src/views/behavior/blockFiles';
import { renameInBehavior, subsystemCommands, subsystemGroups } from '../src/renderer/src/views/utils/subsystems';
import { generateAadlCode, generateJavaCode, generatePythonCode } from '../src/renderer/src/views/utils/codeGenerators';

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
check('the example proposes an operator from a sensor reading', example.includes('sp {propose*grab-game-piece\n   (state <s> ^type state)\n   (<s> ^io.input-link.intake-sensor blocked)\n-->\n   (<s> ^operator <o> + =)\n   (<o> ^name grab-game-piece)\n}'), example);
check('the apply rule binds the output link before commanding the subsystem', example.includes('sp {apply*grab-game-piece*hold-piece\n   (state <s> ^operator <o>)\n   (<o> ^name grab-game-piece)\n   (<s> ^io.output-link <ol>)\n-->\n   (<ol> ^intake closed)\n}'), example);
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
check('comparisons and negation become Soar tests', everything.includes('(<s> ^io.input-link.shooter > 3000)') && everything.includes('-(<s> ^io.input-link.intake <> empty)') && everything.includes('(<s> ^io.input-link.arm < 10)'), everything);
check('robot mode is a condition on the state', everything.includes('(<s> ^mode autonomous)'));
check('priorities become operator preferences', everything.includes('(<s> ^operator <o> + >)') && everything.includes('(<s> ^operator <o> + <)') && everything.includes('(<s> ^operator <o> !)'), everything);
check('apply rules are named after their operator', everything.includes('sp {apply*Score-High*spin-up') && everything.includes('sp {apply*Score-High*note'));
check('multi-word values are quoted', everything.includes('(<ol> ^feeder |Run Forward|)'));
check('remember and forget add and remove facts', everything.includes('(<s> ^scored yes +)') && everything.includes('(<s> ^waiting yes -)'));
check('elaborations that command devices bind the output link too', /sp \{elaborate\*piece-ready\n {3}\(state <s> \^type state\)\n {3}\(<s> \^io\.output-link <ol>\)/.test(everything), everything);
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
check('the example uses the robot’s own sensor and subsystem', exampleOnRobot.includes('^io.input-link.beambreak2 blocked') && exampleOnRobot.includes('(<ol> ^intake closed)'), exampleOnRobot);

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
check('SoarBlocks preferences become Operator priorities', openedCode.includes('sp {propose*ScoreHigh\n   (state <s> ^type state)\n   (<s> ^io.input-link.Claw OPEN)\n-->\n   (<s> ^operator <o> + >)') && /propose\*Stow[\s\S]*?\^operator <o> \+ </.test(openedCode), openedCode);
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
check('Blockly XML files open too', xmlCode.includes('sp {propose*FromXml') && xmlCode.includes('(<s> ^mode teleop)'), xmlCode);

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

// ── Real Soar ──
/** Loads one file into a fresh Soar agent; the CLI only runs the first command it is piped */
function runSoar(file: string): string | undefined {
  const linuxHome = process.env.SOAR_HOME;
  const wslHome = process.env.SOAR_WSL_HOME;
  if (!linuxHome && !wslHome) return undefined;
  const toWsl = (p: string): string => p.replace(/^([A-Za-z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/');
  const input = `source "${linuxHome ? file : toWsl(file)}"\nexit\n`;
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
}

console.log(failures ? `${failures} FAILED` : 'All behavior checks passed');
process.exit(failures ? 1 : 0);
