import React, { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, NodeTypes } from '@xyflow/react';
import { useRobotStore, WIRE_STYLES, PortType } from './store/useRobotStore';
import { ControlHubNode } from './components/ControlHubNode';
import { StandardNode } from './components/StandardNode';
import { CodeViewerModal } from './components/CodeViewerModal';
import { PriceEditorModal } from './components/PriceEditorModal';
import { generateJavaCode, generateAadlCode } from './utils/codeGenerators';
import { useNavigate } from 'react-router-dom';
import { 
  Cpu, 
  Plus, 
  FileCode, 
  Layers, 
  Trash2, 
  Eye, 
  Zap, 
  Settings, 
  Camera, 
  Server, 
  ArrowLeft, 
  Save,
  Gauge,
  Wind,
  Radio,
  Activity,
  LucideIcon
} from 'lucide-react';
import '@xyflow/react/dist/style.css';

const proOptions = { hideAttribution: true };

export interface HardwareItemConfig {
  id: string;
  label: string;
  defaultCost: number;
  category: 'Control & Power' | 'Actuators & Drive' | 'Sensors & Vision' | 'Coprocessors';
  icon: LucideIcon;
  borderColor: string;
  iconColor: string;
}

export const FRC_HARDWARE_CATALOG: HardwareItemConfig[] = [
  { id: 'roboRIO', label: 'roboRIO 2.0', defaultCost: 450.00, category: 'Control & Power', icon: Cpu, borderColor: 'border-indigo-500/30', iconColor: 'text-indigo-400' },
  { id: 'PDH', label: 'REV PDH (20 Ch)', defaultCost: 240.00, category: 'Control & Power', icon: Zap, borderColor: 'border-amber-500/30', iconColor: 'text-amber-500' },
  { id: 'PneumaticsHub', label: 'Pneumatics Hub', defaultCost: 120.00, category: 'Control & Power', icon: Wind, borderColor: 'border-sky-500/30', iconColor: 'text-sky-400' },
  { id: 'KrakenX60', label: 'Kraken X60 Motor', defaultCost: 180.00, category: 'Actuators & Drive', icon: Activity, borderColor: 'border-emerald-500/30', iconColor: 'text-emerald-400' },
  { id: 'SparkMaxNEO', label: 'NEO + SPARK Max', defaultCost: 125.00, category: 'Actuators & Drive', icon: Zap, borderColor: 'border-orange-500/30', iconColor: 'text-orange-400' },
  { id: 'SolenoidValve', label: 'Solenoid Valve', defaultCost: 45.00, category: 'Actuators & Drive', icon: Wind, borderColor: 'border-cyan-500/30', iconColor: 'text-cyan-400' },
  { id: 'Limelight', label: 'Limelight 3/3G', defaultCost: 400.00, category: 'Sensors & Vision', icon: Camera, borderColor: 'border-lime-500/30', iconColor: 'text-lime-400' },
  { id: 'CANcoder', label: 'CTRE CANcoder', defaultCost: 65.00, category: 'Sensors & Vision', icon: Gauge, borderColor: 'border-purple-500/30', iconColor: 'text-purple-400' },
  { id: 'Pigeon2', label: 'Pigeon 2.0 IMU', defaultCost: 199.00, category: 'Sensors & Vision', icon: Radio, borderColor: 'border-rose-500/30', iconColor: 'text-rose-400' },
  { id: 'Coprocessor', label: 'Orange Pi / Jetson', defaultCost: 120.00, category: 'Coprocessors', icon: Server, borderColor: 'border-indigo-500/30', iconColor: 'text-indigo-400' }
];

export default function App(): React.JSX.Element {
  const navigate = useNavigate();

  const { 
    nodes, 
    edges, 
    onNodesChange, 
    onEdgesChange, 
    onConnect, 
    addDevice, 
    clearWorkspace 
  } = useRobotStore();

  const [deviceCosts, setDeviceCosts] = useState<Record<string, number>>({
    roboRIO: 450, PDH: 240, PneumaticsHub: 120, KrakenX60: 180, SparkMaxNEO: 125, SolenoidValve: 45, Limelight: 400, CANcoder: 65, Pigeon2: 199, Coprocessor: 120
  });

  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [modalAadl, setModalAadl] = useState('');
  const [modalJava, setModalJava] = useState('');

  const nodeTypes = useMemo<NodeTypes>(() => ({
    ControlHub: ControlHubNode,
    StandardNode: StandardNode,
  }), []);

  const handleViewCode = (): void => {
    setModalAadl(generateAadlCode(nodes, edges));
    setModalJava(generateJavaCode(nodes, edges));
    setIsCodeModalOpen(true);
  };

  return (
    <div className="flex w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar Controls */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col justify-between z-10 shadow-2xl">
        <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-160px)]">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
            <Layers className="text-indigo-500 w-6 h-6" />
            <div>
              <h1 className="text-lg font-mono font-black tracking-tight text-slate-100">SysMod Studio</h1>
              <p className="text-[10px] text-indigo-400 font-sans tracking-widest uppercase font-semibold">FRC Subsystem Architecture</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => navigate('/brainstorming')} className="py-2 px-3 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-slate-300 flex items-center justify-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button onClick={() => alert('Workspace JSON Saved')} className="py-2 px-3 rounded bg-indigo-950/40 border border-indigo-500/30 text-[11px] font-mono font-bold text-indigo-300 flex items-center justify-center gap-1">
              <Save className="w-3.5 h-3.5" /> Save JSON
            </button>
          </div>

          <div className="space-y-4 border-t border-slate-800/80 pt-4">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 px-1">FRC Hardware Component Palette</h2>
            {FRC_HARDWARE_CATALOG.map((item) => {
              const ItemIcon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => addDevice(item.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border ${item.borderColor} text-left transition group`}
                >
                  <div className="flex items-center gap-2">
                    <ItemIcon className={`w-4 h-4 ${item.iconColor}`} />
                    <span className="text-xs font-mono text-slate-300">{item.label}</span>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex flex-col gap-3 bg-slate-950/40">
          <button onClick={clearWorkspace} className="w-full py-2 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono bg-slate-900 border border-red-500/20 text-red-400 hover:border-red-500/50 transition">
            <Trash2 className="w-3.5 h-3.5" /> Clear Canvas
          </button>
          <button onClick={handleViewCode} className="w-full py-2.5 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono bg-slate-900 border border-indigo-500/30 text-indigo-400 hover:text-indigo-300 transition">
            <Eye className="w-3.5 h-3.5" /> Preview Code
          </button>
        </div>
      </aside>

      {/* Main Workspace Viewport */}
      <main className="flex-1 h-full relative bg-slate-950">
        {/* Connection Protocol Legend Bar */}
        <div className="absolute top-4 right-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-2xl flex items-center gap-4 text-xs font-mono">
          <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider border-r border-slate-800 pr-3">
            Wiring Standards:
          </span>
          {Object.entries(WIRE_STYLES).map(([type, style]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: style.color }} />
              <span className="text-slate-300 text-[11px]">{style.label}</span>
            </div>
          ))}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          proOptions={proOptions}
        >
          <Background color="#334155" gap={16} size={1} />
          <Controls className="bg-slate-900! border-slate-700! fill-slate-200! [&_button]:border-slate-800! [&_button]:bg-slate-900" />
        </ReactFlow>
      </main>

      <CodeViewerModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        aadlCode={modalAadl}
        javaCode={modalJava}
      />
    </div>
  );
}