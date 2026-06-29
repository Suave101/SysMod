import { create } from 'zustand';
import { 
  Connection, 
  Edge, 
  Node, 
  addEdge, 
  OnNodesChange, 
  OnEdgesChange, 
  applyNodeChanges, 
  applyEdgeChanges 
} from '@xyflow/react';

export type HardwareType = 'ControlHub' | 'Sensor' | 'Coprocessor' | 'Motor';

export interface RobotNodeData {
  label: string;
  hardwareType: HardwareType;
  ipAddress?: string;
  [key: string]: unknown;
}

export type RobotNode = Node<RobotNodeData>;

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
  
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },
  
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },
  
  onConnect: (connection) => {
    set({
      edges: addEdge({ ...connection, animated: true, style: { stroke: '#94a3b8' } }, get().edges),
    });
  },
  
  addDevice: (type: HardwareType) => {
    const id = `${type.toLowerCase()}_${Date.now()}`;
    const xPosition = 250 + Math.random() * 100;
    const yPosition = 200 + Math.random() * 100;
    
    // Set identifiable fallback naming structures
    const defaultData: RobotNodeData = {
      label: `${type.toLowerCase()}${get().nodes.length + 1}`,
      hardwareType: type,
    };

    if (type === 'Coprocessor') {
      defaultData.ipAddress = '192.168.43.50';
    }

    const newNode: RobotNode = {
      id,
      type,
      position: { x: xPosition, y: yPosition },
      data: defaultData,
    };

    set({ nodes: [...get().nodes, newNode] });
  },

  updateNodeLabel: (id: string, label: string) => {
    set({
      nodes: get().nodes.map((node) => 
        node.id === id ? { ...node, data: { ...node.data, label } } : node
      ),
    });
  },

  deleteNode: (id: string) => {
    set({
      // Remove the node itself
      nodes: get().nodes.filter((node) => node.id !== id),
      // Clean up any stray connection lines wired into this node
      edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id),
    });
  },

  clearWorkspace: () => set({ nodes: [], edges: [] })
}));