/**
 * Which wires the diagram lets you draw at all. These are physical impossibilities, like a
 * power lead in a CAN port, so they're blocked while you drag instead of reported afterwards.
 * Mistakes that are possible on a real robot stay as rule checks in the Problems panel.
 */
import { Connection, Edge, Node } from '@xyflow/react';
import type { FRCNodeData } from '../store/useRobotStore';
import { getWireFamily, WireFamily } from './aadlGenerator';

export const FAMILY_NAMES: Record<WireFamily, string> = {
  power: 'power',
  can: 'CAN',
  eth: 'Ethernet',
  rsl: 'RSL',
  dio: 'digital I/O',
  usb: 'USB',
  pwm: 'PWM',
  i2c: 'I2C',
  mxp: 'MXP',
  comp: 'compressor',
  sol: 'solenoid',
  press: 'pressure switch',
};

/** Ethernet switch ports for downstream devices */
export const SWITCH_PORTS = 4;

/**
 * How many wires a port takes. An Ethernet jack holds one cable, so every Ethernet port takes
 * one wire, except a switch's downstream ports, which share one handle on the diagram.
 */
export function portCapacity(deviceType: string, handle: string): number {
  if (getWireFamily(handle) !== 'eth') return Infinity;
  if (deviceType === 'NetworkSwitch' && handle === 'eth-out') return SWITCH_PORTS;
  return 1;
}

type Ends = Pick<Connection, 'source' | 'target'> & { sourceHandle?: string | null; targetHandle?: string | null };

/** Why a wire can't be drawn, or undefined if it can */
export function connectionProblem(connection: Ends, nodes: Node<FRCNodeData>[], edges: Edge[]): string | undefined {
  const { source, target, sourceHandle, targetHandle } = connection;
  if (!source || !target) return undefined;
  if (source === target) return 'A component can’t be wired to itself.';

  const from = getWireFamily(sourceHandle);
  const to = getWireFamily(targetHandle);
  if (from && to && from !== to) {
    return `A ${FAMILY_NAMES[from]} port can’t connect to a ${FAMILY_NAMES[to]} port.`;
  }

  const typeOf = (id: string): string => nodes.find((n) => n.id === id)?.data?.deviceType || '';
  const labelOf = (id: string): string => nodes.find((n) => n.id === id)?.data?.label || id;
  for (const [nodeId, handle] of [[source, sourceHandle], [target, targetHandle]] as const) {
    if (!handle) continue;
    const capacity = portCapacity(typeOf(nodeId), handle);
    const used = edges.filter((e) => (e.source === nodeId && e.sourceHandle === handle) || (e.target === nodeId && e.targetHandle === handle)).length;
    if (used >= capacity) {
      return capacity === 1
        ? `That Ethernet port on ${labelOf(nodeId)} already has a cable. Add an Ethernet switch to connect more devices.`
        : `All ${capacity} Ethernet ports on ${labelOf(nodeId)} are in use.`;
    }
  }
  return undefined;
}
