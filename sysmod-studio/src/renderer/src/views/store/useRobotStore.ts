import { create } from 'zustand';
import { 
  Node, 
  Edge, 
  OnNodesChange, 
  OnEdgesChange, 
  OnConnect, 
  applyNodeChanges, 
  applyEdgeChanges, 
  addEdge 
} from '@xyflow/react';

export type PortType = 'pwr12v' | 'pwr5v' | 'can' | 'eth' | 'pneumatic' | 'usb';

export interface FRCNodeData extends Record<string, unknown> {
  label: string;
  deviceType: string;
  category: 'Control & Power' | 'Actuators & Drive' | 'Sensors & Vision' | 'Coprocessors';
  canId?: number;
  powerChannel?: number;
  protocol?: string;
  details?: string;
}

interface RobotStore {
  nodes: Node<FRCNodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addDevice: (type: string) => void;
  removeNode: (id: string) => void;
  clearWorkspace: () => void;
  setNodes: (nodes: Node<FRCNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
}

// Wire color and stroke properties by port type
export const WIRE_STYLES: Record<PortType, { color: string; label: string; animated: boolean; strokeWidth: number; strokeDasharray?: string }> = {
  pwr12v: { color: '#ef4444', label: '12V Power', animated: false, strokeWidth: 3 },
  pwr5v: { color: '#f97316', label: '5V/3.3V Power', animated: false, strokeWidth: 2 },
  can: { color: '#eab308', label: 'CAN Bus', animated: true, strokeWidth: 2.5 },
  eth: { color: '#10b981', label: 'Ethernet', animated: true, strokeWidth: 2.5 },
  pneumatic: { color: '#0284c7', label: 'Pneumatics', animated: false, strokeWidth: 2.5, strokeDasharray: '6 3' },
  usb: { color: '#a855f7', label: 'USB Serial', animated: false, strokeWidth: 2 },
};

const FRC_DEVICE_DEFAULTS: Record<string, { label: string; category: FRCNodeData['category']; protocol: string; details: string }> = {
  roboRIO: { label: 'roboRIO 2.0', category: 'Control & Power', protocol: 'CAN / Eth / USB', details: 'Main Robot Controller' },
  PDH: { label: 'REV PDH (20 Ch)', category: 'Control & Power', protocol: '12V Power / CAN', details: 'Power Distribution Hub' },
  PneumaticsHub: { label: 'Pneumatics Hub', category: 'Control & Power', protocol: 'CAN / Pneumatic', details: 'PCM/PH Controller' },
  KrakenX60: { label: 'Kraken X60 Motor', category: 'Actuators & Drive', protocol: 'CAN Bus / Talon FX', details: 'Brushless Actuator' },
  SparkMaxNEO: { label: 'NEO + SPARK Max', category: 'Actuators & Drive', protocol: 'CAN Bus / PWM', details: 'Brushless Controller' },
  SolenoidValve: { label: 'Solenoid Valve', category: 'Actuators & Drive', protocol: 'Pneumatic / 12V', details: 'Pneumatic Actuator' },
  Limelight: { label: 'Limelight 3/3G', category: 'Sensors & Vision', protocol: 'Ethernet / CAN', details: 'Smart Vision Camera' },
  CANcoder: { label: 'CTRE CANcoder', category: 'Sensors & Vision', protocol: 'CAN Bus', details: 'Absolute Encoder' },
  Pigeon2: { label: 'Pigeon 2.0 IMU', category: 'Sensors & Vision', protocol: 'CAN Bus', details: '9-Axis Gyroscope' },
  Coprocessor: { label: 'Linux Coprocessor', category: 'Coprocessors', protocol: 'USB / Ethernet', details: 'Orange Pi / Jetson' },
};

let deviceCounter = 1;

// Helper to determine port connection type from handle string ID
const getPortTypeFromHandle = (handleId?: string | null): PortType => {
  if (!handleId) return 'can';
  if (handleId.includes('12v') || handleId.includes('pwr-in') || handleId.includes('pwr-out')) return 'pwr12v';
  if (handleId.includes('5v') || handleId.includes('3v3')) return 'pwr5v';
  if (handleId.includes('can')) return 'can';
  if (handleId.includes('eth')) return 'eth';
  if (handleId.includes('pneumatic') || handleId.includes('air')) return 'pneumatic';
  if (handleId.includes('usb')) return 'usb';
  return 'can';
};

export const useRobotStore = create<RobotStore>((set, get) => ({
  nodes: [],
  edges: [],

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes) as Node<FRCNodeData>[],
    });
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection) => {
    // Detect wire type based on the source or target handle ID
    const portType = getPortTypeFromHandle(connection.sourceHandle || connection.targetHandle);
    const wireStyle = WIRE_STYLES[portType];

    set({
      edges: addEdge(
        {
          ...connection,
          type: 'smoothstep',
          animated: wireStyle.animated,
          label: wireStyle.label,
          labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
          labelBgStyle: { fill: '#0f172a', fillOpacity: 0.85, rx: 4, ry: 4 },
          style: { 
            stroke: wireStyle.color, 
            strokeWidth: wireStyle.strokeWidth, 
            strokeDasharray: wireStyle.strokeDasharray 
          },
        },
        get().edges
      ),
    });
  },

  addDevice: (type: string) => {
    const config = FRC_DEVICE_DEFAULTS[type] || {
      label: type,
      category: 'Actuators & Drive',
      protocol: 'CAN Bus',
      details: 'FRC Component',
    };

    const id = `${type.toLowerCase()}${deviceCounter++}`;
    const nodeCount = get().nodes.length;
    
    const position = {
      x: 100 + (nodeCount % 3) * 320,
      y: 80 + Math.floor(nodeCount / 3) * 220,
    };

    const isController = type === 'roboRIO' || type === 'Coprocessor' || type === 'PDH';

    const newNode: Node<FRCNodeData> = {
      id,
      type: isController ? 'ControlHub' : 'StandardNode',
      position,
      data: {
        label: `${config.label} (${id})`,
        deviceType: type,
        category: config.category,
        protocol: config.protocol,
        details: config.details,
        canId: type !== 'PDH' && type !== 'roboRIO' ? (nodeCount % 62) + 1 : undefined,
      },
    };

    set({
      nodes: [...get().nodes, newNode],
    });
  },

  removeNode: (id: string) => {
    set({
      nodes: get().nodes.filter((node) => node.id !== id),
      edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id),
    });
  },

  clearWorkspace: () => set({ nodes: [], edges: [] }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
}));