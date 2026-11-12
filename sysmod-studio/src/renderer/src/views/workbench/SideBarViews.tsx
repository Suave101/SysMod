import React, { useEffect, useMemo, useState } from 'react';
import * as monaco from 'monaco-editor';
import { Award, Blocks, Bot, ChevronDown, ChevronRight, Code2, FileCode, FileText, Layers, Pencil, Plus, Save, Sigma, Trash2 } from 'lucide-react';
import { isSubsystem } from '../utils/subsystems';
import { subsystemAttribute } from '../behavior/soarNames';
import { useTeamSubsystems } from '../behavior/robotDevices';
import { DEVICE_CATEGORIES, FRC_DEVICE_DEFAULTS, useRobotStore } from '../store/useRobotStore';
import { ContractSource, SYSTEM_SCOPE } from '../utils/agree/frcContracts';
import { beforeMonacoMount } from '../utils/monacoLanguages';
import { HARDWARE_STYLES } from './hardwareStyles';
import { scopeLabel, WorkbenchModel } from './useWorkbenchModel';
import { GENERATED_FILES, GeneratedFileId } from './Editors';

const SectionHeader: React.FC<{ title: string; actions?: React.ReactNode }> = ({ title, actions }) => (
  <div className="flex items-center justify-between px-3 h-9 shrink-0 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
    {title}
    {actions}
  </div>
);

// ── Components ──

const SubsystemsSection: React.FC = () => {
  const addSubsystem = useRobotStore((state) => state.addSubsystem);
  const nodes = useRobotStore((state) => state.nodes);
  const teamSubsystems = useTeamSubsystems();
  const onDiagram = new Set(nodes.filter(isSubsystem).map((n) => subsystemAttribute(n.data.label)));
  const missing = teamSubsystems.filter((name) => !onDiagram.has(subsystemAttribute(name)));

  return (
    <>
      <SectionHeader title="Subsystems" />
      <div className="px-3 pb-3 space-y-1.5 shrink-0">
        <button
          onClick={() => addSubsystem()}
          className="w-full flex items-center justify-between p-2 rounded bg-slate-950 hover:bg-slate-800 border border-dashed border-teal-500/50 text-left transition group"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-teal-300" />
            <span className="text-xs font-mono text-slate-300">Subsystem frame</span>
          </div>
          <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-300 transition" />
        </button>
        {missing.length > 0 && (
          <button
            onClick={() => missing.forEach((name) => addSubsystem(name))}
            title={missing.join(', ')}
            className="w-full flex items-center gap-2 p-2 rounded border border-slate-800 hover:bg-slate-800 text-left text-xs font-mono text-slate-300 transition"
          >
            <Plus className="w-3.5 h-3.5 text-teal-300 shrink-0" />
            <span className="truncate">Add from Brainstorming ({missing.join(', ')})</span>
          </button>
        )}
        <p className="text-[10px] text-slate-500 px-1 leading-relaxed">
          Drag devices into a frame to group them. Each subsystem is something your Soar agent can read and command, and becomes a subsystem class in the robot code.
        </p>
      </div>
    </>
  );
};

export const ComponentsView: React.FC = () => {
  const addDevice = useRobotStore((state) => state.addDevice);
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();

  return (
    <>
      <SubsystemsSection />
      <SectionHeader title="FRC Components" />
      <div className="px-3 pb-2 shrink-0">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search components"
          aria-label="Search components"
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-3">
        {DEVICE_CATEGORIES.map((category) => {
          const devices = Object.entries(FRC_DEVICE_DEFAULTS).filter(
            ([, device]) => device.category === category && (!query || device.label.toLowerCase().includes(query)),
          );
          if (devices.length === 0) return null;
          return (
            <details key={category} open className="group/section space-y-1.5">
              <summary className="flex items-center justify-between px-1 py-0.5 cursor-pointer select-none text-[11px] font-mono font-bold text-indigo-300">
                {category}
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 transition group-open/section:rotate-180" />
              </summary>
              {devices.map(([type, device]) => {
                const style = HARDWARE_STYLES[type];
                const ItemIcon = style.icon;
                return (
                  <button
                    key={type}
                    onClick={() => addDevice(type)}
                    className={`w-full flex items-center justify-between p-2 rounded bg-slate-950 hover:bg-slate-800 border ${style.borderColor} text-left transition group`}
                  >
                    <div className="flex items-center gap-2">
                      <ItemIcon className={`w-3.5 h-3.5 ${style.iconColor}`} />
                      <span className="text-xs font-mono text-slate-300">{device.label}</span>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition" />
                  </button>
                );
              })}
            </details>
          );
        })}
      </div>
    </>
  );
};

// ── Model & Contracts ──

/** Read-only, syntax-highlighted AGREE using Monaco's colorizer, without a full editor per item */
const AgreePreview: React.FC<{ sources: ContractSource[] }> = ({ sources }) => {
  const text = sources.map(({ label, text: body }) => `-- ${label}\n${body.trim()}`).join('\n\n');
  const [html, setHtml] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    beforeMonacoMount(monaco);
    // Colorized HTML uses the active theme's token classes
    monaco.editor.setTheme('sysmod-dark');
    monaco.editor.colorize(text, 'agree', { tabSize: 2 }).then((result) => !cancelled && setHtml(result));
    return () => {
      cancelled = true;
    };
  }, [text]);

  return html ? (
    <div className="agree-preview px-3 py-2 text-[11px] leading-relaxed font-mono overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <pre className="px-3 py-2 text-[11px] leading-relaxed font-mono text-slate-400 whitespace-pre">{text}</pre>
  );
};

interface ContractsViewProps {
  model: WorkbenchModel;
  onOpenAadl: () => void;
  onOpenContract: (scope: string) => void;
}

export const ContractsView: React.FC<ContractsViewProps> = ({ model, onOpenAadl, onOpenContract }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [SYSTEM_SCOPE]: true });

  const scopes = useMemo(() => {
    const types = [...new Set(model.nodes.map((n) => n.data?.deviceType))].sort((a, b) =>
      scopeLabel(a, FRC_DEVICE_DEFAULTS).localeCompare(scopeLabel(b, FRC_DEVICE_DEFAULTS)),
    );
    return [SYSTEM_SCOPE, ...types];
  }, [model.nodes]);

  const errorCount = (scope: string): number => model.program.errors.filter((e) => e.scope.startsWith(`${scope}:`)).length;

  return (
    <>
      <SectionHeader title="Model" />
      <button
        onClick={onOpenAadl}
        className="flex items-center gap-2 px-4 py-1 text-xs font-mono text-slate-300 hover:bg-slate-800/70 text-left"
      >
        <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> FRC_Robot_Architecture.aadl
      </button>

      <SectionHeader title="AGREE Contracts" />
      <p className="px-3 pb-2 text-[10px] font-sans text-slate-500">Read only. Open a contract in the editor to change it.</p>
      <div className="flex-1 min-h-0 overflow-y-auto pb-3">
        {scopes.map((scope) => {
          const sources = scope === SYSTEM_SCOPE ? model.contracts.system : model.contracts.deviceTypes[scope] || [];
          const isOpen = !!expanded[scope];
          const errors = errorCount(scope);
          return (
            <div key={scope} className="border-b border-slate-800/60">
              <div className="group flex items-center hover:bg-slate-800/70">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [scope]: !isOpen }))}
                  onDoubleClick={() => onOpenContract(scope)}
                  aria-expanded={isOpen}
                  className="flex-1 min-w-0 flex items-center gap-1.5 pl-2 py-1 text-xs font-mono text-slate-300 text-left"
                >
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-500" />}
                  <Sigma className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate">{scopeLabel(scope, FRC_DEVICE_DEFAULTS)}.agree</span>
                  {errors > 0 && <span className="ml-auto mr-1 text-[10px] font-bold text-red-400">{errors}</span>}
                </button>
                <button
                  onClick={() => onOpenContract(scope)}
                  title="Open in editor"
                  aria-label={`Edit ${scopeLabel(scope, FRC_DEVICE_DEFAULTS)} contract`}
                  className="p-1 mr-1 rounded text-slate-500 hover:text-slate-100 opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              {isOpen &&
                (sources.length > 0 ? (
                  <AgreePreview sources={sources} />
                ) : (
                  <p className="px-8 py-1.5 text-[11px] font-mono text-slate-500">-- No contract yet</p>
                ))}
            </div>
          );
        })}
      </div>
    </>
  );
};

// ── Export & Project ──

interface ProjectViewProps {
  onExportPdf: () => void;
  onOpenFile: (file: GeneratedFileId) => void;
  onSaveFile: (file: GeneratedFileId) => void;
  onOpenJudgeReport: () => void;
}

const FILE_ROWS: { id: GeneratedFileId; icon: React.ReactNode }[] = [
  { id: 'python', icon: <FileCode className="w-3.5 h-3.5 text-emerald-400" /> },
  { id: 'java', icon: <Code2 className="w-3.5 h-3.5 text-amber-400" /> },
  { id: 'aadl', icon: <FileText className="w-3.5 h-3.5 text-indigo-400" /> },
  { id: 'soar', icon: <Bot className="w-3.5 h-3.5 text-teal-400" /> },
  { id: 'agentAadl', icon: <FileText className="w-3.5 h-3.5 text-teal-400" /> },
];

/** A generated file: select it to open it as a tab, or save it with the icon on the right */
const GeneratedFileRow: React.FC<{ id: GeneratedFileId; icon: React.ReactNode; onOpen: () => void; onSave: () => void }> = ({ id, icon, onOpen, onSave }) => (
  <div className="flex items-stretch rounded border border-slate-800 hover:bg-slate-800/60 transition">
    <button onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-xs font-mono text-left text-slate-300" title={`Open ${GENERATED_FILES[id].fileName}`}>
      {icon}
      <span className="truncate">{GENERATED_FILES[id].fileName}</span>
      <span className="ml-auto text-[10px] text-slate-500 whitespace-nowrap">{GENERATED_FILES[id].description}</span>
    </button>
    <button onClick={onSave} className="px-2 border-l border-slate-800 text-slate-500 hover:text-slate-100" title={`Save ${GENERATED_FILES[id].fileName}`} aria-label={`Save ${GENERATED_FILES[id].fileName}`}>
      <Save className="w-3.5 h-3.5" />
    </button>
  </div>
);

const ProjectButton: React.FC<{ onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }> = ({ onClick, icon, label, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-mono text-left border transition ${
      danger ? 'border-red-500/20 text-red-400 hover:border-red-500/50' : 'border-slate-800 text-slate-300 hover:bg-slate-800'
    }`}
  >
    {icon}
    {label}
  </button>
);

// ── Behavior (Soar) ──

interface BehaviorViewProps {
  onOpenEditor: () => void;
  onOpenFile: (file: 'soar' | 'agentAadl') => void;
  onSaveFile: (file: 'soar' | 'agentAadl') => void;
}

export const BehaviorView: React.FC<BehaviorViewProps> = ({ onOpenEditor, onOpenFile, onSaveFile }) => (
  <>
    <SectionHeader title="Robot behavior" />
    <div className="px-3 space-y-2">
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Build what your robot decides to do with blocks. They become rules for <b className="text-slate-200">Soar</b>, a cognitive architecture
        from the University of Michigan that has been used for decades in robots and simulated pilots.
      </p>
      <ProjectButton onClick={onOpenEditor} icon={<Blocks className="w-3.5 h-3.5 text-teal-400" />} label="Open behavior editor" />
      <GeneratedFileRow id="soar" icon={<Bot className="w-3.5 h-3.5 text-teal-400" />} onOpen={() => onOpenFile('soar')} onSave={() => onSaveFile('soar')} />
      <GeneratedFileRow id="agentAadl" icon={<FileText className="w-3.5 h-3.5 text-teal-400" />} onOpen={() => onOpenFile('agentAadl')} onSave={() => onSaveFile('agentAadl')} />
      <p className="text-[10px] text-slate-500 px-1">
        To prove facts about the agent, open the editor and choose <b className="text-slate-300">Properties</b>.
      </p>
    </div>
    <SectionHeader title="How a rule works" />
    <ol className="px-4 pl-7 space-y-1 text-[11px] text-slate-400 list-decimal">
      <li>
        An <b className="text-slate-200">Operator</b> is proposed when its conditions are true.
      </li>
      <li>Soar picks one proposed operator.</li>
      <li>
        Its <b className="text-slate-200">Apply</b> rules send commands to devices.
      </li>
    </ol>
    <p className="px-3 mt-2 text-[10px] text-slate-500">The agent reads and commands the subsystem frames and devices on your architecture diagram.</p>
  </>
);

export const ProjectView: React.FC<ProjectViewProps> =({ onExportPdf, onOpenFile, onSaveFile, onOpenJudgeReport }) => {
  const clearWorkspace = useRobotStore((state) => state.clearWorkspace);
  return (
    <>
      <SectionHeader title="Generated code" />
      <div className="px-3 space-y-1.5">
        {FILE_ROWS.map((row) => (
          <GeneratedFileRow key={row.id} id={row.id} icon={row.icon} onOpen={() => onOpenFile(row.id)} onSave={() => onSaveFile(row.id)} />
        ))}
        <p className="text-[10px] text-slate-500 px-1">Opens as a tab and updates as you wire. Motor current limits come from each component.</p>
      </div>
      <SectionHeader title="Export" />
      <div className="px-3 space-y-1.5">
        <ProjectButton onClick={onOpenJudgeReport} icon={<Award className="w-3.5 h-3.5 text-amber-400" />} label="Judge report (proofs)" />
        <ProjectButton onClick={onExportPdf} icon={<FileText className="w-3.5 h-3.5 text-sky-400" />} label="PDF schematic and BOM" />
      </div>
      <SectionHeader title="Workspace" />
      <div className="px-3 space-y-1.5">
        <ProjectButton onClick={() => window.confirm('Remove every component and wire from the diagram?') && clearWorkspace()} icon={<Trash2 className="w-3.5 h-3.5" />} label="Clear diagram" danger />
      </div>
    </>
  );
};
