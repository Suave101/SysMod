import { create } from 'zustand';
import { Connection, Edge, Node, addEdge, OnNodesChange, OnEdgesChange, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

export type HardwareType = 'ControlHub' | string; // Allows for dynamic strings now

export interface RobotNodeData {
  label: string;
  hardwareType: HardwareType;
  [key: string]: any; // Allow our dynamic ports and themes
}

export type RobotNode = Node<RobotNodeData>;

// --- THE HARDWARE REGISTRY ---
// Add new components here in seconds. The StandardNode will automatically render them!
const HARDWARE_LIBRARY: Record<string, any> = {
  DcMotor: {
    theme: 'amber', iconName: 'Zap',
    inputs: [{ id: 'power_in', label: '12V Power & Encoder', color: '!bg-amber-500' }],
    outputs: [],
    details: { "Type": "DC Motor (Ex)", "Max RPM": "312" }
  },
  Servo: {
    theme: 'rose', iconName: 'Settings',
    inputs: [{ id: 'pwm_in', label: 'PWM Signal (5V)', color: '!bg-orange-400' }],
    outputs: [],
    details: { "Type": "Standard Servo" }
  },
  Webcam: {
    theme: 'indigo', iconName: 'Camera',
    inputs: [{ id: 'usb_link', label: 'USB 2.0 / 3.0', color: '!bg-indigo-400' }],
    outputs: [],
    details: { "Resolution": "1080p", "Protocol": "UVC" }
  },
  ColorSensor: {
    theme: 'cyan', iconName: 'Eye',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Address": "0x3C", "Range": "2-10cm" }
  },
  Coprocessor: {
    theme: 'indigo', iconName: 'Cpu',
    inputs: [{ id: 'usb_serial', label: 'USB Serial Link', color: '!bg-indigo-400' }],
    outputs: [{ id: 'data_out', label: 'Data / GPIO Bus', color: '!bg-indigo-300' }],
    details: { "OS": "Linux (ARM)", "Protocol": "USB Serial" }
  },
};

interface RobotStoreState {
  nodes: RobotNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<RobotNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  addDevice: (type: HardwareType) => void;
  updateNodeLabel: (id: string, label: string) => void;
  deleteNode: (id: string) => void;
  clearWorkspace: () => void;
}

export const useRobotStore = create<RobotStoreState>((set, get) => ({
  nodes: [],
  edges: [],
  
  onNodesChange: (c) => set({ nodes: applyNodeChanges(c, get().nodes) }),
  onEdgesChange: (c) => set({ edges: applyEdgeChanges(c, get().edges) }),
  onConnect: (connection) => set({ edges: addEdge({ ...connection, animated: true, style: { stroke: '#94a3b8' } }, get().edges) }),
  
  addDevice: (type: string) => {
    const id = `${type.toLowerCase()}_${Date.now()}`;
    const defaultData: RobotNodeData = {
      label: `${type.toLowerCase()}${get().nodes.length + 1}`,
      hardwareType: type,
    };

    // If it's in the registry, attach the configuration
    const blueprint = HARDWARE_LIBRARY[type];
    if (blueprint) {
      Object.assign(defaultData, blueprint);
    }

    // Determine React Flow nodeType mapping
    // If it's the massive Control Hub, use the custom one. Otherwise, default to StandardNode.
    const reactFlowType = type === 'ControlHub' ? 'ControlHub' : 'StandardNode';

    set({ nodes: [...get().nodes, {
      id,
      type: reactFlowType,
      position: { x: 300 + Math.random() * 50, y: 200 + Math.random() * 50 },
      data: defaultData,
    }] });
  },

  updateNodeLabel: (id, label) => set({
    nodes: get().nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, label } } : n)
  }),
  deleteNode: (id) => set({
    nodes: get().nodes.filter((n) => n.id !== id),
    edges: get().edges.filter((e) => e.source !== id && e.target !== id),
  }),
  clearWorkspace: () => set({ nodes: [], edges: [] })
}));