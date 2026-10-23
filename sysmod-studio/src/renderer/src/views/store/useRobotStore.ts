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

export type PortType = 'pwr12v' | 'pwr10a' | 'pwr5v' | 'can' | 'eth' | 'pneumatic' | 'usb';

export const MAX_HIGH_CHANNELS = 20; // Ports 0-19 (40A ATO)
export const MAX_LOW_CHANNELS = 3;   // Ports 20-22 (15A ATM)
export const MAX_SWITCHED_CHANNELS = 1; // Port 23 (15A ATM Switchable)

export interface FRCNodeData extends Record<string, unknown> {
  label: string;
  deviceType: string;
  category: 'Control & Power' | 'Actuators & Drive' | 'Sensors & Vision' | 'Coprocessors';
  canId?: number;
  powerChannel?: string; // e.g. "High Ch #3", "Low Ch #21", "Switchable Ch #23"
  protocol?: string;
  details?: string;
}

export interface FRCEdgeData extends Record<string, unknown> {
  channelType?: 'high' | 'low' | 'switched';
  channelNum?: number;
  isCanTerminator?: boolean;
}

interface RobotStore {
  nodes: Node<FRCNodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addDevice: (type: string) => void;
  removeNode: (id: string) => void;
  removeEdge: (edgeId: string) => void;
  clearWorkspace: () => void;
  setNodes: (nodes: Node<FRCNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  getPdhAllocations: () => {
    highMap: Map<number, { nodeId: string; deviceLabel: string }>;
    lowMap: Map<number, { nodeId: string; deviceLabel: string }>;
    switchedMap: Map<number, { nodeId: string; deviceLabel: string }>;
  };
}

export const WIRE_STYLES: Record<string, { color: string; label: string; animated: boolean; strokeWidth: number; strokeDasharray?: string }> = {
  pwrBattery: { color: '#dc2626', label: '12V Battery Main (120A)', animated: false, strokeWidth: 4 },
  pwrHigh: { color: '#ef4444', label: '40A High-Current (ATO)', animated: false, strokeWidth: 3 },
  pwrLow: { color: '#f97316', label: '15A Low-Current (ATM)', animated: false, strokeWidth: 2.5 },
  pwrSwitched: { color: '#e11d48', label: '15A Switchable (LED/Acc)', animated: false, strokeWidth: 2.5, strokeDasharray: '4 2' },
  can: { color: '#eab308', label: 'CAN Bus', animated: true, strokeWidth: 2.5 },
  eth: { color: '#10b981', label: 'Ethernet', animated: true, strokeWidth: 2.5 },
  pneumatic: { color: '#0284c7', label: 'Pneumatics', animated: false, strokeWidth: 2.5, strokeDasharray: '6 3' },
};

const FRC_DEVICE_DEFAULTS: Record<string, { label: string; category: FRCNodeData['category']; protocol: string; details: string }> = {
  Battery12V: { label: '12V FRC Battery', category: 'Control & Power', protocol: '12V DC (SB50)', details: '12V 18Ah SLA Battery' },
  roboRIO: { label: 'roboRIO 2.0', category: 'Control & Power', protocol: 'CAN / Eth / USB', details: 'Main Robot Controller' },
  PDH: { label: 'REV PDH', category: 'Control & Power', protocol: '12V Power / CAN', details: '20 High / 3 Low / 1 Switched' },
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

export const useRobotStore = create<RobotStore>((set, get) => ({
  nodes: [],
  edges: [],

  getPdhAllocations: () => {
    const highMap = new Map<number, { nodeId: string; deviceLabel: string }>();
    const lowMap = new Map<number, { nodeId: string; deviceLabel: string }>();
    const switchedMap = new Map<number, { nodeId: string; deviceLabel: string }>();

    const { edges, nodes } = get();

    edges.forEach((edge) => {
      const data = edge.data as FRCEdgeData | undefined;
      if (!data) return;

      const targetNode = nodes.find((n) => n.id === edge.target);
      const label = targetNode?.data?.label || edge.target;

      if (data.channelType === 'high' && typeof data.channelNum === 'number') {
        highMap.set(data.channelNum, { nodeId: edge.target, deviceLabel: label });
      } else if (data.channelType === 'low' && typeof data.channelNum === 'number') {
        lowMap.set(data.channelNum, { nodeId: edge.target, deviceLabel: label });
      } else if (data.channelType === 'switched' && typeof data.channelNum === 'number') {
        switchedMap.set(data.channelNum, { nodeId: edge.target, deviceLabel: label });
      }
    });

    return { highMap, lowMap, switchedMap };
  },

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes) as Node<FRCNodeData>[],
    });
  },

  onEdgesChange: (changes) => {
    const prevEdges = get().edges;
    const nextEdges = applyEdgeChanges(changes, prevEdges);

    if (nextEdges.length < prevEdges.length) {
      const activePowerLabels = new Map<string, string>();
      nextEdges.forEach((e) => {
        const data = e.data as FRCEdgeData | undefined;
        if (data?.channelType && data.channelNum !== undefined) {
          const typeName = data.channelType === 'high' ? 'High' : data.channelType === 'low' ? 'Low' : 'Switchable';
          activePowerLabels.set(e.target, `Port #${data.channelNum} (${typeName})`);
        }
      });

      const updatedNodes = get().nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          powerChannel: activePowerLabels.get(node.id),
        },
      }));

      set({ nodes: updatedNodes, edges: nextEdges });
      return;
    }

    set({ edges: nextEdges });
  },

  removeEdge: (edgeId: string) => {
    const edge = get().edges.find((e) => e.id === edgeId);
    if (!edge) return;

    const remainingEdges = get().edges.filter((e) => e.id !== edgeId);

    const updatedNodes = get().nodes.map((node) => {
      if (node.id === edge.target) {
        return {
          ...node,
          data: {
            ...node.data,
            powerChannel: undefined,
          },
        };
      }
      return node;
    });

    set({ nodes: updatedNodes, edges: remainingEdges });
  },

  onConnect: (connection) => {
    const { nodes, getPdhAllocations } = get();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    // ── 1. Battery Connection to PDH ──
    if (sourceNode?.data?.deviceType === 'Battery12V') {
      if (targetNode?.data?.deviceType !== 'PDH' || connection.targetHandle !== 'pwr-12v-in') {
        alert("Battery output must connect directly to the 12V Main Input on the REV PDH.");
        return;
      }

      set({
        edges: addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: false,
            label: '12V Main Battery Connection',
            labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
            style: { stroke: '#dc2626', strokeWidth: 4 },
          },
          get().edges
        ),
      });
      return;
    }

    // ── 2. PDH Power Outlet Rules ──
    const isPdhSource = sourceNode?.data?.deviceType === 'PDH';
    const isTargetPowerIn = connection.targetHandle?.includes('pwr');

    if (isPdhSource && isTargetPowerIn) {
      const { highMap, lowMap, switchedMap } = getPdhAllocations();
      const isTargetRoboRIO = targetNode?.data?.deviceType === 'roboRIO';

      // Rule: High-Current Ports (0-19)
      if (connection.sourceHandle === 'pwr-high-out') {
        if (isTargetRoboRIO) {
          alert("Violates FRC Rules: roboRIO cannot run on a high-current breaker port (20A-40A)! Connect it to a 15A Low-Current Port (Ports 20-22).");
          return;
        }

        let nextChan = -1;
        for (let i = 0; i < MAX_HIGH_CHANNELS; i++) {
          if (!highMap.has(i)) {
            nextChan = i;
            break;
          }
        }

        if (nextChan === -1) {
          alert(`All ${MAX_HIGH_CHANNELS} High-Current Breaker Channels (Ports 0-19) are occupied!`);
          return;
        }

        const channelLabel = `Port #${nextChan} (High 40A)`;
        if (targetNode) {
          set({
            nodes: nodes.map((n) => n.id === targetNode.id ? { ...n, data: { ...n.data, powerChannel: channelLabel } } : n),
          });
        }

        set({
          edges: addEdge(
            {
              ...connection,
              type: 'smoothstep',
              label: channelLabel,
              labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
              labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
              style: { stroke: '#ef4444', strokeWidth: 3 },
              data: { channelType: 'high', channelNum: nextChan },
            },
            get().edges
          ),
        });
        return;
      }

      // Rule: Low-Current Ports (20-22)
      if (connection.sourceHandle === 'pwr-low-out') {
        let nextChan = -1;
        for (let i = 20; i < 20 + MAX_LOW_CHANNELS; i++) {
          if (!lowMap.has(i)) {
            nextChan = i;
            break;
          }
        }

        if (nextChan === -1) {
          alert(`All ${MAX_LOW_CHANNELS} Low-Current Channels (Ports 20-22) are occupied!`);
          return;
        }

        const channelLabel = `Port #${nextChan} (Low 15A)`;
        if (targetNode) {
          set({
            nodes: nodes.map((n) => n.id === targetNode.id ? { ...n, data: { ...n.data, powerChannel: channelLabel } } : n),
          });
        }

        set({
          edges: addEdge(
            {
              ...connection,
              type: 'smoothstep',
              label: channelLabel,
              labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
              labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
              style: { stroke: '#f97316', strokeWidth: 2.5 },
              data: { channelType: 'low', channelNum: nextChan },
            },
            get().edges
          ),
        });
        return;
      }

      // Rule: Switchable Low-Current Port (23)
      if (connection.sourceHandle === 'pwr-switched-out') {
        if (isTargetRoboRIO) {
          alert("Violates FRC Rules: roboRIO cannot be plugged into the software-switchable channel!");
          return;
        }

        if (switchedMap.has(23)) {
          alert("The Switchable Channel (Port 23) is already occupied!");
          return;
        }

        const channelLabel = `Port #23 (Switchable 15A)`;
        if (targetNode) {
          set({
            nodes: nodes.map((n) => n.id === targetNode.id ? { ...n, data: { ...n.data, powerChannel: channelLabel } } : n),
          });
        }

        set({
          edges: addEdge(
            {
              ...connection,
              type: 'smoothstep',
              label: channelLabel,
              labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
              labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
              style: { stroke: '#e11d48', strokeWidth: 2.5, strokeDasharray: '4 2' },
              data: { channelType: 'switched', channelNum: 23 },
            },
            get().edges
          ),
        });
        return;
      }
    }

    // ── 3. CAN Connection Wiring Rules ──
    const isCanConnection = connection.sourceHandle?.includes('can') || connection.targetHandle?.includes('can');
    const isCanTerminationPoint = targetNode?.data?.deviceType === 'PDH' && connection.targetHandle === 'can-term';

    if (isCanConnection) {
      let label = 'CAN Bus [Loop]';
      if (connection.sourceHandle === 'can-start') label = 'CAN Bus [RIO Start]';
      if (isCanTerminationPoint) label = 'CAN Bus [120Ω Terminated]';

      set({
        edges: addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: true,
            label,
            labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
            style: { stroke: isCanTerminationPoint ? '#f59e0b' : '#eab308', strokeWidth: 2.5 },
            data: { isCanTerminator: isCanTerminationPoint },
          },
          get().edges
        ),
      });
      return;
    }

    // Default Fallback Wiring
    set({
      edges: addEdge(
        {
          ...connection,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2.5 },
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
      x: 100 + (nodeCount % 3) * 350,
      y: 80 + Math.floor(nodeCount / 3) * 230,
    };

    const isController = type === 'roboRIO' || type === 'PDH';

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
        canId: type !== 'PDH' && type !== 'roboRIO' && type !== 'Battery12V' ? (nodeCount % 62) + 1 : undefined,
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