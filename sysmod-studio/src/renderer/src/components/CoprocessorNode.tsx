import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useRobotStore, RobotNode } from '../store/useRobotStore';
import { Terminal } from 'lucide-react';

export const CoprocessorNode: React.FC<NodeProps<RobotNode>> = ({ id, data }) => {
  const updateNodeLabel = useRobotStore((state) => state.updateNodeLabel);

  return (
    <div className="bg-slate-900 border border-indigo-500 rounded-lg shadow-xl w-56 text-slate-200 relative">
      <Handle 
        type="target" 
        position={Position.Left} 
        id="power_data_in" 
        className="!bg-slate-400 !w-2.5 !h-2.5 !-left-[6px] !top-1/2 !-translate-y-1/2"
      />
      
      <div className="bg-indigo-950/40 border-b border-indigo-500/20 px-3 py-2 flex items-center gap-2 rounded-t-lg">
        <Terminal className="w-4 h-4 text-indigo-400 shrink-0" />
        <div className="w-full">
          <input 
            type="text"
            value={data.label}
            onChange={(e) => updateNodeLabel(id, e.target.value)}
            className="bg-transparent border-b border-transparent hover:border-indigo-500/30 focus:border-indigo-500 focus:outline-none font-mono font-semibold text-xs text-indigo-400 w-full px-0.5 py-0"
            placeholder="coprocessorName"
          />
        </div>
      </div>
      
      <div className="p-3 bg-slate-950/40 space-y-2 text-xs font-mono rounded-b-lg">
        <div className="text-[11px] flex justify-between">
          <span className="text-slate-500">Static IP:</span>
          <span className="text-indigo-300">{data.ipAddress}</span>
        </div>
        
        <div className="flex items-center justify-between relative pt-1.5 border-t border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase tracking-tight">USB Link</span>
          <Handle 
            type="source" 
            position={Position.Right} 
            id="usb_link" 
            className="!bg-indigo-400 !w-2.5 !h-2.5 !-right-[6px] !top-1/2 !-translate-y-1/2"
          />
        </div>
      </div>
    </div>
  );
};