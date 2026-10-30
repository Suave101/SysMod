import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, Node, NodeTypes, Edge, ReactFlowInstance } from '@xyflow/react';
import { useRobotStore, DEVICE_CATEGORIES, FRC_DEVICE_DEFAULTS, FRCNodeData } from './store/useRobotStore';
import { ControlHubNode } from './components/ControlHubNode';
import { StandardNode } from './components/StandardNode';
import { CodeViewerModal } from './components/CodeViewerModal';
import { AadlPanel } from './components/AadlPanel';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { generatePythonCode, generateJavaCode, generateAadlCode } from './utils/codeGenerators';
import { generateArchitectureReportHtml } from './utils/pdfGenerator';
import { useNavigate } from 'react-router-dom';
import { 
  Cpu, Plus, Layers, Trash2, Eye, Zap, Camera, Server, ArrowLeft, Save, Gauge, Wind, Radio, Activity, Battery, ShieldCheck, FileCode, Wifi, Lightbulb, Sliders, ShieldAlert, FileText, ChevronDown, LucideIcon 
} from 'lucide-react';
import '@xyflow/react/dist/style.css';

const proOptions = { hideAttribution: true };

interface HardwareStyle {
  icon: LucideIcon;
  borderColor: string;
  iconColor: string;
}

const HARDWARE_STYLES: Record<string, HardwareStyle> = {
  Battery12V: { icon: Battery, borderColor: 'border-red-500/40', iconColor: 'text-red-500' },
  MainBreaker120A: { icon: ShieldAlert, borderColor: 'border-red-600/40', iconColor: 'text-red-500' },
  PDH: { icon: Zap, borderColor: 'border-amber-500/40', iconColor: 'text-amber-500' },
  VRM: { icon: Zap, borderColor: 'border-amber-500/40', iconColor: 'text-amber-400' },
  MPM: { icon: Zap, borderColor: 'border-amber-500/40', iconColor: 'text-amber-400' },
  BuckConverter: { icon: Sliders, borderColor: 'border-sky-500/40', iconColor: 'text-sky-400' },
  roboRIO: { icon: Cpu, borderColor: 'border-indigo-500/40', iconColor: 'text-indigo-400' },
  RadioSwitch: { icon: Wifi, borderColor: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  RSL: { icon: Lightbulb, borderColor: 'border-yellow-500/40', iconColor: 'text-yellow-400' },
  CANivore: { icon: Radio, borderColor: 'border-amber-500/40', iconColor: 'text-amber-400' },
  CANHub: { icon: Radio, borderColor: 'border-amber-500/40', iconColor: 'text-amber-400' },
  KrakenX60: { icon: Activity, borderColor: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  KrakenX44: { icon: Activity, borderColor: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  Falcon500: { icon: Activity, borderColor: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  SparkMaxNEO: { icon: Zap, borderColor: 'border-orange-500/40', iconColor: 'text-orange-400' },
  NEOVortex: { icon: Zap, borderColor: 'border-orange-500/40', iconColor: 'text-orange-400' },
  NEO550: { icon: Zap, borderColor: 'border-orange-500/40', iconColor: 'text-orange-400' },
  BrushedController: { icon: Zap, borderColor: 'border-orange-500/40', iconColor: 'text-orange-400' },
  PWMServo: { icon: Zap, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  PneumaticsHub: { icon: Wind, borderColor: 'border-sky-500/40', iconColor: 'text-sky-400' },
  Compressor: { icon: Wind, borderColor: 'border-sky-500/40', iconColor: 'text-sky-400' },
  PressureSwitch: { icon: Wind, borderColor: 'border-sky-500/40', iconColor: 'text-sky-400' },
  SolenoidValve: { icon: Wind, borderColor: 'border-cyan-500/40', iconColor: 'text-cyan-400' },
  CANcoder: { icon: Gauge, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  ThroughBore: { icon: Gauge, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  Pigeon2: { icon: Radio, borderColor: 'border-rose-500/40', iconColor: 'text-rose-400' },
  NavX2: { icon: Radio, borderColor: 'border-rose-500/40', iconColor: 'text-rose-400' },
  LimitSwitch: { icon: Eye, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  BeamBreak: { icon: Eye, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  TimeOfFlight: { icon: Gauge, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  ColorSensor: { icon: Eye, borderColor: 'border-purple-500/40', iconColor: 'text-purple-400' },
  Limelight: { icon: Camera, borderColor: 'border-lime-500/40', iconColor: 'text-lime-400' },
  PhotonVision: { icon: Camera, borderColor: 'border-lime-500/40', iconColor: 'text-lime-400' },
  Coprocessor: { icon: Server, borderColor: 'border-indigo-500/40', iconColor: 'text-indigo-400' },
};

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

  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [modalAadl, setModalAadl] = useState('');
  const [modalJava, setModalJava] = useState('');
  const [modalPython, setModalPython] = useState('');

  const [isAadlPanelOpen, setIsAadlPanelOpen] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node<FRCNodeData>, Edge> | null>(null);
  const canvasRef = useRef<HTMLElement>(null);

  // Opening the panel narrows the canvas, so refit to keep the whole diagram in view
  useEffect(() => {
    if (!flowInstance || !canvasRef.current) return;
    const observer = new ResizeObserver(() => {
      observer.disconnect();
      flowInstance.fitView({ duration: 200 });
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [isAadlPanelOpen, flowInstance]);

  // PDF Modal State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfReportHtml, setPdfReportHtml] = useState('');

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

  const handleGeneratePDF = (): void => {
    const html = generateArchitectureReportHtml(nodes, edges);
    setPdfReportHtml(html);
    setIsPdfModalOpen(true);
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

          <button
            onClick={() => setIsAadlPanelOpen((isOpen) => !isOpen)}
            className="w-full py-2.5 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/60 transition font-bold"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            {isAadlPanelOpen ? 'Hide AADL & Verification' : 'Convert to AADL & Verify'}
          </button>

          <div className="space-y-3 border-t border-slate-800/80 pt-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 px-1">FRC Component Palette</h2>
            {DEVICE_CATEGORIES.map((category) => (
              <details key={category} open className="group/section space-y-1.5">
                <summary className="flex items-center justify-between px-1 py-0.5 cursor-pointer select-none text-[11px] font-mono font-bold text-indigo-300">
                  {category}
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 transition group-open/section:rotate-180" />
                </summary>
                {Object.entries(FRC_DEVICE_DEFAULTS)
                  .filter(([, device]) => device.category === category)
                  .map(([type, device]) => {
                    const style = HARDWARE_STYLES[type];
                    const ItemIcon = style.icon;
                    return (
                      <button
                        key={type}
                        onClick={() => addDevice(type)}
                        className={`w-full flex items-center justify-between p-2 rounded bg-slate-950 hover:bg-slate-800 border ${style.borderColor} text-left transition group`}
                      >
                        <div className="flex items-center gap-2">
                          <ItemIcon className={`w-3.5 h-3.5 ${style.iconColor}`} />
                          <span className="text-xs font-mono text-slate-300">{device.label}</span>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition" />
                      </button>
                    );
                  })}
              </details>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex flex-col gap-2 bg-slate-950/40">
          <button onClick={clearWorkspace} className="w-full py-1.5 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono bg-slate-900 border border-red-500/20 text-red-400 hover:border-red-500/50 transition">
            <Trash2 className="w-3.5 h-3.5" /> Clear Canvas
          </button>
          <button onClick={handleGeneratePDF} className="w-full py-2 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono font-bold bg-sky-950/60 border border-sky-500/40 text-sky-300 hover:bg-sky-900/60 transition shadow-md">
            <FileText className="w-3.5 h-3.5 text-sky-400" /> Export PDF / BOM Spec
          </button>
          <button onClick={handleExportRobotPy} className="w-full py-2.5 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/20">
            <FileCode className="w-4 h-4" /> Export robot.py (RobotPy)
          </button>
        </div>
      </aside>

      <main ref={canvasRef} className="flex-1 min-w-0 h-full relative bg-slate-950">
        <div className="absolute top-4 right-4 z-20 max-w-[calc(100%-2rem)] bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-2xl flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-mono">
          <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider border-r border-slate-800 pr-3">
            Wiring Standards:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
            <span className="text-slate-300 text-[11px]">120A Main Bus</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span className="text-slate-300 text-[11px]">Regulated Power</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-slate-300 text-[11px]">CAN Bus</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
            <span className="text-slate-300 text-[11px]">CAN FD</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <span className="text-slate-300 text-[11px]">RSL Signal</span>
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={handleEdgeClick}
          onInit={setFlowInstance}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          proOptions={proOptions}
        >
          <Background color="#334155" gap={16} size={1} />
          <Controls className="bg-slate-900! border-slate-700! fill-slate-200! [&_button]:border-slate-800! [&_button]:bg-slate-900" />
        </ReactFlow>
      </main>

      {isAadlPanelOpen && (
        <AadlPanel nodes={nodes} edges={edges} onClose={() => setIsAadlPanelOpen(false)} />
      )}

      <CodeViewerModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        aadlCode={modalAadl}
        javaCode={modalJava}
        pythonCode={modalPython}
      />

      {/* Embedded In-App PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        htmlContent={pdfReportHtml}
      />
    </div>
  );
}