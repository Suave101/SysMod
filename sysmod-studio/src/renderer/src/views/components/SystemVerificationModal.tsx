import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, Info, X } from 'lucide-react';
import { VerificationReport } from '../utils/systemVerifier';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: VerificationReport;
}

export const SystemVerificationModal: React.FC<ModalProps> = ({ isOpen, onClose, report }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`p-5 border-b flex justify-between items-center ${
          report.passed ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-red-950/40 border-red-500/30'
        }`}>
          <div className="flex items-center gap-3">
            {report.passed ? (
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-8 h-8 text-red-500" />
            )}
            <div>
              <h2 className="text-base font-mono font-bold text-slate-100">
                System Rules Verification
              </h2>
              <span className={`text-xs font-mono font-semibold ${report.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                {report.passed ? 'PASS: FRC Rules Compliant' : 'FAIL: Rule Violations Detected'} ({report.score}% Score)
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Issue List */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
          {report.issues.length === 0 ? (
            <div className="text-center py-8 text-slate-400 font-mono text-xs">
              🎉 All system properties verified! CAN Bus is properly terminated and power routing complies with FRC rules.
            </div>
          ) : (
            report.issues.map((issue) => (
              <div
                key={issue.id}
                className={`p-3.5 rounded-xl border flex gap-3 ${
                  issue.severity === 'error'
                    ? 'bg-red-950/30 border-red-500/30 text-red-200'
                    : issue.severity === 'warning'
                    ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                    : 'bg-indigo-950/30 border-indigo-500/30 text-indigo-200'
                }`}
              >
                {issue.severity === 'error' ? (
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                ) : issue.severity === 'warning' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-mono text-xs font-bold">{issue.title}</h4>
                  <p className="text-[11px] mt-1 text-slate-300 font-sans">{issue.message}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono font-bold transition"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};