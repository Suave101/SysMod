import React, { useCallback, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Node, Edge } from '@xyflow/react';
import { AlertTriangle, Check, Copy, Download, FileText, Info, Loader2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { FRCNodeData } from '../store/useRobotStore';
import { generateAadlCode } from '../utils/codeGenerators';
import { verifySystemProperties } from '../utils/systemVerifier';
import { beforeMonacoMount, EDITOR_OPTIONS } from './CodeViewerModal';

interface AadlPanelProps {
  nodes: Node<FRCNodeData>[];
  edges: Edge[];
  onClose: () => void;
}

const PANEL_EDITOR_OPTIONS = {
  ...EDITOR_OPTIONS,
  fontSize: 12,
  minimap: { enabled: false },
  lineNumbers: 'off' as const,
  padding: { top: 12, bottom: 12 },
};

export const AadlPanel: React.FC<AadlPanelProps> = ({ nodes, edges, onClose }) => {
  const [copied, setCopied] = useState(false);

  // Both results stay in sync with the diagram while the panel is open
  const aadlCode = useMemo(() => generateAadlCode(nodes, edges), [nodes, edges]);
  const report = useMemo(() => verifySystemProperties(nodes, edges), [nodes, edges]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(aadlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [aadlCode]);

  const handleDownload = useCallback(() => {
    const url = URL.createObjectURL(new Blob([aadlCode], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'FRC_Robot_Architecture.aadl';
    a.click();
    URL.revokeObjectURL(url);
  }, [aadlCode]);

  return (
    <aside className="w-[480px] shrink-0 h-full border-l border-slate-800 bg-slate-900 flex flex-col z-10 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          <h2 className="font-mono font-bold text-slate-100 text-sm">AADL Model</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition border ${
              copied
                ? 'text-green-400 bg-green-400/10 border-green-400/30'
                : 'text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition border text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700"
          >
            <Download className="w-3.5 h-3.5" /> Save .aadl
          </button>
          <button onClick={onClose} title="Close" className="p-1 rounded text-slate-500 hover:text-slate-100 hover:bg-slate-800 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* AADL Source */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="aadl"
          value={aadlCode}
          theme="sysmod-dark"
          beforeMount={beforeMonacoMount}
          options={PANEL_EDITOR_OPTIONS}
          loading={
            <div className="flex items-center justify-center h-full bg-slate-950">
              <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                Loading Monaco Editor...
              </div>
            </div>
          }
        />
      </div>

      {/* FRC System Verification */}
      <div className="h-[42%] shrink-0 flex flex-col border-t border-slate-800">
        <div className={`px-4 py-2.5 border-b flex items-center gap-2.5 shrink-0 ${
          report.passed ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-red-950/40 border-red-500/30'
        }`}>
          {report.passed ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-red-500" />
          )}
          <div>
            <h2 className="text-xs font-mono font-bold text-slate-100">FRC System Verification</h2>
            <span className={`text-[11px] font-mono font-semibold ${report.passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {report.passed ? 'PASS: FRC Rules Compliant' : 'FAIL: Rule Violations Detected'} ({report.score}% Score)
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-2">
          {report.issues.length === 0 ? (
            <div className="text-center py-6 text-slate-400 font-mono text-xs">
              🎉 All system properties verified! CAN Bus is properly terminated and power routing complies with FRC rules.
            </div>
          ) : (
            report.issues.map((issue) => (
              <div
                key={issue.id}
                className={`p-2.5 rounded-lg border flex gap-2.5 ${
                  issue.severity === 'error'
                    ? 'bg-red-950/30 border-red-500/30 text-red-200'
                    : issue.severity === 'warning'
                    ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                    : 'bg-indigo-950/30 border-indigo-500/30 text-indigo-200'
                }`}
              >
                {issue.severity === 'error' ? (
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                ) : issue.severity === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-mono text-xs font-bold">{issue.title}</h4>
                  <p className="text-[11px] mt-0.5 text-slate-300 font-sans">{issue.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
};
