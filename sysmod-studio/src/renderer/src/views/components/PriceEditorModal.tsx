import React, { useState, useEffect } from 'react';
import { X, DollarSign, RotateCcw, Check, Settings2 } from 'lucide-react';

interface PriceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceCosts: Record<string, number>;
  onSave: (updatedCosts: Record<string, number>) => void;
}

// System defaults for resetting
const DEFAULT_COSTS: Record<string, number> = {
  ControlHub: 359.00,
  DcMotor: 35.00,
  Servo: 15.00,
  ColorSensor: 25.00,
  Webcam: 35.00,
  Coprocessor: 80.00,
};

const DEVICE_LABELS: Record<string, string> = {
  ControlHub: "REV Control Hub",
  DcMotor: "DC Motor (Ex)",
  Servo: "Standard Servo",
  ColorSensor: "I2C Color Sensor",
  Webcam: "USB Webcam",
  Coprocessor: "Linux Coprocessor",
};

export function PriceEditorModal({ isOpen, onClose, deviceCosts, onSave }: PriceEditorModalProps) {
  // Storing input values as strings prevents erratic cursor jumping during backspacing
  const [localCosts, setLocalCosts] = useState<Record<string, string>>({});

  // Sync state whenever the modal opens or parent pricing changes
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      Object.entries(deviceCosts).forEach(([key, val]) => {
        initial[key] = val.toFixed(2);
      });
      setLocalCosts(initial);
    }
  }, [isOpen, deviceCosts]);

  if (!isOpen) return null;

  const handleInputChange = (key: string, value: string) => {
    setLocalCosts((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleReset = () => {
    const resetValues: Record<string, string> = {};
    Object.entries(DEFAULT_COSTS).forEach(([key, val]) => {
      resetValues[key] = val.toFixed(2);
    });
    setLocalCosts(resetValues);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validatedCosts: Record<string, number> = {};
    
    Object.entries(localCosts).forEach(([key, val]) => {
      const parsedValue = parseFloat(val);
      // Fallback to 0 if the input is empty or invalid
      validatedCosts[key] = isNaN(parsedValue) || parsedValue < 0 ? 0 : parsedValue;
    });

    onSave(validatedCosts);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dark Overlay Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-10 flex flex-col font-sans">
        
        {/* Header */}
        <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-100">
                Hardware Unit Cost Overrides
              </h2>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                Set custom prices to match local component procurement rates.
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition p-1.5 rounded-lg hover:bg-slate-800/60"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Pricing Inputs Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {Object.keys(DEVICE_LABELS).map((key) => (
              <div 
                key={key} 
                className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-800 transition"
              >
                <label 
                  htmlFor={`cost-${key}`} 
                  className="text-xs font-mono font-medium text-slate-300"
                >
                  {DEVICE_LABELS[key]}
                </label>
                
                <div className="relative w-36">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">
                    <DollarSign className="w-3.5 h-3.5" />
                  </span>
                  <input
                    id={`cost-${key}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={localCosts[key] || ''}
                    onChange={(e) => handleInputChange(key, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 pl-7 text-right font-mono text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                    placeholder="0.00"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Footer Actions Panel */}
          <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 py-2 px-3 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono font-bold transition text-slate-400 hover:text-slate-200"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-4 rounded text-[11px] font-mono font-bold transition text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 py-2 px-4 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold transition shadow-md"
              >
                <Check className="w-3.5 h-3.5" /> Apply Overrides
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}