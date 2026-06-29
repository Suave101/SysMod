import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useRobotStore, RobotNode } from '../store/useRobotStore';
import { Eye } from 'lucide-react';

export const SensorNode: React.FC<NodeProps<RobotNode>> = ({ id, data }) => {
  const updateNodeLabel = useRobotStore((state) => state.updateNodeLabel);

  return (
    <div className="bg-slate-900 border border-cyan-500 rounded-lg shadow-xl w-52 text-slate-200 relative">
      {/* FIXED: Changed handle type to "source" so it can successfully connect to the Control Hub's I2C Target bank */}
      <Handle 
        type="source" 
        position={Position.Left} 
        id="i2c_output" 
        className="!bg-cyan-400 !w-2.5 !h-2.5 !-left-[6px] !top-1/2 !-translate-y-1/2"
      />
      
      <div className="bg-cyan-950/30 border-b border-cyan-500/20 px-3 py-2 flex items-center gap-2 rounded-t-lg">
        <Eye className="w-4 h-4 text-cyan-400 shrink-0" />
        <div className="w-full">
          <input 
            type="text"
            value={data.label}
            onChange={(e) => updateNodeLabel(id, e.target.value)}
            className="bg-transparent border-b border-transparent hover:border-cyan-500/30 focus:border-cyan-500 focus:outline-none font-mono font-semibold text-xs text-cyan-400 w-full px-0.5 py-0"
            placeholder="sensorName"
          />
        </div>
      </div>
      
      <div className="p-2 bg-slate-950/40 text-[11px] font-mono text-slate-400 flex justify-between rounded-b-lg">
        <span className="text-slate-500">Protocol:</span>
        <span className="text-slate-300">I2C (0x3C)</span>
      </div>
    </div>
  );
};