import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Cpu, Zap, Trash2, Power, Wifi, ShieldAlert, Radio, Lock, Share2 } from 'lucide-react';
import { useRobotStore, FRCNodeData } from '../store/useRobotStore';

export const ControlHubNode: React.FC<NodeProps> = ({ id, data }) => {
  const nodeData = data as unknown as FRCNodeData;
  const { removeNode, getPdhAllocations } = useRobotStore();
  const deviceType = nodeData.deviceType || '';

  // ── VH-109 FRC Radio Node ──
  if (deviceType === 'RadioSwitch') {
    return (
      <div className="relative min-w-[320px] bg-slate-900 border-2 border-emerald-500/80 rounded-xl p-3.5 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-mono text-xs font-black text-slate-100">{nodeData.label || id}</h3>
              <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider block font-bold">
                VH-109 FRC Radio (2-Port)
              </span>
            </div>
          </div>
          <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2.5 space-y-2">
          {/* Power / Passive PoE Input */}
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-red-500/30 relative">
            <Handle
              type="target"
              position={Position.Left}
              id="pwr-12v-in"
              className="w-3.5 h-3.5 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-12px]"
            />
            <span>12V Power / Passive PoE In</span>
            <span className="text-slate-500 text-[8px]">VRM / RPM / PDH</span>
          </div>

          {/* RIO Port: Dedicated RoboRIO Link */}
          <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-emerald-500/40 relative">
            <Handle
              type="target"
              position={Position.Left}
              id="eth-rio"
              className="w-3.5 h-3.5 !bg-emerald-500 !border-2 !border-slate-950 rounded-full !left-[-12px]"
            />
            <div className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold block">RIO Port (Dedicated)</span>
                <span className="text-slate-500 text-[8px]">RoboRIO Uplink + Passive PoE</span>
              </div>
            </div>
            <span className="text-amber-400 font-bold text-[8px] bg-amber-950/60 px-1 py-0.5 rounded border border-amber-500/30">
              No Extra Device
            </span>
          </div>

          {/* AUX Port: Single downstream accessory slot */}
          <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-emerald-500/40 relative">
            <div className="flex items-center gap-1">
              <Share2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold block">AUX Port (Auxiliary)</span>
                <span className="text-slate-500 text-[8px]">Coprocessor / Limelight / Switch</span>
              </div>
            </div>
            <span className="text-emerald-400 font-bold text-[8px] bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-500/30">
              1 Slot Available
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id="eth-aux"
              className="w-3.5 h-3.5 !bg-emerald-500 !border-2 !border-slate-950 rounded-full !right-[-12px]"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── 120A Main Circuit Breaker Node ──
  if (deviceType === 'MainBreaker120A') {
    return (
      <div className="relative min-w-[260px] bg-slate-900 border-2 border-red-600 rounded-xl p-3.5 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="font-mono text-xs font-black text-slate-100">{nodeData.label || id}</h3>
              <span className="text-[9px] font-mono text-red-400 uppercase tracking-wider block font-bold">120A Main Circuit Breaker</span>
            </div>
          </div>
          <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-red-500/30 relative">
            <Handle type="target" position={Position.Left} id="pwr-battery-in" className="w-3.5 h-3.5 !bg-red-600 !border-2 !border-slate-950 rounded-full !left-[-12px]" />
            <span className="font-bold">12V Battery Input</span>
            <span className="text-slate-500 text-[8px]">From Battery</span>
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-red-500/30 relative">
            <span className="font-bold">Protected 120A Bus Out</span>
            <span className="text-red-300 text-[8px]">To PDH</span>
            <Handle type="source" position={Position.Right} id="pwr-pdh-out" className="w-3.5 h-3.5 !bg-red-500 !border-2 !border-slate-950 rounded-full !right-[-12px]" />
          </div>
        </div>
      </div>
    );
  }

  // ── CTRE CANivore Bus Adapter Node ──
  if (deviceType === 'CANivore') {
    return (
      <div className="relative min-w-[270px] bg-slate-900 border-2 border-amber-500/80 rounded-xl p-3.5 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="font-mono text-xs font-black text-slate-100">{nodeData.label || id}</h3>
              <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider block font-bold">CTRE CANivore (CAN FD)</span>
            </div>
          </div>
          <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex items-center justify-between text-[9px] font-mono text-indigo-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-indigo-500/30 relative">
            <Handle type="target" position={Position.Left} id="usb-in" className="w-3.5 h-3.5 !bg-indigo-500 !border-2 !border-slate-950 rounded-full !left-[-12px]" />
            <span className="font-bold">USB Connection</span>
            <span className="text-slate-500 text-[8px]">roboRIO USB</span>
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-amber-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-amber-500/40 relative">
            <span className="font-bold">CAN FD Bus Start (8Mbps)</span>
            <span className="text-amber-300 text-[8px]">To CTRE Loop</span>
            <Handle type="source" position={Position.Right} id="can-fd-start" className="w-3.5 h-3.5 !bg-amber-400 !border-2 !border-slate-950 rounded-full !right-[-12px]" />
          </div>
        </div>
      </div>
    );
  }

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
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-red-500/30 relative">
            <Handle type="target" position={Position.Left} id="pwr-12v-in" className="w-3.5 h-3.5 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-12px]" />
            <span className="font-bold flex items-center gap-1"><Power className="w-3 h-3 text-red-500" /> 120A Main Breaker Input</span>
            <span className="text-slate-500 text-[8px]">Main Power</span>
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-red-500/30 relative">
            <span className="font-bold">20x High-Current (Ports 0–19)</span>
            <span className="text-red-300 font-mono text-[8px]">{highMap.size}/20 ATO 40A</span>
            <Handle type="source" position={Position.Right} id="pwr-high-out" className="w-3.5 h-3.5 !bg-red-500 !border-2 !border-slate-950 rounded-full !right-[-12px]" />
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-orange-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-orange-500/30 relative">
            <span className="font-bold">3x Low-Current (Ports 20–22)</span>
            <span className="text-orange-300 font-mono text-[8px]">{lowMap.size}/3 ATM 15A</span>
            <Handle type="source" position={Position.Right} id="pwr-low-out" className="w-3.5 h-3.5 !bg-orange-500 !border-2 !border-slate-950 rounded-full !right-[-12px]" />
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-rose-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-rose-500/30 relative">
            <span className="font-bold">1x Switchable (Port 23)</span>
            <span className="text-rose-300 font-mono text-[8px]">{switchedMap.size}/1 ATM 15A</span>
            <Handle type="source" position={Position.Right} id="pwr-switched-out" className="w-3.5 h-3.5 !bg-rose-500 !border-2 !border-slate-950 rounded-full !right-[-12px]" />
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-amber-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-amber-500/40 relative">
            <Handle type="target" position={Position.Left} id="can-term" className="w-3.5 h-3.5 !bg-amber-400 !border-2 !border-slate-950 rounded-full !left-[-12px]" />
            <span className="font-bold">CAN Bus 120Ω Terminator</span>
            <span className="text-emerald-400 text-[8px]">Bus End</span>
          </div>
        </div>
      </div>
    );
  }

  // ── roboRIO 2.0 Main Controller ──
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
        <div className="flex items-center justify-between text-[9px] font-mono text-orange-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-orange-500/40 relative">
          <Handle type="target" position={Position.Left} id="pwr-12v-in" className="w-3.5 h-3.5 !bg-orange-500 !border-2 !border-slate-950 rounded-full !left-[-12px]" />
          <span className="font-bold">12V Power In</span>
          <span className="text-orange-300 font-bold text-[8px]">PDH Low Ch (20–22)</span>
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono text-yellow-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-yellow-500/40 relative">
          <span className="font-bold">RSL Status Port</span>
          <span className="text-yellow-300 text-[8px]">To Allen-Bradley RSL</span>
          <Handle type="source" position={Position.Right} id="rsl-out" className="w-3.5 h-3.5 !bg-yellow-400 !border-2 !border-slate-950 rounded-full !right-[-12px]" />
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono text-amber-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-amber-500/40 relative">
          <span className="font-bold">CAN Bus Start</span>
          <span className="text-emerald-400 text-[8px]">To Chain</span>
          <Handle type="source" position={Position.Right} id="can-start" className="w-3.5 h-3.5 !bg-amber-400 !border-2 !border-slate-950 rounded-full !right-[-12px]" />
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-emerald-500/30 relative">
          <Handle type="target" position={Position.Left} id="eth-in" className="w-3.5 h-3.5 !bg-emerald-500 !border-2 !border-slate-950 rounded-full !left-[-12px]" />
          <span className="font-bold">Ethernet Port</span>
          <span className="text-slate-500 text-[8px]">To Radio RIO Port</span>
          <Handle type="source" position={Position.Right} id="eth-out" className="w-3.5 h-3.5 !bg-emerald-500 !border-2 !border-slate-950 rounded-full !right-[-12px]" />
        </div>
      </div>
    </div>
  );
};