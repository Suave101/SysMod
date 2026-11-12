/**
 * The facts an FRC robot inspector checks on a wiring drawing, shared by both sheets of the
 * printable schematic: reference designators, printed pin names, PDH channel protection, wire
 * gauge and insulation color, CAN daisy-chain order and termination, and the grouped BOM.
 *
 * Wire sizes follow the FRC Game Manual's wire-size table (protection rating → minimum AWG) and
 * its insulation color rule for 12 V power. Re-check them against each season's manual.
 */
import { Node, Edge } from '@xyflow/react';
import { FRCEdgeData, FRCNodeData, FRC_DEVICE_DEFAULTS } from '../store/useRobotStore';
import { getDevicePorts, getWireFamily, WireFamily } from './aadlGenerator';
import { MOTOR_TYPES } from './hardwareValidation';

// ── Reference designators ─────────────────────────────────────────────────────────────────

const REF_DES_PREFIX: Record<string, string> = {
  Battery12V: 'BT',
  MainBreaker120A: 'CB',
  RSL: 'DS',
  KrakenX60: 'M',
  KrakenX44: 'M',
  Falcon500: 'M',
  SparkMaxNEO: 'M',
  NEO550: 'M',
  NEOVortex: 'M',
  BrushedController: 'M',
  PWMServo: 'M',
  Compressor: 'M',
  CANcoder: 'E',
  ThroughBore: 'E',
  LimitSwitch: 'S',
  BeamBreak: 'S',
  PressureSwitch: 'S',
  SolenoidValve: 'SV',
  Limelight: 'CAM',
  PhotonVision: 'CAM',
};

/** Numbers each device by kind in diagram order: BT1, CB1, U1, U2, M1, … */
export function assignRefDes(nodes: Node<FRCNodeData>[]): Map<string, string> {
  const counters: Record<string, number> = {};
  const refs = new Map<string, string>();
  nodes.forEach((node) => {
    const prefix = REF_DES_PREFIX[node.data?.deviceType] || 'U';
    counters[prefix] = (counters[prefix] || 0) + 1;
    refs.set(node.id, `${prefix}${counters[prefix]}`);
  });
  return refs;
}

/** "M1, M2, M3, U4" → "M1–M3, U4" */
export function compressRefs(refs: string[]): string {
  const parsed = refs
    .map((r) => {
      const m = /^([A-Z]+)(\d+)$/.exec(r);
      return m ? { prefix: m[1], n: Number(m[2]), raw: r } : { prefix: r, n: NaN, raw: r };
    })
    .sort((a, b) => a.prefix.localeCompare(b.prefix) || a.n - b.n);
  const out: string[] = [];
  for (let i = 0; i < parsed.length; ) {
    let j = i;
    while (j + 1 < parsed.length && parsed[j + 1].prefix === parsed[i].prefix && parsed[j + 1].n === parsed[j].n + 1) j++;
    if (Number.isNaN(parsed[i].n)) out.push(parsed[i].raw);
    else if (j - i >= 2) out.push(`${parsed[i].raw}–${parsed[j].raw}`);
    else for (let k = i; k <= j; k++) out.push(parsed[k].raw);
    i = j + 1;
  }
  return out.join(', ');
}

// ── PDH channels and protection ───────────────────────────────────────────────────────────

export type ChannelType = 'high' | 'low' | 'switched';

export const PDH_CHANNEL_COUNT = 24;

export const channelTypeOf = (n: number): ChannelType => (n <= 19 ? 'high' : n <= 22 ? 'low' : 'switched');

export const CHANNEL_TYPE_NAME: Record<ChannelType, string> = { high: 'High', low: 'Low', switched: 'Switchable' };

/** What each PDH slot accepts */
export const CHANNEL_SLOT: Record<ChannelType, string> = {
  high: '40A max ATO breaker',
  low: '15A max ATM fuse',
  switched: '15A max ATM fuse',
};

export interface Protection {
  amps: number;
  kind: 'Breaker' | 'Fuse';
  /** "40A Breaker" */
  text: string;
}

/**
 * The breaker or fuse SysMod suggests for a channel. High channels take auto-resetting ATO
 * breakers sized to a motor's supply current limit (rounded up to 20/30/40 A); other devices on a
 * high channel get 20 A. Low and switchable channels take a 10 A ATM fuse (roboRIO, radio, etc.).
 */
export function channelProtection(type: ChannelType, device?: Node<FRCNodeData>): Protection {
  let amps: number;
  let kind: Protection['kind'];
  if (type === 'high') {
    kind = 'Breaker';
    if (device && MOTOR_TYPES.includes(device.data?.deviceType)) {
      const limit = device.data?.currentLimit ?? 40;
      amps = limit <= 20 ? 20 : limit <= 30 ? 30 : 40;
    } else {
      amps = 20;
    }
  } else {
    kind = 'Fuse';
    amps = 10;
  }
  return { amps, kind, text: `${amps}A ${kind}` };
}

/** Minimum copper size for a protected 12 V branch, from the FRC wire-size table */
export function awgForProtection(amps: number): number {
  if (amps > 30) return 12;
  if (amps > 20) return 14;
  return 18;
}

// ── Printed pins ──────────────────────────────────────────────────────────────────────────

export interface PrintPin {
  /** Handle id, or "ch-N" for one PDH channel */
  key: string;
  label: string;
  /** Short name for the wire schedule: "CH 0", "CAN IN" */
  short: string;
}

const PIN_NAMES: Record<string, [string, string]> = {
  'pwr-battery-out': ['+12V / GND OUT (SB50)', 'SB50'],
  'pwr-battery-in': ['LINE IN (+12V)', 'LINE'],
  'pwr-pdh-out': ['LOAD OUT (+12V)', 'LOAD'],
  'pwr-12v-in': ['12V IN (+ / −)', '12V IN'],
  'pwr-high-out': ['HIGH CH 0–19 (40A ATO)', 'HIGH'],
  'pwr-low-out': ['LOW CH 20–22 (15A ATM)', 'LOW'],
  'pwr-switched-out': ['SWITCHABLE CH 23 (15A ATM)', 'CH 23'],
  'pwr-regulated-out': ['REGULATED OUT (+ / −)', 'REG OUT'],
  'pwr-mpm-out': ['FUSED 12V OUT (+ / −)', 'FUSED OUT'],
  'can-term': ['CAN IN', 'CAN'],
  'can-in': ['CAN IN', 'CAN IN'],
  'can-out': ['CAN OUT', 'CAN OUT'],
  'can-start': ['CAN BUS START', 'CAN'],
  'can-fd-start': ['CAN FD BUS START', 'CAN FD'],
  'rsl-out': ['RSL OUT (RSL+ / RSL−)', 'RSL'],
  'rsl-in': ['RSL IN (RSL+ / RSL−)', 'RSL'],
  'eth-out': ['ETHERNET', 'ETH'],
  'eth-in': ['ETHERNET', 'ETH'],
  'eth-rio': ['RIO PORT (ETH)', 'RIO'],
  'eth-aux': ['AUX1 PORT (ETH)', 'AUX1'],
  'eth-aux2': ['AUX2 PORT (ETH)', 'AUX2'],
  'dio-in': ['DIO 0–9', 'DIO'],
  'dio-out': ['DIO SIGNAL', 'DIO'],
  'pwm-out': ['PWM 0–9', 'PWM'],
  'pwm-in': ['PWM IN', 'PWM'],
  'usb-out': ['USB HOST', 'USB'],
  'usb-in': ['USB', 'USB'],
  'i2c-in': ['I2C', 'I2C'],
  'i2c-out': ['I2C', 'I2C'],
  'mxp-in': ['MXP', 'MXP'],
  'mxp-out': ['MXP', 'MXP'],
  'comp-out': ['COMPRESSOR OUT (+ / −)', 'COMP'],
  'comp-in': ['COMPRESSOR IN (+ / −)', 'COMP'],
  'sol-out': ['SOLENOID OUT', 'SOL'],
  'sol-in': ['SOLENOID IN', 'SOL'],
  'press-in': ['PRESSURE SW IN', 'PRESS'],
  'press-out': ['PRESSURE SW OUT', 'PRESS'],
};

const DEVICE_PIN_NAMES: Record<string, Record<string, [string, string]>> = {
  SystemCore: {
    'dio-in': ['SMART I/O 0–5', 'SMART I/O'],
    'pwm-out': ['SMART I/O PWM', 'SMART I/O'],
    ...Object.fromEntries([0, 1, 2, 3, 4].map((n) => [`can-${n}`, [`CAN ${n} (FD) START`, `CAN ${n}`] as [string, string]])),
  },
  RadioSwitch: { 'pwr-12v-in': ['12V DC IN (2-WIRE, NOT PoE)', '12V DC'] },
  PDH: { 'pwr-12v-in': ['MAIN IN (+12V / GND)', 'MAIN IN'] },
};

function pinName(deviceType: string, handle: string): [string, string] {
  const name = DEVICE_PIN_NAMES[deviceType]?.[handle] || PIN_NAMES[handle];
  if (name) return name;
  const text = handle.replace(/-/g, ' ').toUpperCase();
  return [text, text];
}

const channelLabel = (n: number, protection: Protection): string =>
  `CH ${n} · ${protection.text.toUpperCase()} (${CHANNEL_TYPE_NAME[channelTypeOf(n)].toUpperCase()})`;

// ── Wires ─────────────────────────────────────────────────────────────────────────────────

export type TraceKind = 'power' | 'can' | 'network' | 'control';

export const traceKindOf = (family: WireFamily | undefined): TraceKind =>
  family === 'power' ? 'power' : family === 'can' ? 'can' : family === 'eth' ? 'network' : 'control';

export interface WireRun {
  /** W1, W2, … in schedule order */
  id: string;
  edge: Edge;
  family: WireFamily | undefined;
  kind: TraceKind;
  /** Battery → breaker → PDH */
  isMain: boolean;
  fromNode: string;
  fromPin: PrintPin;
  toNode: string;
  toPin: PrintPin;
  signal: string;
  awg: string;
  color: string;
  /** Short gauge/color callout drawn on the trace */
  callout: string;
  /** The PDH channel feeding this wire, if any */
  channel?: { pdh: string; num: number; type: ChannelType; protection: Protection };
  /** CAN bus name and position along the daisy chain, if this is a CAN wire */
  can?: { bus: string; seq: number; of: number };
}

interface WireSpec {
  signal: string;
  awg: string;
  color: string;
  short: string;
}

const RED_BLACK = 'Red (+) / Black (−)';

function wireSpec(family: WireFamily | undefined, isMain: boolean, protection?: Protection): WireSpec {
  if (family === 'power') {
    if (isMain) return { signal: '+12V / GND main feed', awg: '6 AWG', color: RED_BLACK, short: '6 AWG RED/BLK' };
    if (protection) {
      const awg = `${awgForProtection(protection.amps)} AWG`;
      return { signal: `+12V / GND (${protection.text})`, awg, color: RED_BLACK, short: `${awg} RED/BLK` };
    }
    return { signal: '+12V / GND', awg: '18 AWG', color: RED_BLACK, short: '18 AWG RED/BLK' };
  }
  switch (family) {
    case 'can':
      return { signal: 'CAN-H / CAN-L', awg: '22 AWG', color: 'Yellow (H) / Green (L)', short: '22 AWG YEL/GRN' };
    case 'eth':
      return { signal: 'Ethernet', awg: 'Cat5e/6 cable', color: 'Per cable', short: 'CAT5e' };
    case 'rsl':
      return { signal: 'RSL+ / RSL−', awg: '22 AWG', color: RED_BLACK, short: '22 AWG RSL+/−' };
    case 'pwm':
      return { signal: 'PWM signal / 6V / GND', awg: 'PWM cable', color: 'White / Red / Black', short: 'PWM CABLE' };
    case 'dio':
      return { signal: 'DIO signal / 5V / GND', awg: 'PWM-style cable', color: 'White / Red / Black', short: 'DIO CABLE' };
    case 'usb':
      return { signal: 'USB', awg: 'USB cable', color: 'Per cable', short: 'USB' };
    case 'i2c':
      return { signal: 'I2C', awg: 'I2C cable', color: 'Per cable', short: 'I2C' };
    case 'mxp':
      return { signal: 'MXP', awg: 'Header', color: '—', short: 'MXP' };
    case 'comp':
      return { signal: 'Compressor +12V / GND', awg: '18 AWG', color: RED_BLACK, short: '18 AWG RED/BLK' };
    case 'sol':
      return { signal: 'Solenoid + / −', awg: '22 AWG', color: 'Per valve', short: '22 AWG' };
    case 'press':
      return { signal: 'Pressure switch', awg: '22 AWG', color: 'Per switch', short: '22 AWG' };
    default:
      return { signal: 'Signal', awg: '—', color: '—', short: '' };
  }
}

/** Handles that start a CAN bus at a controller or CANivore */
const CAN_START_HANDLES = ['can-start', 'can-fd-start', 'can-0', 'can-1', 'can-2', 'can-3', 'can-4'];

export interface CanBus {
  name: string;
  /** Devices in daisy-chain order, starting at the controller */
  order: string[];
  /** The two (or more) physical ends that need 120 Ω termination: node id + printed pin key */
  terminations: { nodeId: string; pinKey: string; builtIn: boolean }[];
  /** True when the bus branches, which CAN should not do */
  branched: boolean;
  wires: string[];
}

export interface PdhChannelRow {
  num: number;
  type: ChannelType;
  nodeId?: string;
  protection?: Protection;
  wireId?: string;
  awg?: string;
}

export interface BomRow {
  deviceType: string;
  part: string;
  description: string;
  category: string;
  protocol: string;
  refs: string[];
  addresses: string[];
  qty: number;
  unitCost: number;
  extCost: number;
  priced: boolean;
}

export interface WiringModel {
  nodes: Node<FRCNodeData>[];
  nodeById: Map<string, Node<FRCNodeData>>;
  refs: Map<string, string>;
  /** Printed pins of each device, in drawing order */
  pins: Map<string, { inputs: PrintPin[]; outputs: PrintPin[] }>;
  wires: WireRun[];
  canBuses: CanBus[];
  /** One 24-row channel map per PDH */
  pdhMaps: { nodeId: string; rows: PdhChannelRow[] }[];
  bom: BomRow[];
  totalCost: number;
  /** Extra lines shown under a device's pins, such as how the radio is powered */
  deviceNotes: Map<string, string[]>;
  /** "nodeId:pinKey" → note shown beside that pin, such as "120Ω TERM" */
  pinNotes: Map<string, string>;
}

export function describeAddress(node: Node<FRCNodeData>): string | undefined {
  if (node.data?.canId !== undefined) return `CAN ${node.data.canId}`;
  if (node.data?.dioPort !== undefined) return `DIO ${node.data.dioPort}`;
  if (node.data?.pwmPort !== undefined) return `PWM ${node.data.pwmPort}`;
  return undefined;
}

export function buildWiringModel(nodes: Node<FRCNodeData>[], edges: Edge[]): WiringModel {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const refs = assignRefDes(nodes);
  const liveEdges = edges.filter((e) => nodeById.has(e.source) && nodeById.has(e.target));
  const typeOf = (id: string): string => nodeById.get(id)?.data?.deviceType || '';

  // PDH channels used by each wire
  const channelOf = (edge: Edge): { num: number; type: ChannelType } | undefined => {
    if (typeOf(edge.source) !== 'PDH') return undefined;
    const data = edge.data as FRCEdgeData | undefined;
    if (typeof data?.channelNum !== 'number') return undefined;
    return { num: data.channelNum, type: data.channelType || channelTypeOf(data.channelNum) };
  };

  // Printed pins
  const pins = new Map<string, { inputs: PrintPin[]; outputs: PrintPin[] }>();
  nodes.forEach((node) => {
    const type = node.data?.deviceType;
    const ports = getDevicePorts(type);
    const toPin = (handle: string): PrintPin => {
      const [label, short] = pinName(type, handle);
      return { key: handle, label, short };
    };
    let outputs = ports.out.map(toPin);
    if (type === 'PDH') {
      const used = liveEdges
        .filter((e) => e.source === node.id)
        .map((e) => ({ e, ch: channelOf(e) }))
        .filter((x): x is { e: Edge; ch: { num: number; type: ChannelType } } => !!x.ch)
        .sort((a, b) => a.ch.num - b.ch.num);
      const unchanneled = new Set(
        liveEdges.filter((e) => e.source === node.id && !channelOf(e)).map((e) => e.sourceHandle || ''),
      );
      outputs = [
        ...used.map(({ e, ch }) => {
          const protection = channelProtection(ch.type, nodeById.get(e.target));
          return { key: `ch-${ch.num}`, label: channelLabel(ch.num, protection), short: `CH ${ch.num}` };
        }),
        // Group pins stay for wires without a channel, and when nothing is wired yet
        ...ports.out.filter((h) => unchanneled.has(h) || used.length === 0).map(toPin),
      ];
    }
    pins.set(node.id, { inputs: ports.in.map(toPin), outputs });
  });

  const pinFor = (nodeId: string, side: 'inputs' | 'outputs', key: string | null | undefined): PrintPin => {
    const list = pins.get(nodeId)?.[side] || [];
    const other = pins.get(nodeId)?.[side === 'inputs' ? 'outputs' : 'inputs'] || [];
    return (
      list.find((p) => p.key === key) ||
      other.find((p) => p.key === key) ||
      list[0] ||
      other[0] || { key: key || 'pin', label: (key || 'PIN').toUpperCase(), short: (key || 'PIN').toUpperCase() }
    );
  };

  // CAN buses: connected CAN wires, with a controller port counted as its own point
  const canEdges = liveEdges.filter((e) => getWireFamily(e.sourceHandle) === 'can' || getWireFamily(e.targetHandle) === 'can');
  const point = (nodeId: string, handle: string | null | undefined): string =>
    /^can-\d$/.test(handle || '') ? `${nodeId}#${handle}` : nodeId;
  const parent = new Map<string, string>();
  const find = (p: string): string => {
    if (!parent.has(p)) parent.set(p, p);
    const q = parent.get(p) as string;
    if (q === p) return p;
    const r = find(q);
    parent.set(p, r);
    return r;
  };
  canEdges.forEach((e) => parent.set(find(point(e.source, e.sourceHandle)), find(point(e.target, e.targetHandle))));
  const groups = new Map<string, Edge[]>();
  canEdges.forEach((e) => {
    const root = find(point(e.source, e.sourceHandle));
    groups.set(root, [...(groups.get(root) || []), e]);
  });

  const canInfo = new Map<string, { bus: string; seq: number; of: number }>();
  const pinNotes = new Map<string, string>();
  const canBuses: CanBus[] = [];
  [...groups.values()]
    .map((group) => {
      const startEdge = group.find((e) => CAN_START_HANDLES.includes(e.sourceHandle || ''));
      return { group, startEdge };
    })
    // Controller buses first, in diagram order
    .sort((a, b) => (a.startEdge ? 0 : 1) - (b.startEdge ? 0 : 1) || nodes.findIndex((n) => n.id === a.group[0].source) - nodes.findIndex((n) => n.id === b.group[0].source))
    .forEach(({ group, startEdge }, busIndex) => {
      const name = `CAN-${String.fromCharCode(65 + busIndex)}`;
      const adjacency = new Map<string, { edge: Edge; other: string; ownHandle: string }[]>();
      const add = (p: string, edge: Edge, other: string, ownHandle: string): void => {
        adjacency.set(p, [...(adjacency.get(p) || []), { edge, other, ownHandle }]);
      };
      group.forEach((e) => {
        const s = point(e.source, e.sourceHandle);
        const t = point(e.target, e.targetHandle);
        add(s, e, t, e.sourceHandle || '');
        add(t, e, s, e.targetHandle || '');
      });

      const startPoint = startEdge
        ? point(startEdge.source, startEdge.sourceHandle)
        : [...adjacency.keys()].find((p) => (adjacency.get(p) || []).length === 1) || [...adjacency.keys()][0];

      // Walk the chain from the controller
      const order: string[] = [];
      const ordered: Edge[] = [];
      const seen = new Set<string>();
      const usedEdges = new Set<string>();
      const walk = (p: string): void => {
        if (seen.has(p)) return;
        seen.add(p);
        order.push(p.split('#')[0]);
        (adjacency.get(p) || []).forEach(({ edge, other }) => {
          if (usedEdges.has(edge.id)) return;
          usedEdges.add(edge.id);
          ordered.push(edge);
          walk(other);
        });
      };
      walk(startPoint);
      group.forEach((e) => {
        if (!usedEdges.has(e.id)) ordered.push(e);
      });
      ordered.forEach((e, i) => canInfo.set(e.id, { bus: name, seq: i + 1, of: ordered.length }));

      // Physical ends: points with one CAN wire
      const ends = [...adjacency.entries()].filter(([, links]) => links.length === 1);
      const branched = [...adjacency.values()].some((links) => links.length > 2) || ends.length > 2;
      const terminations = ends.map(([p, links]) => {
        const nodeId = p.split('#')[0];
        const type = typeOf(nodeId);
        const handle = links[0].ownHandle;
        // A device in the middle of a chain style (CAN IN used, CAN OUT free) ends at its free CAN OUT
        const devicePins = pins.get(nodeId);
        const freeOut =
          handle === 'can-in' && devicePins?.outputs.some((pp) => pp.key === 'can-out') && !group.some((e) => e.source === nodeId && e.sourceHandle === 'can-out')
            ? 'can-out'
            : handle;
        const builtIn = type === 'roboRIO' || type === 'PDH';
        return { nodeId, pinKey: freeOut, builtIn };
      });
      terminations.forEach((t) => {
        const type = typeOf(t.nodeId);
        const text = type === 'roboRIO' ? '120Ω TERM (BUILT-IN)' : type === 'PDH' ? '120Ω TERM (ON)' : t.pinKey === 'can-out' ? "120Ω TERMINATOR REQ'D" : '120Ω TERM';
        pinNotes.set(`${t.nodeId}:${t.pinKey}`, text);
      });

      canBuses.push({ name, order, terminations, branched, wires: ordered.map((e) => e.id) });
    });

  // Wire runs, in schedule order: main feed, PDH channels, other power, CAN in chain order, Ethernet, the rest
  const familyRank: Partial<Record<WireFamily, number>> = { power: 0, can: 1, eth: 2 };
  const rankOf = (e: Edge): number[] => {
    const family = getWireFamily(e.sourceHandle) || getWireFamily(e.targetHandle);
    const isMain = ['Battery12V', 'MainBreaker120A'].includes(typeOf(e.source));
    const ch = channelOf(e);
    const can = canInfo.get(e.id);
    const busIdx = can ? canBuses.findIndex((b) => b.name === can.bus) : 0;
    return [
      family === 'power' ? (isMain ? 0 : ch ? 1 : 2) : 3 + (familyRank[family as WireFamily] ?? 3),
      isMain ? (typeOf(e.source) === 'Battery12V' ? 0 : 1) : ch ? ch.num : can ? busIdx * 1000 + can.seq : nodes.findIndex((n) => n.id === e.source),
    ];
  };
  const sorted = [...liveEdges].sort((a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    return ra[0] - rb[0] || ra[1] - rb[1];
  });

  const wires: WireRun[] = sorted.map((edge, i) => {
    const family = getWireFamily(edge.sourceHandle) || getWireFamily(edge.targetHandle);
    const isMain = family === 'power' && ['Battery12V', 'MainBreaker120A'].includes(typeOf(edge.source));
    const ch = channelOf(edge);
    const protection = ch ? channelProtection(ch.type, nodeById.get(edge.target)) : undefined;
    const spec = wireSpec(family, isMain, protection);
    const id = `W${i + 1}`;
    const can = canInfo.get(edge.id);
    const fromPin = ch ? pinFor(edge.source, 'outputs', `ch-${ch.num}`) : pinFor(edge.source, 'outputs', edge.sourceHandle);
    return {
      id,
      edge,
      family,
      kind: traceKindOf(family),
      isMain,
      fromNode: edge.source,
      fromPin,
      toNode: edge.target,
      toPin: pinFor(edge.target, 'inputs', edge.targetHandle),
      signal: spec.signal,
      awg: spec.awg,
      color: spec.color,
      callout: [id, can ? `${can.bus} ${can.seq}/${can.of}` : '', spec.short].filter(Boolean).join(' · '),
      channel: ch && protection ? { pdh: edge.source, num: ch.num, type: ch.type, protection } : undefined,
      can,
    };
  });

  // PDH maps
  const pdhMaps = nodes
    .filter((n) => n.data?.deviceType === 'PDH')
    .map((pdh) => {
      const rows: PdhChannelRow[] = Array.from({ length: PDH_CHANNEL_COUNT }, (_, num) => ({ num, type: channelTypeOf(num) }));
      wires
        .filter((w) => w.channel?.pdh === pdh.id)
        .forEach((w) => {
          const ch = w.channel;
          if (!ch || ch.num < 0 || ch.num >= PDH_CHANNEL_COUNT) return;
          rows[ch.num] = { num: ch.num, type: ch.type, nodeId: w.toNode, protection: ch.protection, wireId: w.id, awg: w.awg };
        });
      return { nodeId: pdh.id, rows };
    });

  // Device notes
  const deviceNotes = new Map<string, string[]>();
  nodes.forEach((node) => {
    const notes: string[] = [];
    const address = describeAddress(node);
    if (address) notes.push(`ADDR: ${address}`);
    const feed = wires.find((w) => w.toNode === node.id && w.family === 'power');
    if (feed?.channel) notes.push(`FEED: ${refs.get(feed.fromNode)} CH ${feed.channel.num} · ${feed.channel.protection.text.toUpperCase()}`);
    else if (feed) notes.push(`FEED: ${refs.get(feed.fromNode)} · ${feed.awg}`);
    if (node.data?.deviceType === 'RadioSwitch') notes.push('PWR: 12V DC 2-WIRE (PASSIVE PoE NOT USED)');
    if (node.data?.deviceType === 'MainBreaker120A') notes.push('RATING: 120A MAIN');
    deviceNotes.set(node.id, notes);
  });

  // BOM, grouped by part
  const bomMap = new Map<string, BomRow>();
  nodes.forEach((node) => {
    const type = node.data?.deviceType || 'Unknown';
    const catalog = FRC_DEVICE_DEFAULTS[type];
    const unitCost = catalog?.cost ?? 0;
    const row =
      bomMap.get(type) ||
      ({
        deviceType: type,
        part: catalog?.label || type,
        description: catalog?.details || node.data?.details || '',
        category: catalog?.category || node.data?.category || 'General',
        protocol: catalog?.protocol || node.data?.protocol || '',
        refs: [],
        addresses: [],
        qty: 0,
        unitCost,
        extCost: 0,
        priced: unitCost > 0,
      } as BomRow);
    const ref = refs.get(node.id) || '';
    row.refs.push(ref);
    const address = describeAddress(node);
    if (address) row.addresses.push(`${ref} ${address}`);
    row.qty += 1;
    row.extCost = row.unitCost * row.qty;
    bomMap.set(type, row);
  });
  const bom = [...bomMap.values()];
  const totalCost = bom.reduce((sum, row) => sum + row.extCost, 0);

  return { nodes, nodeById, refs, pins, wires, canBuses, pdhMaps, bom, totalCost, deviceNotes, pinNotes };
}
