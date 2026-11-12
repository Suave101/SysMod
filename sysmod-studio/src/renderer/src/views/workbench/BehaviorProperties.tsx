/**
 * The Properties pane of the Behavior tab: facts about the agent to prove with JKind, built from
 * templates, with each answer in plain words and counterexamples shown loop by loop.
 * See docs/verification/proving-robot-behavior.md.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, HelpCircle, Loader2, Play, Plus, X, XCircle } from 'lucide-react';
import { useRobotStore } from '../store/useRobotStore';
import { AgentProperty, CommandRef } from '../behavior/agentProperties';
import { agentCommands, agentTrace, ROBOT_MODES, TraceLoop } from '../behavior/agentAgree';
import { ProofResult } from '../utils/agree/jkindResults';
import { WorkbenchModel } from './useWorkbenchModel';

const TEMPLATES: { kind: AgentProperty['kind']; label: string; hint: string }[] = [
  { kind: 'only-in-mode', label: 'Only in a mode', hint: 'A command is only sent in one robot mode' },
  { kind: 'never-together', label: 'Never together', hint: 'Two devices are never in these states at once' },
  { kind: 'can-happen', label: 'Can it happen?', hint: 'Find a way for the agent to send a command' },
];

const refKey = (ref: CommandRef): string => JSON.stringify([ref.device, ref.value]);
const refText = (ref: CommandRef): string => `${ref.device} → ${ref.value}`;

const select = 'min-w-0 max-w-full bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-indigo-500';

const CommandSelect: React.FC<{ value: CommandRef; commands: CommandRef[]; onChange: (ref: CommandRef) => void; label: string }> = ({ value, commands, onChange, label }) => {
  const known = commands.some((c) => refKey(c) === refKey(value));
  return (
    <select aria-label={label} className={select} value={refKey(value)} onChange={(e) => onChange(commands.find((c) => refKey(c) === e.target.value) || value)}>
      {!known && <option value={refKey(value)}>{refText(value)} (no rule sends this)</option>}
      {commands.map((c) => (
        <option key={refKey(c)} value={refKey(c)}>
          {refText(c)}
        </option>
      ))}
    </select>
  );
};

/** One property as a sentence with dropdowns */
const PropertySentence: React.FC<{ property: AgentProperty; commands: CommandRef[]; onChange: (p: AgentProperty) => void }> = ({ property, commands, onChange }) => {
  const words = 'text-[11px] text-slate-400';
  if (property.kind === 'only-in-mode') {
    return (
      <span className="flex flex-wrap items-center gap-1">
        <CommandSelect label="Command" value={property.command} commands={commands} onChange={(command) => onChange({ ...property, command })} />
        <span className={words}>is only sent in</span>
        <select aria-label="Robot mode" className={select} value={property.mode} onChange={(e) => onChange({ ...property, mode: e.target.value })}>
          {ROBOT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </span>
    );
  }
  if (property.kind === 'never-together') {
    return (
      <span className="flex flex-wrap items-center gap-1">
        <CommandSelect label="First command" value={property.first} commands={commands} onChange={(first) => onChange({ ...property, first })} />
        <span className={words}>and</span>
        <CommandSelect label="Second command" value={property.second} commands={commands} onChange={(second) => onChange({ ...property, second })} />
        <span className={words}>are never the last commands at the same time</span>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className={words}>Can the agent send</span>
      <CommandSelect label="Command" value={property.command} commands={commands} onChange={(command) => onChange({ ...property, command })} />
      <span className={words}>?</span>
    </span>
  );
};

type Verdict = { tone: 'good' | 'bad' | 'warn'; text: string; showTrace: boolean };

function verdict(property: AgentProperty, result: ProofResult): Verdict {
  const reachable = property.kind === 'can-happen';
  if (result.answer === 'valid') {
    return reachable
      ? { tone: 'warn', text: 'No. No match can ever send this. Check the conditions of the rules that send it.', showTrace: false }
      : { tone: 'good', text: 'Proved. This is true in every match, whatever the sensors read and whatever Soar picks.', showTrace: false };
  }
  if (result.answer === 'falsifiable') {
    return reachable
      ? { tone: 'good', text: 'Yes. Here is one way it happens:', showTrace: true }
      : { tone: 'bad', text: 'Not always. Here is a match where it fails:', showTrace: true };
  }
  if (result.answer === 'unknown') return { tone: 'warn', text: 'JKind could not decide in time. Try again, or make the rules simpler.', showTrace: false };
  return { tone: 'warn', text: 'The model contradicts itself. Please report this.', showTrace: false };
}

const TONE_ICONS = {
  good: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />,
  bad: <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />,
  warn: <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />,
};

/** A counterexample, one column per robot loop */
const TraceTable: React.FC<{ loops: TraceLoop[]; devices: string[]; reachable: boolean }> = ({ loops, devices, reachable }) => {
  // The property's guarantee is false at the loop that matters: a failure, or for "Can it happen?", the answer
  const mark = reachable ? { text: ' ← here', style: 'text-emerald-300' } : { text: ' ✗', style: 'text-red-300' };
  const cell = 'px-1.5 py-0.5 align-top whitespace-nowrap';
  const head = `${cell} text-left text-slate-500 font-normal sticky left-0 bg-slate-900`;
  const readings = loops[0]?.readings.map((r) => r.attribute) || [];
  return (
    <div className="mt-1 overflow-x-auto border border-slate-800 rounded">
      <table className="text-[10px] font-mono text-slate-300 border-collapse">
        <thead>
          <tr className="text-slate-500 border-b border-slate-800">
            <th className={head}>Loop</th>
            {loops.map((_, k) => (
              <th key={k} className={`${cell} text-left font-normal ${loops[k].holds === false ? mark.style : ''}`}>
                {k + 1}
                {loops[k].holds === false ? mark.text : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className={head}>Robot mode</th>
            {loops.map((l, k) => (
              <td key={k} className={cell}>{l.mode}</td>
            ))}
          </tr>
          {readings.map((attribute, i) => (
            <tr key={attribute}>
              <th className={head}>{attribute}</th>
              {loops.map((l, k) => (
                <td key={k} className={cell} title={l.readings[i].changed ? 'A new reading: rules that used it can fire again' : undefined}>
                  {l.readings[i].text}
                  {l.readings[i].changed && k > 0 && l.readings[i].text === loops[k - 1].readings[i].text ? ' (new)' : ''}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-slate-800">
            <th className={head}>Soar picks</th>
            {loops.map((l, k) => (
              <td key={k} className={`${cell} ${l.stalled ? 'text-amber-300' : 'text-teal-300'}`} title={l.chose ? 'Equal operators tied; Soar picked this one at random' : undefined}>
                {l.decision}
                {l.chose ? ' (random)' : ''}
              </td>
            ))}
          </tr>
          <tr>
            <th className={head}>Robot is sent</th>
            {loops.map((l, k) => (
              <td key={k} className={`${cell} text-sky-300`}>{l.sent.join(', ') || '—'}</td>
            ))}
          </tr>
          {devices.map((device) => (
            <tr key={device}>
              <th className={head}>{device} is</th>
              {loops.map((l, k) => (
                <td key={k} className={cell}>{l.last.find((x) => x.device === device)?.value ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const devicesOf = (p: AgentProperty): string[] => (p.kind === 'never-together' ? [...new Set([p.first.device, p.second.device])] : [p.command.device]);

export const BehaviorProperties: React.FC<{ model: WorkbenchModel }> = ({ model }) => {
  const { behavior } = model;
  const properties = useRobotStore((state) => state.behaviorProperties);
  const setProperties = useRobotStore((state) => state.setBehaviorProperties);
  const commands = useMemo(() => agentCommands(behavior.agent), [behavior.agent]);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const add = (kind: AgentProperty['kind']): void => {
    const [first, second] = [commands[0], commands[1] || commands[0]];
    const next: AgentProperty =
      kind === 'only-in-mode' ? { kind, command: first, mode: 'autonomous' } : kind === 'never-together' ? { kind, first, second } : { kind, command: first };
    setProperties([...properties, next]);
  };
  const update = (i: number, p: AgentProperty): void => setProperties(properties.map((q, j) => (j === i ? p : q)));
  const remove = (i: number): void => setProperties(properties.filter((_, j) => j !== i));

  // Results belong to the properties they were proved for, found by their content
  const run = behavior.run;
  const resultFor = (p: AgentProperty): { result: ProofResult; guarantee: string } | undefined => {
    if (!run) return undefined;
    const i = run.properties.findIndex((q) => JSON.stringify(q) === JSON.stringify(p));
    const guarantee = i >= 0 ? run.program.guarantees[i] : undefined;
    const result = guarantee && run.results.find((r) => r.property === guarantee.lustreName);
    return result && guarantee ? { result, guarantee: guarantee.name } : undefined;
  };

  const button = 'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';

  if (!behavior.hasRules) {
    return <p className="p-3 text-[11px] text-slate-400">Add rules with blocks first. Then you can ask SysMod to prove facts about what the agent does.</p>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 p-3 space-y-2 border-b border-slate-800">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Ask whether something is true in <b className="text-slate-200">every</b> match: whatever the sensors read, whatever Soar picks when operators tie, for as long as
          the match runs. JKind checks it on this computer.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button key={t.kind} onClick={() => add(t.kind)} disabled={commands.length === 0} className={button} title={commands.length ? t.hint : 'No rule sends a command yet'}>
              <Plus className="w-3 h-3" /> {t.label}
            </button>
          ))}
          <button
            onClick={() => void behavior.prove()}
            disabled={behavior.proving || properties.length === 0}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {behavior.proving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {behavior.proving ? 'Proving...' : 'Prove'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {behavior.agent.warnings.map((w) => (
          <p key={w} className="flex gap-1.5 px-1 text-[11px] text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
          </p>
        ))}
        {behavior.error && <p className="px-1 text-[11px] text-red-300 whitespace-pre-wrap">{behavior.error}</p>}
        {behavior.isStale && <p className="px-1 text-[11px] text-amber-300">The blocks or properties changed since the last proof. Prove again to update.</p>}
        {properties.length === 0 && <p className="px-1 text-[11px] text-slate-500">No properties yet. Add one with the buttons above.</p>}

        {properties.map((p, i) => {
          const found = resultFor(p);
          const v = found && verdict(p, found.result);
          const loops =
            v?.showTrace && found?.result.counterexample && run && open.has(i)
              ? agentTrace(run.agent, run.program, found.result.counterexample.signals, found.result.counterexample.steps, found.guarantee)
              : undefined;
          return (
            <div key={i} className="rounded border border-slate-800 bg-slate-950/60 p-2">
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-mono text-slate-600 mt-1">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <PropertySentence property={p} commands={commands} onChange={(next) => update(i, next)} />
                </div>
                <button onClick={() => remove(i)} aria-label={`Remove property ${i + 1}`} className="text-slate-500 hover:text-slate-100">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {v && found && (
                <div className={`mt-1.5 ${behavior.isStale ? 'opacity-60' : ''}`}>
                  <p className="flex gap-1.5 text-[11px] text-slate-200">
                    {TONE_ICONS[v.tone]}
                    <span>{v.text}</span>
                  </p>
                  {v.showTrace && found.result.counterexample && (
                    <button
                      onClick={() => setOpen((s) => new Set(s.has(i) ? [...s].filter((x) => x !== i) : [...s, i]))}
                      className="mt-1 flex items-center gap-1 text-[11px] font-mono text-sky-300 hover:text-sky-200"
                    >
                      {open.has(i) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {open.has(i) ? 'Hide' : 'Show'} the {found.result.counterexample.steps} robot {found.result.counterexample.steps === 1 ? 'loop' : 'loops'}
                    </button>
                  )}
                  {loops && <TraceTable loops={loops} devices={devicesOf(p)} reachable={p.kind === 'can-happen'} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
