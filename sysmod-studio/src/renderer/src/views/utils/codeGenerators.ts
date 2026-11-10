import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';
import { formatAmps, generatePythonCode, REV_MOTORS } from './pythonGenerator';
import { generateAadlCode } from './aadlGenerator';
import { motorCurrentLimitA } from './hardwareValidation';

export { generatePythonCode, generateAadlCode };

const TALON_FX_MOTORS = ['KrakenX60', 'KrakenX44', 'Falcon500'];

/** A Java field name for a component id */
const javaName = (id: string): string => {
  const name = id.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(name) ? name : `_${name}`;
};

/**
 * Generates a WPILib Robot.java that creates every device on the diagram with its CAN ID or
 * port, and applies each motor's supply current limit from the diagram.
 */
export function generateJavaCode(nodes: Node<FRCNodeData>[], _edges: Edge[]): string {
  const of = (...types: string[]): Node<FRCNodeData>[] => nodes.filter((n) => types.includes(n.data?.deviceType || ''));
  const talons = of(...TALON_FX_MOTORS);
  const sparks = of(...Object.keys(REV_MOTORS));
  const servos = of('PWMServo');
  const cancoders = of('CANcoder');
  const pigeons = of('Pigeon2');
  const digitalInputs = of('LimitSwitch', 'BeamBreak');
  const throughBores = of('ThroughBore');
  const solenoids = of('SolenoidValve');
  const hasCompressor = of('Compressor').length > 0;
  const hasPneumatics = solenoids.length > 0 || hasCompressor;
  const usesFlex = sparks.some((s) => REV_MOTORS[s.data.deviceType].controller === 'SparkFlex');
  const usesMax = sparks.some((s) => REV_MOTORS[s.data.deviceType].controller === 'SparkMax');
  const canId = (n: Node<FRCNodeData>): number => n.data?.canId ?? 1;

  const imports = new Set<string>(['edu.wpi.first.wpilibj.TimedRobot']);
  if (talons.length > 0) imports.add('com.ctre.phoenix6.hardware.TalonFX').add('com.ctre.phoenix6.configs.CurrentLimitsConfigs');
  if (cancoders.length > 0) imports.add('com.ctre.phoenix6.hardware.CANcoder');
  if (pigeons.length > 0) imports.add('com.ctre.phoenix6.hardware.Pigeon2');
  if (sparks.length > 0) {
    imports.add('com.revrobotics.spark.SparkLowLevel.MotorType').add('com.revrobotics.spark.SparkBase.ResetMode').add('com.revrobotics.spark.SparkBase.PersistMode');
  }
  if (usesMax) imports.add('com.revrobotics.spark.SparkMax').add('com.revrobotics.spark.config.SparkMaxConfig');
  if (usesFlex) imports.add('com.revrobotics.spark.SparkFlex').add('com.revrobotics.spark.config.SparkFlexConfig');
  if (servos.length > 0) imports.add('edu.wpi.first.wpilibj.Servo');
  if (digitalInputs.length > 0) imports.add('edu.wpi.first.wpilibj.DigitalInput');
  if (throughBores.length > 0) imports.add('edu.wpi.first.wpilibj.DutyCycleEncoder');
  if (hasPneumatics) imports.add('edu.wpi.first.wpilibj.PneumaticHub');
  if (solenoids.length > 0) imports.add('edu.wpi.first.wpilibj.Solenoid');
  if (hasCompressor) imports.add('edu.wpi.first.wpilibj.Compressor');

  const fields: string[] = [];
  talons.forEach((m) => fields.push(`  private final TalonFX ${javaName(m.id)} = new TalonFX(${canId(m)});`));
  sparks.forEach((m) => {
    const { controller, motorType } = REV_MOTORS[m.data.deviceType];
    fields.push(`  private final ${controller} ${javaName(m.id)} = new ${controller}(${canId(m)}, MotorType.${motorType});`);
  });
  servos.forEach((s) => fields.push(`  private final Servo ${javaName(s.id)} = new Servo(${s.data?.pwmPort ?? 0});`));
  cancoders.forEach((s) => fields.push(`  private final CANcoder ${javaName(s.id)} = new CANcoder(${canId(s)});`));
  pigeons.forEach((s) => fields.push(`  private final Pigeon2 ${javaName(s.id)} = new Pigeon2(${canId(s)});`));
  digitalInputs.forEach((s) => fields.push(`  private final DigitalInput ${javaName(s.id)} = new DigitalInput(${s.data?.dioPort ?? 0});`));
  throughBores.forEach((s) => fields.push(`  private final DutyCycleEncoder ${javaName(s.id)} = new DutyCycleEncoder(${s.data?.dioPort ?? 0});`));
  if (hasPneumatics) fields.push('  private final PneumaticHub pneumaticHub = new PneumaticHub();');
  if (hasCompressor) fields.push('  private final Compressor compressor = pneumaticHub.makeCompressor();');
  solenoids.forEach((s, channel) => fields.push(`  private final Solenoid ${javaName(s.id)} = pneumaticHub.makeSolenoid(${channel});`));

  const init: string[] = [];
  if (talons.length > 0 || sparks.length > 0) init.push('    // Supply current limits from each motor on the SysMod architecture diagram');
  talons.forEach((m) => {
    init.push(`    ${javaName(m.id)}.getConfigurator().apply(new CurrentLimitsConfigs()`);
    init.push(`        .withSupplyCurrentLimit(${formatAmps(motorCurrentLimitA(m))})`);
    init.push('        .withSupplyCurrentLimitEnable(true));');
  });
  sparks.forEach((m) => {
    const { controller } = REV_MOTORS[m.data.deviceType];
    const config = `${javaName(m.id)}Config`;
    // SPARK smart current limits cap motor current, which is never below supply current
    init.push(`    ${controller}Config ${config} = new ${controller}Config();`);
    init.push(`    ${config}.smartCurrentLimit(${Math.round(motorCurrentLimitA(m))});`);
    init.push(`    ${javaName(m.id)}.configure(${config}, ResetMode.kResetSafeParameters, PersistMode.kPersistParameters);`);
  });
  if (hasCompressor) init.push('    compressor.enableAnalog(100.0, 120.0);');

  let code = 'package frc.robot;\n\n';
  code += [...imports].sort().map((i) => `import ${i};`).join('\n');
  code += '\n\n/** Generated by SysMod Studio from the architecture diagram */\n';
  code += 'public class Robot extends TimedRobot {\n';
  if (fields.length > 0) code += `${fields.join('\n')}\n\n`;
  code += '  @Override\n  public void robotInit() {\n';
  code += init.length > 0 ? `${init.join('\n')}\n` : '';
  code += '  }\n\n';
  code += '  @Override\n  public void robotPeriodic() {}\n\n';
  code += '  @Override\n  public void teleopPeriodic() {}\n';
  code += '}\n';
  return code;
}
