import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Background, Connection, Controls, Edge, Node, NodeTypes, OnConnectEnd, ReactFlow, ReactFlowInstance } from '@xyflow/react';
import { connectionProblem } from '../utils/connectionRules';
import { Ban, Check, ChevronDown, ChevronRight, Copy, Download, Loader2, Play, ShieldCheck } from 'lucide-react';
import { FRCNodeData, FRC_DEVICE_DEFAULTS, useRobotStore } from '../store/useRobotStore';
import { ControlHubNode } from '../components/ControlHubNode';
import { StandardNode } from '../components/StandardNode';
import { beforeMonacoMount, EDITOR_OPTIONS } from '../utils/monacoLanguages';
import { getStandardDeviceContract, getStandardSystemContract, SYSTEM_SCOPE } from '../utils/agree/frcContracts';
import { scopeLabel, WorkbenchModel } from './useWorkbenchModel';
import { AlertToasts, issuesByNode, NodeAlertsProvider, withNodeAlerts } from './HardwareAlerts';
import type { VerificationIssue } from '../utils/systemVerifier';
import '@xyflow/react/dist/style.css';

const proOptions = { hideAttribution: true };

export const EDITOR_PANE_OPTIONS = { ...EDITOR_OPTIONS, fontSize: 13, minimap: { enabled: true, scale: 1 } };
const CONTRACT_EDITOR_OPTIONS = { ...EDITOR_PANE_OPTIONS, readOnly: false, contextmenu: true, minimap: { enabled: false } };
const STANDARD_EDITOR_OPTIONS = { ...EDITOR_PANE_OPTIONS, minimap: { enabled: false }, scrollBeyondLastLine: false, renderLineHighlight: 'none' as const };

const EditorLoading: React.FC = () => (
  <div className="flex items-center justify-center h-full bg-slate-950">
    <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
      Loading editor...
    </div>
  </div>
);

/** The strip under the tabs that says where you are, like VS Code's breadcrumbs */
const Breadcrumbs: React.FC<{ parts: string[]; actions?: React.ReactNode }> = ({ parts, actions }) => (
  <div className="h-8 shrink-0 flex items-center justify-between px-3 border-b border-slate-800 bg-slate-900/60">
    <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 min-w-0">
      {parts.map((part, idx) => (
        <React.Fragment key={part}>
          {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
          <span className={`truncate ${idx === parts.length - 1 ? 'text-slate-200' : ''}`}>{part}</span>
        </React.Fragment>
      ))}
    </div>
    <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
  </div>
);

const ToolbarButton: React.FC<{ onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean; disabled?: boolean }> = ({
  onClick, icon, label, primary, disabled,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono transition border disabled:opacity-50 disabled:cursor-not-allowed ${
      primary ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500' : 'text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700'
    }`}
  >
    {icon}
    {label}
  </button>
);

// ── Architecture diagram ──

interface DiagramEditorProps {
  isVisible: boolean;
  layoutKey: string;
  issues: VerificationIssue[];
}

// Wrapped once, outside render, so React Flow never sees new node types
const NODE_TYPES: NodeTypes = { ControlHub: withNodeAlerts(ControlHubNode), StandardNode: withNodeAlerts(StandardNode) };

export const DiagramEditor: React.FC<DiagramEditorProps> = ({ isVisible, layoutKey, issues }) => {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, removeEdge } = useRobotStore();
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node<FRCNodeData>, Edge> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const alertsByNode = useMemo(() => issuesByNode(issues), [issues]);

  const showOnDiagram = (issue: VerificationIssue): void => {
    if (!flowInstance || !issue.nodeIds?.length) return;
    flowInstance.fitView({ nodes: issue.nodeIds.map((id) => ({ id })), duration: 400, padding: 0.5, maxZoom: 1.2 });
  };

  // Opening or closing a side bar or panel resizes the canvas, so refit once it settles
  useEffect(() => {
    if (!flowInstance || !canvasRef.current || !isVisible) return;
    const observer = new ResizeObserver(() => {
      observer.disconnect();
      flowInstance.fitView({ duration: 200 });
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [layoutKey, flowInstance, isVisible]);

  const handleEdgeClick = (_: React.MouseEvent, edge: Edge): void => {
    if (window.confirm(`Delete connection "${edge.label || 'Wire'}"?`)) removeEdge(edge.id);
  };

  // Impossible wires, like power into a CAN port, won't snap to the handle while you drag
  const isValidConnection = useCallback((c: Connection | Edge): boolean => !connectionProblem(c, nodes, edges), [nodes, edges]);

  // ...and when you let go over one, say why
  const [refusal, setRefusal] = useState<string>();
  const handleConnectEnd: OnConnectEnd = (_event, state) => {
    const { fromHandle, toHandle } = state;
    if (state.isValid !== false || !fromHandle || !toHandle) return;
    const [start, end] = fromHandle.type === 'source' ? [fromHandle, toHandle] : [toHandle, fromHandle];
    const reason = connectionProblem({ source: start.nodeId, sourceHandle: start.id ?? null, target: end.nodeId, targetHandle: end.id ?? null }, nodes, edges);
    if (reason) setRefusal(reason);
  };
  useEffect(() => {
    if (!refusal) return;
    const timer = setTimeout(() => setRefusal(undefined), 4000);
    return () => clearTimeout(timer);
  }, [refusal]);

  return (
    <div ref={canvasRef} className="relative w-full h-full bg-slate-950">
      <div className="absolute top-3 right-3 z-20 max-w-[calc(100%-1.5rem)] bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg px-3 py-2 shadow-2xl flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
        <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider border-r border-slate-800 pr-3">Wiring</span>
        {[
          ['bg-red-600', '120A Main Bus'],
          ['bg-sky-400', 'Regulated Power'],
          ['bg-amber-400', 'CAN Bus'],
          ['bg-amber-600', 'CAN FD'],
          ['bg-yellow-400', 'RSL Signal'],
        ].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
            <span className="text-slate-300 text-[11px]">{label}</span>
          </div>
        ))}
      </div>

      <NodeAlertsProvider value={alertsByNode}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onConnectEnd={handleConnectEnd}
          onEdgeClick={handleEdgeClick}
          onInit={setFlowInstance}
          nodeTypes={NODE_TYPES}
          fitView
          minZoom={0.2}
          proOptions={proOptions}
        >
          <Background color="#334155" gap={16} size={1} />
          <Controls className="bg-slate-900! border-slate-700! fill-slate-200! [&_button]:border-slate-800! [&_button]:bg-slate-900" />
        </ReactFlow>
      </NodeAlertsProvider>

      {refusal && (
        <div role="alert" className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/60 bg-red-950/95 text-red-100 text-xs font-mono shadow-2xl max-w-[90%]">
          <Ban className="w-4 h-4 shrink-0 text-red-400" />
          {refusal}
        </div>
      )}

      {isVisible && <AlertToasts issues={issues} onShow={showOnDiagram} />}
    </div>
  );
};

// ── Generated files (read only): the AADL model, robot.py and Robot.java ──

/** A file SysMod generates from the diagram, shown as a read-only editor tab */
export interface GeneratedFile {
  fileName: string;
  language: string;
  folder: string;
  description: string;
}

export const GENERATED_FILES = {
  aadl: { fileName: 'FRC_Robot_Architecture.aadl', language: 'aadl', folder: 'Model', description: 'AADL model' },
  python: { fileName: 'robot.py', language: 'python', folder: 'Robot code', description: 'RobotPy (Python)' },
  java: { fileName: 'Robot.java', language: 'java', folder: 'Robot code', description: 'WPILib (Java)' },
} satisfies Record<string, GeneratedFile>;

export type GeneratedFileId = keyof typeof GENERATED_FILES;

/**
 * Saves a generated file. In the desktop app this opens a native save dialog; in a browser it
 * downloads the file.
 */
export async function saveGeneratedFile(file: GeneratedFile, content: string): Promise<void> {
  const extension = file.fileName.split('.').pop() as string;
  if (window.sysmodAPI?.saveTextFile) {
    await window.sysmodAPI.saveTextFile(content, { defaultName: file.fileName, extension, description: file.description });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadAadl = (aadl: string): Promise<void> => saveGeneratedFile(GENERATED_FILES.aadl, aadl);

export const GeneratedFileEditor: React.FC<{ file: GeneratedFile; content: string }> = ({ file, content }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <Breadcrumbs
        parts={[file.folder, file.fileName]}
        actions={
          <>
            <span className="text-[10px] font-mono text-slate-500 mr-1">Generated from the diagram · read only</span>
            <ToolbarButton onClick={handleCopy} icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} label={copied ? 'Copied!' : 'Copy'} />
            <ToolbarButton onClick={() => saveGeneratedFile(file, content)} icon={<Download className="w-3.5 h-3.5" />} label={`Save ${file.fileName}`} />
          </>
        }
      />
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={file.language}
          value={content}
          theme="sysmod-dark"
          beforeMount={beforeMonacoMount}
          options={EDITOR_PANE_OPTIONS}
          loading={<EditorLoading />}
          path={`generated/${file.fileName}`}
        />
      </div>
    </div>
  );
};

// ── AGREE contract editor ──

const CUSTOM_CONTRACT_HINT = `-- Write your own AGREE contract for every component of this type. For example:
-- guarantee "Never draws power above 13 V" : pwr_12v_in <= 13.0;
`;

const SYSTEM_CONTRACT_HINT = `-- System lemmas refer to components by id. For example:
-- lemma "Motor never browns out" : krakenx601.pwr_12v_in >= 6.8;
`;

interface ContractEditorProps {
  scope: string;
  model: WorkbenchModel;
  onProve: () => void;
}

export const ContractEditor: React.FC<ContractEditorProps> = ({ scope, model, onProve }) => {
  const customContracts = useRobotStore((state) => state.customContracts);
  const setCustomContract = useRobotStore((state) => state.setCustomContract);
  const [showStandard, setShowStandard] = useState(true);
  const editorRef = useRef<Parameters<OnMount>[0] | undefined>(undefined);
  const monacoRef = useRef<Parameters<OnMount>[1] | undefined>(undefined);
  const [isMounted, setIsMounted] = useState(false);

  const standardText = scope === SYSTEM_SCOPE ? getStandardSystemContract(model.nodes, model.edges) : getStandardDeviceContract(scope);
  const errors = model.program.errors.filter((e) => e.scope === `${scope}: Your contract`);
  const standardLines = (standardText || '').split('\n').length;

  // Squiggles under the lines with errors, as in any code editor
  useEffect(() => {
    const editor = editorRef.current;
    const monacoApi = monacoRef.current;
    const editorModel = editor?.getModel();
    if (!editorModel || !monacoApi) return;
    monacoApi.editor.setModelMarkers(
      editorModel,
      'agree',
      errors.map((e) => {
        const line = Math.min(Math.max(e.line, 1), editorModel.getLineCount());
        return {
          severity: monacoApi.MarkerSeverity.Error,
          message: e.message,
          startLineNumber: line,
          endLineNumber: line,
          startColumn: editorModel.getLineFirstNonWhitespaceColumn(line) || 1,
          endColumn: editorModel.getLineMaxColumn(line),
        };
      }),
    );
  }, [errors, isMounted]);

  const handleMount: OnMount = (editor, monacoApi) => {
    editorRef.current = editor;
    monacoRef.current = monacoApi;
    setIsMounted(true);
  };

  return (
    <div className="flex flex-col h-full">
      <Breadcrumbs
        parts={['AGREE Contracts', `${scopeLabel(scope, FRC_DEVICE_DEFAULTS)}.agree`]}
        actions={
          <ToolbarButton
            onClick={onProve}
            disabled={model.proof.proving || model.program.obligations.length === 0}
            primary
            icon={model.proof.proving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            label={model.proof.proving ? 'Proving...' : 'Prove'}
          />
        }
      />

      <div className="shrink-0 border-b border-slate-800">
        <button
          onClick={() => setShowStandard((v) => !v)}
          aria-expanded={showStandard}
          className="w-full flex items-center gap-1.5 px-3 h-7 text-[11px] font-mono font-bold text-emerald-300 bg-slate-900/40"
        >
          {showStandard ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <ShieldCheck className="w-3.5 h-3.5" /> FRC standard contract
          <span className="font-normal text-slate-500">· built in, read only</span>
        </button>
        {showStandard &&
          (standardText ? (
            <div style={{ height: Math.min(standardLines, 14) * 19 + 16 }}>
              <Editor height="100%" language="agree" value={standardText} theme="sysmod-dark" beforeMount={beforeMonacoMount} options={STANDARD_EDITOR_OPTIONS} loading={<EditorLoading />} />
            </div>
          ) : (
            <p className="px-8 py-2 text-[11px] font-mono text-slate-500">-- No standard contract for this scope.</p>
          ))}
      </div>

      <div className="shrink-0 flex items-center gap-1.5 px-3 h-7 text-[11px] font-mono font-bold text-indigo-300 bg-slate-900/40 border-b border-slate-800">
        Your contract
        {errors.length > 0 && <span className="font-normal text-red-400">· {errors.length} error{errors.length === 1 ? '' : 's'}</span>}
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="agree"
          path={`contracts/${scope}.agree`}
          value={customContracts[scope] ?? (scope === SYSTEM_SCOPE ? SYSTEM_CONTRACT_HINT : CUSTOM_CONTRACT_HINT)}
          onChange={(value) => setCustomContract(scope, value || '')}
          onMount={handleMount}
          theme="sysmod-dark"
          beforeMount={beforeMonacoMount}
          options={CONTRACT_EDITOR_OPTIONS}
          loading={<EditorLoading />}
        />
      </div>
    </div>
  );
};
