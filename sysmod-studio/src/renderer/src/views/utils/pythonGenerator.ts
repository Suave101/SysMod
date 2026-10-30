import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';

export function generatePythonCode(nodes: Node<FRCNodeData>[], edges: Edge[]): string {
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
    motors.forEach((m) => {
      const varName = m.id;
      const canId = m.data?.canId || 1;
      const pwmPort = m.data?.pwmPort || 0;
      const dev = m.data?.deviceType;

      if (dev === 'KrakenX60' || dev === 'KrakenX44' || dev === 'Falcon500') {
        code += `        self.${varName} = phoenix6.hardware.TalonFX(${canId}${busArg})\n`;
      } else if (dev === 'BrushedController') {
        code += `        self.${varName} = rev.CANSparkMax(${canId}, rev.CANSparkLowLevel.MotorType.kBrushed)\n`;
      } else if (dev === 'SparkMaxNEO' || dev === 'NEO550') {
        code += `        self.${varName} = rev.CANSparkMax(${canId}, rev.CANSparkLowLevel.MotorType.kBrushless)\n`;
      } else if (dev === 'NEOVortex') {
        code += `        self.${varName} = rev.CANSparkFlex(${canId}, rev.CANSparkLowLevel.MotorType.kBrushless)\n`;
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
      const canId = s.data?.canId || 1;
      const dioPort = s.data?.dioPort || 0;
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