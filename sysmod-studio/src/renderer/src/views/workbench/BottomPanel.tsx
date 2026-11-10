import React from 'react';
import {
  AlertTriangle, Award, CheckCircle2, Gauge, CircleAlert, HelpCircle, Info, Loader2, Play, ShieldCheck, Sigma, X, XCircle,
} from 'lucide-react';
import { FRC_DEVICE_DEFAULTS } from '../store/useRobotStore';
import { ProofResult } from '../utils/agree/jkindResults';
import { scopeLabel, WorkbenchModel } from './useWorkbenchModel';
import { HardwarePanel } from './HardwarePanel';
import { CAN_LOAD_LIMITS } from '../utils/hardwareValidation';

export type PanelView = 'problems' | 'hardware' | 'proofs';

interface Problem {
  key: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  source: string;
  scope?: string;
}

/** FRC rule issues and AGREE errors in one list, like VS Code's Problems view */
export function collectProblems(model: WorkbenchModel): Problem[] {
  const agree: Problem[] = model.program.errors.map((e, idx) => {
    const [scope, label] = e.scope.split(': ');
    return {
      key: `agree-${idx}`,
      severity: 'error',
      title: e.message,
      detail: `${scopeLabel(scope, FRC_DEVICE_DEFAULTS)}.agree · ${label}, line ${e.line}`,
      source: 'AGREE',
      scope,
    };
  });
  const rules: Problem[] = model.report.issues.map((issue) => ({
    key: issue.id,
    severity: issue.severity,
    title: issue.title,
    detail: issue.message,
    source: 'FRC Rules',
  }));
  return [...agree, ...rules];
}

const SEVERITY_ICONS = {
  error: <CircleAlert className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />,
  info: <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />,
};

const ANSWER_STYLES: Record<ProofResult['answer'], { label: string; icon: React.ReactNode }> = {
  valid: { label: 'Proved', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> },
  falsifiable: { label: 'Counterexample', icon: <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" /> },
  unknown: { label: 'Not proved in time', icon: <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /> },
  inconsistent: { label: 'Contracts contradict', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /> },
};

// Generated contract variables are bookkeeping, not ports students wired
const isContractVariable = (port: string): boolean => /^(assume|guarantee|lemma|assert)_/.test(port);

const ProofRow: React.FC<{ result: ProofResult }> = ({ result }) => {
  const style = ANSWER_STYLES[result.answer] || ANSWER_STYLES.unknown;
  const obligation = result.obligation;
  // The failing component's own ports explain the failure best, so they come first
  const signals = (result.counterexample?.signals || [])
    .filter((s) => s.component && !isContractVariable(s.port))
    .sort((a, b) => Number(b.component === obligation?.component) - Number(a.component === obligation?.component))
    .slice(0, 10);

  return (
    <div className="flex gap-2 px-3 py-1.5 hover:bg-slate-800/50">
      {style.icon}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-mono text-slate-200">
          <span>{obligation?.description || result.property}</span>
          <span className="text-[10px] text-slate-500">
            {style.label} · {obligation?.kind === 'lemma' ? 'System lemma' : `Assumption of ${obligation?.component}`} · {obligation?.source}
          </span>
        </p>
        {signals.length > 0 && (
          <div className="mt-1 overflow-x-auto">
            <table className="text-[10px] font-mono text-slate-300">
              <thead>
                <tr className="text-slate-500">
                  <th className="pr-3 text-left font-normal">Port</th>
                  {signals[0].values.map((_, step) => (
                    <th key={step} className="px-1.5 text-right font-normal">Step {step}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.name}>
                    <td className="pr-3 text-slate-400 whitespace-nowrap">{s.component}.{s.port}</td>
                    {s.values.map((v, step) => (
                      <td key={step} className="px-1.5 text-right">{typeof v === 'boolean' ? (v ? 'true' : 'false') : Number(v.toFixed(3))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

interface BottomPanelProps {
  model: WorkbenchModel;
  view: PanelView;
  height: number;
  onViewChange: (view: PanelView) => void;
  onClose: () => void;
  onOpenContract: (scope: string) => void;
  onOpenJudgeReport: () => void;
  onResizeStart: (event: React.PointerEvent) => void;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({ model, view, height, onViewChange, onClose, onOpenContract, onOpenJudgeReport, onResizeStart }) => {
  const problems = collectProblems(model);
  const { proof, program } = model;

  const tab = (id: PanelView, label: string, badge?: number) => (
    <button
      onClick={() => onViewChange(id)}
      className={`h-full px-2 text-[11px] font-mono uppercase tracking-wider border-b ${
        view === id ? 'text-slate-100 border-indigo-400' : 'text-slate-500 border-transparent hover:text-slate-300'
      }`}
    >
      {label}
      {badge !== undefined && <span className="ml-1.5 px-1.5 rounded-full bg-slate-700 text-[10px] text-slate-200">{badge}</span>}
    </button>
  );

  return (
    <section style={{ height }} className="shrink-0 flex flex-col border-t border-slate-800 bg-slate-900 relative" aria-label="Panel">
      <div
        onPointerDown={onResizeStart}
        className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-10 hover:bg-indigo-500/40"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panel"
      />
      <div className="h-9 shrink-0 flex items-center justify-between px-3 gap-3">
        <div className="flex items-center gap-3 h-full">
          {tab('problems', 'Problems', problems.length)}
          {tab('hardware', 'Hardware', model.hardware.issues.filter((i) => i.severity !== 'info').length)}
          {tab('proofs', 'Proofs', proof.results ? proof.results.length : program.obligations.length)}
        </div>
        <div className="flex items-center gap-1">
          {view === 'proofs' && (
            <button
              onClick={onOpenJudgeReport}
              title="Explain the proofs for judges, with step-by-step math"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              <Award className="w-3.5 h-3.5" /> Judge report
            </button>
          )}
          {view === 'proofs' && (
            <button
              onClick={proof.prove}
              disabled={proof.proving || program.obligations.length === 0}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {proof.proving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {proof.proving ? 'Proving...' : 'Prove contracts'}
            </button>
          )}
          <button onClick={onClose} title="Close panel" aria-label="Close panel" className="p-1 rounded text-slate-500 hover:text-slate-100 hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-2">
        {view === 'problems' &&
          (problems.length === 0 ? (
            <p className="px-3 py-2 text-xs font-mono text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> No problems. The wiring meets every FRC rule and the contracts have no errors.
            </p>
          ) : (
            problems.map((p) => (
              <button
                key={p.key}
                onClick={() => p.scope && onOpenContract(p.scope)}
                className={`w-full flex gap-2 px-3 py-1 text-left hover:bg-slate-800/50 ${p.scope ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {SEVERITY_ICONS[p.severity]}
                <span className="min-w-0 flex flex-wrap items-baseline gap-x-2 text-xs font-mono">
                  <span className="text-slate-200">{p.title}</span>
                  <span className="text-[11px] font-sans text-slate-500">{p.detail}</span>
                  <span className="text-[10px] text-slate-600">[{p.source}]</span>
                </span>
              </button>
            ))
          ))}

        {view === 'hardware' && <HardwarePanel hardware={model.hardware} nameOf={(id) => model.nodes.find((n) => n.id === id)?.data?.label || id} />}

        {view === 'proofs' && (
          <>
            {proof.error && <p className="px-3 py-1 text-xs font-mono text-red-300 whitespace-pre-wrap">{proof.error}</p>}
            {proof.isStale && <p className="px-3 py-1 text-xs font-mono text-amber-300">The diagram or contracts changed since this proof. Prove again to update.</p>}
            {program.warnings.map((w) => (
              <p key={w} className="px-3 py-1 text-xs font-mono text-amber-300">{w}</p>
            ))}
            {!proof.results && !proof.error && program.obligations.length > 0 && (
              <p className="px-3 py-1 text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <Sigma className="w-3.5 h-3.5 text-emerald-400" />
                {program.obligations.length} obligations. Prove checks every component assumption and system lemma against the contracts and wiring, for every possible input over time.
              </p>
            )}
            {proof.results?.map((result) => <ProofRow key={result.property} result={result} />)}
          </>
        )}
      </div>
    </section>
  );
};

interface StatusBarProps {
  model: WorkbenchModel;
  onShowPanel: (view: PanelView) => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({ model, onShowPanel }) => {
  const problems = collectProblems(model);
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.filter((p) => p.severity === 'warning').length;
  const { proof } = model;
  const busiestCan = [...model.hardware.canBuses].sort((a, b) => b.utilization - a.utilization)[0];

  const proofLabel = proof.proving
    ? 'Proving...'
    : proof.results
      ? `${proof.provedCount}/${proof.results.length} proved${proof.isStale ? ' (out of date)' : ''}`
      : `${model.program.obligations.length} obligations to prove`;

  return (
    <footer className="h-6 shrink-0 flex items-center justify-between px-2 bg-indigo-700 text-[11px] font-mono text-indigo-50">
      <div className="flex items-center h-full">
        <button onClick={() => onShowPanel('problems')} className="flex items-center gap-2.5 h-full px-2 hover:bg-indigo-600" title="Show problems">
          <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {errors}</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {warnings}</span>
        </button>
        <button onClick={() => onShowPanel('proofs')} className="flex items-center gap-1 h-full px-2 hover:bg-indigo-600" title="Show proofs">
          {proof.proving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sigma className="w-3.5 h-3.5" />} {proofLabel}
        </button>
        {busiestCan && (
          <button
            onClick={() => onShowPanel('hardware')}
            className={`flex items-center gap-1 h-full px-2 hover:bg-indigo-600 ${busiestCan.utilization >= CAN_LOAD_LIMITS.error ? 'bg-red-600' : busiestCan.utilization >= CAN_LOAD_LIMITS.warning ? 'bg-amber-500 text-slate-950' : ''}`}
            title={`Busiest CAN bus: ${busiestCan.name}`}
          >
            <Gauge className="w-3.5 h-3.5" /> CAN {Math.round(busiestCan.utilization * 100)}%
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 px-2 text-indigo-200">
        <span>{model.nodes.length} components · {model.edges.length} wires</span>
        <span>AADL · AGREE · JKind</span>
      </div>
    </footer>
  );
};
