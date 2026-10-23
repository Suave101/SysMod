import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Trash2, Box, Zap, Radio, Wind, Camera } from 'lucide-react';
import { useRobotStore, FRCNodeData } from '../store/useRobotStore';

export const StandardNode: React.FC<NodeProps> = ({ id, data }) => {
  const nodeData = data as unknown as FRCNodeData;
  const removeNode = useRobotStore((state) => state.removeNode);
  const deviceType = nodeData.deviceType || '';

  // Render port handles matching device hardware
  const renderHardwarePorts = () => {
    if (deviceType === 'Limelight') {
      return (
        <>
          {/* 12V Power In */}
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/80 px-2 py-1 rounded my-1 border border-red-500/20 relative">
            <Handle
              type="target"
              position={Position.Left}
              id="pwr-12v-in"
              className="w-3 h-3 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-12px]"
            />
            <span>12V Power In</span>
            <span className="text-slate-500 text-[8px]">PDH Ch</span>
          </div>
          {/* Ethernet Data Out */}
          <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 bg-slate-950/80 px-2 py-1 rounded my-1 border border-emerald-500/20 relative">
            <span>Ethernet Vision</span>
            <span className="text-slate-500 text-[8px]">Network</span>
            <Handle
              type="source"
              position={Position.Right}
              id="eth-out"
              className="w-3 h-3 !bg-emerald-500 !border-2 !border-slate-950 rounded-full !right-[-12px]"
            />
          </div>
        </>
      );
    }

    if (deviceType === 'SolenoidValve') {
      return (
        <>
          <div className="flex items-center justify-between text-[9px] font-mono text-sky-400 bg-slate-950/80 px-2 py-1 rounded my-1 border border-sky-500/20 relative">
            <Handle
              type="target"
              position={Position.Left}
              id="pneumatic-in"
              className="w-3 h-3 !bg-sky-500 !border-2 !border-slate-950 rounded-full !left-[-12px]"
            />
            <span>Air Pressure In</span>
            <span className="text-slate-500 text-[8px]">Pneumatics Hub</span>
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono text-sky-300 bg-slate-950/80 px-2 py-1 rounded my-1 border border-sky-500/20 relative">
            <span>Action Air Out</span>
            <span className="text-slate-500 text-[8px]">Piston Cylinder</span>
            <Handle
              type="source"
              position={Position.Right}
              id="pneumatic-out"
              className="w-3 h-3 !bg-sky-400 !border-2 !border-slate-950 rounded-full !right-[-12px]"
            />
          </div>
        </>
      );
    }

    // Default Motor Controllers / CAN Sensors (Kraken, SPARK Max, CANcoder, Pigeon)
    return (
      <>
        {/* Power Supply Port */}
        <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/80 px-2 py-1 rounded my-1 border border-red-500/20 relative">
          <Handle
            type="target"
            position={Position.Left}
            id="pwr-12v-in"
            className="w-3 h-3 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-12px]"
          />
          <span>12V Main Power In</span>
          <span className="text-slate-500 text-[8px]">PDH</span>
        </div>

        {/* CAN Bus Daisy Chain Ports */}
        <div className="flex items-center justify-between text-[9px] font-mono text-amber-400 bg-slate-950/80 px-2 py-1 rounded my-1 border border-amber-500/20 relative">
          <Handle
            type="target"
            position={Position.Left}
            id="can-in"
            className="w-3 h-3 !bg-amber-400 !border-2 !border-slate-950 rounded-full !left-[-12px]"
          />
          <span>CAN Bus In</span>
          <span>CAN Bus Out</span>
          <Handle
            type="source"
            position={Position.Right}
            id="can-out"
            className="w-3 h-3 !bg-amber-400 !border-2 !border-slate-950 rounded-full !right-[-12px]"
          />
        </div>
      </>
    );
  };

  return (
    <div className="relative group min-w-[240px] bg-slate-900 border border-slate-700/80 rounded-xl p-3 shadow-2xl hover:border-cyan-500/80 transition">
      {/* Node Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {deviceType === 'Limelight' ? <Camera className="w-4 h-4 text-lime-400" /> :
           deviceType === 'SolenoidValve' ? <Wind className="w-4 h-4 text-sky-400" /> :
           deviceType === 'Pigeon2' ? <Radio className="w-4 h-4 text-rose-400" /> :
           <Box className="w-4 h-4 text-cyan-400" />}
          <span className="font-mono text-xs font-bold text-slate-200 truncate max-w-[140px]">
            {nodeData.label || id}
          </span>
        </div>
        <button
          onClick={() => removeNode(id)}
          className="text-slate-500 hover:text-red-400 transition p-0.5 rounded"
          title="Delete Node"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hardware Interface Ports */}
      <div className="mt-2.5 space-y-1">
        {renderHardwarePorts()}
      </div>

      {/* Metadata Footnote */}
      <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex justify-between text-[9px] font-mono text-slate-500">
        <span>Protocol: {nodeData.protocol || 'CAN'}</span>
        {nodeData.canId !== undefined && <span className="text-amber-400 font-bold">CAN ID: {nodeData.canId}</span>}
      </div>
    </div>
  );
};