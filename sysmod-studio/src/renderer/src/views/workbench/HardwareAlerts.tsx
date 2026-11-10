/**
 * Active alerts for the Hardware Validation Engine: a ring and badge on every component with
 * a problem, and a toast whenever an edit creates a new CAN load, current or ID problem.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NodeProps } from '@xyflow/react';
import { AlertTriangle, CircleAlert, Gauge, Hash, Info, X, Zap } from 'lucide-react';
import type { VerificationIssue } from '../utils/systemVerifier';

const NodeAlertsContext = createContext<Map<string, VerificationIssue[]>>(new Map());

export const NodeAlertsProvider = NodeAlertsContext.Provider;

/** Groups issues by the components they mention */
export function issuesByNode(issues: VerificationIssue[]): Map<string, VerificationIssue[]> {
  const map = new Map<string, VerificationIssue[]>();
  issues.forEach((issue) => issue.nodeIds?.forEach((id) => map.set(id, [...(map.get(id) || []), issue])));
  return map;
}

const SEVERITY_RANK = { error: 2, warning: 1, info: 0 };
const worst = (issues: VerificationIssue[]): VerificationIssue['severity'] =>
  issues.reduce<VerificationIssue['severity']>((w, i) => (SEVERITY_RANK[i.severity] > SEVERITY_RANK[w] ? i.severity : w), 'info');

const RING = { error: 'ring-2 ring-red-500 ring-offset-2 ring-offset-slate-950', warning: 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950', info: '' };
const BADGE = { error: 'bg-red-600 text-white', warning: 'bg-amber-400 text-slate-950', info: 'bg-sky-500 text-white' };

/** Wraps a node renderer so components with problems show them where they are */
export function withNodeAlerts(Component: React.FC<NodeProps>): React.FC<NodeProps> {
  const Wrapped: React.FC<NodeProps> = (props) => {
    const all = useContext(NodeAlertsContext).get(props.id) || [];
    const shown = all.filter((i) => i.severity !== 'info');
    // The ring is for the hardware engine's live checks; other rules only get the badge
    const hardware = shown.filter((i) => i.category);
    return (
      <div className={`relative rounded-xl ${hardware.length > 0 ? RING[worst(hardware)] : ''}`}>
        <Component {...props} />
        {shown.length > 0 && (
          <div
            className={`absolute -top-2.5 -left-2.5 z-10 min-w-5 h-5 px-1 rounded-full flex items-center justify-center gap-0.5 text-[10px] font-mono font-bold shadow-lg ${BADGE[worst(shown)]}`}
            title={shown.map((i) => `${i.severity === 'error' ? '✖' : '▲'} ${i.title}: ${i.message}`).join('\n\n')}
            role="status"
            aria-label={`${shown.length} problem${shown.length === 1 ? '' : 's'} on this component`}
          >
            {worst(shown) === 'error' ? <CircleAlert className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            {shown.length}
          </div>
        )}
      </div>
    );
  };
  Wrapped.displayName = `WithNodeAlerts(${Component.displayName || Component.name})`;
  return Wrapped;
}

const CATEGORY_ICON: Record<NonNullable<VerificationIssue['category']>, React.ReactNode> = {
  'can-load': <Gauge className="w-4 h-4" />,
  current: <Zap className="w-4 h-4" />,
  ids: <Hash className="w-4 h-4" />,
};

const TOAST_STYLE = {
  error: 'border-red-500/60 bg-red-950/95 text-red-100',
  warning: 'border-amber-400/60 bg-amber-950/95 text-amber-100',
  info: 'border-sky-500/60 bg-sky-950/95 text-sky-100',
};

const TOAST_MS = 7000;
const MAX_TOASTS = 3;

interface AlertToastsProps {
  issues: VerificationIssue[];
  onShow: (issue: VerificationIssue) => void;
}

/**
 * Pops up a toast for each hardware problem an edit introduces. Problems that were already
 * there when the diagram opened stay quiet; they're on the badges and in Problems.
 */
export const AlertToasts: React.FC<AlertToastsProps> = ({ issues, onShow }) => {
  const known = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<VerificationIssue[]>([]);

  useEffect(() => {
    const hardware = issues.filter((i) => i.category);
    const current = new Set(hardware.map((i) => i.id));
    if (known.current) {
      const fresh = hardware.filter((i) => !known.current?.has(i.id) && i.severity !== 'info');
      if (fresh.length > 0) setToasts((shown) => [...fresh, ...shown.filter((t) => current.has(t.id))].slice(0, MAX_TOASTS));
      else setToasts((shown) => shown.filter((t) => current.has(t.id)));
    }
    known.current = current;
  }, [issues]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((shown) => shown.slice(0, -1)), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;
  return (
    <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-2 w-[360px] max-w-[calc(100%-2rem)]" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`flex gap-2.5 p-3 rounded-lg border shadow-2xl backdrop-blur-md ${TOAST_STYLE[toast.severity]}`} role="alert">
          <span className="mt-0.5 shrink-0">{toast.category ? CATEGORY_ICON[toast.category] : <Info className="w-4 h-4" />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-mono font-bold">{toast.title}</p>
            <p className="mt-0.5 text-[11px] leading-snug opacity-90">{toast.message}</p>
            {toast.nodeIds && toast.nodeIds.length > 0 && (
              <button onClick={() => onShow(toast)} className="mt-1.5 text-[11px] font-mono underline underline-offset-2 hover:opacity-80">
                Show on diagram
              </button>
            )}
          </div>
          <button
            onClick={() => setToasts((shown) => shown.filter((t) => t.id !== toast.id))}
            className="self-start p-0.5 rounded opacity-70 hover:opacity-100"
            aria-label="Dismiss alert"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
