import React, { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, NodeTypes } from '@xyflow/react';
import { useRobotStore } from './store/useRobotStore';
import { ControlHubNode } from './components/ControlHubNode';
import { CodeViewerModal } from './components/CodeViewerModal';
import { generateJavaCode, generateAadlCode } from './utils/codeGenerators';
import { Cpu, Plus, FileCode, Layers, Trash2, Eye, Zap, Settings, Camera, Server } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { StandardNode } from './components/StandardNode';

const proOptions = { hideAttribution: true };

export default function App(): React.JSX.Element {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addDevice, clearWorkspace } = useRobotStore();

  const nodeTypes = useMemo<NodeTypes>(() => ({
    ControlHub: ControlHubNode,
    StandardNode: StandardNode,
  }), []);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [modalAadl, setModalAadl] = useState('');
  const [modalJava, setModalJava] = useState('');

  // ── Open code viewer ──────────────────────────────────────────────────────
  const handleViewCode = (): void => {
    setModalAadl(generateAadlCode(nodes, edges));
    setModalJava(generateJavaCode(nodes, edges));
    setIsCodeModalOpen(true);
  };

  // ── Export Java to disk via native save dialog ────────────────────────────
  const handleExportHardwareCode = async (): Promise<void> => {
    const code = generateJavaCode(nodes, edges);
    try {
      const response = await window.sysmodAPI.saveJavaFile(code);
      if (response.success && response.filePath) {
        alert(`Configuration saved successfully to:\n${response.filePath}`);
      }
    } catch (error) {
      console.error('IPC IO failure:', error);
      alert('Critical Error: Failed to write file payload over native runtime bridge.');
    }
  };

  return (
    <div className="flex w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar Interface Components */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col justify-between z-10 shadow-2xl">
        <div className="p-4 space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
            <Layers className="text-amber-500 w-6 h-6" />
            <div>
              <h1 className="text-lg font-mono font-black tracking-tight text-slate-100">SysMod Studio</h1>
              <p className="text-[10px] text-slate-400 font-sans tracking-widest uppercase">FTC Subsystem Modeler</p>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 px-1">Hardware Blueprinting Components</h2>
            <div className="space-y-2">

              {/* ── Controllers ── */}
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest px-1 pt-1">Controllers</p>
              <button
                onClick={() => addDevice('ControlHub')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-amber-500/30 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-mono text-slate-300">REV Control Hub</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-500 transition" />
              </button>

              {/* ── Actuators ── */}
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest px-1 pt-1">Actuators</p>
              <button
                onClick={() => addDevice('DcMotor')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-amber-500/20 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-mono text-slate-300">DC Motor (Ex)</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition" />
              </button>

              <button
                onClick={() => addDevice('Servo')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-rose-500/20 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-rose-400" />
                  <span className="text-xs font-mono text-slate-300">Standard Servo</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 transition" />
              </button>

              {/* ── Sensors & Vision ── */}
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest px-1 pt-1">Sensors &amp; Vision</p>
              <button
                onClick={() => addDevice('ColorSensor')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-cyan-500/30 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono text-slate-300">I2C Color Sensor</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition" />
              </button>

              <button
                onClick={() => addDevice('Webcam')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-indigo-500/20 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-mono text-slate-300">USB Webcam</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition" />
              </button>

              {/* ── Compute ── */}
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest px-1 pt-1">Compute</p>
              <button
                onClick={() => addDevice('Coprocessor')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-indigo-500/30 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-mono text-slate-300">Linux Coprocessor</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition" />
              </button>

            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 space-y-2 bg-slate-950/40">
          <button 
            onClick={clearWorkspace}
            className="w-full py-2 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono bg-slate-900 border border-red-500/20 hover:border-red-500/50 text-red-400 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Canvas
          </button>

          <button
            onClick={handleViewCode}
            className="w-full py-2.5 px-3 rounded flex items-center justify-center gap-2 text-xs font-mono bg-slate-900 border border-cyan-500/30 hover:border-cyan-400/60 text-cyan-400 hover:text-cyan-300 transition"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview Code
          </button>

          <button 
            onClick={handleExportHardwareCode}
            disabled={nodes.length === 0}
            className="w-full py-3 px-4 rounded flex items-center justify-center gap-2 text-sm font-mono bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-transparent transition shadow-lg shadow-amber-500/10"
          >
            <FileCode className="w-4 h-4" />
            Export Code to OS
          </button>
        </div>
      </aside>

      {/* Main Canvas Workspace Viewport */}
      <main className="flex-1 h-full relative bg-slate-950">
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

      {/* Code Viewer Modal */}
      <CodeViewerModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        aadlCode={modalAadl}
        javaCode={modalJava}
      />
    </div>
  );
}