// useRobotStore.ts
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
  category: DeviceCategory;
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

// Display order of the component palette
export const DEVICE_CATEGORIES = [
  'Power & Protection',
  'Control & Communication',
  'Motors & Controllers',
  'Pneumatics',
  'Sensors',
  'Vision & Coprocessors',
] as const;

export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

// Single source for every device's name, group and estimated unit cost
export const FRC_DEVICE_DEFAULTS: Record<string, { label: string; category: DeviceCategory; protocol: string; details: string; cost: number }> = {
  Battery12V: { label: '12V FRC Battery', category: 'Power & Protection', protocol: '12V DC (SB50)', details: '12V 18Ah SLA Battery', cost: 50.00 },
  MainBreaker120A: { label: '120A Main Breaker', category: 'Power & Protection', protocol: 'High Current Pass', details: 'Primary System Power Switch', cost: 35.00 },
  PDH: { label: 'REV PDH', category: 'Power & Protection', protocol: '12V Power / CAN', details: '20 High / 3 Low / 1 Switchable', cost: 240.00 },
  VRM: { label: 'CTRE Voltage Regulator Module', category: 'Power & Protection', protocol: 'Regulated 12V / 5V', details: 'Regulated 12V and 5V Outputs', cost: 45.00 },
  MPM: { label: 'REV Mini Power Module', category: 'Power & Protection', protocol: 'Fused 12V', details: 'Passive Fused Power Splitter', cost: 25.00 },
  BuckConverter: { label: '5V/12V Buck Converter', category: 'Power & Protection', protocol: 'DC-DC Regulated', details: 'Clean Power for Coprocessors', cost: 15.00 },

  roboRIO: { label: 'roboRIO 2.0', category: 'Control & Communication', protocol: 'CAN / Eth / USB / DIO / PWM', details: 'Main Robot Controller', cost: 450.00 },
  RadioSwitch: { label: 'VH-109 FRC Radio', category: 'Control & Communication', protocol: 'Ethernet / Passive PoE', details: '4-Port Wi-Fi 6E FRC Radio', cost: 150.00 },
  RSL: { label: 'Robot Signal Light (RSL)', category: 'Control & Communication', protocol: 'RSL Signal', details: 'Robot Status Light', cost: 35.00 },
  CANivore: { label: 'CTRE CANivore', category: 'Control & Communication', protocol: 'USB to CAN FD', details: 'Secondary CAN FD Bus Adapter', cost: 299.99 },
  CANHub: { label: 'WCP CAN Bus Hub', category: 'Control & Communication', protocol: 'CAN Splitter', details: 'CAN Bus Distribution Board', cost: 25.00 },

  KrakenX60: { label: 'Kraken X60 Motor', category: 'Motors & Controllers', protocol: 'CAN / CAN FD', details: 'Brushless Motor + Integrated TalonFX', cost: 217.99 },
  KrakenX44: { label: 'Kraken X44 Motor', category: 'Motors & Controllers', protocol: 'CAN / CAN FD', details: 'Compact Brushless + Integrated TalonFX', cost: 217.99 },
  Falcon500: { label: 'Falcon 500 Motor', category: 'Motors & Controllers', protocol: 'CAN / CAN FD', details: 'Brushless Motor + Integrated TalonFX', cost: 180.00 },
  SparkMaxNEO: { label: 'NEO + SPARK MAX', category: 'Motors & Controllers', protocol: 'CAN / PWM', details: 'Brushless Motor and Controller', cost: 125.00 },
  NEOVortex: { label: 'NEO Vortex + SPARK Flex', category: 'Motors & Controllers', protocol: 'CAN / PWM', details: 'Brushless Motor and Controller', cost: 180.00 },
  NEO550: { label: 'NEO 550 + SPARK MAX', category: 'Motors & Controllers', protocol: 'CAN / PWM', details: 'Compact Brushless and Controller', cost: 45.00 },
  BrushedController: { label: 'Brushed Motor + SPARK MAX', category: 'Motors & Controllers', protocol: 'CAN / PWM', details: 'Brushed Motor Controller', cost: 50.00 },
  PWMServo: { label: 'PWM Servo Motor', category: 'Motors & Controllers', protocol: 'PWM Signal', details: 'Standard Servo', cost: 20.00 },

  PneumaticsHub: { label: 'REV Pneumatic Hub', category: 'Pneumatics', protocol: 'CAN / Solenoid', details: '16 Solenoid Channels', cost: 120.00 },
  Compressor: { label: 'Pneumatic Compressor', category: 'Pneumatics', protocol: 'Pneumatic Hub Output', details: 'Air Compressor', cost: 110.00 },
  PressureSwitch: { label: 'Pneumatic Pressure Switch', category: 'Pneumatics', protocol: 'Digital Switch', details: '120 PSI Auto Cutoff Switch', cost: 15.00 },
  SolenoidValve: { label: 'Solenoid Valve', category: 'Pneumatics', protocol: 'Solenoid Channel', details: 'Pneumatic Valve', cost: 45.00 },

  CANcoder: { label: 'CTRE CANcoder', category: 'Sensors', protocol: 'CAN / CAN FD', details: 'Absolute Encoder', cost: 65.00 },
  ThroughBore: { label: 'REV Through Bore Encoder', category: 'Sensors', protocol: 'DIO Duty Cycle', details: 'Absolute / Quadrature Encoder', cost: 45.00 },
  Pigeon2: { label: 'Pigeon 2.0 IMU', category: 'Sensors', protocol: 'CAN / CAN FD', details: '9-Axis IMU', cost: 199.99 },
  NavX2: { label: 'navX2-MXP Gyro', category: 'Sensors', protocol: 'MXP (SPI / I2C)', details: 'Plugs Into roboRIO MXP Port', cost: 100.00 },
  LimitSwitch: { label: 'Limit Switch', category: 'Sensors', protocol: 'DIO Contact', details: 'Physical Hardstop Sensor', cost: 10.00 },
  BeamBreak: { label: 'Beam-Break Sensor', category: 'Sensors', protocol: 'DIO Optical', details: 'Game Piece Sensor', cost: 15.00 },
  TimeOfFlight: { label: 'LaserCAN ToF Sensor', category: 'Sensors', protocol: 'CAN', details: 'Laser Distance Measurement', cost: 35.00 },
  ColorSensor: { label: 'REV Color Sensor V3', category: 'Sensors', protocol: 'I2C', details: 'Color & Proximity Sensor', cost: 20.00 },

  Limelight: { label: 'Limelight 3/3G/4', category: 'Vision & Coprocessors', protocol: 'Ethernet / NetworkTables', details: 'Smart Vision Camera', cost: 400.00 },
  PhotonVision: { label: 'USB Camera (PhotonVision)', category: 'Vision & Coprocessors', protocol: 'USB', details: 'Runs on a Coprocessor', cost: 120.00 },
  Coprocessor: { label: 'Linux Coprocessor', category: 'Vision & Coprocessors', protocol: 'USB / Ethernet', details: 'Orange Pi / Jetson', cost: 120.00 },
};

const CAN_ID_DEVICES = ['KrakenX60', 'KrakenX44', 'Falcon500', 'SparkMaxNEO', 'NEOVortex', 'NEO550', 'BrushedController', 'PneumaticsHub', 'CANcoder', 'Pigeon2', 'TimeOfFlight'];
const DIO_DEVICES = ['LimitSwitch', 'BeamBreak', 'ThroughBore'];

function lowestUnused(used: (number | undefined)[], first: number, last: number): number | undefined {
  for (let value = first; value <= last; value++) {
    if (!used.includes(value)) return value;
  }
  return undefined;
}

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
    const { nodes, edges, getPdhAllocations } = get();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    // ── Rule 0: PDH Power Channel Allocation Fix ──
    const sourceHandle = connection.sourceHandle;
    if (sourceNode?.data?.deviceType === 'PDH' && sourceHandle?.startsWith('pwr-')) {
      const { highMap, lowMap, switchedMap } = getPdhAllocations();

      let channelType: 'high' | 'low' | 'switched' | undefined;
      let assignedPort: number | undefined;
      let strokeColor = '#ef4444';
      let strokeDasharray: string | undefined;

      if (sourceHandle === 'pwr-high-out') {
        channelType = 'high';
        for (let i = 0; i < MAX_HIGH_CHANNELS; i++) {
          if (!highMap.has(i)) {
            assignedPort = i;
            break;
          }
        }
        if (assignedPort === undefined) {
          alert("PDH High-Current Limit Reached: All 20 40A ATO channels (Ports 0–19) are occupied!");
          return;
        }
        strokeColor = '#ef4444';
      } else if (sourceHandle === 'pwr-low-out') {
        channelType = 'low';
        for (let i = 20; i < 20 + MAX_LOW_CHANNELS; i++) {
          if (!lowMap.has(i)) {
            assignedPort = i;
            break;
          }
        }
        if (assignedPort === undefined) {
          alert("PDH Low-Current Limit Reached: All 3 15A ATM channels (Ports 20–22) are occupied!");
          return;
        }
        strokeColor = '#f97316';
      } else if (sourceHandle === 'pwr-switched-out') {
        channelType = 'switched';
        if (!switchedMap.has(23)) {
          assignedPort = 23;
        } else {
          alert("PDH Switchable Channel Occupied: Port 23 is already in use!");
          return;
        }
        strokeColor = '#e11d48';
        strokeDasharray = '4 2';
      }

      if (channelType && assignedPort !== undefined) {
        const channelTypeName = channelType === 'high' ? 'High' : channelType === 'low' ? 'Low' : 'Switchable';
        const portLabel = `Port #${assignedPort} (${channelTypeName})`;

        // Update target node power channel display label
        const updatedNodes = get().nodes.map((n) => {
          if (n.id === connection.target) {
            return {
              ...n,
              data: {
                ...n.data,
                powerChannel: portLabel,
              },
            };
          }
          return n;
        });

        set({
          nodes: updatedNodes,
          edges: addEdge(
            {
              ...connection,
              type: 'smoothstep',
              animated: false,
              label: portLabel,
              labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
              labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
              style: { stroke: strokeColor, strokeWidth: 3, strokeDasharray },
              data: { channelType, channelNum: assignedPort },
            },
            get().edges
          ),
        });
        return;
      }
    }

    const isCanConnection = connection.sourceHandle?.includes('can') || connection.targetHandle?.includes('can');

    // Rule 1: CAN Bus MUST NOT originate from or connect to the FRC Radio
    if (sourceNode?.data?.deviceType === 'RadioSwitch' || targetNode?.data?.deviceType === 'RadioSwitch') {
      if (isCanConnection) {
        alert("Violates FRC Rules: The CAN bus CANNOT start at or connect to the FRC Radio!");
        return;
      }
    }

    // Rule 2: FRC Radio Dedicated Port Allocation Rules
    const isRadioSource = sourceNode?.data?.deviceType === 'RadioSwitch';
    const isRadioTarget = targetNode?.data?.deviceType === 'RadioSwitch';

    if (isRadioSource || isRadioTarget) {
      const radioHandle = isRadioSource ? connection.sourceHandle : connection.targetHandle;
      const otherNode = isRadioSource ? targetNode : sourceNode;

      if (radioHandle === 'eth-rio') {
        if (otherNode?.data?.deviceType !== 'roboRIO') {
          alert("Violates FRC Rules: The Radio's RIO port is reserved exclusively for the RoboRIO!");
          return;
        }
      }

      if (radioHandle === 'eth-aux' || radioHandle === 'eth-aux2') {
        const auxAlreadyOccupied = edges.some((e) => e.source === sourceNode?.id && e.sourceHandle === radioHandle);

        if (auxAlreadyOccupied) {
          alert("Radio AUX Port Occupied! Each AUX port only supports 1 downstream connection.");
          return;
        }
      }
    }

    // Rule 3: Main Power Sequence
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

    // Rule 4: Ethernet Connections
    const isEthConnection = connection.sourceHandle?.includes('eth') || connection.targetHandle?.includes('eth');
    if (isEthConnection) {
      set({
        edges: addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: true,
            label: 'Ethernet Link',
            labelStyle: { fill: '#f8fafc', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f172a', fillOpacity: 0.9, rx: 4, ry: 4 },
            style: { stroke: '#10b981', strokeWidth: 2.5 },
          },
          get().edges
        ),
      });
      return;
    }

    // Rule 5: Standard CAN Bus & Termination
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

    // Default Connection
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
      category: 'Motors & Controllers' as DeviceCategory,
      protocol: 'CAN Bus',
      details: 'FRC Component',
    };

    const id = `${type.toLowerCase()}${deviceCounter++}`;
    const nodes = get().nodes;
    const nodeCount = nodes.length;
    
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
        canId: CAN_ID_DEVICES.includes(type) ? lowestUnused(nodes.map((n) => n.data.canId), 1, 62) : undefined,
        dioPort: DIO_DEVICES.includes(type) ? lowestUnused(nodes.map((n) => n.data.dioPort), 0, 9) : undefined,
        pwmPort: type === 'PWMServo' ? lowestUnused(nodes.map((n) => n.data.pwmPort), 0, 9) : undefined,
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