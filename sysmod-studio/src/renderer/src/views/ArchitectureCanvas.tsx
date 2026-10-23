import React, { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, NodeTypes, Edge } from '@xyflow/react';
import { useRobotStore, WIRE_STYLES } from './store/useRobotStore';
import { ControlHubNode } from './components/ControlHubNode';
import { StandardNode } from './components/StandardNode';
import { CodeViewerModal } from './components/CodeViewerModal';
import { SystemVerificationModal } from './components/SystemVerificationModal';
import { generatePythonCode, generateJavaCode, generateAadlCode } from './utils/codeGenerators';
import { verifySystemProperties, VerificationReport } from './utils/systemVerifier';
import { useNavigate } from 'react-router-dom';
import { 
  Cpu, 
  Plus, 
  Layers, 
  Trash2, 
  Eye, 
  Zap, 
  Camera, 
  Server, 
  ArrowLeft, 
  Save,
  Gauge,
  Wind,
  Radio,
  Activity,
  Battery,
  ShieldCheck,
  FileCode,
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
  { id: 'Battery12V', label: '12V FRC Battery', defaultCost: 50.00, category: 'Control & Power', icon: Battery, borderColor: 'border-red-500/40', iconColor: 'text-red-500' },
  { id: 'PDH', label: 'REV PDH', defaultCost: 240.00, category: 'Control & Power', icon: Zap, borderColor: 'border-amber-500/40', iconColor: 'text-amber-500' },
  { id: 'roboRIO', label: 'roboRIO 2.0', defaultCost: 450.00, category: 'Control & Power', icon: Cpu, borderColor: 'border-indigo-500/40', iconColor: 'text-indigo-400' },
  { id: 'PneumaticsHub', label: 'Pneumatics Hub', defaultCost: 120.00, category: 'Control & Power', icon: Wind, borderColor: 'border-sky-500/40', iconColor: 'text-sky-400' },
  { id: 'KrakenX60', label: 'Kraken X60 Motor', defaultCost: 180.00, category: 'Actuators & Drive', icon: Activity, borderColor: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  { id: 'SparkMaxNEO', label: 'NEO + SPARK Max', defaultCost: 125.00, category: 'Actuators & Drive', icon: Zap, borderColor: 'border-orange-500/40', iconColor: 'text-orange-400' },
  { id: 'SolenoidValve', label: 'Solenoid Valve', defaultCost: 45.00, category: 'Actuators & Drive', icon: Wind, borderColor: 'border-cyan-500/40', iconColor: 'text-cyan-400' },
  { id: 'Limelight', label: 'Limelight 3/3G', defaultCost: 400.00, category: 'Sensors & Vision', icon: Camera, borderColor: 'border-lime-500/40', iconColor: 'text-lime-400' },
  { id: 'CANcoder', label: 'CTRE CANcoder', defaultCost: 65.00, category: 'Sensors & Vision', icon: Gauge, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  { id: 'Pigeon2', label: 'Pigeon 2.0 IMU', defaultCost: 199.00, category: 'Sensors & Vision', icon: Radio, borderColor: 'border-rose-500/40', iconColor: 'text-rose-400' },
  { id: 'Coprocessor', label: 'Orange Pi / Jetson', defaultCost: 120.00, category: 'Coprocessors', icon: Server, borderColor: 'border-indigo-500/40', iconColor: 'text-indigo-400' }
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
    removeEdge,
    clearWorkspace
  } = useRobotStore();

  // Code Viewer Modal State
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [modalAadl, setModalAadl] = useState('');
  const [modalJava, setModalJava] = useState('');
  const [modalPython, setModalPython] = useState('');

  // Verification Diagnostics Modal State
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [verifyReport, setVerifyReport] = useState<VerificationReport>({ passed: true, score: 100, issues: [] });

  const nodeTypes = useMemo<NodeTypes>(() => ({
    ControlHub: ControlHubNode,
    StandardNode: StandardNode,
  }), []);

  const handleViewCode = (): void => {
    setModalAadl(generateAadlCode(nodes, edges));
    setModalJava(generateJavaCode(nodes, edges));
    setModalPython(generatePythonCode(nodes, edges));
    setIsCodeModalOpen(true);
  };

  const handleRunVerification = (): void => {
    const report = verifySystemProperties(nodes, edges);
    setVerifyReport(report);
    setIsVerifyModalOpen(true);
  };

  const handleExportRobotPy = async (): Promise<void> => {
    const pythonCode = generatePythonCode(nodes, edges);
    try {
      if (window.sysmodAPI && window.sysmodAPI.saveJavaFile) {
        const response = await window.sysmodAPI.saveJavaFile(pythonCode);
        if (response.success && response.filePath) {
          alert(`RobotPy script exported successfully to:\n${response.filePath}`);
        }
      } else {
        const blob = new Blob([pythonCode], { type: 'text/x-python' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'robot.py';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to save robot.py script.');
    }
  };

  const handleEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    if (window.confirm(`Delete connection "${edge.label || 'Wire'}"?`)) {
      removeEdge(edge.id);
    }
  };

  return (
    <div className="flex w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar Controls */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col justify-between z-10 shadow-2xl">
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
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
            <button onClick={() => alert('Workspace Saved')} className="py-2 px-3 rounded bg-indigo-950/40 border border-indigo-500/30 text-[11px] font-mono font-bold text-indigo-300 flex items-center justify-center gap-1">
              <Save className="w-3.5 h-3.5" /> Save JSON
            </button>
          </div>

          {/* Verification Diagnostics Trigger */}
          <button
            onClick={handleRunVerification}
            className="w-full py-2.5 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/60 transition font-bold"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Verify FRC System Rules
          </button>

          <div className="space-y-3 border-t border-slate-800/80 pt-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 px-1">FRC Component Palette</h2>
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

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 flex flex-col gap-2.5 bg-slate-950/40">
          <button onClick={clearWorkspace} className="w-full py-2 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono bg-slate-900 border border-red-500/20 text-red-400 hover:border-red-500/50 transition">
            <Trash2 className="w-3.5 h-3.5" /> Clear Canvas
          </button>
          <button onClick={handleViewCode} className="w-full py-2 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono bg-slate-900 border border-indigo-500/30 text-indigo-400 hover:text-indigo-300 transition">
            <Eye className="w-3.5 h-3.5" /> Preview Code (Python/Java/AADL)
          </button>
          <button onClick={handleExportRobotPy} className="w-full py-2.5 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/20">
            <FileCode className="w-4 h-4" /> Export robot.py (RobotPy)
          </button>
        </div>
      </aside>

      {/* Main Canvas Viewport */}
      <main className="flex-1 h-full relative bg-slate-950">
        <div className="absolute top-4 right-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-2xl flex items-center gap-4 text-xs font-mono">
          <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider border-r border-slate-800 pr-3">
            Wiring Standard:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
            <span className="text-slate-300 text-[11px]">12V Battery</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-slate-300 text-[11px]">40A High (0-19)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span className="text-slate-300 text-[11px]">15A Low (20-22)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-slate-300 text-[11px]">CAN Bus</span>
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={handleEdgeClick}
          nodeTypes={nodeTypes}
          fitView
          proOptions={proOptions}
        >
          <Background color="#334155" gap={16} size={1} />
          <Controls className="bg-slate-900! border-slate-700! fill-slate-200! [&_button]:border-slate-800! [&_button]:bg-slate-900" />
        </ReactFlow>
      </main>

      {/* Code Viewer Modal */}
      <CodeViewerModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        aadlCode={modalAadl}
        javaCode={modalJava}
        pythonCode={modalPython}
      />

      {/* System Rule Diagnostics Modal */}
      <SystemVerificationModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        report={verifyReport}
      />
    </div>
  );
}