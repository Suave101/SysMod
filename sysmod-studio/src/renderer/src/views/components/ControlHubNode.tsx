import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Cpu, Zap, Trash2, Power } from 'lucide-react';
import { useRobotStore, FRCNodeData, MAX_HIGH_CHANNELS, MAX_LOW_CHANNELS } from '../store/useRobotStore';

export const ControlHubNode: React.FC<NodeProps> = ({ id, data }) => {
  const nodeData = data as unknown as FRCNodeData;
  const { removeNode, getPdhAllocations } = useRobotStore();
  const deviceType = nodeData.deviceType || '';

  // ── REV Power Distribution Hub (PDH) Node ──
  if (deviceType === 'PDH') {
    const { highMap, lowMap, switchedMap } = getPdhAllocations();

    return (
      <div className="relative min-w-[340px] bg-slate-900 border-2 border-amber-500/80 rounded-xl p-4 shadow-2xl">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="font-mono text-xs font-black text-slate-100">{nodeData.label || id}</h3>
              <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider block font-bold">
                REV PDH Power Center
              </span>
            </div>
          </div>
          <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {/* Main Battery Power Input */}
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-red-500/30 relative">
            <Handle
              type="target"
              position={Position.Left}
              id="pwr-12v-in"
              className="w-3.5 h-3.5 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-12px]"
            />
            <span className="font-bold flex items-center gap-1"><Power className="w-3 h-3 text-red-500" /> 12V Main Battery In</span>
            <span className="text-slate-500 text-[8px]">From Battery (SB50)</span>
          </div>

          {/* 20x High-Current Channels (Ports 0–19, 40A ATO) */}
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-red-500/30 relative">
            <span className="font-bold">20x High-Current (Ports 0–19)</span>
            <span className="text-red-300 font-mono text-[8px]">{highMap.size}/20 ATO 40A</span>
            <Handle
              type="source"
              position={Position.Right}
              id="pwr-high-out"
              className="w-3.5 h-3.5 !bg-red-500 !border-2 !border-slate-950 rounded-full !right-[-12px]"
            />
          </div>

          {/* 3x Low-Current Channels (Ports 20–22, 15A ATM) */}
          <div className="flex items-center justify-between text-[9px] font-mono text-orange-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-orange-500/30 relative">
            <span className="font-bold">3x Low-Current (Ports 20–22)</span>
            <span className="text-orange-300 font-mono text-[8px]">{lowMap.size}/3 ATM 15A</span>
            <Handle
              type="source"
              position={Position.Right}
              id="pwr-low-out"
              className="w-3.5 h-3.5 !bg-orange-500 !border-2 !border-slate-950 rounded-full !right-[-12px]"
            />
          </div>

          {/* 1x Switchable Channel (Port 23, 15A ATM) */}
          <div className="flex items-center justify-between text-[9px] font-mono text-rose-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-rose-500/30 relative">
            <span className="font-bold">1x Switchable (Port 23)</span>
            <span className="text-rose-300 font-mono text-[8px]">{switchedMap.size}/1 ATM 15A (LEDs)</span>
            <Handle
              type="source"
              position={Position.Right}
              id="pwr-switched-out"
              className="w-3.5 h-3.5 !bg-rose-500 !border-2 !border-slate-950 rounded-full !right-[-12px]"
            />
          </div>

          {/* CAN Bus 120Ω Terminator */}
          <div className="flex items-center justify-between text-[9px] font-mono text-amber-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-amber-500/40 relative">
            <Handle
              type="target"
              position={Position.Left}
              id="can-term"
              className="w-3.5 h-3.5 !bg-amber-400 !border-2 !border-slate-950 rounded-full !left-[-12px]"
            />
            <span className="font-bold">CAN Bus 120Ω Terminator</span>
            <span className="text-emerald-400 text-[8px]">Bus End</span>
          </div>
        </div>

        {/* Live Port Channel Matrix */}
        <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
          <div className="flex justify-between items-center text-[9px] font-mono">
            <span className="uppercase text-slate-400 font-bold">20x High-Current (0–19)</span>
            <span className="text-emerald-400 font-bold">{MAX_HIGH_CHANNELS - highMap.size} Available</span>
          </div>

          <div className="grid grid-cols-5 gap-1 text-[8px] font-mono">
            {Array.from({ length: MAX_HIGH_CHANNELS }).map((_, i) => {
              const assigned = highMap.get(i);
              return (
                <div
                  key={i}
                  title={assigned ? `Port ${i}: ${assigned.deviceLabel}` : `Port ${i}: Free`}
                  className={`p-0.5 rounded border text-center transition ${
                    assigned ? 'bg-red-950/60 border-red-500/50 text-red-300 font-bold' : 'bg-slate-950/40 border-slate-800 text-slate-600'
                  }`}
                >
                  P{i}
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center text-[8px] font-mono pt-1">
            <span className="text-orange-400">Low-Current (20–22): {lowMap.size}/3</span>
            <span className="text-rose-400">Switchable (23): {switchedMap.size}/1</span>
          </div>
        </div>
      </div>
    );
  }

  // ── roboRIO 2.0 Main Controller Node ──
  return (
    <div className="relative min-w-[290px] bg-slate-900 border-2 border-indigo-500/80 rounded-xl p-4 shadow-2xl">
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="font-mono text-xs font-black text-slate-100">{nodeData.label || id}</h3>
            <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-wider block font-bold">
              roboRIO 2.0 Controller
            </span>
          </div>
        </div>
        <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {/* Low-Current Power Input (Ports 20–22) */}
        <div className="flex items-center justify-between text-[9px] font-mono text-orange-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-orange-500/40 relative">
          <Handle
            type="target"
            position={Position.Left}
            id="pwr-12v-in"
            className="w-3.5 h-3.5 !bg-orange-500 !border-2 !border-slate-950 rounded-full !left-[-12px]"
          />
          <span className="font-bold">12V Power In</span>
          <span className="text-orange-300 font-bold text-[8px]">PDH Low Ch (20–22)</span>
        </div>

        {/* CAN Bus Origin Start Handle */}
        <div className="flex items-center justify-between text-[9px] font-mono text-amber-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-amber-500/40 relative">
          <span className="font-bold">CAN Bus Start (Origin)</span>
          <span className="text-emerald-400 text-[8px]">To Daisy Chain</span>
          <Handle
            type="source"
            position={Position.Right}
            id="can-start"
            className="w-3.5 h-3.5 !bg-amber-400 !border-2 !border-slate-950 rounded-full !right-[-12px]"
          />
        </div>

        {/* Ethernet Network */}
        <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-emerald-500/30 relative">
          <span className="font-bold">Ethernet Port</span>
          <span className="text-slate-500 text-[8px]">Radio / Vision</span>
          <Handle
            type="source"
            position={Position.Right}
            id="eth-out"
            className="w-3.5 h-3.5 !bg-emerald-500 !border-2 !border-slate-950 rounded-full !right-[-12px]"
          />
        </div>
      </div>
    </div>
  );
};