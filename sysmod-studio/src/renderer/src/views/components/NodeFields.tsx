import React, { useEffect, useState } from 'react';
import { FRCNodeData, useRobotStore } from '../store/useRobotStore';

type NumericField = 'canId' | 'dioPort' | 'pwmPort' | 'currentLimit';

interface NodeNumberFieldProps {
  nodeId: string;
  field: NumericField;
  value: number | undefined;
  label: string;
  /** Name for screen readers when the visible label is short or empty */
  ariaName?: string;
  unit?: string;
  min: number;
  max: number;
  className?: string;
}

/**
 * A small number box inside a diagram component, for settings like a CAN ID. "nodrag" stops
 * React Flow from dragging the component while you select the text. Every valid change goes
 * straight to the store, so the hardware checks rerun as you type.
 */
export const NodeNumberField: React.FC<NodeNumberFieldProps> = ({ nodeId, field, value, label, ariaName, unit, min, max, className = 'text-amber-400' }) => {
  const updateNodeData = useRobotStore((state) => state.updateNodeData);
  const [text, setText] = useState(value === undefined ? '' : String(value));

  // Follow outside changes, such as undo or loading a robot
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);

  const commit = (raw: string): void => {
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(parsed)) updateNodeData(nodeId, { [field]: parsed } as Partial<FRCNodeData>);
  };

  return (
    <label className={`nodrag flex items-center gap-1 font-bold ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setText(value === undefined ? '' : String(value))}
        aria-label={`${ariaName || label.replace(/:$/, '')} for ${nodeId}`}
        className="nodrag w-10 bg-slate-950 border border-slate-700 rounded px-1 py-0 text-center text-[9px] text-slate-100 font-mono focus:outline-none focus:border-indigo-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {unit}
    </label>
  );
};
