import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Blocks, Bot, Code2, FileText, Sigma, Terminal, Workflow, X } from 'lucide-react';
import { FRC_DEVICE_DEFAULTS } from './store/useRobotStore';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { generateArchitectureReportHtml } from './utils/pdfGenerator';
import { ActivityBar, SideView } from './workbench/ActivityBar';
import { BehaviorView, ComponentsView, ContractsView, ProjectView } from './workbench/SideBarViews';
import { ContractEditor, DiagramEditor, GENERATED_FILES, GeneratedFileEditor, GeneratedFileId, saveGeneratedFile } from './workbench/Editors';
import { BottomPanel, collectProblems, PanelView, StatusBar } from './workbench/BottomPanel';
import { scopeLabel, useWorkbenchModel } from './workbench/useWorkbenchModel';
import { JudgeReport } from './workbench/JudgeReport';
import { BehaviorEditor } from './workbench/BehaviorEditor';

type EditorTab =
  | { id: 'diagram' }
  | { id: 'judges' }
  | { id: 'behavior' }
  | { id: `file:${GeneratedFileId}`; file: GeneratedFileId }
  | { id: `contract:${string}`; scope: string };

const FILE_ICONS: Record<GeneratedFileId, React.ReactNode> = {
  aadl: <FileText className="w-3.5 h-3.5 text-indigo-400" />,
  python: <Terminal className="w-3.5 h-3.5 text-emerald-400" />,
  java: <Code2 className="w-3.5 h-3.5 text-amber-400" />,
  soar: <Bot className="w-3.5 h-3.5 text-teal-400" />,
};

const DIAGRAM_TAB: EditorTab = { id: 'diagram' };
const SIDE_BAR_LIMITS = { min: 200, max: 520, initial: 288 };
const PANEL_LIMITS = { min: 120, max: 600, initial: 220 };

/** Tracks a pointer drag on a sash and reports the new size, clamped to limits */
function useSash(initial: number, limits: { min: number; max: number }, axis: 'x' | 'y', invert = false) {
  const [size, setSize] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);

  const start = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const origin = axis === 'x' ? event.clientX : event.clientY;
      const startSize = size;
      setIsDragging(true);
      const move = (e: PointerEvent): void => {
        const delta = (axis === 'x' ? e.clientX : e.clientY) - origin;
        setSize(Math.min(limits.max, Math.max(limits.min, startSize + (invert ? -delta : delta))));
      };
      const end = (): void => {
        setIsDragging(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
    },
    [axis, invert, limits.max, limits.min, size],
  );

  return { size, start, isDragging };
}

export default function App(): React.JSX.Element {
  const navigate = useNavigate();
  const model = useWorkbenchModel();
  const { nodes, edges } = model;

  const [sideView, setSideView] = useState<SideView>('components');
  const [isSideBarOpen, setIsSideBarOpen] = useState(true);
  const [panelView, setPanelView] = useState<PanelView>('problems');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [tabs, setTabs] = useState<EditorTab[]>([DIAGRAM_TAB]);
  const [activeTabId, setActiveTabId] = useState<EditorTab['id']>('diagram');
  const sideBar = useSash(SIDE_BAR_LIMITS.initial, SIDE_BAR_LIMITS, 'x');
  const panel = useSash(PANEL_LIMITS.initial, PANEL_LIMITS, 'y', true);

  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfReportHtml, setPdfReportHtml] = useState('');

  const openTab = useCallback((tab: EditorTab) => {
    setTabs((open) => (open.some((t) => t.id === tab.id) ? open : [...open, tab]));
    setActiveTabId(tab.id);
  }, []);

  const openContract = useCallback((scope: string) => openTab({ id: `contract:${scope}`, scope }), [openTab]);
  const openJudgeReport = useCallback(() => openTab({ id: 'judges' }), [openTab]);
  const openBehavior = useCallback(() => openTab({ id: 'behavior' }), [openTab]);
  const openFile = useCallback((file: GeneratedFileId) => openTab({ id: `file:${file}`, file }), [openTab]);

  const closeTab = (id: EditorTab['id']): void => {
    if (id === 'diagram') return;
    const index = tabs.findIndex((t) => t.id === id);
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) setActiveTabId(remaining[Math.max(0, index - 1)].id);
  };

  const selectSideView = (view: SideView): void => {
    if (isSideBarOpen && view === sideView) {
      setIsSideBarOpen(false);
    } else {
      setSideView(view);
      setIsSideBarOpen(true);
    }
  };

  const showPanel = (view: PanelView): void => {
    if (isPanelOpen && panelView === view) {
      setIsPanelOpen(false);
    } else {
      setPanelView(view);
      setIsPanelOpen(true);
    }
  };

  const proveAndShow = (): void => {
    setPanelView('proofs');
    setIsPanelOpen(true);
    model.proof.prove();
  };

  // VS Code's shortcuts: Ctrl+B toggles the side bar, Ctrl+J toggles the panel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSideBarOpen((open) => !open);
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsPanelOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleExportPdf = (): void => {
    setPdfReportHtml(generateArchitectureReportHtml(nodes, edges));
    setIsPdfModalOpen(true);
  };

  const tabTitle = (tab: EditorTab): { label: string; icon: React.ReactNode } => {
    if (tab.id === 'diagram') return { label: 'Architecture', icon: <Workflow className="w-3.5 h-3.5 text-sky-400" /> };
    if ('file' in tab) return { label: GENERATED_FILES[tab.file].fileName, icon: FILE_ICONS[tab.file] };
    if (tab.id === 'judges') return { label: 'Judge Report', icon: <Award className="w-3.5 h-3.5 text-amber-400" /> };
    if (tab.id === 'behavior') return { label: 'Behavior', icon: <Blocks className="w-3.5 h-3.5 text-teal-400" /> };
    return { label: `${scopeLabel(tab.scope, FRC_DEVICE_DEFAULTS)}.agree`, icon: <Sigma className="w-3.5 h-3.5 text-emerald-400" /> };
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) || DIAGRAM_TAB;
  const problemCount = collectProblems(model).filter((p) => p.severity === 'error').length;
  const isResizing = sideBar.isDragging || panel.isDragging;
  // Changing this tells the diagram to refit after the layout settles
  const layoutKey = `${isSideBarOpen}-${isPanelOpen}-${activeTab.id === 'diagram'}-${isResizing ? 'drag' : `${sideBar.size}x${panel.size}`}`;

  return (
    <div className={`flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden ${isResizing ? 'select-none' : ''}`}>
      <div className="flex flex-1 min-h-0">
        <ActivityBar activeView={sideView} isSideBarOpen={isSideBarOpen} problemCount={problemCount} onSelect={selectSideView} onBack={() => navigate('/brainstorming')} />

        {isSideBarOpen && (
          <aside style={{ width: sideBar.size }} className="relative shrink-0 flex flex-col bg-slate-900 border-r border-slate-800" aria-label="Side bar">
            {sideView === 'components' && <ComponentsView />}
            {sideView === 'contracts' && <ContractsView model={model} onOpenAadl={() => openFile('aadl')} onOpenContract={openContract} />}
            {sideView === 'behavior' && <BehaviorView onOpenEditor={openBehavior} onOpenFile={() => openFile('soar')} onSaveFile={() => saveGeneratedFile(GENERATED_FILES.soar, model.generated.soar)} />}
            {sideView === 'project' && (
              <ProjectView
                onExportPdf={handleExportPdf}
                onOpenFile={openFile}
                onSaveFile={(file) => saveGeneratedFile(GENERATED_FILES[file], model.generated[file])}
                onOpenJudgeReport={openJudgeReport}
              />
            )}
            <div
              onPointerDown={sideBar.start}
              className="absolute top-0 -right-1 bottom-0 w-2 cursor-col-resize z-10 hover:bg-indigo-500/40"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side bar"
            />
          </aside>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Editor tabs */}
          <div className="h-9 shrink-0 flex items-end bg-slate-950 border-b border-slate-800 overflow-x-auto" role="tablist">
            {tabs.map((tab) => {
              const { label, icon } = tabTitle(tab);
              const isActive = tab.id === activeTab.id;
              return (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTabId(tab.id)}
                  onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
                  className={`group h-full flex items-center gap-1.5 pl-3 pr-1.5 border-r border-slate-800 text-xs font-mono cursor-pointer select-none whitespace-nowrap ${
                    isActive ? 'bg-slate-900 text-slate-100 border-t-2 border-t-indigo-400' : 'text-slate-500 hover:text-slate-300 border-t-2 border-t-transparent'
                  }`}
                >
                  {icon}
                  {label}
                  {tab.id !== 'diagram' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      aria-label={`Close ${label}`}
                      className={`p-0.5 rounded hover:bg-slate-700 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                </div>
              );
            })}
          </div>

          {/* The diagram stays mounted so its pan and zoom survive switching tabs */}
          <div className="relative flex-1 min-h-0">
            <div className={`absolute inset-0 ${activeTab.id === 'diagram' ? '' : 'invisible pointer-events-none'}`}>
              <DiagramEditor isVisible={activeTab.id === 'diagram'} layoutKey={layoutKey} issues={model.report.issues} />
            </div>
            {/* Opaque and on top, because React Flow forces its nodes visible inside a hidden parent */}
            {'file' in activeTab && (
              <div className="absolute inset-0 z-10 bg-slate-950">
                <GeneratedFileEditor key={activeTab.file} file={GENERATED_FILES[activeTab.file]} content={model.generated[activeTab.file]} />
              </div>
            )}
            {activeTab.id === 'behavior' && (
              <div className="absolute inset-0 z-10 bg-slate-950">
                <BehaviorEditor model={model} onOpenFile={() => openFile('soar')} />
              </div>
            )}
            {activeTab.id === 'judges' && (
              <div className="absolute inset-0 z-10 bg-slate-950">
                <JudgeReport model={model} />
              </div>
            )}
            {'scope' in activeTab && (
              <div className="absolute inset-0 z-10 bg-slate-950">
                <ContractEditor key={activeTab.scope} scope={activeTab.scope} model={model} onProve={proveAndShow} />
              </div>
            )}
          </div>

          {isPanelOpen && (
            <BottomPanel
              model={model}
              view={panelView}
              height={panel.size}
              onViewChange={setPanelView}
              onClose={() => setIsPanelOpen(false)}
              onOpenContract={openContract}
              onOpenJudgeReport={openJudgeReport}
              onResizeStart={panel.start}
            />
          )}
        </div>
      </div>

      <StatusBar model={model} onShowPanel={showPanel} />

      <PdfPreviewModal isOpen={isPdfModalOpen} onClose={() => setIsPdfModalOpen(false)} htmlContent={pdfReportHtml} />
    </div>
  );
}
