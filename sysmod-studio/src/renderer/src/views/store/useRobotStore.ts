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

export type PortType = 'pwr12v' | 'pwr10a' | 'pwrRegulated' | 'can' | 'canfd' | 'eth' | 'pneumatic' | 'pwm' | 'dio' | 'rsl' | 'usb';

export const MAX_HIGH_CHANNELS = 20; // Ports 0-19 (40A ATO)
export const MAX_LOW_CHANNELS = 3;   // Ports 20-22 (15A ATM)
export const MAX_SWITCHED_CHANNELS = 1; // Port 23 (15A ATM Switchable)

export interface FRCNodeData extends Record<string, unknown> {
  label: string;
  deviceType: string;
  category: 'Control & Power' | 'Actuators & Drive' | 'Sensors & Vision' | 'Coprocessors';
  canId?: number;
  dioPort?: number;
  pwmPort?: number;
  powerChannel?: string;
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
  pwrBattery: { color: '#dc2626', label: '12V Main Unfiltered', animated: false, strokeWidth: 4 },
  pwrHigh: { color: '#ef4444', label: '40A High-Current (ATO)', animated: false, strokeWidth: 3 },
  pwrLow: { color: '#f97316', label: '15A Low-Current (ATM)', animated: false, strokeWidth: 2.5 },
  pwrSwitched: { color: '#e11d48', label: '15A Switchable', animated: false, strokeWidth: 2.5, strokeDasharray: '4 2' },
  pwrRegulated: { color: '#38bdf8', label: 'Regulated 5V/12V Power', animated: false, strokeWidth: 2 },
  can: { color: '#eab308', label: 'Standard CAN Bus (1Mbps)', animated: true, strokeWidth: 2.5 },
  canfd: { color: '#f59e0b', label: 'CTRE CAN FD Bus (8Mbps)', animated: true, strokeWidth: 3 },
  eth: { color: '#10b981', label: 'Ethernet Network', animated: true, strokeWidth: 2.5 },
  pneumatic: { color: '#0284c7', label: 'Pneumatics Air', animated: false, strokeWidth: 2.5, strokeDasharray: '6 3' },
  pwm: { color: '#a855f7', label: 'PWM Signal', animated: false, strokeWidth: 2 },
  dio: { color: '#c084fc', label: 'DIO / Sensor Signal', animated: false, strokeWidth: 2 },
  rsl: { color: '#facc15', label: 'RSL Indicator Wiring', animated: true, strokeWidth: 2 },
  usb: { color: '#6366f1', label: 'USB Data Link', animated: false, strokeWidth: 2 },
};

const FRC_DEVICE_DEFAULTS: Record<string, { label: string; category: FRCNodeData['category']; protocol: string; details: string }> = {
  // Control & Power
  Battery12V: { label: '12V FRC Battery', category: 'Control & Power', protocol: '12V DC (SB50)', details: '12V 18Ah SLA Battery' },
  MainBreaker120A: { label: '120A Main Breaker', category: 'Control & Power', protocol: 'High Current Pass', details: 'Primary System Power Switch' },
  PDH: { label: 'REV PDH', category: 'Control & Power', protocol: '12V Power / CAN', details: '20 High / 3 Low / 1 Switched' },
  roboRIO: { label: 'roboRIO 2.0', category: 'Control & Power', protocol: 'CAN / Eth / USB / DIO', details: 'Main Robot Controller' },
  RSL: { label: 'Robot Signal Light (RSL)', category: 'Control & Power', protocol: 'RSL Signal', details: 'Allen-Bradley Status Light' },
  RadioSwitch: { label: 'VH-109 Radio / Eth Switch', category: 'Control & Power', protocol: 'Ethernet', details: 'Managed Ethernet Hub' },
  PneumaticsHub: { label: 'Pneumatics Hub', category: 'Control & Power', protocol: 'CAN / Pneumatic', details: 'PCM/PH Controller' },
  PressureSwitch: { label: 'Pneumatic Pressure Switch', category: 'Control & Power', protocol: 'Cutoff Switch Signal', details: '120 PSI Auto Cutoff Switch' },
  VRM_MPM: { label: 'Mini Power Module / VRM', category: 'Control & Power', protocol: 'Aux Power', details: 'Regulated Aux Power Board' },
  BuckConverter: { label: '5V/12V Buck Converter', category: 'Control & Power', protocol: 'DC-DC Regulated', details: 'Clean Power for Coprocessors' },

  // CAN & Controllers
  CANivore: { label: 'CTRE CANivore', category: 'Control & Power', protocol: 'USB to CAN FD', details: 'Secondary CAN FD Bus Adapter' },
  CANHub: { label: 'WCP CAN Bus Hub', category: 'Control & Power', protocol: 'CAN Splitter', details: 'CAN Bus Distribution Board' },
  BrushedController: { label: 'Talon SRX / SPARK', category: 'Actuators & Drive', protocol: 'CAN / PWM', details: 'Brushed Motor Controller' },

  // Actuators
  KrakenX60: { label: 'Kraken X60 Motor', category: 'Actuators & Drive', protocol: 'CAN FD / Talon FX', details: 'Brushless Actuator' },
  Falcon500: { label: 'Falcon 500 Motor', category: 'Actuators & Drive', protocol: 'CAN / Talon FX', details: 'Integrated Brushless Motor' },
  SparkMaxNEO: { label: 'NEO + SPARK Max', category: 'Actuators & Drive', protocol: 'CAN Bus / PWM', details: 'Brushless Controller' },
  NEOVortex: { label: 'NEO Vortex + SPARK Flex', category: 'Actuators & Drive', protocol: 'CAN Bus / PWM', details: 'High Output Motor' },
  NEO550: { label: 'NEO 550 Motor', category: 'Actuators & Drive', protocol: 'CAN Bus / PWM', details: 'Compact Brushless' },
  PWMServo: { label: 'PWM Servo Motor', category: 'Actuators & Drive', protocol: 'PWM Signal', details: 'Standard Servo' },
  Compressor: { label: 'Pneumatic Compressor', category: 'Actuators & Drive', protocol: '12V Pneumatic Power', details: 'Air Compressor' },
  SolenoidValve: { label: 'Solenoid Valve', category: 'Actuators & Drive', protocol: 'Pneumatic / 12V', details: 'Pneumatic Actuator' },

  // Sensors & Vision
  Limelight: { label: 'Limelight 3/3G', category: 'Sensors & Vision', protocol: 'Ethernet / NetworkTables', details: 'Smart Vision Camera' },
  PhotonVision: { label: 'PhotonVision Camera', category: 'Sensors & Vision', protocol: 'Ethernet / NetworkTables', details: 'Custom Vision Processor' },
  CANcoder: { label: 'CTRE CANcoder', category: 'Sensors & Vision', protocol: 'CAN / CAN FD', details: 'Absolute Encoder' },
  ThroughBore: { label: 'REV Through Bore', category: 'Sensors & Vision', protocol: 'DIO Duty Cycle', details: 'Quadrature Encoder' },
  Pigeon2: { label: 'Pigeon 2.0 IMU', category: 'Sensors & Vision', protocol: 'CAN / CAN FD', details: '9-Axis Gyroscope' },
  NavX2: { label: 'navX2-MXP Gyro', category: 'Sensors & Vision', protocol: 'SPI / CAN', details: 'Precision Gyro' },
  CANdle: { label: 'CTRE CANdle', category: 'Sensors & Vision', protocol: 'CAN Bus / 12V', details: 'LED Driver Controller' },
  LimitSwitch: { label: 'Limit Switch', category: 'Sensors & Vision', protocol: 'DIO Contact', details: 'Physical Hardstop Sensor' },
  BeamBreak: { label: 'Beam-Break Sensor', category: 'Sensors & Vision', protocol: 'DIO Optical', details: 'Indexer Game Piece Sensor' },
  TimeOfFlight: { label: 'LaserCAN / ToF Sensor', category: 'Sensors & Vision', protocol: 'CAN / I2C', details: 'Laser Distance Measurement' },
  ColorSensor: { label: 'REV Color Sensor V3', category: 'Sensors & Vision', protocol: 'I2C / CAN', details: 'Color & Proximity Sensor' },

  // Coprocessors
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

    // ── 1. Main Power Routing (Battery -> 120A Main Breaker -> PDH) ──
    if (sourceNode?.data?.deviceType === 'Battery12V') {
      if (targetNode?.data?.deviceType !== 'MainBreaker120A') {
        alert("Violates FRC Rules: The 12V Battery MUST connect directly to the 120A Main Circuit Breaker input!");
        return;
      }

      set({
        edges: addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: false,
            label: '12V Main Battery Link',
            labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
            style: { stroke: '#dc2626', strokeWidth: 4 },
          },
          get().edges
        ),
      });
      return;
    }

    if (sourceNode?.data?.deviceType === 'MainBreaker120A') {
      if (targetNode?.data?.deviceType !== 'PDH' || connection.targetHandle !== 'pwr-12v-in') {
        alert("The 120A Main Breaker output must connect to the REV PDH 12V Main Power Input.");
        return;
      }

      set({
        edges: addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: false,
            label: 'Protected 120A Bus',
            labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
            style: { stroke: '#ef4444', strokeWidth: 4 },
          },
          get().edges
        ),
      });
      return;
    }

    // ── 2. Buck Converter Power Output ──
    if (sourceNode?.data?.deviceType === 'BuckConverter') {
      set({
        edges: addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: false,
            label: '5V/12V Regulated DC',
            labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
            style: { stroke: '#38bdf8', strokeWidth: 2.5 },
          },
          get().edges
        ),
      });
      return;
    }

    // ── 3. RSL (Robot Signal Light) Wiring ──
    if (sourceNode?.data?.deviceType === 'roboRIO' && connection.sourceHandle === 'rsl-out') {
      if (targetNode?.data?.deviceType !== 'RSL') {
        alert("roboRIO RSL header can only connect to the Robot Signal Light (RSL).");
        return;
      }

      set({
        edges: addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: true,
            label: 'RSL Status Signal',
            labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
            style: { stroke: '#facc15', strokeWidth: 2.5 },
          },
          get().edges
        ),
      });
      return;
    }

    // ── 4. CANivore CAN FD Secondary Bus ──
    if (sourceNode?.data?.deviceType === 'CANivore') {
      if (connection.sourceHandle === 'can-fd-start') {
        set({
          edges: addEdge(
            {
              ...connection,
              type: 'smoothstep',
              animated: true,
              label: 'CTRE CAN FD Bus (8Mbps)',
              labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
              labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
              style: { stroke: '#f59e0b', strokeWidth: 3 },
            },
            get().edges
          ),
        });
        return;
      }
    }

    // ── 5. PDH Breaker Channel Allocations ──
    const isPdhSource = sourceNode?.data?.deviceType === 'PDH';
    const isTargetPowerIn = connection.targetHandle?.includes('pwr');

    if (isPdhSource && isTargetPowerIn) {
      const { highMap, lowMap, switchedMap } = getPdhAllocations();
      const isTargetRoboRIO = targetNode?.data?.deviceType === 'roboRIO';

      if (connection.sourceHandle === 'pwr-high-out') {
        if (isTargetRoboRIO) {
          alert("Violates FRC Rules: roboRIO cannot run on a high-current breaker port (20A-40A)! Connect to a 15A Low-Current Port (Ports 20-22).");
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
          alert(`All ${MAX_HIGH_CHANNELS} High-Current Channels (Ports 0-19) are occupied!`);
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

    // Default Connection Handling
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

    const isController = ['roboRIO', 'PDH', 'RadioSwitch', 'MainBreaker120A', 'CANivore', 'PneumaticsHub'].includes(type);

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
        canId: !['PDH', 'roboRIO', 'Battery12V', 'MainBreaker120A', 'RadioSwitch', 'RSL', 'PWMServo', 'Compressor', 'LimitSwitch', 'BeamBreak', 'PressureSwitch', 'BuckConverter'].includes(type) ? (nodeCount % 62) + 1 : undefined,
        dioPort: ['LimitSwitch', 'BeamBreak', 'ThroughBore'].includes(type) ? nodeCount % 10 : undefined,
        pwmPort: type === 'PWMServo' ? nodeCount % 10 : undefined,
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