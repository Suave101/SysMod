import React from 'react';
import { ArrowLeft, Boxes, FolderTree, Share2 } from 'lucide-react';
import logoUrl from '../../assets/logo.svg';

export type SideView = 'components' | 'contracts' | 'project';

const VIEWS: { id: SideView; label: string; icon: React.ReactNode }[] = [
  { id: 'components', label: 'Components', icon: <Boxes className="w-5 h-5" /> },
  { id: 'contracts', label: 'Model & Contracts', icon: <FolderTree className="w-5 h-5" /> },
  { id: 'project', label: 'Export & Project', icon: <Share2 className="w-5 h-5" /> },
];

interface ActivityBarProps {
  activeView: SideView;
  isSideBarOpen: boolean;
  problemCount: number;
  onSelect: (view: SideView) => void;
  onBack: () => void;
}

/** Like VS Code, choosing the open view again collapses the side bar */
export const ActivityBar: React.FC<ActivityBarProps> = ({ activeView, isSideBarOpen, problemCount, onSelect, onBack }) => (
  <nav className="w-12 shrink-0 flex flex-col items-center justify-between bg-slate-950 border-r border-slate-800 py-2">
    <div className="flex flex-col items-center gap-1">
      <img src={logoUrl} alt="SysMod Studio" title="SysMod Studio" className="w-7 h-7 mb-2" draggable={false} />
      {VIEWS.map((view) => {
        const isActive = isSideBarOpen && activeView === view.id;
        return (
          <button
            key={view.id}
            onClick={() => onSelect(view.id)}
            title={view.label}
            aria-label={view.label}
            aria-pressed={isActive}
            className={`relative w-12 h-11 flex items-center justify-center transition ${
              isActive ? 'text-slate-100' : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-indigo-400 rounded-r" />}
            {view.icon}
            {view.id === 'contracts' && problemCount > 0 && (
              <span className="absolute top-1.5 right-2 min-w-4 h-4 px-1 rounded-full bg-red-600 text-[9px] font-mono font-bold text-white flex items-center justify-center">
                {problemCount > 99 ? '99+' : problemCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
    <button onClick={onBack} title="Back to Brainstorming" aria-label="Back to Brainstorming" className="w-12 h-11 flex items-center justify-center text-slate-500 hover:text-slate-200 transition">
      <ArrowLeft className="w-5 h-5" />
    </button>
  </nav>
);
