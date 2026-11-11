/**
 * A subsystem frame on the architecture diagram. Drag devices into it to group them; the label
 * names the subsystem in the behavior editor and in the generated robot code.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { Bot, Layers, Trash2 } from 'lucide-react';
import { FRCNodeData, useRobotStore } from '../store/useRobotStore';
import { subsystemCommands } from '../utils/subsystems';
import { subsystemAttribute } from '../behavior/soarNames';

export const SubsystemNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { label } = data as unknown as FRCNodeData;
  const renameSubsystem = useRobotStore((state) => state.renameSubsystem);
  const removeNode = useRobotStore((state) => state.removeNode);
  const memberCount = useRobotStore((state) => state.nodes.filter((n) => n.parentId === id).length);
  const behaviorBlocks = useRobotStore((state) => state.behaviorBlocks);
  const attribute = subsystemAttribute(label);
  const commands = useMemo(() => subsystemCommands(behaviorBlocks).get(attribute) || [], [behaviorBlocks, attribute]);

  const [draft, setDraft] = useState(label);
  useEffect(() => setDraft(label), [label]);
  const commit = (): void => {
    if (draft.trim()) renameSubsystem(id, draft);
    else setDraft(label);
  };

  const remove = (): void => {
    const message = memberCount > 0 ? `Remove the "${label}" subsystem? Its ${memberCount} devices stay on the diagram.` : `Remove the "${label}" subsystem?`;
    if (window.confirm(message)) removeNode(id);
  };

  return (
    <div className={`w-full h-full rounded-2xl border-2 border-dashed ${selected ? 'border-teal-300 bg-teal-400/[0.07]' : 'border-teal-500/50 bg-teal-500/[0.04]'}`}>
      <NodeResizer isVisible={selected} minWidth={260} minHeight={180} lineClassName="!border-teal-300" handleClassName="!w-2.5 !h-2.5 !bg-teal-300 !border-slate-950" />
      <div className="flex items-center gap-2 px-3 py-2">
        <Layers className="w-4 h-4 shrink-0 text-teal-300" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(label);
              e.currentTarget.blur();
            }
          }}
          aria-label="Subsystem name"
          title="Subsystem name. It becomes the subsystem's name in the behavior editor and the robot code."
          // nodrag lets you select text in the name instead of moving the frame
          className="nodrag min-w-0 flex-1 bg-transparent font-mono text-sm font-black text-teal-100 rounded px-1 -mx-1 hover:bg-slate-900/60 focus:bg-slate-900 focus:outline focus:outline-teal-500/60"
        />
        <span className="shrink-0 text-[10px] font-mono text-teal-400/80">
          {memberCount} {memberCount === 1 ? 'device' : 'devices'}
        </span>
        <button onClick={remove} aria-label={`Remove ${label} subsystem`} className="nodrag shrink-0 text-slate-500 hover:text-red-400 transition">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap px-3 text-[10px] font-mono text-slate-400">
        <Bot className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-slate-500">Soar</span>
        <code className="text-teal-200">^{attribute}</code>
        {commands.length > 0 ? (
          <>
            <span className="text-slate-500">· set to</span>
            {commands.map((c) => (
              <span key={c} className="px-1.5 rounded bg-teal-950/80 border border-teal-800 text-teal-200">
                {c}
              </span>
            ))}
          </>
        ) : (
          <span className="text-slate-600">· no commands yet</span>
        )}
      </div>
      {memberCount === 0 && <p className="px-3 mt-3 text-[11px] text-slate-500">Drag motors, sensors and pneumatics in here to group them.</p>}
    </div>
  );
};
