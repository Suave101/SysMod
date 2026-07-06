import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useRobotStore, RobotNode } from '../store/useRobotStore';
import { Cpu, Activity } from 'lucide-react';

export const ControlHubNode: React.FC<NodeProps<RobotNode>> = ({ id, data }) => {
  const updateNodeLabel = useRobotStore((state) => state.updateNodeLabel);

  return (
    <div className="bg-slate-900 border-2 border-amber-500 rounded-lg shadow-2xl w-[36rem] text-slate-200 font-mono text-[11px] select-none">
      
      {/* Header Banner */}
      <div className="bg-amber-950/50 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between rounded-t-md">
        <div className="flex items-center gap-2.5 flex-1 mr-4">
          <Cpu className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="w-full">
            <input 
              type="text"
              value={data.label}
              onChange={(e) => updateNodeLabel(id, e.target.value)}
              className="bg-transparent border-b border-transparent hover:border-amber-500/40 focus:border-amber-500 focus:outline-none font-bold text-sm text-amber-400 tracking-wide w-full px-0.5 py-0 transition"
              title="Click to rename configuration variable"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 shrink-0">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] text-slate-400 font-sans">6-AXIS IMU: <span className="text-emerald-400 font-bold">OK</span></span>
        </div>
      </div>

      {/* Main IO Bank Interface */}
      <div className="grid grid-cols-2 gap-x-6 p-4 bg-slate-950/40">
        
        {/* LEFT BANK: INPUTS & COMMS (TARGET HANDLES) */}
        <div className="space-y-4 border-r border-slate-800/60 pr-3">
          
          {/* I2C Buses */}
          <div>
            <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-sans block mb-1.5 font-bold">I2C Buses</span>
            <div className="grid grid-cols-2 gap-1">
              {[0, 1, 2, 3].map((bus) => (
                <div key={`i2c_${bus}`} className="flex items-center gap-2 bg-slate-900/60 px-2 py-1 rounded relative border border-slate-800/40">
                  <Handle type="target" position={Position.Left} id={`i2c_${bus}`} className="!bg-cyan-400 !w-2.5 !h-2.5 !-left-[6px]" />
                  <span className="text-slate-400">Bus {bus}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Serial Ports (RS485 & UART) */}
          <div>
            <span className="text-[10px] text-blue-400 uppercase tracking-wider font-sans block mb-1.5 font-bold">Serial (RS485 & UART)</span>
            <div className="grid grid-cols-2 gap-1">
              {[0, 1].map((port) => (
                <div key={`rs485_${port}`} className="flex items-center gap-1.5 bg-slate-900/60 px-2 py-1 rounded relative border border-slate-800/40">
                  <Handle type="target" position={Position.Left} id={`rs485_${port}`} className="!bg-blue-400 !w-2.5 !h-2.5 !-left-[6px]" />
                  <span className="text-slate-400">RS485 {port}</span>
                </div>
              ))}
              {[0, 1].map((port) => (
                <div key={`uart_${port}`} className="flex items-center gap-1.5 bg-slate-900/60 px-2 py-1 rounded relative border border-slate-800/40">
                  <Handle type="target" position={Position.Left} id={`uart_${port}`} className="!bg-pink-400 !w-2.5 !h-2.5 !-left-[6px]" />
                  <span className="text-slate-400">UART {port}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Analog Inputs */}
          <div>
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-sans block mb-1.5 font-bold">Analog Inputs</span>
            <div className="grid grid-cols-2 gap-1">
              {[0, 1, 2, 3].map((ch) => (
                <div key={`analog_${ch}`} className="flex items-center gap-1.5 bg-slate-900/60 px-2 py-1 rounded relative border border-slate-800/40">
                  <Handle type="target" position={Position.Left} id={`analog_${ch}`} className="!bg-emerald-400 !w-2.5 !h-2.5 !-left-[6px]" />
                  <span className="text-slate-400">Ch {ch}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Digital IO */}
          <div>
            <span className="text-[10px] text-purple-400 uppercase tracking-wider font-sans block mb-1.5 font-bold">Digital IO Pins</span>
            <div className="grid grid-cols-2 gap-1">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((pin) => (
                <div key={`digital_${pin}`} className="flex items-center justify-between bg-slate-900/60 px-2 py-0.5 rounded relative border border-slate-800/40 text-[10px]">
                  <Handle type="target" position={Position.Left} id={`digital_${pin}`} className="!bg-purple-400 !w-2 !h-2 !-left-[5px]" />
                  <span className="text-slate-500">DIO</span>
                  <span className="text-slate-300 font-bold">{pin}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT BANK: POWER, ACTUATORS & EXPANSION (SOURCE HANDLES) */}
        <div className="space-y-4 pl-1">
          
          {/* DC Motors w/ Encoders */}
          <div>
            <span className="text-[10px] text-amber-500 uppercase tracking-wider font-sans block mb-1.5 font-bold">DC Motors w/ Encoders</span>
            <div className="space-y-1">
              {[0, 1, 2, 3].map((motor) => (
                <div key={`motor_${motor}`} className="flex items-center justify-between bg-slate-900/60 px-2 py-1 rounded relative border border-slate-800/40">
                  <span className="text-slate-300 font-bold">Port {motor} (M/E)</span>
                  <Handle type="source" position={Position.Right} id={`motor_${motor}`} className="!bg-amber-500 !w-2.5 !h-2.5 !-right-[6px]" />
                </div>
              ))}
            </div>
          </div>

          {/* Servos */}
          <div>
            <span className="text-[10px] text-orange-400 uppercase tracking-wider font-sans block mb-1.5 font-bold">Servo Outputs</span>
            <div className="grid grid-cols-2 gap-1">
              {[0, 1, 2, 3, 4, 5].map((servo) => (
                <div key={`servo_${servo}`} className="flex items-center justify-between bg-slate-900/60 px-2 py-1 rounded relative border border-slate-800/40 text-[10px]">
                  <span className="text-slate-400">SRV {servo}</span>
                  <Handle type="source" position={Position.Right} id={`servo_${servo}`} className="!bg-orange-400 !w-2 !h-2 !-right-[5px]" />
                </div>
              ))}
            </div>
          </div>

          {/* Expansion Hub Interface */}
          <div>
            <span className="text-[10px] text-red-500 uppercase tracking-wider font-sans block mb-1.5 font-bold">Expansion</span>
            <div className="flex items-center justify-between bg-slate-900/60 px-2 py-1.5 rounded relative border border-slate-800/40">
              <span className="text-slate-300 font-bold">Expansion Hub Interface</span>
              <Handle type="source" position={Position.Right} id="expansion_hub" className="!bg-red-500 !w-3 !h-3 !-right-[7px]" />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};