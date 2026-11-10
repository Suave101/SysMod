/**
 * The robot controllers SysMod supports, and the ports each one has. Rules, hardware checks,
 * contracts and the diagram all read from here, so adding a controller happens in one place.
 *
 * SystemCore replaces the roboRIO starting with the 2027 FRC season. Its port counts come from
 * WPILib's 2027 preview documentation; check them against FIRST's final spec sheet at kickoff.
 */
import { Node } from '@xyflow/react';
import type { FRCNodeData } from '../store/useRobotStore';

export type ControllerType = 'SystemCore' | 'roboRIO';

export interface PortLimit {
  name: string;
  /** Handles that share this pool of physical ports */
  handles: string[];
  limit: number;
}

export interface ControllerSpec {
  name: string;
  season: string;
  /** Each handle starts its own CAN bus */
  canBuses: { handle: string; label: string }[];
  /** Digital I/O and PWM port numbers */
  ioRange: { min: number; max: number };
  /** True when DIO and PWM come from one shared pool of ports, like SystemCore's Smart I/O */
  sharedIo: boolean;
  ioName: { dio: string; pwm: string };
  portLimits: PortLimit[];
  hasMxp: boolean;
}

export const CONTROLLERS: Record<ControllerType, ControllerSpec> = {
  SystemCore: {
    name: 'SystemCore',
    season: '2027 and later',
    canBuses: [0, 1, 2, 3, 4].map((n) => ({ handle: `can-${n}`, label: `CAN ${n}` })),
    ioRange: { min: 0, max: 5 },
    sharedIo: true,
    ioName: { dio: 'Smart I/O', pwm: 'Smart I/O' },
    portLimits: [
      { name: 'Smart I/O', handles: ['dio-in', 'pwm-out'], limit: 6 },
      { name: 'USB', handles: ['usb-out'], limit: 4 },
      { name: 'I2C', handles: ['i2c-in'], limit: 2 },
    ],
    hasMxp: false,
  },
  roboRIO: {
    name: 'roboRIO 2.0',
    season: '2026 and earlier',
    canBuses: [{ handle: 'can-start', label: 'CAN' }],
    ioRange: { min: 0, max: 9 },
    sharedIo: false,
    ioName: { dio: 'DIO', pwm: 'PWM' },
    portLimits: [
      { name: 'DIO', handles: ['dio-in'], limit: 10 },
      { name: 'PWM', handles: ['pwm-out'], limit: 10 },
      { name: 'USB', handles: ['usb-out'], limit: 2 },
    ],
    hasMxp: true,
  },
};

export const CONTROLLER_TYPES = Object.keys(CONTROLLERS) as ControllerType[];

export const isControllerType = (type: string | undefined): type is ControllerType => CONTROLLER_TYPES.includes(type as ControllerType);

/** Every handle on any controller that starts a CAN bus */
export const CONTROLLER_CAN_HANDLES = CONTROLLER_TYPES.flatMap((t) => CONTROLLERS[t].canBuses.map((b) => b.handle));

/** The robot's controller, preferring SystemCore if a diagram somehow has both */
export function findController(nodes: Node<FRCNodeData>[]): { node: Node<FRCNodeData>; spec: ControllerSpec; type: ControllerType } | undefined {
  for (const type of CONTROLLER_TYPES) {
    const node = nodes.find((n) => n.data?.deviceType === type);
    if (node) return { node, spec: CONTROLLERS[type], type };
  }
  return undefined;
}

/** The controller new diagrams should use, and what port ranges apply when none is placed yet */
export const DEFAULT_CONTROLLER: ControllerType = 'SystemCore';
