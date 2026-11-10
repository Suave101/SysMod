import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';
import { motorCurrentLimitA } from './hardwareValidation';

/** REVLib 2025 controller class and motor type for each REV motor on the palette */
export const REV_MOTORS: Record<string, { controller: 'SparkMax' | 'SparkFlex'; motorType: 'kBrushless' | 'kBrushed' }> = {
  SparkMaxNEO: { controller: 'SparkMax', motorType: 'kBrushless' },
  NEO550: { controller: 'SparkMax', motorType: 'kBrushless' },
  BrushedController: { controller: 'SparkMax', motorType: 'kBrushed' },
  NEOVortex: { controller: 'SparkFlex', motorType: 'kBrushless' },
};

/** Amps as a code literal: whole numbers stay whole, others keep one decimal */
export const formatAmps = (amps: number): string => (Number.isInteger(amps) ? String(amps) : amps.toFixed(1));

export function generatePythonCode(nodes: Node<FRCNodeData>[], _edges: Edge[]): string {
  const motors = nodes.filter((n) => ['KrakenX60', 'KrakenX44', 'Falcon500', 'SparkMaxNEO', 'NEOVortex', 'NEO550', 'PWMServo', 'BrushedController'].includes(n.data?.deviceType || ''));
  const sensors = nodes.filter((n) => ['CANcoder', 'Pigeon2', 'NavX2', 'ThroughBore', 'Limelight', 'PhotonVision', 'LimitSwitch', 'BeamBreak', 'TimeOfFlight', 'ColorSensor'].includes(n.data?.deviceType || ''));
  const pneumatics = nodes.filter((n) => ['SolenoidValve', 'Compressor', 'PressureSwitch'].includes(n.data?.deviceType || ''));
  const canivorePresent = nodes.some((n) => n.data?.deviceType === 'CANivore');

  let code = `import wpilib
import wpilib.drive
import commands2
`;

  if (nodes.some((n) => ['KrakenX60', 'KrakenX44', 'Falcon500', 'Pigeon2', 'CANcoder'].includes(n.data?.deviceType || ''))) {
    code += `import phoenix6\n`;
  }
  if (nodes.some((n) => ['SparkMaxNEO', 'NEO550', 'NEOVortex', 'BrushedController'].includes(n.data?.deviceType || ''))) {
    code += `import rev\n`;
  }
  if (nodes.some((n) => n.data?.deviceType === 'PhotonVision')) {
    code += `import photonlibpy\nimport photonlibpy.photonCamera\n`;
  }
  if (nodes.some((n) => n.data?.deviceType === 'NavX2')) {
    code += `import navx\n`;
  }
  if (nodes.some((n) => n.data?.deviceType === 'Limelight')) {
    code += `from ntcore import NetworkTableInstance\n`;
  }

  code += `\nclass MyRobot(wpilib.TimedRobot):\n`;
  code += `    def robotInit(self):\n`;
  code += `        """Initialize robot hardware from SysMod Architecture."""\n`;

  const busArg = canivorePresent ? `, "canivore"` : '';

  // Actuators Code
  if (motors.length > 0) {
    code += `        # ── Motor Actuators & Drive Controllers ──\n`;
    code += `        # Supply current limits come from each motor on the SysMod architecture diagram\n`;
    motors.forEach((m) => {
      const varName = m.id;
      const canId = m.data?.canId ?? 1;
      const pwmPort = m.data?.pwmPort ?? 0;
      const dev = m.data?.deviceType;
      const limit = motorCurrentLimitA(m);

      if (dev === 'KrakenX60' || dev === 'KrakenX44' || dev === 'Falcon500') {
        code += `        self.${varName} = phoenix6.hardware.TalonFX(${canId}${busArg})\n`;
        code += `        self.${varName}.configurator.apply(\n`;
        code += `            phoenix6.configs.CurrentLimitsConfigs()\n`;
        code += `            .with_supply_current_limit(${formatAmps(limit)})\n`;
        code += `            .with_supply_current_limit_enable(True)\n`;
        code += `        )\n`;
      } else if (REV_MOTORS[dev]) {
        const { controller, motorType } = REV_MOTORS[dev];
        code += `        self.${varName} = rev.${controller}(${canId}, rev.SparkLowLevel.MotorType.${motorType})\n`;
        // SPARK smart current limits cap motor current, which is never below supply current
        code += `        ${varName}_config = rev.${controller}Config()\n`;
        code += `        ${varName}_config.smartCurrentLimit(${Math.round(limit)})\n`;
        code += `        self.${varName}.configure(${varName}_config, rev.SparkBase.ResetMode.kResetSafeParameters, rev.SparkBase.PersistMode.kPersistParameters)\n`;
      } else if (dev === 'PWMServo') {
        code += `        self.${varName} = wpilib.Servo(${pwmPort})\n`;
      }
    });
  }

  // Sensors & Game Piece Detection Code
  if (sensors.length > 0) {
    code += `\n        # ── Sensors & Game Piece Detection ──\n`;
    sensors.forEach((s) => {
      const varName = s.id;
      const canId = s.data?.canId ?? 1;
      const dioPort = s.data?.dioPort ?? 0;
      const dev = s.data?.deviceType;

      if (dev === 'CANcoder') {
        code += `        self.${varName} = phoenix6.hardware.CANcoder(${canId}${busArg})\n`;
      } else if (dev === 'Pigeon2') {
        code += `        self.${varName} = phoenix6.hardware.Pigeon2(${canId}${busArg})\n`;
      } else if (dev === 'NavX2') {
        code += `        self.${varName} = navx.AHRS.create_spi()\n`;
      } else if (dev === 'ThroughBore') {
        code += `        self.${varName} = wpilib.DutyCycleEncoder(${dioPort})\n`;
      } else if (dev === 'LimitSwitch' || dev === 'BeamBreak') {
        code += `        self.${varName} = wpilib.DigitalInput(${dioPort})\n`;
      } else if (dev === 'PhotonVision') {
        code += `        self.${varName} = photonlibpy.photonCamera.PhotonCamera("photonvision")\n`;
      } else if (dev === 'Limelight') {
        code += `        self.limelight_table = NetworkTableInstance.getDefault().getTable("limelight")\n`;
      }
    });
  }

  // Pneumatics System
  if (pneumatics.length > 0) {
    code += `\n        # ── Pneumatic Control System ──\n`;
    code += `        self.ph = wpilib.PneumaticsHub()\n`;
    pneumatics.forEach((p, idx) => {
      if (p.data?.deviceType === 'Compressor') {
        code += `        self.compressor = self.ph.makeCompressor()\n`;
        code += `        self.compressor.enableAnalog(100.0, 120.0)\n`;
      } else if (p.data?.deviceType === 'SolenoidValve') {
        code += `        self.${p.id} = self.ph.makeSolenoid(${idx})\n`;
      }
    });
  }

  code += `\n    def robotPeriodic(self):\n`;
  if (nodes.some((n) => n.data?.deviceType === 'Limelight')) {
    code += `        tx = self.limelight_table.getNumber("tx", 0.0)\n`;
    code += `        wpilib.SmartDashboard.putNumber("LimelightTX", tx)\n`;
  } else {
    code += `        pass\n`;
  }

  code += `\n    def teleopPeriodic(self):\n        pass\n\n`;
  code += `if __name__ == "__main__":\n    wpilib.run(MyRobot)\n`;

  return code;
}