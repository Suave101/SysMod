import React, { useCallback, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Node, Edge } from '@xyflow/react';
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, Download, FileText, HelpCircle, Info, Loader2, Play, ShieldAlert,
  ShieldCheck, Sigma, X, XCircle,
} from 'lucide-react';
import { FRCNodeData, FRC_DEVICE_DEFAULTS, useRobotStore } from '../store/useRobotStore';
import { generateAadlCode } from '../utils/codeGenerators';
import { verifySystemProperties } from '../utils/systemVerifier';
import { buildContracts, getStandardDeviceContract, getStandardSystemContract, SYSTEM_SCOPE } from '../utils/agree/frcContracts';
import { generateLustre } from '../utils/agree/lustreGenerator';
import { parseJKindXml, ProofResult } from '../utils/agree/jkindResults';
import { beforeMonacoMount, EDITOR_OPTIONS } from './CodeViewerModal';

interface AadlPanelProps {
  nodes: Node<FRCNodeData>[];
  edges: Edge[];
  onClose: () => void;
}

type ModelTab = 'aadl' | 'contracts';
type CheckTab = 'rules' | 'proofs';

const PANEL_EDITOR_OPTIONS = {
  ...EDITOR_OPTIONS,
  fontSize: 12,
  minimap: { enabled: false },
  lineNumbers: 'off' as const,
  padding: { top: 12, bottom: 12 },
};

const CONTRACT_EDITOR_OPTIONS = { ...PANEL_EDITOR_OPTIONS, readOnly: false, lineNumbers: 'on' as const, contextmenu: true };

const CUSTOM_CONTRACT_HINT = `-- Write your own AGREE contract for this scope. For example:
-- guarantee "Never draws power above 13 V" : pwr_12v_in <= 13.0;
`;

const SYSTEM_CONTRACT_HINT = `-- System lemmas refer to devices by id. For example:
-- lemma "Motor never browns out" : krakenx601.pwr_12v_in >= 6.8;
`;

// Generated contract variables are bookkeeping, not ports students wired
const isContractVariable = (port: string): boolean => /^(assume|guarantee|lemma|assert)_/.test(port);

const ANSWER_STYLES: Record<ProofResult['answer'], { label: string; className: string; icon: React.ReactNode }> = {
  valid: { label: 'Proved', className: 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> },
  falsifiable: { label: 'Counterexample', className: 'bg-red-950/30 border-red-500/30 text-red-200', icon: <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" /> },
  unknown: { label: 'Not proved in time', className: 'bg-amber-950/30 border-amber-500/30 text-amber-200', icon: <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> },
  inconsistent: { label: 'Contracts contradict', className: 'bg-amber-950/30 border-amber-500/30 text-amber-200', icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> },
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded text-[11px] font-mono transition border ${
      active ? 'text-indigo-300 bg-indigo-950/50 border-indigo-500/40 font-bold' : 'text-slate-400 border-transparent hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);

export const AadlPanel: React.FC<AadlPanelProps> = ({ nodes, edges, onClose }) => {
  const customContracts = useRobotStore((state) => state.customContracts);
  const setCustomContract = useRobotStore((state) => state.setCustomContract);

  const [copied, setCopied] = useState(false);
  const [modelTab, setModelTab] = useState<ModelTab>('aadl');
  const [checkTab, setCheckTab] = useState<CheckTab>('rules');
  const [scope, setScope] = useState(SYSTEM_SCOPE);
  const [showStandard, setShowStandard] = useState(true);
  const [proving, setProving] = useState(false);
  const [proofError, setProofError] = useState<string>();
  const [proofResults, setProofResults] = useState<ProofResult[]>();
  const [provedLustre, setProvedLustre] = useState<string>();

  // Everything below stays in sync with the diagram while the panel is open
  const contracts = useMemo(() => buildContracts(nodes, edges, customContracts), [nodes, edges, customContracts]);
  const aadlCode = useMemo(() => generateAadlCode(nodes, edges, contracts), [nodes, edges, contracts]);
  const report = useMemo(() => verifySystemProperties(nodes, edges), [nodes, edges]);
  const program = useMemo(() => generateLustre(nodes, edges, contracts), [nodes, edges, contracts]);

  const scopes = useMemo(() => {
    const types = [...new Set(nodes.map((n) => n.data?.deviceType))].sort((a, b) =>
      (FRC_DEVICE_DEFAULTS[a]?.label || a).localeCompare(FRC_DEVICE_DEFAULTS[b]?.label || b),
    );
    return [SYSTEM_SCOPE, ...types];
  }, [nodes]);
  const activeScope = scopes.includes(scope) ? scope : SYSTEM_SCOPE;
  const standardText = activeScope === SYSTEM_SCOPE ? getStandardSystemContract(nodes, edges) : getStandardDeviceContract(activeScope);
  const scopeErrors = program.errors.filter((e) => e.scope.startsWith(`${activeScope}:`) || e.scope.startsWith(`${activeScope} (`));
  const isStale = !!proofResults && provedLustre !== program.lustre;

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

  const handleProve = useCallback(async () => {
    setProofError(undefined);
    if (program.errors.length > 0) {
      setProofError('Fix the contract errors in the AGREE Contracts tab before proving.');
      return;
    }
    if (!window.sysmodAPI?.runJKind) {
      setProofError('Proofs run JKind on this computer, so they only work in the SysMod Studio desktop app.');
      return;
    }
    setProving(true);
    try {
      const response = await window.sysmodAPI.runJKind(program.lustre);
      if (response.success && response.xml) {
        setProofResults(parseJKindXml(response.xml, program.obligations));
        setProvedLustre(program.lustre);
      } else {
        setProofError(response.error || 'JKind did not return any results.');
      }
    } finally {
      setProving(false);
    }
  }, [program]);

  const provedCount = proofResults?.filter((r) => r.answer === 'valid').length || 0;

  return (
    <aside className="w-[480px] shrink-0 h-full border-l border-slate-800 bg-slate-900 flex flex-col z-10 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 bg-slate-950/70 shrink-0 gap-2">
        <div className="flex items-center gap-1">
          <TabButton active={modelTab === 'aadl'} onClick={() => setModelTab('aadl')}>
            <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> AADL Model</span>
          </TabButton>
          <TabButton active={modelTab === 'contracts'} onClick={() => setModelTab('contracts')}>
            <span className="flex items-center gap-1.5"><Sigma className="w-3.5 h-3.5" /> AGREE Contracts</span>
          </TabButton>
        </div>
        <div className="flex items-center gap-1.5">
          {modelTab === 'aadl' && (
            <>
              <button
                onClick={handleCopy}
                title="Copy AADL"
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition border ${
                  copied ? 'text-green-400 bg-green-400/10 border-green-400/30' : 'text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition border text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700"
              >
                <Download className="w-3.5 h-3.5" /> .aadl
              </button>
            </>
          )}
          <button onClick={onClose} title="Close" className="p-1 rounded text-slate-500 hover:text-slate-100 hover:bg-slate-800 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* AADL Source */}
      {modelTab === 'aadl' && (
        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            language="aadl"
            value={aadlCode}
            theme="sysmod-dark"
            beforeMount={beforeMonacoMount}
            options={PANEL_EDITOR_OPTIONS}
            loading={<EditorLoading />}
          />
        </div>
      )}

      {/* AGREE Contract Editor */}
      {modelTab === 'contracts' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2 shrink-0">
            <label htmlFor="contract-scope" className="text-[11px] font-mono text-slate-400">Contract for</label>
            <select
              id="contract-scope"
              value={activeScope}
              onChange={(e) => setScope(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200"
            >
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {s === SYSTEM_SCOPE ? 'Whole robot (system lemmas)' : FRC_DEVICE_DEFAULTS[s]?.label || s}
                </option>
              ))}
            </select>
          </div>

          <div className="border-b border-slate-800 shrink-0">
            <button
              onClick={() => setShowStandard((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-mono font-bold text-emerald-300"
            >
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> FRC standard contract (built in)</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition ${showStandard ? 'rotate-180' : ''}`} />
            </button>
            {showStandard && (
              <pre className="max-h-40 overflow-auto px-3 pb-2 text-[11px] leading-relaxed font-mono text-slate-400 whitespace-pre-wrap">
                {standardText || '-- No standard contract for this scope.'}
              </pre>
            )}
          </div>

          <div className="px-3 py-1.5 text-[11px] font-mono font-bold text-indigo-300 shrink-0">Your contract</div>
          <div className="flex-1 min-h-0">
            <Editor
              key={activeScope}
              height="100%"
              language="agree"
              value={customContracts[activeScope] ?? (activeScope === SYSTEM_SCOPE ? SYSTEM_CONTRACT_HINT : CUSTOM_CONTRACT_HINT)}
              onChange={(value) => setCustomContract(activeScope, value || '')}
              theme="sysmod-dark"
              beforeMount={beforeMonacoMount}
              options={CONTRACT_EDITOR_OPTIONS}
              loading={<EditorLoading />}
            />
          </div>

          {scopeErrors.length > 0 && (
            <div className="max-h-24 overflow-y-auto border-t border-red-500/30 bg-red-950/30 px-3 py-1.5 space-y-0.5 shrink-0">
              {scopeErrors.map((e, idx) => (
                <p key={idx} className="text-[11px] font-mono text-red-300">
                  {e.scope.split(': ')[1] || e.scope}, line {e.line}: {e.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Checks */}
      <div className="h-[42%] shrink-0 flex flex-col border-t border-slate-800">
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-800 bg-slate-950/50 shrink-0">
          <TabButton active={checkTab === 'rules'} onClick={() => setCheckTab('rules')}>
            FRC Rules {report.passed ? '✓' : `(${report.issues.filter((i) => i.severity === 'error').length})`}
          </TabButton>
          <TabButton active={checkTab === 'proofs'} onClick={() => setCheckTab('proofs')}>
            Contract Proofs {proofResults ? `(${provedCount}/${proofResults.length})` : `(${program.obligations.length})`}
          </TabButton>
        </div>

        {checkTab === 'rules' && (
          <>
            <div className={`px-4 py-2 border-b flex items-center gap-2.5 shrink-0 ${
              report.passed ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-red-950/40 border-red-500/30'
            }`}>
              {report.passed ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <ShieldAlert className="w-5 h-5 text-red-500" />}
              <span className={`text-[11px] font-mono font-semibold ${report.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                {report.passed ? 'PASS: FRC Rules Compliant' : 'FAIL: Rule Violations Detected'} ({report.score}% Score)
              </span>
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
          </>
        )}

        {checkTab === 'proofs' && (
          <>
            <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2 shrink-0">
              <button
                onClick={handleProve}
                disabled={proving || program.obligations.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {proving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {proving ? 'Proving...' : 'Prove contracts'}
              </button>
              <span className="text-[11px] font-mono text-slate-400">
                {program.obligations.length} obligation{program.obligations.length === 1 ? '' : 's'} · JKind
              </span>
            </div>
            <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-2">
              {proofError && <p className="text-[11px] font-mono text-red-300 whitespace-pre-wrap">{proofError}</p>}
              {isStale && <p className="text-[11px] font-mono text-amber-300">The diagram or contracts changed since this proof. Prove again to update.</p>}
              {program.warnings.map((w) => (
                <p key={w} className="text-[11px] font-mono text-amber-300">{w}</p>
              ))}
              {!proofResults && !proofError && program.obligations.length > 0 && (
                <p className="text-[11px] font-mono text-slate-400">
                  Prove checks every device assumption and system lemma against the contracts and wiring, for every possible input over time.
                </p>
              )}
              {proofResults?.map((result) => <ProofResultCard key={result.property} result={result} />)}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};

const EditorLoading: React.FC = () => (
  <div className="flex items-center justify-center h-full bg-slate-950">
    <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
      Loading Monaco Editor...
    </div>
  </div>
);

const ProofResultCard: React.FC<{ result: ProofResult }> = ({ result }) => {
  const style = ANSWER_STYLES[result.answer] || ANSWER_STYLES.unknown;
  const obligation = result.obligation;
  // Show the failing device's own ports first, since they explain the failure best
  const signals = (result.counterexample?.signals || [])
    .filter((s) => s.component && !isContractVariable(s.port))
    .sort((a, b) => Number(b.component === obligation?.component) - Number(a.component === obligation?.component))
    .slice(0, 8);

  return (
    <div className={`p-2.5 rounded-lg border flex gap-2.5 ${style.className}`}>
      {style.icon}
      <div className="min-w-0 flex-1">
        <h4 className="font-mono text-xs font-bold">{obligation?.description || result.property}</h4>
        <p className="text-[10px] mt-0.5 font-mono text-slate-400">
          {style.label} · {obligation?.kind === 'lemma' ? 'System lemma' : `Assumption of ${obligation?.component}`} · {obligation?.source}
        </p>
        {signals.length > 0 && (
          <div className="mt-1.5 overflow-x-auto">
            <table className="text-[10px] font-mono text-slate-300">
              <tbody>
                {signals.map((s) => (
                  <tr key={s.name}>
                    <td className="pr-2 text-slate-400 whitespace-nowrap">{s.component}.{s.port}</td>
                    {s.values.map((v, step) => (
                      <td key={step} className="px-1 text-right">
                        {typeof v === 'boolean' ? (v ? 'true' : 'false') : Number(v.toFixed(3))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] mt-0.5 text-slate-500 font-sans">Each column is one step in time, starting at step 0.</p>
          </div>
        )}
      </div>
    </div>
  );
};
