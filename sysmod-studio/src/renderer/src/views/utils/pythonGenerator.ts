import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';
import { motorCurrentLimitA } from './hardwareValidation';
import { SubsystemGroup, subsystemOfDevice } from './subsystems';
import { deviceAttribute, deviceCommandLine, readingLine, SoarAgentInfo, unknownCommandNames } from './soarBridgeCode';

/** REVLib 2025 controller class and motor type for each REV motor on the palette */
export const REV_MOTORS: Record<string, { controller: 'SparkMax' | 'SparkFlex'; motorType: 'kBrushless' | 'kBrushed' }> = {
  SparkMaxNEO: { controller: 'SparkMax', motorType: 'kBrushless' },
  NEO550: { controller: 'SparkMax', motorType: 'kBrushless' },
  BrushedController: { controller: 'SparkMax', motorType: 'kBrushed' },
  NEOVortex: { controller: 'SparkFlex', motorType: 'kBrushless' },
};

/** Amps as a code literal: whole numbers stay whole, others keep one decimal */
export const formatAmps = (amps: number): string => (Number.isInteger(amps) ? String(amps) : amps.toFixed(1));

const TALON_FX = ['KrakenX60', 'KrakenX44', 'Falcon500'];
const MOTOR_TYPES = [...TALON_FX, 'SparkMaxNEO', 'NEOVortex', 'NEO550', 'PWMServo', 'BrushedController'];
const SENSOR_TYPES = ['CANcoder', 'Pigeon2', 'NavX2', 'ThroughBore', 'Limelight', 'PhotonVision', 'LimitSwitch', 'BeamBreak', 'TimeOfFlight', 'ColorSensor'];
const PNEUMATIC_TYPES = ['SolenoidValve', 'Compressor', 'PressureSwitch'];

const SECTIONS: [string, string[]][] = [
  ['Motor Actuators & Drive Controllers', MOTOR_TYPES],
  ['Sensors & Game Piece Detection', SENSOR_TYPES],
  ['Pneumatic Control System', PNEUMATIC_TYPES],
];

interface Context {
  busArg: string;
  solenoids: string[];
}

/** The lines that create one device, written with self. so they work in any class's __init__ */
function deviceLines(n: Node<FRCNodeData>, ctx: Context): { init: string[]; periodic: string[] } {
  const name = n.id;
  const canId = n.data?.canId ?? 1;
  const dev = n.data?.deviceType;
  const init: string[] = [];
  const periodic: string[] = [];

  if (dev && TALON_FX.includes(dev)) {
    init.push(
      `self.${name} = phoenix6.hardware.TalonFX(${canId}${ctx.busArg})`,
      `self.${name}.configurator.apply(`,
      '    phoenix6.configs.CurrentLimitsConfigs()',
      `    .with_supply_current_limit(${formatAmps(motorCurrentLimitA(n))})`,
      '    .with_supply_current_limit_enable(True)',
      ')',
    );
  } else if (dev && REV_MOTORS[dev]) {
    const { controller, motorType } = REV_MOTORS[dev];
    // SPARK smart current limits cap motor current, which is never below supply current
    init.push(
      `self.${name} = rev.${controller}(${canId}, rev.SparkLowLevel.MotorType.${motorType})`,
      `${name}_config = rev.${controller}Config()`,
      `${name}_config.smartCurrentLimit(${Math.round(motorCurrentLimitA(n))})`,
      `self.${name}.configure(${name}_config, rev.SparkBase.ResetMode.kResetSafeParameters, rev.SparkBase.PersistMode.kPersistParameters)`,
    );
  } else if (dev === 'PWMServo') {
    init.push(`self.${name} = wpilib.Servo(${n.data?.pwmPort ?? 0})`);
  } else if (dev === 'CANcoder') {
    init.push(`self.${name} = phoenix6.hardware.CANcoder(${canId}${ctx.busArg})`);
  } else if (dev === 'Pigeon2') {
    init.push(`self.${name} = phoenix6.hardware.Pigeon2(${canId}${ctx.busArg})`);
  } else if (dev === 'NavX2') {
    init.push(`self.${name} = navx.AHRS.create_spi()`);
  } else if (dev === 'ThroughBore') {
    init.push(`self.${name} = wpilib.DutyCycleEncoder(${n.data?.dioPort ?? 0})`);
  } else if (dev === 'LimitSwitch' || dev === 'BeamBreak') {
    init.push(`self.${name} = wpilib.DigitalInput(${n.data?.dioPort ?? 0})`);
  } else if (dev === 'PhotonVision') {
    init.push(`self.${name} = photonlibpy.photonCamera.PhotonCamera("photonvision")`);
  } else if (dev === 'Limelight') {
    init.push(`self.${name}_table = NetworkTableInstance.getDefault().getTable("limelight")`);
    periodic.push(`tx = self.${name}_table.getNumber("tx", 0.0)`, `wpilib.SmartDashboard.putNumber("LimelightTX", tx)`);
  } else if (dev === 'SolenoidValve') {
    // Solenoids live on the REV Pneumatic Hub; channels count up from 0
    init.push(`self.${name} = wpilib.Solenoid(wpilib.PneumaticsModuleType.REVPH, ${ctx.solenoids.indexOf(n.id)})`);
  } else if (dev === 'Compressor') {
    init.push(`self.${name} = wpilib.Compressor(wpilib.PneumaticsModuleType.REVPH)`, `self.${name}.enableAnalog(100.0, 120.0)`);
  }
  return { init, periodic };
}

const indent = (lines: string[], spaces: number): string[] => lines.map((l) => (l ? `${' '.repeat(spaces)}${l}` : l));

/** A class body's device setup, grouped under the same headings robot.py has always used */
function setup(devices: Node<FRCNodeData>[], ctx: Context): { init: string[]; periodic: string[] } {
  const init: string[] = [];
  const periodic: string[] = [];
  SECTIONS.forEach(([title, types], index) => {
    const inSection = devices.filter((d) => types.includes(d.data?.deviceType || ''));
    const lines = inSection.map((d) => deviceLines(d, ctx));
    if (!lines.some((l) => l.init.length)) return;
    if (init.length) init.push('');
    init.push(`# ── ${title} ──`);
    if (index === 0) init.push('# Supply current limits come from each motor on the SysMod architecture diagram');
    lines.forEach((l) => {
      init.push(...l.init);
      periodic.push(...l.periodic);
    });
  });
  return { init, periodic };
}

// Device types robot.py creates an object for (see deviceLines)
const PY_CREATED = new Set([...TALON_FX, ...Object.keys(REV_MOTORS), 'PWMServo', 'CANcoder', 'Pigeon2', 'NavX2', 'ThroughBore', 'LimitSwitch', 'BeamBreak', 'PhotonVision', 'Limelight', 'SolenoidValve', 'Compressor']);

/** The Soar bridge calls for the devices in one container (a subsystem or MyRobot) */
function pythonSoarCalls(members: Node<FRCNodeData>[], agent: SoarAgentInfo): { connect: string[]; send: string[] } {
  const created = members.filter((n) => PY_CREATED.has(n.data?.deviceType));
  const connect = created.filter((n) => agent.commands.has(deviceAttribute(n))).map((n) => deviceCommandLine(n, `self.${n.id}`, 'python', 'soar'));
  const send = created.map((n) => readingLine(n, `self.${n.id}`, 'python', 'soar')).filter((l): l is string => !!l);
  return { connect, send };
}

/** A subsystem as a RobotPy commands2 subsystem that owns its devices */
function pythonSubsystem(group: SubsystemGroup, devices: Node<FRCNodeData>[], ctx: Context, agent?: SoarAgentInfo): string[] {
  const { init, periodic } = setup(devices, ctx);
  const lines = [
    `class ${group.className}(commands2.Subsystem):`,
    `    """The ${group.label} subsystem from the SysMod architecture diagram.`,
    '',
    `    The Soar agent commands it as ^${group.attribute} on its output link.`,
    '    """',
    '',
    '    def __init__(self):',
    '        super().__init__()',
    `        # The last state the Soar agent set, sent back to it as ^${group.attribute}`,
    '        self.state = "none"',
    ...indent(init, 8),
    '',
  ];
  if (periodic.length) lines.push('    def periodic(self):', ...indent(periodic, 8), '');
  lines.push('    def set_state(self, state: str) -> None:', `        """Runs a command the Soar agent sends to ^${group.attribute}."""`, '        self.state = state');
  if (group.commands.length === 0) {
    lines.push('        # The behavior editor doesn’t send this subsystem any commands yet');
  } else {
    group.commands.forEach((command, i) => {
      lines.push(`        ${i === 0 ? 'if' : 'elif'} state == ${JSON.stringify(command)}:`, `            pass  # TODO: what ${group.label} does for ${JSON.stringify(command)}`);
    });
  }
  if (agent) {
    const { connect, send } = pythonSoarCalls(devices, agent);
    lines.push(
      '',
      '    def connect_soar(self, soar) -> None:',
      '        """Lets the Soar agent command this subsystem, and any of its devices it commands directly."""',
      `        soar.on_command(${JSON.stringify(group.attribute)}, lambda c: self.set_state(c.get_string("state")))`,
      ...indent(connect, 8),
      '',
      '    def send_soar_inputs(self, soar) -> None:',
      '        """Sends this subsystem’s state and its devices’ readings to the Soar agent."""',
      `        soar.set_string(${JSON.stringify(group.attribute)}, self.state)`,
      ...indent(send, 8),
    );
  }
  return lines;
}

const PYTHON_MATCH_MODE = `def match_mode() -> str:
    """The Driver Station mode, as the Soar agent reads it from ^io.input-link.match.mode."""
    if wpilib.DriverStation.isDisabled():
        return "disabled"
    if wpilib.DriverStation.isAutonomous():
        return "autonomous"
    if wpilib.DriverStation.isTeleop():
        return "teleop"
    return "test"
`;

/**
 * Generates a RobotPy robot.py that creates every device on the diagram with its CAN ID or port.
 * Each subsystem frame becomes a commands2.Subsystem class that owns the devices inside it.
 * With a Soar agent, MyRobot also runs it through the FRC-Soar bridge's soarbridge module.
 */
export function generatePythonCode(nodes: Node<FRCNodeData>[], _edges: Edge[], subsystems: SubsystemGroup[] = [], agent?: SoarAgentInfo): string {
  const types = new Set(nodes.map((n) => n.data?.deviceType || ''));
  const has = (...list: string[]): boolean => list.some((t) => types.has(t));
  const ctx: Context = {
    busArg: has('CANivore') ? ', "canivore"' : '',
    solenoids: nodes.filter((n) => n.data?.deviceType === 'SolenoidValve').map((n) => n.id),
  };
  const owner = subsystemOfDevice(subsystems);

  let code = `${agent ? 'import os\n\n' : ''}import wpilib\nimport wpilib.drive\nimport commands2\n`;
  if (agent) code += 'import soarbridge  # from the FRC-Soar bridge\n';
  if (has(...TALON_FX, 'Pigeon2', 'CANcoder')) code += 'import phoenix6\n';
  if (has(...Object.keys(REV_MOTORS))) code += 'import rev\n';
  if (has('PhotonVision')) code += 'import photonlibpy\nimport photonlibpy.photonCamera\n';
  if (has('NavX2')) code += 'import navx\n';
  if (has('Limelight')) code += 'from ntcore import NetworkTableInstance\n';

  subsystems.forEach((group) => {
    code += `\n\n${pythonSubsystem(group, nodes.filter((n) => owner.get(n.id)?.id === group.id), ctx, agent).join('\n')}\n`;
  });
  if (agent) code += `\n\n${PYTHON_MATCH_MODE}`;

  const robotNodes = nodes.filter((n) => !owner.has(n.id));
  const { init, periodic } = setup(robotNodes, ctx);
  const robotInit = [...subsystems.map((g) => `self.${g.pythonField} = ${g.className}()`), ...(subsystems.length && init.length ? [''] : []), ...init];
  const robotPeriodic: string[] = [];
  if (agent) {
    const { connect, send } = pythonSoarCalls(robotNodes, agent);
    const known = new Set([...subsystems.map((g) => g.attribute), ...nodes.filter((n) => PY_CREATED.has(n.data?.deviceType)).map(deviceAttribute)]);
    const onDiagram = new Set(nodes.map(deviceAttribute));
    const unknown = unknownCommandNames(agent, known).map(
      (name) => `self.soar.on_command(${JSON.stringify(name)}, lambda c: None)  # TODO: the agent commands ^${name}, ${onDiagram.has(name) ? 'which robot.py doesn’t create' : 'which isn’t on the diagram'}`,
    );
    robotInit.push(
      ...(robotInit.length ? [''] : []),
      '# ── Soar agent: agent.soar from SysMod Studio, saved into the deploy folder ──',
      'self.soar = soarbridge.SoarHardwareInterface(productions_path=os.path.join(wpilib.getDeployDirectory(), "agent.soar"))',
      '# Each name the agent commands needs a handler, or the bridge rejects the command',
      ...subsystems.map((g) => `self.${g.pythonField}.connect_soar(self.soar)`),
      ...connect.map((l) => l.replace(/^soar\./, 'self.soar.')),
      ...unknown,
      'try:',
      '    self.soar.start()',
      'except RuntimeError as e:',
      '    wpilib.reportError(f"Soar agent did not start: {e}", False)',
    );
    robotPeriodic.push(
      '# Send the robot’s state to the Soar agent',
      'if self.soar.is_running():',
      '    self.soar.set_string("match.mode", match_mode())',
      ...subsystems.map((g) => `    self.${g.pythonField}.send_soar_inputs(self.soar)`),
      ...indent(send.map((l) => l.replace(/^soar\./, 'self.soar.')), 4),
      '    self.soar.send_inputs()',
    );
  }
  if (subsystems.length) robotPeriodic.push(...(robotPeriodic.length ? [''] : []), '# Runs each subsystem’s periodic() and any scheduled commands', 'commands2.CommandScheduler.getInstance().run()');
  robotPeriodic.push(...periodic);
  if (agent) robotPeriodic.push('', '# Carry out the commands the agent has decided on', 'if self.soar.is_running():', '    self.soar.dispatch_commands()');

  code += `\n${subsystems.length || agent ? '\n' : ''}class MyRobot(wpilib.TimedRobot):\n`;
  code += '    def robotInit(self):\n';
  code += '        """Initialize robot hardware from SysMod Architecture."""\n';
  if (robotInit.length) code += `${indent(robotInit, 8).join('\n')}\n`;
  code += '\n    def robotPeriodic(self):\n';
  code += `${indent(robotPeriodic.length ? robotPeriodic : ['pass'], 8).join('\n')}\n`;
  code += '\n    def teleopPeriodic(self):\n        pass\n\n';
  code += 'if __name__ == "__main__":\n    wpilib.run(MyRobot)\n';
  return code;
}
