import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';

export type WireFamily = 'power' | 'can' | 'eth' | 'rsl' | 'dio' | 'usb' | 'pwm' | 'i2c' | 'mxp' | 'comp' | 'sol' | 'press';

interface DevicePorts {
  in: string[];
  out: string[];
}

const WIRE_DATA_TYPES: Record<WireFamily, string> = {
  power: 'Electrical_Power',
  can: 'CAN_Frame',
  eth: 'Ethernet_Frame',
  rsl: 'RSL_Signal',
  dio: 'Digital_Signal',
  usb: 'USB_Packet',
  pwm: 'PWM_Signal',
  i2c: 'I2C_Message',
  mxp: 'MXP_Message',
  comp: 'Compressor_Power',
  sol: 'Solenoid_Signal',
  press: 'Pressure_Signal',
};

// These ports take several wires (a bus, or the roboRIO's bank of DIO pins), which plain AADL data ports do not allow
const MESSAGE_FAMILIES: WireFamily[] = ['can', 'eth', 'usb', 'dio', 'i2c', 'mxp'];

const DIO_SENSOR_PORTS: DevicePorts = { in: [], out: ['dio-out'] };
const CAN_DEVICE_PORTS: DevicePorts = { in: ['pwr-12v-in', 'can-in'], out: ['can-out'] };

// Mirrors the <Handle> ids rendered by ControlHubNode and StandardNode
const DEVICE_PORTS: Record<string, DevicePorts> = {
  Battery12V: { in: [], out: ['pwr-battery-out'] },
  MainBreaker120A: { in: ['pwr-battery-in'], out: ['pwr-pdh-out'] },
  PDH: { in: ['pwr-12v-in', 'can-term'], out: ['pwr-high-out', 'pwr-low-out', 'pwr-switched-out'] },
  VRM: { in: ['pwr-12v-in'], out: ['pwr-regulated-out'] },
  MPM: { in: ['pwr-12v-in'], out: ['pwr-mpm-out'] },
  BuckConverter: { in: ['pwr-12v-in'], out: ['pwr-regulated-out'] },
  roboRIO: { in: ['pwr-12v-in', 'eth-in', 'dio-in', 'i2c-in', 'mxp-in'], out: ['rsl-out', 'can-start', 'eth-out', 'pwm-out', 'usb-out'] },
  RadioSwitch: { in: ['pwr-12v-in', 'eth-rio'], out: ['eth-aux', 'eth-aux2'] },
  RSL: { in: ['rsl-in'], out: [] },
  CANivore: { in: ['usb-in'], out: ['can-fd-start'] },
  PWMServo: { in: ['pwm-in'], out: [] },
  PneumaticsHub: { in: ['pwr-12v-in', 'can-in', 'press-in'], out: ['can-out', 'comp-out', 'sol-out'] },
  Compressor: { in: ['comp-in'], out: [] },
  PressureSwitch: { in: [], out: ['press-out'] },
  SolenoidValve: { in: ['sol-in'], out: [] },
  ThroughBore: DIO_SENSOR_PORTS,
  LimitSwitch: DIO_SENSOR_PORTS,
  BeamBreak: DIO_SENSOR_PORTS,
  NavX2: { in: [], out: ['mxp-out'] },
  ColorSensor: { in: [], out: ['i2c-out'] },
  Limelight: { in: ['pwr-12v-in', 'eth-in'], out: ['eth-out'] },
  PhotonVision: { in: [], out: ['usb-out'] },
  Coprocessor: { in: ['pwr-12v-in', 'eth-in', 'usb-in'], out: ['eth-out'] },
};

const AADL_RESERVED_WORDS = new Set([
  'aadlboolean', 'aadlinteger', 'aadlreal', 'aadlstring', 'abstract', 'access', 'all', 'and', 'annex', 'applies',
  'binding', 'bus', 'calls', 'classifier', 'compute', 'connections', 'constant', 'data', 'delta', 'device', 'end',
  'enumeration', 'event', 'extends', 'false', 'feature', 'flow', 'flows', 'group', 'implementation', 'in', 'inherit',
  'initial', 'internal', 'inverse', 'is', 'list', 'memory', 'mode', 'modes', 'none', 'not', 'of', 'or', 'out',
  'package', 'parameter', 'path', 'port', 'private', 'process', 'processor', 'properties', 'property', 'prototypes',
  'provides', 'public', 'range', 'record', 'reference', 'refined', 'refines', 'renames', 'requires', 'self', 'set',
  'sink', 'source', 'subcomponents', 'subprogram', 'system', 'thread', 'to', 'true', 'type', 'units', 'virtual',
  'with',
]);

/** Converts an arbitrary id into a legal AADL identifier */
function toAadlIdentifier(raw: string): string {
  let id = raw.replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!id || !/^[A-Za-z]/.test(id) || AADL_RESERVED_WORDS.has(id.toLowerCase())) {
    id = `x_${id}`.replace(/_+$/, '');
  }
  return id;
}

/** Classifies a React Flow handle by the kind of wire it accepts */
export function getWireFamily(handle: string | null | undefined): WireFamily | undefined {
  if (!handle) return undefined;
  if (handle.startsWith('pwr-')) return 'power';
  if (handle.startsWith('can-')) return 'can';
  if (handle.startsWith('eth-')) return 'eth';
  if (handle.startsWith('rsl-')) return 'rsl';
  if (handle.startsWith('dio-')) return 'dio';
  if (handle.startsWith('usb-')) return 'usb';
  if (handle.startsWith('pwm-')) return 'pwm';
  if (handle.startsWith('i2c-')) return 'i2c';
  if (handle.startsWith('mxp-')) return 'mxp';
  if (handle.startsWith('comp-')) return 'comp';
  if (handle.startsWith('sol-')) return 'sol';
  if (handle.startsWith('press-')) return 'press';
  return undefined;
}

/** True when both ends of an edge are known and carry different kinds of wire */
export function isMismatchedWire(edge: Edge): boolean {
  const sourceFamily = getWireFamily(edge.sourceHandle);
  const targetFamily = getWireFamily(edge.targetHandle);
  return !!sourceFamily && !!targetFamily && sourceFamily !== targetFamily;
}

export function getDevicePorts(deviceType: string): DevicePorts {
  return DEVICE_PORTS[deviceType] || CAN_DEVICE_PORTS;
}

function renderPort(handle: string, direction: 'in' | 'out'): string {
  const family = getWireFamily(handle);
  const portKind = family && MESSAGE_FAMILIES.includes(family) ? 'event data port' : 'data port';
  const dataType = family ? WIRE_DATA_TYPES[family] : 'Digital_Signal';
  return `      ${toAadlIdentifier(handle)}: ${direction} ${portKind} ${dataType};\n`;
}

function describeNode(node: Node<FRCNodeData>): string {
  const { label, canId, dioPort, pwmPort, powerChannel } = node.data;
  const facts = [label || node.id];
  if (canId !== undefined) facts.push(`CAN ID ${canId}`);
  if (dioPort !== undefined) facts.push(`DIO ${dioPort}`);
  if (pwmPort !== undefined) facts.push(`PWM ${pwmPort}`);
  if (powerChannel) facts.push(`PDH ${powerChannel}`);
  return facts.join(' | ');
}

interface BusNetwork {
  name: string;
  classifier: string;
  connections: string[];
}

/** Splits wires of one family into the separate physical networks they form */
export function groupWiresByNetwork<T>(items: T[], getEdge: (item: T) => Edge, family: WireFamily): T[][] {
  const parents = new Map<string, string>();
  const find = (id: string): string => {
    if (!parents.has(id)) parents.set(id, id);
    const parent = parents.get(id) as string;
    if (parent === id) return id;
    const root = find(parent);
    parents.set(id, root);
    return root;
  };

  const members = items.filter((item) => getWireFamily(getEdge(item).sourceHandle) === family);
  members.forEach((item) => parents.set(find(getEdge(item).source), find(getEdge(item).target)));

  const groups = new Map<string, T[]>();
  members.forEach((member) => {
    const root = find(getEdge(member).source);
    groups.set(root, [...(groups.get(root) || []), member]);
  });

  return [...groups.values()];
}

/** Groups connected wires of one family into the physical bus they share */
function findBusNetworks(
  edges: { edge: Edge; name: string }[],
  family: WireFamily,
  prefix: string,
  classifier: string,
): BusNetwork[] {
  const busCounts = new Map<string, number>();
  return groupWiresByNetwork(edges, ({ edge }) => edge, family).map((group) => {
    const isCanFd = family === 'can' && group.some(({ edge }) => edge.sourceHandle === 'can-fd-start');
    const busPrefix = isCanFd ? 'can_fd' : prefix;
    const count = (busCounts.get(busPrefix) || 0) + 1;
    busCounts.set(busPrefix, count);
    return {
      name: `${busPrefix}_bus_${count}`,
      classifier: isCanFd ? 'CAN_FD_Bus' : classifier,
      connections: group.map(({ name }) => name),
    };
  });
}

/**
 * Generates an AADL v2 model of the wiring diagram. Each wire becomes a port connection
 * and CAN/Ethernet wires are bound to the physical bus they run on. The output is one
 * package so it opens directly in OSATE; FRC-specific values are kept in comments because
 * a custom property set would need a second file.
 */
export function generateAadlCode(nodes: Node<FRCNodeData>[], edges: Edge[]): string {
  const deviceTypes = [...new Set(nodes.map((n) => n.data?.deviceType || 'Component'))];
  const validEdges = edges.filter((e) => !isMismatchedWire(e));
  const skippedEdges = edges.filter(isMismatchedWire);

  const connectionCounts = new Map<string, number>();
  const namedEdges = validEdges.map((edge) => {
    const prefix = getWireFamily(edge.sourceHandle) || 'wire';
    const count = (connectionCounts.get(prefix) || 0) + 1;
    connectionCounts.set(prefix, count);
    return { edge, name: `${prefix}_${count}` };
  });

  const networks = [
    ...findBusNetworks(namedEdges, 'can', 'can', 'CAN_Bus'),
    ...findBusNetworks(namedEdges, 'eth', 'eth', 'Ethernet_Bus'),
  ];

  // Handles that are only known from an edge still need a matching feature on the device type
  const portsByType = new Map<string, DevicePorts>();
  deviceTypes.forEach((type) => {
    const ports = getDevicePorts(type);
    portsByType.set(type, { in: [...ports.in], out: [...ports.out] });
  });
  const typeOf = (id: string): string | undefined => nodes.find((n) => n.id === id)?.data?.deviceType;
  validEdges.forEach((e) => {
    const sourcePorts = portsByType.get(typeOf(e.source) || '');
    const targetPorts = portsByType.get(typeOf(e.target) || '');
    const sourceHandle = e.sourceHandle || 'port-out';
    const targetHandle = e.targetHandle || 'port-in';
    if (sourcePorts && !sourcePorts.out.includes(sourceHandle)) sourcePorts.out.push(sourceHandle);
    if (targetPorts && !targetPorts.in.includes(targetHandle)) targetPorts.in.push(targetHandle);
  });

  let aadl = `-- Generated by SysMod Studio from the architecture diagram\n`;
  aadl += `package FRC_Robot_Architecture\npublic\n\n`;

  aadl += `  -- Wire payloads\n`;
  Object.values(WIRE_DATA_TYPES).forEach((dataType) => {
    aadl += `  data ${dataType}\n  end ${dataType};\n\n`;
  });

  aadl += `  -- Physical networks\n`;
  ['CAN_Bus', 'CAN_FD_Bus', 'Ethernet_Bus'].forEach((bus) => {
    aadl += `  bus ${bus}\n  end ${bus};\n\n`;
  });

  aadl += `  -- FRC hardware\n`;
  deviceTypes.forEach((type) => {
    const name = toAadlIdentifier(type);
    const ports = portsByType.get(type) as DevicePorts;
    aadl += `  device ${name}\n`;
    if (ports.in.length + ports.out.length > 0) {
      aadl += `    features\n`;
      ports.in.forEach((handle) => (aadl += renderPort(handle, 'in')));
      ports.out.forEach((handle) => (aadl += renderPort(handle, 'out')));
    }
    aadl += `  end ${name};\n\n`;
  });

  aadl += `  system FRC_Robot\n  end FRC_Robot;\n\n`;
  aadl += `  system implementation FRC_Robot.impl\n`;

  if (nodes.length + networks.length > 0) {
    aadl += `    subcomponents\n`;
    nodes.forEach((n) => {
      aadl += `      -- ${describeNode(n)}\n`;
      aadl += `      ${toAadlIdentifier(n.id)}: device ${toAadlIdentifier(n.data?.deviceType || 'Component')};\n`;
    });
    networks.forEach((network) => {
      aadl += `      ${network.name}: bus ${network.classifier};\n`;
    });
  }

  if (namedEdges.length > 0) {
    aadl += `    connections\n`;
    namedEdges.forEach(({ edge, name }) => {
      if (edge.label) aadl += `      -- ${edge.label}\n`;
      const source = `${toAadlIdentifier(edge.source)}.${toAadlIdentifier(edge.sourceHandle || 'port-out')}`;
      const target = `${toAadlIdentifier(edge.target)}.${toAadlIdentifier(edge.targetHandle || 'port-in')}`;
      aadl += `      ${name}: port ${source} -> ${target};\n`;
    });
  }

  if (networks.length > 0) {
    aadl += `    properties\n`;
    networks.forEach((network) => {
      aadl += `      Actual_Connection_Binding => (reference (${network.name})) applies to ${network.connections.join(', ')};\n`;
    });
  }

  skippedEdges.forEach((e) => {
    aadl += `    -- Omitted incompatible wire: ${e.source}.${e.sourceHandle} -> ${e.target}.${e.targetHandle}\n`;
  });

  aadl += `  end FRC_Robot.impl;\n\n`;
  aadl += `end FRC_Robot_Architecture;\n`;

  return aadl;
}
