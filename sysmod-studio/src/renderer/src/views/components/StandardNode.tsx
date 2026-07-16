import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useRobotStore, RobotNode } from '../store/useRobotStore';
import { Trash2, Box, Cpu, Eye, Zap, Camera, Settings, Compass } from 'lucide-react';

// 1. Icon Library Mapping
const IconMap: Record<string, React.FC<any>> = {
  Box, Cpu, Eye, Zap, Camera, Settings, Compass
};

// 2. Safe Tailwind Theme Mapping (Tailwind compilers need full strings, no string interpolation)
const themes: Record<string, any> = {
  amber: { border: 'border-amber-500', bg: 'bg-amber-950/30', text: 'text-amber-400', focus: 'focus:border-amber-500' },
  cyan: { border: 'border-cyan-500', bg: 'bg-cyan-950/30', text: 'text-cyan-400', focus: 'focus:border-cyan-500' },
  indigo: { border: 'border-indigo-500', bg: 'bg-indigo-950/40', text: 'text-indigo-400', focus: 'focus:border-indigo-500' },
  rose: { border: 'border-rose-500', bg: 'bg-rose-950/30', text: 'text-rose-400', focus: 'focus:border-rose-500' },
  emerald: { border: 'border-emerald-500', bg: 'bg-emerald-950/30', text: 'text-emerald-400', focus: 'focus:border-emerald-500' },
};

export const StandardNode: React.FC<NodeProps<RobotNode>> = ({ id, data }) => {
  const updateNodeLabel = useRobotStore((state) => state.updateNodeLabel);
  const deleteNode = useRobotStore((state) => state.deleteNode);

  const theme = themes[data.theme as string] || themes.cyan;
  const Icon = IconMap[data.iconName as string] || Box;

  return (
    <div className={`bg-slate-900 border ${theme.border} rounded-lg shadow-xl w-52 text-slate-200 relative group`}>
      
      {/* Header */}
      <div className={`${theme.bg} border-b border-slate-800 px-3 py-2 flex items-center justify-between rounded-t-lg`}>
        <div className="flex items-center gap-2 flex-1 mr-2">
          <Icon className={`w-4 h-4 ${theme.text} shrink-0`} />
          <input 
            type="text"
            value={data.label}
            onChange={(e) => updateNodeLabel(id, e.target.value)}
            className={`bg-transparent border-b border-transparent hover:border-slate-700 ${theme.focus} focus:outline-none font-mono font-semibold text-xs ${theme.text} w-full px-0.5`}
          />
        </div>
        <button 
          onClick={() => deleteNode(id)}
          className="nodrag text-slate-500 hover:text-rose-400 p-1 rounded transition cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Ports Interface */}
      <div className="py-2 flex flex-col gap-1 bg-slate-950/40">
        
        {/* Render Targets (Left Side) */}
        {(data.inputs as any[])?.map((port) => (
          <div key={port.id} className="relative flex items-center px-3 py-1">
            <Handle type="target" position={Position.Left} id={port.id} className={`!w-2.5 !h-2.5 !-left-[6px] ${port.color}`} />
            <span className="text-[10px] text-slate-400 font-mono tracking-tight">{port.label}</span>
          </div>
        ))}

        {/* Render Sources (Right Side) */}
        {(data.outputs as any[])?.map((port) => (
          <div key={port.id} className="relative flex items-center justify-end px-3 py-1">
            <span className="text-[10px] text-slate-400 font-mono tracking-tight">{port.label}</span>
            <Handle type="source" position={Position.Right} id={port.id} className={`!w-2.5 !h-2.5 !-right-[6px] ${port.color}`} />
          </div>
        ))}
      </div>

      {/* Footer Properties */}
      {data.details && (
        <div className="p-2 bg-slate-900 border-t border-slate-800 text-[10px] font-mono text-slate-400 rounded-b-lg space-y-1">
          {Object.entries(data.details as Record<string, string>).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-slate-500">{key}:</span>
              <span className="text-slate-300">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};