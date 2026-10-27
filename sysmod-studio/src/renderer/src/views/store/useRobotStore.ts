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
  Battery12V: { label: '12V FRC Battery', category: 'Control & Power', protocol: '12V DC (SB50)', details: '12V 18Ah SLA Battery' },
  MainBreaker120A: { label: '120A Main Breaker', category: 'Control & Power', protocol: 'High Current Pass', details: 'Primary System Power Switch' },
  PDH: { label: 'REV PDH', category: 'Control & Power', protocol: '12V Power / CAN', details: '20 High / 3 Low / 1 Switched' },
  roboRIO: { label: 'roboRIO 2.0', category: 'Control & Power', protocol: 'CAN / Eth / USB / DIO', details: 'Main Robot Controller' },
  RSL: { label: 'Robot Signal Light (RSL)', category: 'Control & Power', protocol: 'RSL Signal', details: 'Allen-Bradley Status Light' },
  RadioSwitch: { label: 'VH-109 FRC Radio', category: 'Control & Power', protocol: 'Ethernet / Passive PoE', details: '2-Port Managed FRC Radio' },
  PneumaticsHub: { label: 'Pneumatics Hub', category: 'Control & Power', protocol: 'CAN / Pneumatic', details: 'PCM/PH Controller' },
  PressureSwitch: { label: 'Pneumatic Pressure Switch', category: 'Control & Power', protocol: 'Cutoff Switch Signal', details: '120 PSI Auto Cutoff Switch' },
  VRM_MPM: { label: 'Mini Power Module / VRM', category: 'Control & Power', protocol: 'Aux Power', details: 'Regulated Aux Power Board' },
  BuckConverter: { label: '5V/12V Buck Converter', category: 'Control & Power', protocol: 'DC-DC Regulated', details: 'Clean Power for Coprocessors' },
  CANivore: { label: 'CTRE CANivore', category: 'Control & Power', protocol: 'USB to CAN FD', details: 'Secondary CAN FD Bus Adapter' },
  CANHub: { label: 'WCP CAN Bus Hub', category: 'Control & Power', protocol: 'CAN Splitter', details: 'CAN Bus Distribution Board' },
  BrushedController: { label: 'Talon SRX / SPARK', category: 'Actuators & Drive', protocol: 'CAN / PWM', details: 'Brushed Motor Controller' },
  KrakenX60: { label: 'Kraken X60 Motor', category: 'Actuators & Drive', protocol: 'CAN FD / Talon FX', details: 'Brushless Actuator' },
  Falcon500: { label: 'Falcon 500 Motor', category: 'Actuators & Drive', protocol: 'CAN / Talon FX', details: 'Integrated Brushless Motor' },
  SparkMaxNEO: { label: 'NEO + SPARK Max', category: 'Actuators & Drive', protocol: 'CAN Bus / PWM', details: 'Brushless Controller' },
  NEOVortex: { label: 'NEO Vortex + SPARK Flex', category: 'Actuators & Drive', protocol: 'CAN Bus / PWM', details: 'High Output Motor' },
  NEO550: { label: 'NEO 550 Motor', category: 'Actuators & Drive', protocol: 'CAN Bus / PWM', details: 'Compact Brushless' },
  PWMServo: { label: 'PWM Servo Motor', category: 'Actuators & Drive', protocol: 'PWM Signal', details: 'Standard Servo' },
  Compressor: { label: 'Pneumatic Compressor', category: 'Actuators & Drive', protocol: '12V Pneumatic Power', details: 'Air Compressor' },
  SolenoidValve: { label: 'Solenoid Valve', category: 'Actuators & Drive', protocol: 'Pneumatic / 12V', details: 'Pneumatic Actuator' },
  Limelight: { label: 'Limelight 3/3G', category: 'Sensors & Vision', protocol: 'Ethernet / NetworkTables', details: 'Smart Vision Camera' },
  PhotonVision: { label: 'PhotonVision Camera', category: 'Sensors & Vision', protocol: 'Ethernet / NetworkTables', details: 'Custom Vision Processor' },
  CANcoder: { label: 'CTRE CANcoder', category: 'Sensors & Vision', protocol: 'CAN / CAN FD', details: 'Absolute Encoder' },
  ThroughBore: { label: 'REV Through Bore', category: 'Sensors & Vision', protocol: 'DIO Duty Cycle', details: 'Quadrature Encoder' },
  Pigeon2: { label: 'Pigeon 2.0 IMU', category: 'Sensors & Vision', protocol: 'CAN / CAN FD', details: '9-Axis Gyroscope' },
  NavX2: { label: 'navX2-MXP Gyro', category: 'Sensors & Vision', protocol: 'SPI / CAN', details: 'Precision Gyro' },
  LimitSwitch: { label: 'Limit Switch', category: 'Sensors & Vision', protocol: 'DIO Contact', details: 'Physical Hardstop Sensor' },
  BeamBreak: { label: 'Beam-Break Sensor', category: 'Sensors & Vision', protocol: 'DIO Optical', details: 'Indexer Game Piece Sensor' },
  TimeOfFlight: { label: 'LaserCAN / ToF Sensor', category: 'Sensors & Vision', protocol: 'CAN / I2C', details: 'Laser Distance Measurement' },
  ColorSensor: { label: 'REV Color Sensor V3', category: 'Sensors & Vision', protocol: 'I2C / CAN', details: 'Color & Proximity Sensor' },
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

      if (radioHandle === 'eth-aux') {
        const auxAlreadyOccupied = edges.some(
          (e) => (e.sourceHandle === 'eth-aux' && e.source === (isRadioSource ? sourceNode.id : targetNode.id)) ||
                 (e.targetHandle === 'eth-aux' && e.target === (isRadioSource ? sourceNode.id : targetNode.id))
        );

        if (auxAlreadyOccupied) {
          alert("Radio AUX Port Occupied! The AUX port only supports 1 downstream connection.");
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