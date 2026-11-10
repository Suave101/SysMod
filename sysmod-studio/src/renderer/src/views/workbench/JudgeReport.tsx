import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Award, Download, Loader2, Play, Printer } from 'lucide-react';
import { renderJudgeReportHtml } from '../utils/agree/judgeReport';
import { WorkbenchModel } from './useWorkbenchModel';

type Team = { number?: string; name?: string };

/** The team number and name from the Design Brief, for the report's cover */
function useTeam(): Team | undefined {
  const [team, setTeam] = useState<Team>();
  useEffect(() => {
    const apply = (data: { teamNumber?: string; teamName?: string } | null): void => {
      if (data) setTeam({ number: data.teamNumber || undefined, name: data.teamName || undefined });
    };
    if (window.electronAPI?.loadData) {
      window.electronAPI.loadData().then(apply).catch(() => undefined);
    } else {
      try {
        const raw = localStorage.getItem('workspace-data');
        if (raw) apply(JSON.parse(raw));
      } catch {
        // No saved Design Brief; the cover just says "FRC robot"
      }
    }
  }, []);
  return team;
}

/**
 * An editor tab that shows the Judge Report as the printed page will look, with buttons to
 * prove again, print or save it. The report itself is a static HTML page in an iframe.
 */
export const JudgeReport: React.FC<{ model: WorkbenchModel }> = ({ model }) => {
  const { proof } = model;
  const frame = useRef<HTMLIFrameElement>(null);
  const team = useTeam();

  const html = useMemo(() => {
    if (!proof.results || !proof.explained || !proof.provedProgram) return undefined;
    return renderJudgeReportHtml({
      team,
      generatedAt: new Date(),
      program: proof.provedProgram,
      results: proof.results,
      proofs: proof.explained,
      rules: model.report,
      componentCount: model.nodes.length,
      wireCount: model.edges.length,
    });
  }, [proof.results, proof.explained, proof.provedProgram, team, model.report, model.nodes.length, model.edges.length]);

  const print = (): void => {
    frame.current?.contentWindow?.focus();
    frame.current?.contentWindow?.print();
  };

  const save = (): void => {
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${team?.number ? `${team.number}-` : ''}formal-verification-report.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const button = 'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <div className="h-10 shrink-0 flex items-center justify-between gap-3 px-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 min-w-0 text-xs font-mono">
          <Award className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-slate-100">Judge Report</span>
          {proof.results && (
            <span className="text-slate-400">
              · {proof.provedCount}/{proof.results.length} proved
            </span>
          )}
          {proof.isStale && (
            <span className="flex items-center gap-1 text-amber-300 truncate">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> The design changed since these proofs
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={proof.prove} disabled={proof.proving} className={`${button} border-indigo-500/60 bg-indigo-600 text-white hover:bg-indigo-500`}>
            {proof.proving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {proof.results ? 'Prove again' : 'Prove'}
          </button>
          <button onClick={save} disabled={!html} className={`${button} border-slate-700 text-slate-300 hover:bg-slate-800`}>
            <Download className="w-3.5 h-3.5" /> Save HTML
          </button>
          <button onClick={print} disabled={!html} className={`${button} border-slate-700 text-slate-300 hover:bg-slate-800`}>
            <Printer className="w-3.5 h-3.5" /> Print / Save PDF
          </button>
        </div>
      </div>

      {proof.error && <p className="px-4 py-2 text-xs font-mono text-red-300 whitespace-pre-wrap border-b border-slate-800">{proof.error}</p>}

      {html ? (
        <div className="flex-1 min-h-0 p-3">
          <iframe ref={frame} srcDoc={html} title="Judge Report" className="w-full h-full rounded border border-slate-800 bg-white" />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-3">
            <Award className="w-10 h-10 text-amber-400 mx-auto" />
            <h2 className="text-lg font-semibold text-slate-100">Show judges what your robot is proved to do</h2>
            <p className="text-sm text-slate-400">
              The Judge Report explains each formally verified property in plain language, with a step-by-step mathematical proof built from your
              wiring and the FRC contracts. It needs no AADL knowledge to read, and it prints as a handout.
            </p>
            <button
              onClick={proof.prove}
              disabled={proof.proving || model.program.obligations.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-mono bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {proof.proving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {proof.proving ? 'Proving...' : 'Prove and build the report'}
            </button>
            {model.program.obligations.length === 0 && <p className="text-xs text-slate-500">Add components to the diagram first. There is nothing to prove yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
};
