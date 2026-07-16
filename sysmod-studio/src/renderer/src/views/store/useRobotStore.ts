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
  // ==========================================
  // MOTORS & ACTUATORS
  // ==========================================
  DcMotor: {
    theme: 'amber', iconName: 'Zap',
    inputs: [{ id: 'power_in', label: '12V Power & Encoder', color: '!bg-amber-500' }],
    outputs: [],
    details: { "Type": "DC Motor (w/ Integrated Encoder)", "Compatibility": "Direct" }
  },
  Servo: {
    theme: 'rose', iconName: 'Settings',
    inputs: [{ id: 'pwm_in', label: 'PWM Signal (5V)', color: '!bg-orange-400' }],
    outputs: [],
    details: { "Type": "Standard Servo" }
  },

  // ==========================================
  // I2C SENSORS (Outputs to Control Hub Target)
  // ==========================================
  RevColorSensor: {
    theme: 'cyan', iconName: 'Eye',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "REV Robotics", "Version": "V2/V3", "Wiring": "Direct" }
  },
  RevDistanceSensor: {
    theme: 'cyan', iconName: 'Ruler',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "REV Robotics", "Range": "2m", "Wiring": "Direct" }
  },
  Rev9AxisImu: {
    theme: 'cyan', iconName: 'Compass',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "REV Robotics", "Type": "9-Axis IMU", "Wiring": "Direct" }
  },
  NavX2Micro: {
    theme: 'cyan', iconName: 'Navigation',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "Kauai Labs", "Type": "IMU/AHRS", "Wiring": "Direct" }
  },
  PinpointOdometry: {
    theme: 'cyan', iconName: 'Map',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "goBILDA", "Type": "Odometry Computer", "Wiring": "Direct" }
  },
  OctoQuad: {
    theme: 'cyan', iconName: 'Cpu',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "DigitalChickenLabs", "Type": "Encoder Hub", "Wiring": "Direct" }
  },
  StandardI2CSensor: {
    theme: 'cyan', iconName: 'Radio',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "AndyMark", "Type": "Color/Lidar/IMU", "Wiring": "Direct" }
  },
  HuskyLens: {
    theme: 'cyan', iconName: 'Camera',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "DFRobot", "Wiring": "Custom Adapter Cable Req." }
  },
  OpticalOdometrySparkFun: {
    theme: 'cyan', iconName: 'Mouse',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "SparkFun", "Wiring": "Adapter Cable Req." }
  },
  AdafruitI2C: {
    theme: 'cyan', iconName: 'Microchip',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "Adafruit", "Type": "BNO055 / TCS34725", "Wiring": "Custom Harness Req." }
  },
  ModernRoboticsI2C: {
    theme: 'cyan', iconName: 'History',
    inputs: [],
    outputs: [{ id: 'i2c_out', label: 'I2C Data Bus', color: '!bg-cyan-400' }],
    details: { "Manufacturer": "Modern Robotics", "Type": "Compass/Gyro/IR (Legacy)", "Wiring": "Logic Level Converter Req." }
  },

  // ==========================================
  // DIGITAL SENSORS
  // ==========================================
  TouchSensor: {
    theme: 'purple', iconName: 'Hand',
    inputs: [],
    outputs: [{ id: 'digital_out', label: 'Digital Signal', color: '!bg-purple-400' }],
    details: { "Manufacturer": "REV Robotics", "Type": "Button/Limit Switch", "Wiring": "Direct" }
  },
  MagneticLimitSwitch: {
    theme: 'purple', iconName: 'Magnet',
    inputs: [],
    outputs: [{ id: 'digital_out', label: 'Digital Signal', color: '!bg-purple-400' }],
    details: { "Manufacturer": "REV Robotics", "Type": "Magnetic Field Sensor", "Wiring": "Direct" }
  },
  LegacyLimitSwitch: {
    theme: 'purple', iconName: 'ToggleLeft',
    inputs: [],
    outputs: [{ id: 'digital_out', label: 'Digital Signal', color: '!bg-purple-400' }],
    details: { "Manufacturer": "Modern Robotics", "Type": "Limit Switch", "Wiring": "Custom Harness Req." }
  },

  // ==========================================
  // ANALOG SENSORS
  // ==========================================
  Potentiometer: {
    theme: 'emerald', iconName: 'RotateCw',
    inputs: [],
    outputs: [{ id: 'analog_out', label: 'Analog Signal', color: '!bg-emerald-400' }],
    details: { "Manufacturer": "REV Robotics", "Type": "Rotational Position", "Wiring": "Custom Harness Req." }
  },
  FloodgateSwitch: {
    theme: 'emerald', iconName: 'Power',
    inputs: [],
    outputs: [{ id: 'analog_out', label: 'Analog Signal', color: '!bg-emerald-400' }],
    details: { "Manufacturer": "goBILDA", "Type": "Power Switch", "Wiring": "Direct" }
  },
  LegacyTouchSensor: {
    theme: 'emerald', iconName: 'Hand',
    inputs: [],
    outputs: [{ id: 'analog_out', label: 'Analog Signal', color: '!bg-emerald-400' }],
    details: { "Manufacturer": "Modern Robotics", "Type": "Touch Sensor (Legacy)", "Wiring": "Custom Harness Req." }
  },

  // ==========================================
  // STANDALONE ENCODERS
  // ==========================================
  ThroughBoreEncoder: {
    theme: 'amber', iconName: 'Disc',
    inputs: [{ id: 'encoder_link', label: 'Encoder Port Connection', color: '!bg-amber-500' }],
    outputs: [],
    details: { "Manufacturer": "REV Robotics", "Type": "Quad Encoder V2", "Wiring": "Direct" }
  },

  // ==========================================
  // VISION SENSORS & COPROCESSORS
  // ==========================================
  Limelight3A: {
    theme: 'indigo', iconName: 'Target',
    inputs: [{ id: 'usb_link', label: 'USB 3.0', color: '!bg-indigo-400' }],
    outputs: [],
    details: { "Manufacturer": "Limelight", "Type": "Smart Vision Sensor", "Protocol": "UVC / Network" }
  },
  Webcam: {
    theme: 'indigo', iconName: 'Video',
    inputs: [{ id: 'usb_link', label: 'USB 2.0 / 3.0', color: '!bg-indigo-400' }],
    outputs: [],
    details: { "Manufacturer": "Standard (Logitech/Microsoft)", "Type": "UVC Camera", "Usage": "TensorFlow / AprilTags" }
  },
  Coprocessor: {
    theme: 'indigo', iconName: 'Cpu',
    inputs: [{ id: 'usb_serial', label: 'USB Serial Link', color: '!bg-indigo-400' }],
    outputs: [{ id: 'data_out', label: 'Data / GPIO Bus', color: '!bg-indigo-300' }],
    details: { "OS": "Linux (ARM)", "Protocol": "USB Serial" }
  }
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