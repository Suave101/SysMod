import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';
import { motorCurrentLimitA } from './hardwareValidation';
import { SubsystemGroup, subsystemOfDevice } from './subsystems';

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

/** A subsystem as a RobotPy commands2 subsystem that owns its devices */
function pythonSubsystem(group: SubsystemGroup, devices: Node<FRCNodeData>[], ctx: Context): string[] {
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
    ...indent(init, 8),
    '',
  ];
  if (periodic.length) lines.push('    def periodic(self):', ...indent(periodic, 8), '');
  lines.push('    def set_state(self, state: str) -> None:', `        """Runs a command the Soar agent sends to ^${group.attribute}."""`);
  if (group.commands.length === 0) {
    lines.push('        pass  # The behavior editor doesn’t send this subsystem any commands yet');
  } else {
    group.commands.forEach((command, i) => {
      lines.push(`        ${i === 0 ? 'if' : 'elif'} state == ${JSON.stringify(command)}:`, `            pass  # TODO: what ${group.label} does for ${JSON.stringify(command)}`);
    });
  }
  return lines;
}

/**
 * Generates a RobotPy robot.py that creates every device on the diagram with its CAN ID or port.
 * Each subsystem frame becomes a commands2.Subsystem class that owns the devices inside it.
 */
export function generatePythonCode(nodes: Node<FRCNodeData>[], _edges: Edge[], subsystems: SubsystemGroup[] = []): string {
  const types = new Set(nodes.map((n) => n.data?.deviceType || ''));
  const has = (...list: string[]): boolean => list.some((t) => types.has(t));
  const ctx: Context = {
    busArg: has('CANivore') ? ', "canivore"' : '',
    solenoids: nodes.filter((n) => n.data?.deviceType === 'SolenoidValve').map((n) => n.id),
  };
  const owner = subsystemOfDevice(subsystems);

  let code = 'import wpilib\nimport wpilib.drive\nimport commands2\n';
  if (has(...TALON_FX, 'Pigeon2', 'CANcoder')) code += 'import phoenix6\n';
  if (has(...Object.keys(REV_MOTORS))) code += 'import rev\n';
  if (has('PhotonVision')) code += 'import photonlibpy\nimport photonlibpy.photonCamera\n';
  if (has('NavX2')) code += 'import navx\n';
  if (has('Limelight')) code += 'from ntcore import NetworkTableInstance\n';

  subsystems.forEach((group) => {
    code += `\n\n${pythonSubsystem(group, nodes.filter((n) => owner.get(n.id)?.id === group.id), ctx).join('\n')}\n`;
  });

  const { init, periodic } = setup(nodes.filter((n) => !owner.has(n.id)), ctx);
  const robotInit = [...subsystems.map((g) => `self.${g.pythonField} = ${g.className}()`), ...(subsystems.length && init.length ? [''] : []), ...init];
  const robotPeriodic = [...(subsystems.length ? ['# Runs each subsystem’s periodic() and any scheduled commands', 'commands2.CommandScheduler.getInstance().run()'] : []), ...periodic];

  code += `\n${subsystems.length ? '\n' : ''}class MyRobot(wpilib.TimedRobot):\n`;
  code += '    def robotInit(self):\n';
  code += '        """Initialize robot hardware from SysMod Architecture."""\n';
  if (robotInit.length) code += `${indent(robotInit, 8).join('\n')}\n`;
  code += '\n    def robotPeriodic(self):\n';
  code += `${indent(robotPeriodic.length ? robotPeriodic : ['pass'], 8).join('\n')}\n`;
  code += '\n    def teleopPeriodic(self):\n        pass\n\n';
  code += 'if __name__ == "__main__":\n    wpilib.run(MyRobot)\n';
  return code;
}
