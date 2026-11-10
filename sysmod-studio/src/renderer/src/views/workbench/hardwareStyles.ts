import {
  Activity, Battery, Camera, Cpu, Eye, Gauge, Lightbulb, LucideIcon, Radio, Server, ShieldAlert, Sliders, Wifi, Wind, Zap,
} from 'lucide-react';

export interface HardwareStyle {
  icon: LucideIcon;
  borderColor: string;
  iconColor: string;
}

export const HARDWARE_STYLES: Record<string, HardwareStyle> = {
  Battery12V: { icon: Battery, borderColor: 'border-red-500/40', iconColor: 'text-red-500' },
  MainBreaker120A: { icon: ShieldAlert, borderColor: 'border-red-600/40', iconColor: 'text-red-500' },
  PDH: { icon: Zap, borderColor: 'border-amber-500/40', iconColor: 'text-amber-500' },
  VRM: { icon: Zap, borderColor: 'border-amber-500/40', iconColor: 'text-amber-400' },
  MPM: { icon: Zap, borderColor: 'border-amber-500/40', iconColor: 'text-amber-400' },
  BuckConverter: { icon: Sliders, borderColor: 'border-sky-500/40', iconColor: 'text-sky-400' },
  roboRIO: { icon: Cpu, borderColor: 'border-indigo-500/40', iconColor: 'text-indigo-400' },
  RadioSwitch: { icon: Wifi, borderColor: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  RSL: { icon: Lightbulb, borderColor: 'border-yellow-500/40', iconColor: 'text-yellow-400' },
  CANivore: { icon: Radio, borderColor: 'border-amber-500/40', iconColor: 'text-amber-400' },
  CANHub: { icon: Radio, borderColor: 'border-amber-500/40', iconColor: 'text-amber-400' },
  KrakenX60: { icon: Activity, borderColor: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  KrakenX44: { icon: Activity, borderColor: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  Falcon500: { icon: Activity, borderColor: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  SparkMaxNEO: { icon: Zap, borderColor: 'border-orange-500/40', iconColor: 'text-orange-400' },
  NEOVortex: { icon: Zap, borderColor: 'border-orange-500/40', iconColor: 'text-orange-400' },
  NEO550: { icon: Zap, borderColor: 'border-orange-500/40', iconColor: 'text-orange-400' },
  BrushedController: { icon: Zap, borderColor: 'border-orange-500/40', iconColor: 'text-orange-400' },
  PWMServo: { icon: Zap, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  PneumaticsHub: { icon: Wind, borderColor: 'border-sky-500/40', iconColor: 'text-sky-400' },
  Compressor: { icon: Wind, borderColor: 'border-sky-500/40', iconColor: 'text-sky-400' },
  PressureSwitch: { icon: Wind, borderColor: 'border-sky-500/40', iconColor: 'text-sky-400' },
  SolenoidValve: { icon: Wind, borderColor: 'border-cyan-500/40', iconColor: 'text-cyan-400' },
  CANcoder: { icon: Gauge, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  ThroughBore: { icon: Gauge, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  Pigeon2: { icon: Radio, borderColor: 'border-rose-500/40', iconColor: 'text-rose-400' },
  NavX2: { icon: Radio, borderColor: 'border-rose-500/40', iconColor: 'text-rose-400' },
  LimitSwitch: { icon: Eye, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  BeamBreak: { icon: Eye, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  TimeOfFlight: { icon: Gauge, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  ColorSensor: { icon: Eye, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  Limelight: { icon: Camera, borderColor: 'border-lime-500/40', iconColor: 'text-lime-400' },
  PhotonVision: { icon: Camera, borderColor: 'border-lime-500/40', iconColor: 'text-lime-400' },
  Coprocessor: { icon: Server, borderColor: 'border-indigo-500/40', iconColor: 'text-indigo-400' },
};
