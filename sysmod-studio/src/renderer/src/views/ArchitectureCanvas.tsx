import React, { useMemo, useState, useEffect } from 'react';
import { ReactFlow, Background, Controls, NodeTypes } from '@xyflow/react';
import { useRobotStore } from './store/useRobotStore';
import { ControlHubNode } from './components/ControlHubNode';
import { CodeViewerModal } from './components/CodeViewerModal';
import { generateJavaCode, generateAadlCode } from './utils/codeGenerators';
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
  AlertCircle, 
  ShieldAlert 
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { StandardNode } from './components/StandardNode';
import { useNavigate } from 'react-router-dom';
import { PriceEditorModal } from './components/PriceEditorModal';

const proOptions = { hideAttribution: true };

// Helper to reliably resolve a node's pricing key from its attributes or visual data tags
const getHardwareType = (node: any, deviceCosts: Record<string, number>): string => {
  // 1. Check top-level node type (e.g. if node.type is 'ControlHub')
  if (node.type && deviceCosts[node.type] !== undefined) {
    return node.type;
  }
  
  // 2. Check metadata inside node.data where store configurations often track specific models
  const dataProps = ['type', 'deviceType', 'hardwareType', 'subType', 'kind'];
  for (const prop of dataProps) {
    const val = node.data?.[prop];
    if (val && deviceCosts[val] !== undefined) {
      return val;
    }
  }

  // 3. Fuzzy matching search against node labels (e.g. "DC Motor (Ex)" -> "DcMotor")
  const label = node.data?.label;
  if (typeof label === 'string') {
    const cleanLabel = label.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const key of Object.keys(deviceCosts)) {
      const cleanKey = key.toLowerCase();
      if (cleanLabel.includes(cleanKey) || cleanKey.includes(cleanLabel)) {
        return key;
      }
    }
  }

  return '';
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
    clearWorkspace,
    setNodes,
    setEdges 
  } = useRobotStore();

  const [deviceCosts, setDeviceCosts] = useState<Record<string, number>>({
    ControlHub: 359.00,
    DcMotor: 35.00,
    Servo: 15.00,
    ColorSensor: 25.00,
    Webcam: 35.00,
    Coprocessor: 80.00,
  });
  
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

  // Custom UI Alert State for Budget Limit Warnings
  const [budgetViolation, setBudgetViolation] = useState<{
    isOpen: boolean;
    deviceName: string;
    deviceCost: number;
    projectedTotal: number;
    limit: number;
  }>({
    isOpen: false,
    deviceName: '',
    deviceCost: 0,
    projectedTotal: 0,
    limit: 0
  });

  // ── States & Workspace Budgets ─────────────────────────────────────────────
  const [spendingLimit, setSpendingLimit] = useState<number>(0);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [modalAadl, setModalAadl] = useState('');
  const [modalJava, setModalJava] = useState('');

  // ── 2. Hydrate Canvas & Budget from Workspace JSON on Mount ────────────────
  useEffect(() => {
    const loadSavedWorkspace = async () => {
      let savedData: any = null;
      if (window.electronAPI && window.electronAPI.loadData) {
        savedData = await window.electronAPI.loadData();
      } else {
        const local = localStorage.getItem('workspace-data');
        if (local) savedData = JSON.parse(local);
      }

      if (savedData) {
        // Enforce existing custom costs
        if (savedData.deviceCosts) {
          setDeviceCosts(savedData.deviceCosts);
        }
        // Enforce existing nodes/edges configuration
        if (savedData.nodes && typeof setNodes === 'function') {
          setNodes(savedData.nodes);
        }
        if (savedData.edges && typeof setEdges === 'function') {
          setEdges(savedData.edges);
        }
        // Extract original spending limit from Design Brief / Brainstorming
        if (savedData.spendingLimit) {
          setSpendingLimit(parseFloat(savedData.spendingLimit) || 0);
        }
      }
    };

    loadSavedWorkspace();
  }, [setNodes, setEdges]);

  // ── 3. Calculate Current Canvas Total Hardware Cost ────────────────────────
  const currentTotalCost = useMemo(() => {
    return nodes.reduce((total, node) => {
      const type = getHardwareType(node, deviceCosts);
      const cost = deviceCosts[type] || 0;
      return total + cost;
    }, 0);
  }, [nodes, deviceCosts]);

  // ── 4. Intercept & Validate Device Addition (Budget Guard) ────────────────
  const handleAddDevice = (type: string) => {
    const cost = deviceCosts[type] || 0;
    
    // Check if the next action exceeds budget constraints
    if (spendingLimit > 0 && (currentTotalCost + cost) > spendingLimit) {
      setBudgetViolation({
        isOpen: true,
        deviceName: type,
        deviceCost: cost,
        projectedTotal: currentTotalCost + cost,
        limit: spendingLimit
      });
      return;
    }
    
    // Add component if under budget
    addDevice(type);
  };

  // Save changes seamlessly back to JSON
  const saveWorkspaceData = async (
    currentNodes = nodes, 
    currentEdges = edges, 
    currentCosts = deviceCosts
  ) => {
    let existingData: any = {};
    if (window.electronAPI && window.electronAPI.loadData) {
      existingData = await window.electronAPI.loadData() || {};
    } else {
      const local = localStorage.getItem('workspace-data');
      if (local) existingData = JSON.parse(local);
    }

    const payload = {
      ...existingData,
      nodes: currentNodes,
      edges: currentEdges,
      deviceCosts: currentCosts
    };

    if (window.electronAPI && window.electronAPI.saveData) {
      await window.electronAPI.saveData(payload);
    } else {
      localStorage.setItem('workspace-data', JSON.stringify(payload));
    }
  };

  // Auto-save changes
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      saveWorkspaceData(nodes, edges, deviceCosts);
    }
  }, [nodes, edges, deviceCosts]);

  const handleBackToBrainstorming = async () => {
    await saveWorkspaceData(nodes, edges, deviceCosts);
    navigate('/brainstorming');
  };

  const handleManualSave = async () => {
    await saveWorkspaceData(nodes, edges, deviceCosts);
    alert('Architecture configuration saved successfully to your system JSON workspace!');
  };

  const nodeTypes = useMemo<NodeTypes>(() => ({
    ControlHub: ControlHubNode,
    StandardNode: StandardNode,
  }), []);

  const handleViewCode = (): void => {
    setModalAadl(generateAadlCode(nodes, edges));
    setModalJava(generateJavaCode(nodes, edges));
    setIsCodeModalOpen(true);
  };

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
        <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-160px)]">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
            <Layers className="text-amber-500 w-6 h-6" />
            <div>
              <h1 className="text-lg font-mono font-black tracking-tight text-slate-100">SysMod Studio</h1>
              <p className="text-[10px] text-slate-400 font-sans tracking-widest uppercase">FTC Subsystem Modeler</p>
            </div>
          </div>

          {/* Navigation & Multi-Page Core Sync Buttons */}
          <div className="grid grid-cols-2 gap-2 pb-2">
            <button
              onClick={handleBackToBrainstorming}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[11px] font-mono font-bold transition text-slate-300"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              onClick={handleManualSave}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-500/30 hover:border-indigo-500/50 text-[11px] font-mono font-bold transition text-indigo-300"
            >
              <Save className="w-3.5 h-3.5" /> Save JSON
            </button>
          </div>

          {/* Dynamic Price Editor Trigger Action */}
          <button
            onClick={() => setIsPriceModalOpen(true)}
            className="w-full py-2 px-3 rounded bg-slate-950 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-[11px] font-mono font-bold transition text-slate-300 flex items-center justify-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" /> Configure Unit Costs
          </button>

          {/* ── 5. System Hardware Budget Widget ── */}
          {spendingLimit > 0 && (
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">Hardware Margin</span>
                <span className={`text-xs font-mono font-bold ${currentTotalCost > spendingLimit ? 'text-red-400' : 'text-emerald-400'}`}>
                  ${currentTotalCost.toFixed(2)} / ${spendingLimit.toFixed(2)}
                </span>
              </div>
              
              {/* Progress Bar Visualizer */}
              <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    (currentTotalCost / spendingLimit) > 0.9 
                      ? 'bg-red-500' 
                      : (currentTotalCost / spendingLimit) > 0.7 
                      ? 'bg-amber-500' 
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min((currentTotalCost / spendingLimit) * 100, 100)}%` }}
                />
              </div>
              
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>Remaining:</span>
                <span className={(spendingLimit - currentTotalCost) < 50 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                  ${(spendingLimit - currentTotalCost).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-3 border-t border-slate-800/80 pt-4">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 px-1">Hardware Blueprinting Components</h2>
            <div className="space-y-2">

              {/* ── Controllers ── */}
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest px-1 pt-1">Controllers</p>
              <button
                onClick={() => handleAddDevice('ControlHub')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-amber-500/30 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-mono text-slate-300">REV Control Hub (${(deviceCosts.ControlHub || 0).toFixed(2)})</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-500 transition" />
              </button>

              {/* ── Actuators ── */}
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest px-1 pt-1">Actuators</p>
              <button
                onClick={() => handleAddDevice('DcMotor')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-amber-500/20 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-mono text-slate-300">DC Motor (Ex) (${(deviceCosts.DcMotor || 0).toFixed(2)})</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition" />
              </button>

              <button
                onClick={() => handleAddDevice('Servo')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-rose-500/20 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-rose-400" />
                  <span className="text-xs font-mono text-slate-300">Standard Servo (${(deviceCosts.Servo || 0).toFixed(2)})</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 transition" />
              </button>

              {/* ── Sensors & Vision ── */}
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest px-1 pt-1">Sensors &amp; Vision</p>
              <button
                onClick={() => handleAddDevice('ColorSensor')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-cyan-500/30 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono text-slate-300">I2C Color Sensor (${(deviceCosts.ColorSensor || 0).toFixed(2)})</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition" />
              </button>

              <button
                onClick={() => handleAddDevice('Webcam')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-indigo-500/20 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-mono text-slate-300">USB Webcam (${(deviceCosts.Webcam || 0).toFixed(2)})</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition" />
              </button>

              {/* ── Compute ── */}
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest px-1 pt-1">Compute</p>
              <button
                onClick={() => handleAddDevice('Coprocessor')}
                className="w-full flex items-center justify-between p-2.5 rounded bg-slate-950 hover:bg-slate-800 border border-indigo-500/30 text-left transition duration-150 group"
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-mono text-slate-300">Linux Coprocessor (${(deviceCosts.Coprocessor || 0).toFixed(2)})</span>
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

      {/* Price Editor Modal */}
      <PriceEditorModal
        isOpen={isPriceModalOpen}
        onClose={() => setIsPriceModalOpen(false)}
        deviceCosts={deviceCosts}
        onSave={(updatedCosts) => {
          setDeviceCosts(updatedCosts);
          saveWorkspaceData(nodes, edges, updatedCosts);
        }}
      />

      {/* ── Custom UI Budget Violation Modal (Replaced Browser Alert) ── */}
      {budgetViolation.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Glassmorphic Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300" 
            onClick={() => setBudgetViolation(prev => ({ ...prev, isOpen: false }))}
          />

          {/* Modal Content container */}
          <div className="relative w-full max-w-md bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl shadow-red-950/20 overflow-hidden z-10 flex flex-col transform transition-all duration-300 scale-100">
            {/* Warning visual indicator strip */}
            <div className="h-1 bg-gradient-to-r from-red-500 via-amber-500 to-red-500" />
            
            <div className="p-6 flex flex-col items-center text-center">
              {/* Alert Icon Shield */}
              <div className="w-14 h-14 rounded-full bg-red-950/40 border border-red-500/20 flex items-center justify-center mb-4 text-red-500 shadow-lg shadow-red-950/30 animate-pulse">
                <ShieldAlert className="w-7 h-7" />
              </div>

              <h3 className="text-sm font-mono font-bold uppercase tracking-widest text-red-400">
                Budget Limit Exceeded
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs font-sans">
                Adding this hardware unit crosses your established design envelope boundary.
              </p>

              {/* Cost Math Visual Cards */}
              <div className="w-full mt-6 bg-slate-950/80 rounded-xl border border-slate-800/80 p-4 space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Attempted Component</span>
                  <span className="font-mono font-bold text-slate-200">
                    {budgetViolation.deviceName} (+${budgetViolation.deviceCost.toFixed(2)})
                  </span>
                </div>

                <hr className="border-slate-800/60" />

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Current Canvas Total</span>
                    <span className="font-mono text-slate-400">${currentTotalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Projected Build Cost</span>
                    <span className="font-mono text-red-400 font-semibold">${budgetViolation.projectedTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Workspace Budget Limit</span>
                    <span className="font-mono text-emerald-400 font-semibold">${budgetViolation.limit.toFixed(2)}</span>
                  </div>
                </div>

                {/* Progress bar overlay representation */}
                <div className="pt-2">
                  <div className="relative w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className="absolute left-0 top-0 h-full bg-emerald-500" 
                      style={{ width: `${Math.min((currentTotalCost / budgetViolation.limit) * 100, 100)}%` }}
                    />
                    <div 
                      className="absolute left-0 top-0 h-full bg-red-500" 
                      style={{ 
                        left: `${Math.min((currentTotalCost / budgetViolation.limit) * 100, 100)}%`, 
                        width: `${Math.max(0, Math.min(((budgetViolation.projectedTotal - currentTotalCost) / budgetViolation.limit) * 100, 100 - (currentTotalCost / budgetViolation.limit) * 100))}%` 
                      }}
                    />
                  </div>
                  <div className="flex justify-end text-[9px] font-mono text-red-400/90 mt-1.5">
                    Overage Margin: +${(budgetViolation.projectedTotal - budgetViolation.limit).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Call-to-actions */}
              <div className="w-full mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setBudgetViolation(prev => ({ ...prev, isOpen: false }));
                    setIsPriceModalOpen(true);
                  }}
                  className="py-2.5 px-4 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200 font-mono text-[10px] font-bold transition duration-150"
                >
                  Adjust Unit Costs
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetViolation(prev => ({ ...prev, isOpen: false }))}
                  className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-[10px] font-bold shadow-lg shadow-red-600/10 hover:shadow-red-600/20 transition duration-150"
                >
                  Acknowledge Warning
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}