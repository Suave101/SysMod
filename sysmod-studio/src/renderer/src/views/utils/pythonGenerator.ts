import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';

export function generatePythonCode(nodes: Node<FRCNodeData>[], edges: Edge[]): string {
  const motors = nodes.filter((n) => ['KrakenX60', 'SparkMaxNEO'].includes(n.data?.deviceType || ''));
  const sensors = nodes.filter((n) => ['CANcoder', 'Pigeon2', 'Limelight'].includes(n.data?.deviceType || ''));
  const pneumatics = nodes.filter((n) => n.data?.deviceType === 'SolenoidValve');

  let code = `import wpilib
import wpilib.drive
import commands2
`;

  // Dynamic Imports based on Hardware
  if (nodes.some((n) => n.data?.deviceType === 'KrakenX60')) {
    code += `import phoenix6\n`;
  }
  if (nodes.some((n) => n.data?.deviceType === 'SparkMaxNEO')) {
    code += `import rev\n`;
  }
  if (nodes.some((n) => n.data?.deviceType === 'Pigeon2' || n.data?.deviceType === 'CANcoder')) {
    if (!code.includes('phoenix6')) code += `import phoenix6\n`;
  }
  if (nodes.some((n) => n.data?.deviceType === 'Limelight')) {
    code += `from ntcore import NetworkTableInstance\n`;
  }

  code += `\nclass MyRobot(wpilib.TimedRobot):\n`;
  code += `    def robotInit(self):\n`;
  code += `        """Initialize robot hardware from SysMod Architecture."""\n`;

  // Initialize Motors
  if (motors.length > 0) {
    code += `        # ── Actuators & Drive Motors ──\n`;
    motors.forEach((m) => {
      const varName = m.id;
      const canId = m.data?.canId || 1;
      if (m.data?.deviceType === 'KrakenX60') {
        code += `        self.${varName} = phoenix6.hardware.TalonFX(${canId})\n`;
      } else if (m.data?.deviceType === 'SparkMaxNEO') {
        code += `        self.${varName} = rev.CANSparkMax(${canId}, rev.CANSparkLowLevel.MotorType.kBrushless)\n`;
      }
    });
  }

  // Initialize Sensors & Vision
  if (sensors.length > 0) {
    code += `\n        # ── Sensors & Vision Systems ──\n`;
    sensors.forEach((s) => {
      const varName = s.id;
      const canId = s.data?.canId || 1;
      if (s.data?.deviceType === 'CANcoder') {
        code += `        self.${varName} = phoenix6.hardware.CANcoder(${canId})\n`;
      } else if (s.data?.deviceType === 'Pigeon2') {
        code += `        self.${varName} = phoenix6.hardware.Pigeon2(${canId})\n`;
      } else if (s.data?.deviceType === 'Limelight') {
        code += `        self.limelight_table = NetworkTableInstance.getDefault().getTable("limelight")\n`;
      }
    });
  }

  // Initialize Pneumatics
  if (pneumatics.length > 0) {
    code += `\n        # ── Pneumatics ──\n`;
    pneumatics.forEach((p, idx) => {
      code += `        self.${p.id} = wpilib.Solenoid(wpilib.PneumaticsModuleType.REVPH, ${idx})\n`;
    });
  }

  code += `\n    def robotPeriodic(self):\n`;
  if (nodes.some((n) => n.data?.deviceType === 'Limelight')) {
    code += `        # Fetch Limelight Target Tracking Values\n`;
    code += `        tx = self.limelight_table.getNumber("tx", 0.0)\n`;
    code += `        tv = self.limelight_table.getNumber("tv", 0.0)\n`;
    code += `        wpilib.SmartDashboard.putNumber("LimelightTX", tx)\n`;
    code += `        wpilib.SmartDashboard.putBoolean("LimelightTarget", tv == 1.0)\n`;
  } else {
    code += `        pass\n`;
  }

  code += `\n    def autonomousInit(self):\n`;
  code += `        pass\n\n`;
  code += `    def teleopInit(self):\n`;
  code += `        pass\n\n`;
  code += `    def teleopPeriodic(self):\n`;
  code += `        pass\n\n`;
  code += `if __name__ == "__main__":\n`;
  code += `    wpilib.run(MyRobot)\n`;

  return code;
}