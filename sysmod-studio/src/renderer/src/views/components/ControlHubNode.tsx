import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Cpu, Zap, Wind, Trash2 } from 'lucide-react';
import { useRobotStore, FRCNodeData } from '../store/useRobotStore';

export const ControlHubNode: React.FC<NodeProps> = ({ id, data }) => {
  const nodeData = data as unknown as FRCNodeData;
  const removeNode = useRobotStore((state) => state.removeNode);
  const deviceType = nodeData.deviceType || '';

  // Render roboRIO 2.0 or REV Power Distribution Hub ports
  if (deviceType === 'PDH') {
    return (
      <div className="relative min-w-[280px] bg-slate-900 border-2 border-amber-500/60 rounded-xl p-3.5 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="font-mono text-xs font-black text-slate-100">{nodeData.label || id}</h3>
              <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider block">Power Distribution Hub</span>
            </div>
          </div>
          <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/80 px-2 py-1 rounded border border-red-500/20 relative">
            <Handle
              type="target"
              position={Position.Left}
              id="pwr-12v-in"
              className="w-3 h-3 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-12px]"
            />
            <span>Main Battery 12V In</span>
            <span className="text-slate-500 text-[8px]">120A Breaker</span>
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/80 px-2 py-1 rounded border border-red-500/20 relative">
            <span>20x Fused 12V Power Out</span>
            <span className="text-slate-500 text-[8px]">To Motors &amp; RIO</span>
            <Handle
              type="source"
              position={Position.Right}
              id="pwr-12v-out"
              className="w-3 h-3 !bg-red-500 !border-2 !border-slate-950 rounded-full !right-[-12px]"
            />
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-amber-400 bg-slate-950/80 px-2 py-1 rounded border border-amber-500/20 relative">
            <span>CAN Telemetry</span>
            <Handle
              type="source"
              position={Position.Right}
              id="can-out"
              className="w-3 h-3 !bg-amber-400 !border-2 !border-slate-950 rounded-full !right-[-12px]"
            />
          </div>
        </div>
      </div>
    );
  }

  // Default roboRIO 2.0 / Coprocessor Layout
  return (
    <div className="relative min-w-[280px] bg-slate-900 border-2 border-indigo-500/60 rounded-xl p-3.5 shadow-2xl">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="font-mono text-xs font-black text-slate-100">{nodeData.label || id}</h3>
            <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-wider block">Primary Controller</span>
          </div>
        </div>
        <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-3 space-y-1.5">
        {/* 12V Power In */}
        <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/80 px-2 py-1 rounded border border-red-500/20 relative">
          <Handle
            type="target"
            position={Position.Left}
            id="pwr-12v-in"
            className="w-3 h-3 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-12px]"
          />
          <span>12V Main Power In</span>
          <span className="text-slate-500 text-[8px]">From PDH</span>
        </div>

        {/* CAN Bus Loop Out */}
        <div className="flex items-center justify-between text-[9px] font-mono text-amber-400 bg-slate-950/80 px-2 py-1 rounded border border-amber-500/20 relative">
          <span>CAN Bus Primary Loop</span>
          <span className="text-slate-500 text-[8px]">To Actuators</span>
          <Handle
            type="source"
            position={Position.Right}
            id="can-out"
            className="w-3 h-3 !bg-amber-400 !border-2 !border-slate-950 rounded-full !right-[-12px]"
          />
        </div>

        {/* Ethernet Network */}
        <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 bg-slate-950/80 px-2 py-1 rounded border border-emerald-500/20 relative">
          <span>Radio / Vision Ethernet</span>
          <span className="text-slate-500 text-[8px]">10/100 Eth</span>
          <Handle
            type="source"
            position={Position.Right}
            id="eth-out"
            className="w-3 h-3 !bg-emerald-500 !border-2 !border-slate-950 rounded-full !right-[-12px]"
          />
        </div>

        {/* 5V Sensor Rail */}
        <div className="flex items-center justify-between text-[9px] font-mono text-orange-400 bg-slate-950/80 px-2 py-1 rounded border border-orange-500/20 relative">
          <span>5V DIO / PWM Power Rail</span>
          <span className="text-slate-500 text-[8px]">To Sensors</span>
          <Handle
            type="source"
            position={Position.Right}
            id="pwr-5v-out"
            className="w-3 h-3 !bg-orange-500 !border-2 !border-slate-950 rounded-full !right-[-12px]"
          />
        </div>
      </div>
    </div>
  );
};