import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../../store/useRobotStore';
import { toAadlIdentifier } from '../aadlGenerator';

/** One block of AGREE annex text, kept separate so errors can say which block they came from */
export interface ContractSource {
  label: string;
  text: string;
}

export interface AgreeContracts {
  deviceTypes: Record<string, ContractSource[]>;
  system: ContractSource[];
}

/** Contracts students write in the advanced editor, keyed by device type plus 'System' */
export type CustomContracts = Record<string, string>;

export const SYSTEM_SCOPE = 'System';
export const STANDARD_LABEL = 'FRC standard contract';
export const CUSTOM_LABEL = 'Your contract';

// Limits used by the standard contracts. Each one is explained in docs/verification/frc-contracts.md.
export const FRC_LIMITS = {
  /** Highest voltage a 12 V lead-acid FRC battery reaches, at the end of charging */
  batteryMaxVolts: 14.4,
  /** roboRIO 2.0 maximum input; the lowest maximum of the common FRC control electronics */
  deviceMaxVolts: 16.0,
  /** roboRIO 2.0 default brownout threshold, where it disables PWM outputs */
  brownoutVolts: 6.75,
  /** VRM and buck converters regulate to at most 12 V */
  regulatedMaxVolts: 12.0,
};

const POWERED_TYPES = [
  'PDH', 'VRM', 'MPM', 'BuckConverter', 'roboRIO', 'RadioSwitch', 'PneumaticsHub', 'Limelight', 'Coprocessor',
  'KrakenX60', 'KrakenX44', 'Falcon500', 'SparkMaxNEO', 'NEOVortex', 'NEO550', 'BrushedController',
];

const supplyCeiling = (port: string): string =>
  `const MAX_INPUT_VOLTS : real = ${FRC_LIMITS.deviceMaxVolts.toFixed(1)};
assume "Supply comes from the robot battery and never exceeds ${FRC_LIMITS.deviceMaxVolts} V" :
  ${port} >= 0.0 and ${port} <= MAX_INPUT_VOLTS;`;

const STANDARD_DEVICE_CONTRACTS: Record<string, string> = {
  Battery12V: `-- The robot has one battery, and it is the only power source
const MAX_VOLTS : real = ${FRC_LIMITS.batteryMaxVolts.toFixed(1)};
guarantee "Battery voltage stays between 0 V and the ${FRC_LIMITS.batteryMaxVolts} V lead-acid charge limit" :
  pwr_battery_out >= 0.0 and pwr_battery_out <= MAX_VOLTS;`,

  MainBreaker120A: `guarantee "Either passes battery voltage through or is tripped open" :
  pwr_pdh_out = pwr_battery_in or pwr_pdh_out = 0.0;`,

  PDH: `guarantee "High-current channels never exceed the PDH input" :
  pwr_high_out >= 0.0 and pwr_high_out <= pwr_12v_in;
guarantee "Low-current channels never exceed the PDH input" :
  pwr_low_out >= 0.0 and pwr_low_out <= pwr_12v_in;
guarantee "Switchable channel never exceeds the PDH input" :
  pwr_switched_out >= 0.0 and pwr_switched_out <= pwr_12v_in;`,

  MPM: `guarantee "Fused outputs never exceed the module input" :
  pwr_mpm_out >= 0.0 and pwr_mpm_out <= pwr_12v_in;`,

  VRM: `guarantee "Regulated output never exceeds ${FRC_LIMITS.regulatedMaxVolts} V" :
  pwr_regulated_out >= 0.0 and pwr_regulated_out <= ${FRC_LIMITS.regulatedMaxVolts.toFixed(1)};`,

  BuckConverter: `guarantee "Regulated output never exceeds ${FRC_LIMITS.regulatedMaxVolts} V" :
  pwr_regulated_out >= 0.0 and pwr_regulated_out <= ${FRC_LIMITS.regulatedMaxVolts.toFixed(1)};`,

  roboRIO: `const BROWNOUT_VOLTS : real = ${FRC_LIMITS.brownoutVolts};
guarantee "PWM outputs stay between -1 and 1" :
  pwm_out >= -1.0 and pwm_out <= 1.0;
guarantee "PWM outputs are disabled during a brownout (below ${FRC_LIMITS.brownoutVolts} V)" :
  pwr_12v_in < BROWNOUT_VOLTS => pwm_out = 0.0;`,

  PWMServo: `assume "PWM command stays between -1 and 1" :
  pwm_in >= -1.0 and pwm_in <= 1.0;`,

  PneumaticsHub: `guarantee "Compressor only runs while the pressure switch calls for air" :
  comp_out => press_in;`,
};

/** The standard contract for one device type, or undefined if the type has none */
export function getStandardDeviceContract(type: string): string | undefined {
  const parts = [STANDARD_DEVICE_CONTRACTS[type], POWERED_TYPES.includes(type) ? supplyCeiling('pwr_12v_in') : undefined];
  const text = parts.filter(Boolean).join('\n');
  return text || undefined;
}

/**
 * System lemmas that follow from the wiring. A compressor must stop when its pressure switch
 * opens, which is only provable when the compressor and switch share a Pneumatic Hub.
 */
export function getStandardSystemContract(nodes: Node<FRCNodeData>[], edges: Edge[]): string | undefined {
  const lemmas: string[] = [];
  nodes.filter((n) => n.data?.deviceType === 'Compressor').forEach((compressor) => {
    const hubWire = edges.find((e) => e.target === compressor.id && e.targetHandle === 'comp-in');
    const switchWire = hubWire && edges.find((e) => e.target === hubWire.source && e.targetHandle === 'press-in');
    if (switchWire) {
      lemmas.push(`lemma "${compressor.id} stops when the pressure switch reaches cutoff" :
  ${toAadlIdentifier(compressor.id)}.comp_in => ${toAadlIdentifier(switchWire.source)}.press_out;`);
    }
  });
  return lemmas.length > 0 ? lemmas.join('\n') : undefined;
}

/** Combines the standard FRC contracts with the student's own for every device type on the canvas */
export function buildContracts(nodes: Node<FRCNodeData>[], edges: Edge[], custom: CustomContracts): AgreeContracts {
  const withCustom = (standard: string | undefined, scope: string): ContractSource[] =>
    [
      standard ? { label: STANDARD_LABEL, text: standard } : undefined,
      custom[scope]?.trim() ? { label: CUSTOM_LABEL, text: custom[scope] } : undefined,
    ].filter((s): s is ContractSource => !!s);

  const deviceTypes: Record<string, ContractSource[]> = {};
  [...new Set(nodes.map((n) => n.data?.deviceType))].forEach((type) => {
    const sources = withCustom(getStandardDeviceContract(type), type);
    if (sources.length > 0) deviceTypes[type] = sources;
  });

  return { deviceTypes, system: withCustom(getStandardSystemContract(nodes, edges), SYSTEM_SCOPE) };
}
