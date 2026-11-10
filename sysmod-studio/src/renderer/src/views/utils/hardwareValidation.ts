/**
 * Hardware Validation Engine (Phase 2).
 *
 * Three analyses that run on every change to the diagram:
 *  - CAN bus load: estimated bus utilization for each CAN network, from each device's
 *    default status traffic
 *  - Current limits: the load on every PDH channel, regulator and the 120 A main breaker,
 *    rolled up through the power tree
 *  - Port and ID conflicts: duplicate or out-of-range CAN IDs, DIO ports, PWM ports and PDH channels
 *
 * The traffic and current figures are design estimates from vendor defaults, not measurements.
 * Each one is a named constant below so it can be checked against a datasheet and updated.
 */
import { Node, Edge } from '@xyflow/react';
import { FRCEdgeData, FRCNodeData } from '../store/useRobotStore';
import { getWireFamily, groupWiresByNetwork, isMismatchedWire } from './aadlGenerator';

export interface HardwareIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  nodeIds?: string[];
  category: 'can-load' | 'current' | 'ids';
}

// ── CAN bus load ──────────────────────────────────────────────────────────────────────────

/**
 * Estimated CAN frames per second each device sends or receives with vendor default settings,
 * including the robot code's control frames. Teams that slow down status frames use less.
 */
export const CAN_FRAMES_PER_SECOND: Record<string, number> = {
  // CTRE Phoenix 6 Talon FX: fast position and velocity signals plus slower status signals
  KrakenX60: 250,
  KrakenX44: 250,
  Falcon500: 250,
  // REV SPARK MAX and SPARK Flex: periodic status frames 0 to 6 plus the control frame
  SparkMaxNEO: 330,
  NEOVortex: 330,
  NEO550: 330,
  BrushedController: 330,
  CANcoder: 100,
  Pigeon2: 150,
  TimeOfFlight: 50,
  PneumaticsHub: 30,
  PDH: 40,
  roboRIO: 50,
};

/** Time one 8-byte frame occupies on the bus, including bit stuffing */
const FRAME_TIME_US = {
  classic: 150, // CAN 2.0 at 1 Mbit/s
  fd: 45, // CAN FD on a CANivore: 1 Mbit/s arbitration, then a faster data phase
};

export const CAN_LOAD_LIMITS = { warning: 0.7, error: 0.9 };

export interface CanBusLoad {
  id: string;
  name: string;
  isFd: boolean;
  devices: { nodeId: string; deviceType: string; framesPerSecond: number }[];
  framesPerSecond: number;
  /** Fraction of bus time in use, from 0 upward; above 1 means frames are being dropped */
  utilization: number;
}

// ── Current ───────────────────────────────────────────────────────────────────────────────

export const MOTOR_TYPES = ['KrakenX60', 'KrakenX44', 'Falcon500', 'SparkMaxNEO', 'NEOVortex', 'NEO550', 'BrushedController'];

/** The supply current limit a new motor controller gets, matching its 40 A PDH channel */
export const DEFAULT_MOTOR_LIMIT_A = 40;

/** A motor controller's supply current limit, as set on its component, in amps */
export const motorCurrentLimitA = (node: Node<FRCNodeData>): number => node.data?.currentLimit ?? DEFAULT_MOTOR_LIMIT_A;

/** Typical maximum draw, in amps at 12 V, of devices that aren't motors */
export const DEVICE_CURRENT_A: Record<string, number> = {
  roboRIO: 2,
  RadioSwitch: 1.5,
  Limelight: 4,
  Coprocessor: 3,
  PneumaticsHub: 0.5,
  Compressor: 12,
  SolenoidValve: 0.2,
  VRM: 0.1,
  BuckConverter: 0.1,
  MPM: 0,
};

/** Rated current of each PDH channel type, from its breaker or fuse */
export const PDH_CHANNEL_RATING_A = { high: 40, low: 15, switched: 15 };

/** Rated output current of regulators, which can't be exceeded for long */
export const REGULATOR_RATING_A: Record<string, number> = { VRM: 2, BuckConverter: 5 };

export const MAIN_BREAKER_RATING_A = 120;

/** Above this many times its rating, the main breaker trips within seconds */
export const MAIN_BREAKER_TRIP_FACTOR = 2;

export interface PowerLoad {
  id: string;
  name: string;
  /** The device whose supply this is, or the PDH for the main breaker */
  nodeId: string;
  ratingA: number;
  loadA: number;
  loads: { nodeId: string; currentA: number }[];
}

// ── IDs ───────────────────────────────────────────────────────────────────────────────────

export const CAN_ID_RANGE = { min: 0, max: 62 };
export const DIO_RANGE = { min: 0, max: 9 };
export const PWM_RANGE = { min: 0, max: 9 };

// CAN IDs only need to be unique per device class, and these models share a class
const CAN_ID_CLASSES: Record<string, string> = {
  KrakenX60: 'Talon FX',
  KrakenX44: 'Talon FX',
  Falcon500: 'Talon FX',
  SparkMaxNEO: 'SPARK',
  NEOVortex: 'SPARK',
  NEO550: 'SPARK',
  BrushedController: 'SPARK',
};

export const canIdClass = (deviceType: string): string => CAN_ID_CLASSES[deviceType] || deviceType;

export interface IdAssignment {
  kind: 'CAN' | 'DIO' | 'PWM' | 'PDH';
  scope: string;
  value: number;
  nodeIds: string[];
}

export interface HardwareAnalysis {
  canBuses: CanBusLoad[];
  mainBreaker: PowerLoad;
  channels: PowerLoad[];
  regulators: PowerLoad[];
  ids: IdAssignment[];
  issues: HardwareIssue[];
}

const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;
const amps = (value: number): string => `${Number(value.toFixed(1))} A`;

export function analyzeHardware(nodes: Node<FRCNodeData>[], edges: Edge[]): HardwareAnalysis {
  const issues: HardwareIssue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nameOf = (id: string): string => byId.get(id)?.data?.label || id;
  const typeOf = (id: string): string => byId.get(id)?.data?.deviceType || '';
  const validEdges = edges.filter((e) => !isMismatchedWire(e));

  // ── CAN bus load ──
  const canNetworks = groupWiresByNetwork(validEdges, (e) => e, 'can');
  const canBuses: CanBusLoad[] = canNetworks.map((network, index) => {
    const isFd = network.some((e) => e.sourceHandle === 'can-fd-start');
    const memberIds = [...new Set(network.flatMap((e) => [e.source, e.target]))];
    const root = network.find((e) => e.sourceHandle === 'can-fd-start' || e.sourceHandle === 'can-start')?.source;
    const devices = memberIds
      .map((nodeId) => ({ nodeId, deviceType: typeOf(nodeId), framesPerSecond: CAN_FRAMES_PER_SECOND[typeOf(nodeId)] || 0 }))
      .filter((d) => d.framesPerSecond > 0);
    const framesPerSecond = devices.reduce((sum, d) => sum + d.framesPerSecond, 0);
    const utilization = (framesPerSecond * (isFd ? FRAME_TIME_US.fd : FRAME_TIME_US.classic)) / 1_000_000;
    const name = root ? `${isFd ? 'CAN FD' : 'CAN'} bus from ${root}` : `CAN chain ${index + 1}`;
    return { id: root || `chain-${index + 1}`, name, isFd, devices, framesPerSecond, utilization };
  });

  canBuses.forEach((bus) => {
    if (bus.utilization < CAN_LOAD_LIMITS.warning) return;
    const isError = bus.utilization >= CAN_LOAD_LIMITS.error;
    const busiest = [...bus.devices].sort((a, b) => b.framesPerSecond - a.framesPerSecond);
    issues.push({
      id: `can-load-${bus.id}`,
      category: 'can-load',
      severity: isError ? 'error' : 'warning',
      title: isError ? 'CAN Bus Saturated' : 'CAN Bus Heavily Loaded',
      message: `The ${bus.name} is about ${percent(bus.utilization)} busy with ${bus.devices.length} devices (${bus.framesPerSecond} frames/s). ${
        isError ? 'Above 90%, frames are delayed or lost, and devices can stop responding.' : 'Keep it under 70% to leave room for bursts.'
      } Slow down status frames you don't use${bus.isFd ? '' : ', or move CTRE devices to a CANivore'}.`,
      nodeIds: busiest.slice(0, 5).map((d) => d.nodeId),
    });
  });

  // ── Current: roll each supply's load up the power tree ──
  const powerChildren = (nodeId: string): Edge[] =>
    validEdges.filter((e) => e.source === nodeId && ['power', 'comp', 'sol'].includes(getWireFamily(e.sourceHandle) || ''));

  const ownCurrent = (node: Node<FRCNodeData>): number => {
    const type = node.data?.deviceType;
    if (MOTOR_TYPES.includes(type)) return motorCurrentLimitA(node);
    return DEVICE_CURRENT_A[type] ?? 0;
  };

  const loadsUnder = (nodeId: string, visiting = new Set<string>()): { nodeId: string; currentA: number }[] => {
    if (visiting.has(nodeId)) return [];
    visiting.add(nodeId);
    const node = byId.get(nodeId);
    if (!node) return [];
    const own = ownCurrent(node);
    const below = powerChildren(nodeId).flatMap((e) => loadsUnder(e.target, visiting));
    return [...(own > 0 ? [{ nodeId, currentA: own }] : []), ...below];
  };
  const total = (loads: { currentA: number }[]): number => loads.reduce((sum, l) => sum + l.currentA, 0);

  const pdh = nodes.find((n) => n.data?.deviceType === 'PDH');
  const channels: PowerLoad[] = pdh
    ? validEdges
        .filter((e) => e.source === pdh.id && getWireFamily(e.sourceHandle) === 'power')
        .map((e) => {
          const data = e.data as FRCEdgeData | undefined;
          const type = data?.channelType || 'high';
          const loads = loadsUnder(e.target);
          return {
            id: e.id,
            name: `PDH channel ${data?.channelNum ?? '?'} (${type === 'high' ? '40 A' : '15 A'})`,
            nodeId: e.target,
            ratingA: PDH_CHANNEL_RATING_A[type],
            loadA: total(loads),
            loads,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    : [];

  channels.forEach((channel) => {
    const fed = byId.get(channel.nodeId);
    const fedType = fed?.data?.deviceType || '';
    // A motor on a 15 A channel is already its own rule, so don't report it twice
    if (MOTOR_TYPES.includes(fedType) && channel.ratingA < PDH_CHANNEL_RATING_A.high) return;

    if (MOTOR_TYPES.includes(fedType) && channel.loadA > channel.ratingA) {
      issues.push({
        id: `current-motor-limit-${channel.nodeId}`,
        category: 'current',
        severity: 'warning',
        title: 'Current Limit Above Breaker',
        message: `${nameOf(channel.nodeId)} has a ${amps(channel.loadA)} supply current limit on a ${amps(channel.ratingA)} breaker. A long push at that limit trips the breaker before the controller limits current. Lower the limit to ${amps(channel.ratingA)} or less.`,
        nodeIds: [channel.nodeId],
      });
    } else if (channel.loadA > channel.ratingA) {
      issues.push({
        id: `current-channel-${channel.id}`,
        category: 'current',
        severity: 'error',
        title: 'PDH Channel Overloaded',
        message: `${channel.name} feeds ${nameOf(channel.nodeId)}, which can draw about ${amps(channel.loadA)} with everything behind it. That is more than the channel's ${amps(channel.ratingA)} rating.`,
        nodeIds: [...new Set(channel.loads.map((l) => l.nodeId))],
      });
    }
  });

  const regulators: PowerLoad[] = nodes
    .filter((n) => REGULATOR_RATING_A[n.data?.deviceType] !== undefined)
    .map((n) => {
      const loads = powerChildren(n.id).flatMap((e) => loadsUnder(e.target));
      return { id: n.id, name: `${nameOf(n.id)} output`, nodeId: n.id, ratingA: REGULATOR_RATING_A[n.data.deviceType], loadA: total(loads), loads };
    });

  regulators.forEach((regulator) => {
    if (regulator.loadA <= regulator.ratingA) return;
    issues.push({
      id: `current-regulator-${regulator.id}`,
      category: 'current',
      severity: 'error',
      title: 'Regulator Overloaded',
      message: `${regulator.name} is rated for ${amps(regulator.ratingA)}, but the devices on it can draw about ${amps(regulator.loadA)}. It will brown out or shut down. Move a device to its own supply.`,
      nodeIds: [regulator.id, ...regulator.loads.map((l) => l.nodeId)],
    });
  });

  const allLoads = channels.flatMap((c) => c.loads);
  const mainBreaker: PowerLoad = {
    id: 'main-breaker',
    name: '120 A main breaker',
    nodeId: nodes.find((n) => n.data?.deviceType === 'MainBreaker120A')?.id || pdh?.id || '',
    ratingA: MAIN_BREAKER_RATING_A,
    loadA: total(allLoads),
    loads: allLoads,
  };

  if (mainBreaker.loadA > MAIN_BREAKER_RATING_A) {
    const tripsFast = mainBreaker.loadA > MAIN_BREAKER_RATING_A * MAIN_BREAKER_TRIP_FACTOR;
    issues.push({
      id: 'current-main-breaker',
      category: 'current',
      severity: tripsFast ? 'warning' : 'info',
      title: tripsFast ? 'Main Breaker Can Trip' : 'Peak Draw Above Main Breaker',
      message: `If every device draws its full limit at once, the robot pulls about ${amps(mainBreaker.loadA)} through the ${amps(MAIN_BREAKER_RATING_A)} main breaker. ${
        tripsFast
          ? `Above ${amps(MAIN_BREAKER_RATING_A * MAIN_BREAKER_TRIP_FACTOR)}, it can trip within seconds and the battery will brown out. Lower the supply current limits on mechanisms that run together.`
          : 'Short peaks like this are normal, but long pushes at full power will heat and eventually trip it.'
      }`,
      nodeIds: mainBreaker.nodeId ? [mainBreaker.nodeId] : undefined,
    });
  }

  // ── IDs and ports ──
  const ids: IdAssignment[] = [];
  const record = (kind: IdAssignment['kind'], scope: string, value: number, nodeId: string): void => {
    const existing = ids.find((a) => a.kind === kind && a.scope === scope && a.value === value);
    if (existing) existing.nodeIds.push(nodeId);
    else ids.push({ kind, scope, value, nodeIds: [nodeId] });
  };

  const busOf = new Map<string, CanBusLoad>();
  canNetworks.forEach((network, index) => network.forEach((e) => [e.source, e.target].forEach((id) => busOf.set(id, canBuses[index]))));

  nodes.forEach((node) => {
    const { canId, dioPort, pwmPort, deviceType } = node.data || ({} as FRCNodeData);
    if (canId !== undefined) {
      const bus = busOf.get(node.id);
      // Devices on no bus yet are compared with each other, since they will likely share one
      record('CAN', `${bus ? bus.name : 'not wired to a bus'} · ${canIdClass(deviceType)}`, canId, node.id);
      if (!Number.isInteger(canId) || canId < CAN_ID_RANGE.min || canId > CAN_ID_RANGE.max) {
        issues.push({ id: `id-can-range-${node.id}`, category: 'ids', severity: 'error', title: 'Invalid CAN ID', message: `${nameOf(node.id)} has CAN ID ${canId}. CAN IDs must be whole numbers from ${CAN_ID_RANGE.min} to ${CAN_ID_RANGE.max}.`, nodeIds: [node.id] });
      }
    }
    if (dioPort !== undefined) {
      record('DIO', 'roboRIO DIO', dioPort, node.id);
      if (!Number.isInteger(dioPort) || dioPort < DIO_RANGE.min || dioPort > DIO_RANGE.max) {
        issues.push({ id: `id-dio-range-${node.id}`, category: 'ids', severity: 'error', title: 'Invalid DIO Port', message: `${nameOf(node.id)} is on DIO port ${dioPort}, but the roboRIO has DIO ports ${DIO_RANGE.min} to ${DIO_RANGE.max}.`, nodeIds: [node.id] });
      }
    }
    if (pwmPort !== undefined) {
      record('PWM', 'roboRIO PWM', pwmPort, node.id);
      if (!Number.isInteger(pwmPort) || pwmPort < PWM_RANGE.min || pwmPort > PWM_RANGE.max) {
        issues.push({ id: `id-pwm-range-${node.id}`, category: 'ids', severity: 'error', title: 'Invalid PWM Port', message: `${nameOf(node.id)} is on PWM port ${pwmPort}, but the roboRIO has PWM ports ${PWM_RANGE.min} to ${PWM_RANGE.max}.`, nodeIds: [node.id] });
      }
    }
  });

  if (pdh) {
    edges.forEach((e) => {
      const data = e.data as FRCEdgeData | undefined;
      if (e.source === pdh.id && typeof data?.channelNum === 'number') record('PDH', 'PDH channel', data.channelNum, e.target);
    });
  }

  ids.sort((a, b) => a.kind.localeCompare(b.kind) || a.scope.localeCompare(b.scope) || a.value - b.value);
  ids
    .filter((a) => a.nodeIds.length > 1)
    .forEach((a) => {
      const who = a.nodeIds.map(nameOf).join(', ');
      const where = a.kind === 'CAN' ? `CAN ID ${a.value} (${a.scope})` : `${a.scope} ${a.value}`;
      issues.push({
        id: `id-duplicate-${a.kind}-${a.scope}-${a.value}`,
        category: 'ids',
        severity: 'error',
        title: a.kind === 'CAN' ? 'Duplicate CAN ID' : `Duplicate ${a.kind === 'PDH' ? 'PDH Channel' : `${a.kind} Port`}`,
        message: `${who} all use ${where}. ${
          a.kind === 'CAN' ? 'Devices of the same kind on one bus need different IDs, or the robot code talks to the wrong one.' : 'Each port can only connect to one device.'
        }`,
        nodeIds: a.nodeIds,
      });
    });

  return { canBuses, mainBreaker, channels, regulators, ids, issues };
}
