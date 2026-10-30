import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Trash2, Box, Wind, Camera, Radio, Activity, BatteryCharging, Cpu, Lightbulb, Sliders, Eye } from 'lucide-react';
import { useRobotStore, FRCNodeData } from '../store/useRobotStore';

const SINGLE_PORT_DEVICES: Record<string, { handle: string; label: string; isInput: boolean }> = {
  PWMServo: { handle: 'pwm-in', label: 'PWM Signal In', isInput: true },
  Compressor: { handle: 'comp-in', label: 'Pneumatic Hub Power In', isInput: true },
  SolenoidValve: { handle: 'sol-in', label: 'Solenoid Channel In', isInput: true },
  PressureSwitch: { handle: 'press-out', label: 'Switch Signal Out', isInput: false },
  ColorSensor: { handle: 'i2c-out', label: 'I2C To roboRIO', isInput: false },
  NavX2: { handle: 'mxp-out', label: 'MXP To roboRIO', isInput: false },
  PhotonVision: { handle: 'usb-out', label: 'USB To Coprocessor', isInput: false },
};

export const StandardNode: React.FC<NodeProps> = ({ id, data }) => {
  const nodeData = data as unknown as FRCNodeData;
  const removeNode = useRobotStore((state) => state.removeNode);
  const deviceType = nodeData.deviceType || '';

  // ── 12V Battery Component ──
  if (deviceType === 'Battery12V') {
    return (
      <div className="relative group min-w-[240px] bg-slate-900 border-2 border-red-500/80 rounded-xl p-3.5 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BatteryCharging className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="font-mono text-xs font-black text-slate-100">{nodeData.label || id}</h3>
              <span className="text-[9px] font-mono text-red-400 uppercase tracking-wider block font-bold">12V 18Ah SLA Battery</span>
            </div>
          </div>
          <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-red-500/40 relative">
            <span className="font-bold">12V SB50 Output</span>
            <span className="text-slate-500 text-[8px]">To Main Breaker</span>
            <Handle type="source" position={Position.Right} id="pwr-battery-out" className="w-3.5 h-3.5 !bg-red-500 !border-2 !border-slate-950 rounded-full !right-[-12px]" />
          </div>
        </div>
      </div>
    );
  }

  // ── Robot Signal Light (RSL) Component ──
  if (deviceType === 'RSL') {
    return (
      <div className="relative group min-w-[220px] bg-slate-900 border-2 border-yellow-500/80 rounded-xl p-3.5 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-400" />
            <div>
              <h3 className="font-mono text-xs font-black text-slate-100">{nodeData.label || id}</h3>
              <span className="text-[9px] font-mono text-yellow-400 uppercase tracking-wider block font-bold">Status Signal Light</span>
            </div>
          </div>
          <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[9px] font-mono text-yellow-400 bg-slate-950/90 px-2 py-1 rounded border border-yellow-500/30 relative">
            <Handle type="target" position={Position.Left} id="rsl-in" className="w-3 h-3 !bg-yellow-400 !border-2 !border-slate-950 rounded-full !left-[-11px]" />
            <span>RSL Header In</span>
            <span className="text-slate-500 text-[8px]">roboRIO</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Buck Converter, VRM & Mini Power Module Components ──
  if (['BuckConverter', 'VRM', 'MPM'].includes(deviceType)) {
    return (
      <div className="relative group min-w-[240px] bg-slate-900 border-2 border-sky-500/80 rounded-xl p-3 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" />
            <span className="font-mono text-xs font-bold text-slate-200">{nodeData.label || id}</span>
          </div>
          <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2 py-1 rounded border border-red-500/20 relative">
            <Handle type="target" position={Position.Left} id="pwr-12v-in" className="w-3 h-3 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-11px]" />
            <span>12V Raw In</span>
            <span className="text-slate-500 text-[8px]">PDH Low Ch</span>
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono text-sky-400 bg-slate-950/90 px-2 py-1 rounded border border-sky-500/20 relative">
            <span>{deviceType === 'MPM' ? 'Fused 12V Out' : '5V/12V Regulated Out'}</span>
            <Handle type="source" position={Position.Right} id={deviceType === 'MPM' ? 'pwr-mpm-out' : 'pwr-regulated-out'} className="w-3 h-3 !bg-sky-400 !border-2 !border-slate-950 rounded-full !right-[-11px]" />
          </div>
        </div>
      </div>
    );
  }

  // Hardware Ports Renderer
  const renderHardwarePorts = () => {
    // DIO Contact / Optical Sensors
    if (['LimitSwitch', 'BeamBreak', 'ThroughBore'].includes(deviceType)) {
      return (
        <div className="flex items-center justify-between text-[9px] font-mono text-purple-400 bg-slate-950/90 px-2 py-1 rounded border border-purple-500/20 relative">
          <span>DIO Signal Output</span>
          <span className="text-purple-300">Port #{nodeData.dioPort || 0}</span>
          <Handle type="source" position={Position.Right} id="dio-out" className="w-3 h-3 !bg-purple-400 !border-2 !border-slate-950 rounded-full !right-[-11px]" />
        </div>
      );
    }

    // Single-Wire Devices
    const singlePort = SINGLE_PORT_DEVICES[deviceType];
    if (singlePort) {
      return (
        <div className="flex items-center justify-between text-[9px] font-mono text-sky-400 bg-slate-950/90 px-2 py-1 rounded border border-sky-500/20 relative">
          {singlePort.isInput && <Handle type="target" position={Position.Left} id={singlePort.handle} className="w-3 h-3 !bg-sky-400 !border-2 !border-slate-950 rounded-full !left-[-11px]" />}
          <span>{singlePort.label}</span>
          {nodeData.pwmPort !== undefined && <span className="text-purple-300">Port #{nodeData.pwmPort}</span>}
          {!singlePort.isInput && <Handle type="source" position={Position.Right} id={singlePort.handle} className="w-3 h-3 !bg-sky-400 !border-2 !border-slate-950 rounded-full !right-[-11px]" />}
        </div>
      );
    }

    // Limelight Smart Camera & Coprocessors
    if (['Limelight', 'Coprocessor'].includes(deviceType)) {
      return (
        <>
          <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2 py-1 rounded border border-red-500/20 relative">
            <Handle type="target" position={Position.Left} id="pwr-12v-in" className="w-3 h-3 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-11px]" />
            <span>Regulated / 12V In</span>
            <span className="text-amber-400 font-bold">{nodeData.powerChannel || 'Unassigned'}</span>
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 bg-slate-950/90 px-2 py-1 rounded border border-emerald-500/20 relative">
            <Handle type="target" position={Position.Left} id="eth-in" className="w-3 h-3 !bg-emerald-500 !border-2 !border-slate-950 rounded-full !left-[-11px]" />
            <span>Ethernet Data</span>
            <Handle type="source" position={Position.Right} id="eth-out" className="w-3 h-3 !bg-emerald-500 !border-2 !border-slate-950 rounded-full !right-[-11px]" />
          </div>
          {deviceType === 'Coprocessor' && (
            <div className="flex items-center justify-between text-[9px] font-mono text-indigo-400 bg-slate-950/90 px-2 py-1 rounded border border-indigo-500/20 relative">
              <Handle type="target" position={Position.Left} id="usb-in" className="w-3 h-3 !bg-indigo-500 !border-2 !border-slate-950 rounded-full !left-[-11px]" />
              <span>USB Camera In</span>
            </div>
          )}
        </>
      );
    }

    // Default Motor Controllers and CAN Sensors
    return (
      <>
        <div className="flex items-center justify-between text-[9px] font-mono text-red-400 bg-slate-950/90 px-2 py-1 rounded border border-red-500/20 relative">
          <Handle type="target" position={Position.Left} id="pwr-12v-in" className="w-3 h-3 !bg-red-500 !border-2 !border-slate-950 rounded-full !left-[-11px]" />
          <span>12V Power In</span>
          <span className="text-amber-400 font-bold">{nodeData.powerChannel || 'Unassigned'}</span>
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono text-amber-400 bg-slate-950/90 px-2 py-1 rounded border border-amber-500/20 relative">
          <Handle type="target" position={Position.Left} id="can-in" className="w-3 h-3 !bg-amber-400 !border-2 !border-slate-950 rounded-full !left-[-11px]" />
          <span>CAN In</span>
          <span>CAN Out</span>
          <Handle type="source" position={Position.Right} id="can-out" className="w-3 h-3 !bg-amber-400 !border-2 !border-slate-950 rounded-full !right-[-11px]" />
        </div>
      </>
    );
  };

  return (
    <div className="relative group min-w-[240px] bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl hover:border-cyan-500/80 transition">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {['Limelight', 'PhotonVision'].includes(deviceType) ? <Camera className="w-4 h-4 text-lime-400" /> :
           ['SolenoidValve', 'Compressor', 'PressureSwitch'].includes(deviceType) ? <Wind className="w-4 h-4 text-sky-400" /> :
           ['Pigeon2', 'NavX2'].includes(deviceType) ? <Radio className="w-4 h-4 text-rose-400" /> :
           ['LimitSwitch', 'BeamBreak'].includes(deviceType) ? <Eye className="w-4 h-4 text-purple-400" /> :
           ['KrakenX60', 'KrakenX44', 'Falcon500'].includes(deviceType) ? <Activity className="w-4 h-4 text-emerald-400" /> :
           deviceType === 'Coprocessor' ? <Cpu className="w-4 h-4 text-indigo-400" /> :
           <Box className="w-4 h-4 text-cyan-400" />}
          <span className="font-mono text-xs font-bold text-slate-200 truncate max-w-[140px]">
            {nodeData.label || id}
          </span>
        </div>
        <button onClick={() => removeNode(id)} className="text-slate-500 hover:text-red-400 transition p-0.5 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-2.5 space-y-1">
        {renderHardwarePorts()}
      </div>

      <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex justify-between text-[9px] font-mono text-slate-500">
        <span>Protocol: {nodeData.protocol || 'CAN'}</span>
        {nodeData.canId !== undefined && <span className="text-amber-400 font-bold">CAN ID: {nodeData.canId}</span>}
      </div>
    </div>
  );
};