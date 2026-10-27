import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';
import { generatePythonCode } from './pythonGenerator';

export { generatePythonCode };

/**
 * Generates FRC WPILib Java (Robot.java / RobotContainer.java)
 */
export function generateJavaCode(nodes: Node<FRCNodeData>[], edges: Edge[]): string {
  const motors = nodes.filter((n) => ['KrakenX60', 'SparkMaxNEO'].includes(n.data?.deviceType || ''));
  const sensors = nodes.filter((n) => ['CANcoder', 'Pigeon2', 'Limelight'].includes(n.data?.deviceType || ''));
  const pneumatics = nodes.filter((n) => n.data?.deviceType === 'SolenoidValve');

  let code = `package frc.robot;

import edu.wpi.first.wpilibj.TimedRobot;
import edu.wpi.first.wpilibj.smartdashboard.SmartDashboard;
`;

  if (nodes.some((n) => n.data?.deviceType === 'KrakenX60' || n.data?.deviceType === 'Pigeon2' || n.data?.deviceType === 'CANcoder')) {
    code += `import com.ctre.phoenix6.hardware.TalonFX;\n`;
    code += `import com.ctre.phoenix6.hardware.CANcoder;\n`;
    code += `import com.ctre.phoenix6.hardware.Pigeon2;\n`;
  }
  if (nodes.some((n) => n.data?.deviceType === 'SparkMaxNEO')) {
    code += `import com.revrobotics.CANSparkMax;\n`;
    code += `import com.revrobotics.CANSparkLowLevel.MotorType;\n`;
  }
  if (pneumatics.length > 0) {
    code += `import edu.wpi.first.wpilibj.Solenoid;\n`;
    code += `import edu.wpi.first.wpilibj.PneumaticsModuleType;\n`;
  }

  code += `\npublic class Robot extends TimedRobot {\n`;

  // Member variables
  motors.forEach((m) => {
    if (m.data?.deviceType === 'KrakenX60') {
      code += `    private TalonFX ${m.id};\n`;
    } else if (m.data?.deviceType === 'SparkMaxNEO') {
      code += `    private CANSparkMax ${m.id};\n`;
    }
  });

  sensors.forEach((s) => {
    if (s.data?.deviceType === 'CANcoder') {
      code += `    private CANcoder ${s.id};\n`;
    } else if (s.data?.deviceType === 'Pigeon2') {
      code += `    private Pigeon2 ${s.id};\n`;
    }
  });

  pneumatics.forEach((p) => {
    code += `    private Solenoid ${p.id};\n`;
  });

  code += `\n    @Override\n    public void robotInit() {\n`;

  // Instantiations
  motors.forEach((m) => {
    const canId = m.data?.canId || 1;
    if (m.data?.deviceType === 'KrakenX60') {
      code += `        ${m.id} = new TalonFX(${canId});\n`;
    } else if (m.data?.deviceType === 'SparkMaxNEO') {
      code += `        ${m.id} = new CANSparkMax(${canId}, MotorType.kBrushless);\n`;
    }
  });

  sensors.forEach((s) => {
    const canId = s.data?.canId || 1;
    if (s.data?.deviceType === 'CANcoder') {
      code += `        ${s.id} = new CANcoder(${canId});\n`;
    } else if (s.data?.deviceType === 'Pigeon2') {
      code += `        ${s.id} = new Pigeon2(${canId});\n`;
    }
  });

  pneumatics.forEach((p, idx) => {
    code += `        ${p.id} = new Solenoid(PneumaticsModuleType.REVPH, ${idx});\n`;
  });

  code += `    }\n\n`;
  code += `    @Override\n    public void robotPeriodic() {}\n\n`;
  code += `    @Override\n    public void teleopPeriodic() {}\n`;
  code += `}\n`;

  return code;
}

/**
 * Generates FRC Architectural AADL Specification
 */
export function generateAadlCode(nodes: Node<FRCNodeData>[], edges: Edge[]): string {
  let aadl = `package FRC_Robot_Architecture\npublic\n`;
  aadl += `  with Base_Types;\n\n`;
  aadl += `  system FRC_Robot\n  end FRC_Robot;\n\n`;
  aadl += `  system implementation FRC_Robot.impl\n`;
  aadl += `    subcomponents\n`;

  nodes.forEach((n) => {
    const type = n.data?.deviceType || 'Component';
    aadl += `      ${n.id}: device ${type};\n`;
  });

  aadl += `\n    connections\n`;

  edges.forEach((e, idx) => {
    aadl += `      conn_${idx}: port ${e.source}.${e.sourceHandle || 'out'} -> ${e.target}.${e.targetHandle || 'in'};\n`;
  });

  aadl += `  end FRC_Robot.impl;\n`;
  aadl += `end FRC_Robot_Architecture;\n`;

  return aadl;
}