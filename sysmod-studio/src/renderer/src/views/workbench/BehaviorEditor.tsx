/**
 * The Behavior tab: the SoarBlocks editor inside the workbench. Blocks on the left, the Soar
 * agent they generate on the right, both updating as you edit.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as Blockly from 'blockly';
import { ChevronRight, Download, FileCode, FolderOpen, Sparkles, Trash2, X } from 'lucide-react';
import { useRobotStore } from '../store/useRobotStore';
import { setDeviceOptions, TOOLBOX } from '../behavior/blocks';
import { readBlocksFile, writeBlocksFile } from '../behavior/blockFiles';
import { saveGeneratedFile } from './Editors';
import { behaviorDevices, exampleBehavior } from '../behavior/robotDevices';
import { beforeMonacoMount, EDITOR_OPTIONS } from '../utils/monacoLanguages';
import { WorkbenchModel } from './useWorkbenchModel';

const THEME = Blockly.Theme.defineTheme('sysmod-dark', {
  name: 'sysmod-dark',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#020617',
    toolboxBackgroundColour: '#0f172a',
    toolboxForegroundColour: '#cbd5e1',
    flyoutBackgroundColour: '#1e293b',
    flyoutForegroundColour: '#e2e8f0',
    flyoutOpacity: 0.97,
    scrollbarColour: '#475569',
    scrollbarOpacity: 0.6,
    insertionMarkerColour: '#f8fafc',
    insertionMarkerOpacity: 0.3,
    cursorColour: '#f59e0b',
  },
  fontStyle: { family: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif', size: 11 },
});

const CODE_OPTIONS = { ...EDITOR_OPTIONS, fontSize: 12, minimap: { enabled: false }, lineNumbers: 'off' as const, padding: { top: 12, bottom: 12 } };

interface BehaviorEditorProps {
  model: WorkbenchModel;
  onOpenFile: () => void;
}

export const BehaviorEditor: React.FC<BehaviorEditorProps> = ({ model, onOpenFile }) => {
  const host = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; lines: string[] } | null>(null);
  const devices = useMemo(() => behaviorDevices(model.nodes, model.subsystems), [model.nodes, model.subsystems]);

  // The device dropdown asks for its options each time it opens, so this keeps it current
  useEffect(() => setDeviceOptions(devices), [devices]);

  useEffect(() => {
    if (!host.current) return;
    const ws = Blockly.inject(host.current, {
      toolbox: TOOLBOX,
      theme: THEME,
      renderer: 'zelos',
      // Blockly's sprites and sounds are served locally; the app's security policy blocks the CDN copy
      media: './blockly-media/',
      trashcan: true,
      // From SoarBlocks: right-click a block to collapse it or add a comment
      collapse: true,
      comments: true,
      grid: { spacing: 24, length: 2, colour: '#1e293b', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.85, maxScale: 2.5, minScale: 0.3, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: false },
    });
    workspace.current = ws;

    const saved = useRobotStore.getState().behaviorBlocks;
    if (saved) {
      try {
        Blockly.serialization.workspaces.load(saved, ws);
      } catch (error) {
        console.error('Could not load behavior blocks', error);
      }
    }

    // Saving on every real change lets the agent.soar tab and the side preview follow along
    const onChange = (event: Blockly.Events.Abstract): void => {
      if (event.isUiEvent) return;
      useRobotStore.getState().setBehaviorBlocks(Blockly.serialization.workspaces.save(ws));
    };
    ws.addChangeListener(onChange);

    const observer = new ResizeObserver(() => Blockly.svgResize(ws));
    observer.observe(host.current);

    return () => {
      observer.disconnect();
      ws.removeChangeListener(onChange);
      ws.dispose();
      workspace.current = null;
    };
  }, []);

  const loadExample = (): void => {
    const ws = workspace.current;
    if (!ws) return;
    if (ws.getAllBlocks(false).length > 0 && !window.confirm('Replace your blocks with the example?')) return;
    Blockly.serialization.workspaces.load(exampleBehavior(devices), ws);
    useRobotStore.getState().setBehaviorBlocks(Blockly.serialization.workspaces.save(ws));
  };

  const clear = (): void => {
    const ws = workspace.current;
    if (!ws || ws.getAllBlocks(false).length === 0 || !window.confirm('Remove every behavior block?')) return;
    ws.clear();
    useRobotStore.getState().setBehaviorBlocks(null);
  };

  const openBlocks = async (file: File | undefined): Promise<void> => {
    const ws = workspace.current;
    if (!ws || !file) return;
    try {
      const opened = readBlocksFile(await file.text());
      if (ws.getAllBlocks(false).length > 0 && !window.confirm(`Replace your blocks with ${file.name}?`)) return;
      Blockly.serialization.workspaces.load(opened.state, ws);
      useRobotStore.getState().setBehaviorBlocks(Blockly.serialization.workspaces.save(ws));
      setMessage({ kind: 'info', lines: [`Opened ${file.name}.`, ...opened.notes] });
    } catch (error) {
      setMessage({ kind: 'error', lines: [`Could not open ${file.name}.`, (error as Error).message] });
    }
  };

  const saveBlocks = (): Promise<void> =>
    saveGeneratedFile(
      { fileName: 'behavior.json', language: 'json', folder: 'Behavior', description: 'Behavior blocks' },
      writeBlocksFile(useRobotStore.getState().behaviorBlocks),
    );

  const button = 'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-700';

  return (
    <div className="flex flex-col h-full">
      <div className="h-8 shrink-0 flex items-center justify-between px-3 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
          <span>Behavior</span>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <span className="text-slate-200">Soar agent blocks</span>
          <span className="ml-2 text-[10px] text-slate-500">
            {model.subsystems.length} {model.subsystems.length === 1 ? 'subsystem' : 'subsystems'} and {devices.length - model.subsystems.length} devices from the diagram
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={loadExample} className={button}>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Load example
          </button>
          <button onClick={() => fileInput.current?.click()} className={button} title="Open a behavior.json, SoarBlocks or Blockly XML file">
            <FolderOpen className="w-3.5 h-3.5 text-sky-400" /> Open blocks
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.xml,application/json,text/xml"
            className="hidden"
            onChange={(e) => {
              void openBlocks(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button onClick={() => void saveBlocks()} className={button} title="Save these blocks to a file you can open later">
            <Download className="w-3.5 h-3.5 text-sky-400" /> Save blocks
          </button>
          <button onClick={clear} className={button}>
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
          <button onClick={onOpenFile} className={button}>
            <FileCode className="w-3.5 h-3.5 text-teal-400" /> Open agent.soar
          </button>
        </div>
      </div>
      {message && (
        <div
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`shrink-0 flex items-start justify-between gap-3 px-3 py-1.5 text-[11px] border-b ${
            message.kind === 'error' ? 'bg-red-950/60 border-red-900 text-red-200' : 'bg-sky-950/50 border-sky-900 text-sky-200'
          }`}
        >
          <div>
            {message.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          <button onClick={() => setMessage(null)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 flex">
        <div ref={host} className="flex-1 min-w-0 h-full" aria-label="Behavior blocks" />
        <aside className="w-[34%] min-w-[260px] max-w-[520px] flex flex-col border-l border-slate-800 bg-slate-900" aria-label="Generated Soar">
          <div className="h-8 shrink-0 flex items-center px-3 text-[11px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800">
            agent.soar · live
          </div>
          <div className="flex-1 min-h-0">
            <Editor height="100%" language="soar" value={model.generated.soar} theme="sysmod-dark" beforeMount={beforeMonacoMount} options={CODE_OPTIONS} path="generated/agent-preview.soar" />
          </div>
        </aside>
      </div>
    </div>
  );
};
