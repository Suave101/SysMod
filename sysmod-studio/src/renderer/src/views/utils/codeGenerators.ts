import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';
import { formatAmps, generatePythonCode, REV_MOTORS } from './pythonGenerator';
import { generateAadlCode } from './aadlGenerator';
import { motorCurrentLimitA } from './hardwareValidation';
import { SubsystemGroup, subsystemOfDevice } from './subsystems';
import { deviceAttribute, deviceCommandLine, readingLine, SoarAgentInfo, unknownCommandNames } from './soarBridgeCode';

export { generatePythonCode, generateAadlCode };

const TALON_FX_MOTORS = ['KrakenX60', 'KrakenX44', 'Falcon500'];

/** The order devices are declared in, so the code reads motors first, then sensors, then air */
const DECLARATION_ORDER = [...TALON_FX_MOTORS, ...Object.keys(REV_MOTORS), 'PWMServo', 'CANcoder', 'Pigeon2', 'LimitSwitch', 'BeamBreak', 'ThroughBore', 'Compressor', 'SolenoidValve'];

/** A Java field name for a component id */
const javaName = (id: string): string => {
  const name = id.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(name) ? name : `_${name}`;
};

interface JavaDevice {
  imports: string[];
  field: string;
  init: string[];
  isMotor?: boolean;
}

/** How one device is declared and set up, wherever it ends up (Robot or a subsystem class) */
function javaDevice(n: Node<FRCNodeData>, solenoidChannel: number): JavaDevice | undefined {
  const name = javaName(n.id);
  const canId = n.data?.canId ?? 1;
  const type = n.data?.deviceType || '';

  if (TALON_FX_MOTORS.includes(type)) {
    return {
      imports: ['com.ctre.phoenix6.hardware.TalonFX', 'com.ctre.phoenix6.configs.CurrentLimitsConfigs'],
      field: `private final TalonFX ${name} = new TalonFX(${canId});`,
      init: [
        `${name}.getConfigurator().apply(new CurrentLimitsConfigs()`,
        `    .withSupplyCurrentLimit(${formatAmps(motorCurrentLimitA(n))})`,
        '    .withSupplyCurrentLimitEnable(true));',
      ],
      isMotor: true,
    };
  }
  if (REV_MOTORS[type]) {
    const { controller, motorType } = REV_MOTORS[type];
    const config = `${name}Config`;
    return {
      imports: [
        'com.revrobotics.spark.SparkLowLevel.MotorType', 'com.revrobotics.spark.SparkBase.ResetMode', 'com.revrobotics.spark.SparkBase.PersistMode',
        `com.revrobotics.spark.${controller}`, `com.revrobotics.spark.config.${controller}Config`,
      ],
      field: `private final ${controller} ${name} = new ${controller}(${canId}, MotorType.${motorType});`,
      // SPARK smart current limits cap motor current, which is never below supply current
      init: [
        `${controller}Config ${config} = new ${controller}Config();`,
        `${config}.smartCurrentLimit(${Math.round(motorCurrentLimitA(n))});`,
        `${name}.configure(${config}, ResetMode.kResetSafeParameters, PersistMode.kPersistParameters);`,
      ],
      isMotor: true,
    };
  }
  const simple: Record<string, [string, string]> = {
    PWMServo: ['edu.wpi.first.wpilibj.Servo', `Servo ${name} = new Servo(${n.data?.pwmPort ?? 0})`],
    CANcoder: ['com.ctre.phoenix6.hardware.CANcoder', `CANcoder ${name} = new CANcoder(${canId})`],
    Pigeon2: ['com.ctre.phoenix6.hardware.Pigeon2', `Pigeon2 ${name} = new Pigeon2(${canId})`],
    LimitSwitch: ['edu.wpi.first.wpilibj.DigitalInput', `DigitalInput ${name} = new DigitalInput(${n.data?.dioPort ?? 0})`],
    BeamBreak: ['edu.wpi.first.wpilibj.DigitalInput', `DigitalInput ${name} = new DigitalInput(${n.data?.dioPort ?? 0})`],
    ThroughBore: ['edu.wpi.first.wpilibj.DutyCycleEncoder', `DutyCycleEncoder ${name} = new DutyCycleEncoder(${n.data?.dioPort ?? 0})`],
  };
  if (simple[type]) return { imports: [simple[type][0]], field: `private final ${simple[type][1]};`, init: [] };
  // Solenoids and the compressor live on the REV Pneumatic Hub; channels count up from 0
  if (type === 'SolenoidValve') {
    return {
      imports: ['edu.wpi.first.wpilibj.Solenoid', 'edu.wpi.first.wpilibj.PneumaticsModuleType'],
      field: `private final Solenoid ${name} = new Solenoid(PneumaticsModuleType.REVPH, ${solenoidChannel});`,
      init: [],
    };
  }
  if (type === 'Compressor') {
    return {
      imports: ['edu.wpi.first.wpilibj.Compressor', 'edu.wpi.first.wpilibj.PneumaticsModuleType'],
      field: `private final Compressor ${name} = new Compressor(PneumaticsModuleType.REVPH);`,
      init: [`${name}.enableAnalog(100.0, 120.0);`],
    };
  }
  return undefined;
}

const indent = (lines: string[], spaces: number): string[] => lines.map((l) => (l ? `${' '.repeat(spaces)}${l}` : l));

/** Field declarations, then the setup lines for a constructor or robotInit */
function declare(devices: JavaDevice[]): { fields: string[]; init: string[] } {
  const init: string[] = [];
  if (devices.some((d) => d.isMotor)) init.push('// Supply current limits from each motor on the SysMod architecture diagram');
  devices.forEach((d) => init.push(...d.init));
  return { fields: devices.map((d) => d.field), init };
}

/** The Soar bridge calls a subsystem or device can make, for one container (a subsystem or Robot) */
function javaSoarCalls(members: Node<FRCNodeData>[], agent: SoarAgentInfo): { connect: string[]; send: string[] } {
  const connect = members.filter((n) => agent.commands.has(deviceAttribute(n))).map((n) => deviceCommandLine(n, javaName(n.id), 'java', 'soar'));
  const send = members.map((n) => readingLine(n, javaName(n.id), 'java', 'soar')).filter((l): l is string => !!l);
  return { connect, send };
}

/** A subsystem as a WPILib command-based subsystem that owns its devices */
function javaSubsystem(group: SubsystemGroup, members: Node<FRCNodeData>[], declared: Map<string, JavaDevice>, agent?: SoarAgentInfo): string[] {
  const { fields, init } = declare(members.map((n) => declared.get(n.id) as JavaDevice));
  const lines = [
    '/**',
    ` * The ${group.label} subsystem from the SysMod architecture diagram.`,
    ` * The Soar agent commands it as ^${group.attribute} on its output link.`,
    ' */',
    `public static class ${group.className} extends SubsystemBase {`,
    ...indent(fields, 2),
    '  /** The last state the Soar agent set, sent back to it as ^' + group.attribute + ' */',
    '  private String state = "none";',
    '',
    `  public ${group.className}() {`,
    ...indent(init, 4),
    '  }',
    '',
    `  /** Runs a command the Soar agent sends to ^${group.attribute} */`,
    '  public void setState(String state) {',
    '    this.state = state;',
    '    switch (state) {',
  ];
  group.commands.forEach((command) => {
    lines.push(`      case ${JSON.stringify(command)}:`, `        // TODO: what ${group.label} does for ${JSON.stringify(command)}`, '        break;');
  });
  if (group.commands.length === 0) lines.push('      // The behavior editor doesn’t send this subsystem any commands yet');
  lines.push('      default:', '        break;', '    }', '  }', '', '  public String getState() {', '    return state;', '  }');
  if (agent) {
    const { connect, send } = javaSoarCalls(members, agent);
    lines.push(
      '',
      '  /** Lets the Soar agent command this subsystem, and any of its devices it commands directly */',
      '  public void connectSoar(SoarBridge soar) {',
      `    soar.onCommand(${JSON.stringify(group.attribute)}, c -> setState(c.getString("state")));`,
      ...indent(connect, 4),
      '  }',
      '',
      '  /** Sends this subsystem’s state and its devices’ readings to the Soar agent */',
      '  public void sendSoarInputs(SoarBridge soar) {',
      `    soar.setString(${JSON.stringify(group.attribute)}, state);`,
      ...indent(send, 4),
      '  }',
    );
  }
  lines.push('}');
  return lines;
}

const JAVA_MATCH_MODE = [
  '/** The Driver Station mode, as the Soar agent reads it from ^io.input-link.match.mode */',
  'private static String matchMode() {',
  '  if (DriverStation.isDisabled()) return "disabled";',
  '  if (DriverStation.isAutonomous()) return "autonomous";',
  '  if (DriverStation.isTeleop()) return "teleop";',
  '  return "test";',
  '}',
];

/**
 * Generates a WPILib Robot.java that creates every device on the diagram with its CAN ID or
 * port, and applies each motor's supply current limit from the diagram. Each subsystem frame
 * becomes a SubsystemBase class that owns the devices inside it. With a Soar agent, Robot also
 * runs it through the FRC-Soar bridge: it sends the robot's state every loop and passes each
 * command the agent sends to the subsystem or device it names.
 */
export function generateJavaCode(nodes: Node<FRCNodeData>[], _edges: Edge[], subsystems: SubsystemGroup[] = [], agent?: SoarAgentInfo): string {
  const ordered = DECLARATION_ORDER.flatMap((type) => nodes.filter((n) => n.data?.deviceType === type));
  const solenoids = ordered.filter((n) => n.data.deviceType === 'SolenoidValve').map((n) => n.id);
  const declared = new Map<string, JavaDevice>();
  ordered.forEach((n) => {
    const device = javaDevice(n, solenoids.indexOf(n.id));
    if (device) declared.set(n.id, device);
  });
  const owner = subsystemOfDevice(subsystems);

  const imports = new Set<string>(['edu.wpi.first.wpilibj.TimedRobot']);
  declared.forEach((d) => d.imports.forEach((i) => imports.add(i)));
  if (subsystems.length > 0) imports.add('edu.wpi.first.wpilibj2.command.SubsystemBase').add('edu.wpi.first.wpilibj2.command.CommandScheduler');

  const robotMembers = ordered.filter((n) => declared.has(n.id) && !owner.has(n.id));
  const { fields, init } = declare(robotMembers.map((n) => declared.get(n.id) as JavaDevice));
  const classes = subsystems.map((group) =>
    javaSubsystem(group, ordered.filter((n) => declared.has(n.id) && owner.get(n.id)?.id === group.id), declared, agent),
  );
  const subsystemFields = subsystems.map((g) => `private final ${g.className} ${g.javaField} = new ${g.className}();`);

  const body: string[] = [];
  classes.forEach((lines) => body.push(...lines, ''));
  if (subsystemFields.length) body.push(...subsystemFields, '');
  if (fields.length) body.push(...fields, '');

  const periodic: string[] = [];
  if (agent) {
    imports.add('frc.soar.SoarBridge').add('edu.wpi.first.wpilibj.DriverStation').add('edu.wpi.first.wpilibj.Filesystem').add('java.io.File');
    // Devices that aren't in a subsystem, and names the agent commands that aren't on the diagram
    const { connect, send } = javaSoarCalls(robotMembers, agent);
    const known = new Set([...subsystems.map((g) => g.attribute), ...ordered.map(deviceAttribute)]);
    const onDiagram = new Set(nodes.map(deviceAttribute));
    const unknown = unknownCommandNames(agent, known).map(
      (name) =>
        `soar.onCommand(${JSON.stringify(name)}, c -> {});  // TODO: the agent commands ^${name}, ${onDiagram.has(name) ? 'which Robot.java doesn’t create' : 'which isn’t on the diagram'}`,
    );
    body.push(
      '/** Runs agent.soar from SysMod Studio. Save it into src/main/deploy so it is deployed with the code. */',
      'private final SoarBridge soar = new SoarBridge(new File(Filesystem.getDeployDirectory(), "agent.soar").getPath());',
      '',
    );
    init.push(
      ...(init.length ? [''] : []),
      '// Each name the Soar agent commands needs a handler, or the bridge rejects the command',
      ...subsystems.map((g) => `${g.javaField}.connectSoar(soar);`),
      ...connect,
      ...unknown,
      'try {',
      '  soar.start();',
      '} catch (IllegalStateException e) {',
      '  DriverStation.reportError("Soar agent did not start: " + e.getMessage(), false);',
      '}',
    );
    periodic.push(
      '// Send the robot’s state to the Soar agent',
      'if (soar.isRunning()) {',
      '  soar.setString("match.mode", matchMode());',
      ...subsystems.map((g) => `  ${g.javaField}.sendSoarInputs(soar);`),
      ...indent(send, 2),
      '  soar.sendInputs();',
      '}',
    );
  }
  if (subsystems.length > 0) periodic.push(...(periodic.length ? [''] : []), '// Runs each subsystem’s periodic() and any scheduled commands', 'CommandScheduler.getInstance().run();');
  if (agent) periodic.push('', '// Carry out the commands the agent has decided on', 'if (soar.isRunning()) {', '  soar.dispatchCommands();', '}');

  body.push('@Override', 'public void robotInit() {', ...indent(init, 2), '}', '');
  body.push(...(periodic.length ? ['@Override', 'public void robotPeriodic() {', ...indent(periodic, 2), '}'] : ['@Override', 'public void robotPeriodic() {}']), '');
  body.push('@Override', 'public void teleopPeriodic() {}');
  if (agent) body.push('', ...JAVA_MATCH_MODE);

  let code = 'package frc.robot;\n\n';
  code += [...imports].sort().map((i) => `import ${i};`).join('\n');
  code += '\n\n/** Generated by SysMod Studio from the architecture diagram */\n';
  code += 'public class Robot extends TimedRobot {\n';
  code += `${indent(body, 2).join('\n')}\n`;
  code += '}\n';
  return code;
}
