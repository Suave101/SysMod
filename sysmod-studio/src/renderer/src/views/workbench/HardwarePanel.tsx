import React from 'react';
import { Gauge, Hash, Zap } from 'lucide-react';
import { CAN_LOAD_LIMITS, HardwareAnalysis, PowerLoad } from '../utils/hardwareValidation';

const LEVEL_COLORS = { ok: 'bg-emerald-500', warn: 'bg-amber-400', bad: 'bg-red-500' };

const level = (fraction: number, warn: number, bad: number): keyof typeof LEVEL_COLORS =>
  fraction >= bad ? 'bad' : fraction >= warn ? 'warn' : 'ok';

/** A horizontal bar; the fill caps at the end, and the label says how far past it the value is */
const Meter: React.FC<{ fraction: number; warn: number; bad: number; label: string }> = ({ fraction, warn, bad, label }) => (
  <div className="flex items-center gap-2 min-w-0">
    <div className="relative flex-1 h-2 rounded-full bg-slate-800 overflow-hidden" role="meter" aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full ${LEVEL_COLORS[level(fraction, warn, bad)]}`} style={{ width: `${Math.min(100, fraction * 100)}%` }} />
      {warn < 1 && <div className="absolute top-0 bottom-0 w-px bg-slate-500" style={{ left: `${warn * 100}%` }} title={`${Math.round(warn * 100)}%`} />}
    </div>
    <span className={`w-12 text-right text-[11px] font-mono ${level(fraction, warn, bad) === 'ok' ? 'text-slate-300' : level(fraction, warn, bad) === 'warn' ? 'text-amber-300' : 'text-red-300'}`}>
      {Math.round(fraction * 100)}%
    </span>
  </div>
);

const Section: React.FC<{ icon: React.ReactNode; title: string; note?: string; children: React.ReactNode }> = ({ icon, title, note, children }) => (
  <section className="min-w-0">
    <h3 className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
      {icon} {title}
    </h3>
    {children}
    {note && <p className="mt-1.5 text-[10px] text-slate-500">{note}</p>}
  </section>
);

const amps = (value: number): string => `${Number(value.toFixed(1))} A`;

const PowerRow: React.FC<{ load: PowerLoad; nameOf: (id: string) => string }> = ({ load, nameOf }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-2 py-0.5 text-[11px] font-mono">
    <span className="truncate text-slate-300" title={load.loads.map((l) => `${nameOf(l.nodeId)}: ${amps(l.currentA)}`).join('\n')}>
      {load.name} <span className="text-slate-500">→ {nameOf(load.nodeId)}</span>
    </span>
    <Meter fraction={load.loadA / load.ratingA} warn={0.8} bad={1.0001} label={`${load.name} load`} />
    <span className="text-slate-400 whitespace-nowrap">
      {amps(load.loadA)} / {amps(load.ratingA)}
    </span>
  </div>
);

export const HardwarePanel: React.FC<{ hardware: HardwareAnalysis; nameOf: (id: string) => string }> = ({ hardware, nameOf }) => {
  const { canBuses, mainBreaker, channels, regulators, ids } = hardware;
  const conflicts = ids.filter((a) => a.nodeIds.length > 1);
  // Conflicts first, so they aren't buried under a long list of healthy IDs
  const sortedIds = [...conflicts, ...ids.filter((a) => a.nodeIds.length === 1)];

  return (
    <div className="grid gap-5 px-3 py-2 lg:grid-cols-3">
      <Section icon={<Gauge className="w-3.5 h-3.5" />} title="CAN bus load" note={`Estimated from vendor default status rates. Keep each bus under ${Math.round(CAN_LOAD_LIMITS.warning * 100)}%.`}>
        {canBuses.length === 0 ? (
          <p className="text-xs text-slate-500">No CAN wiring yet.</p>
        ) : (
          canBuses.map((bus) => (
            <div key={bus.id} className="py-0.5">
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span className="truncate">{bus.name}</span>
                <span className="text-slate-500 whitespace-nowrap">
                  {bus.devices.length} devices · {bus.framesPerSecond} frames/s
                </span>
              </div>
              <Meter fraction={bus.utilization} warn={CAN_LOAD_LIMITS.warning} bad={CAN_LOAD_LIMITS.error} label={`${bus.name} utilization`} />
            </div>
          ))
        )}
      </Section>

      <Section icon={<Zap className="w-3.5 h-3.5" />} title="Current" note="Motors use their supply current limit; other parts use typical maximum draw.">
        <PowerRow load={mainBreaker} nameOf={nameOf} />
        <div className="mt-1 max-h-40 overflow-y-auto pr-1">
          {channels.map((c) => (
            <PowerRow key={c.id} load={c} nameOf={nameOf} />
          ))}
          {regulators.map((r) => (
            <PowerRow key={r.id} load={r} nameOf={nameOf} />
          ))}
          {channels.length === 0 && <p className="text-xs text-slate-500">Nothing is wired to a PDH channel yet.</p>}
        </div>
      </Section>

      <Section icon={<Hash className="w-3.5 h-3.5" />} title="IDs and ports" note="Edit a CAN ID, DIO or PWM port right on its component.">
        {conflicts.length > 0 && (
          <p className="mb-1 text-[11px] font-mono text-red-300">
            {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
          </p>
        )}
        <div className="max-h-44 overflow-y-auto pr-1">
          <table className="w-full text-[11px] font-mono">
            <tbody>
              {sortedIds.map((a) => {
                const clash = a.nodeIds.length > 1;
                return (
                  <tr key={`${a.kind}-${a.scope}-${a.value}`} className={clash ? 'text-red-300' : 'text-slate-300'}>
                    <td className="pr-2 whitespace-nowrap text-slate-500">{a.kind}</td>
                    <td className="pr-2 text-right">{a.value}</td>
                    <td className="truncate max-w-0 w-full" title={a.scope}>
                      {a.nodeIds.map(nameOf).join(', ')}
                      {clash && ' ✖'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ids.length === 0 && <p className="text-xs text-slate-500">No IDs assigned yet.</p>}
        </div>
      </Section>
    </div>
  );
};
