/**
 * The facts students can ask SysMod to prove about their behavior blocks. Kept apart from
 * agentAgree.ts so the store can hold them without loading the AGREE compiler.
 */

/** A command as a student names it: the device or subsystem and the value it is set to */
export interface CommandRef {
  device: string;
  value: string;
}

/** The property templates students pick from */
export type AgentProperty =
  | { kind: 'never-together'; first: CommandRef; second: CommandRef }
  | { kind: 'only-in-mode'; command: CommandRef; mode: string }
  | { kind: 'can-happen'; command: CommandRef };

/** Points properties about a renamed subsystem at its new name, like renameInBehavior does for blocks */
export function renameInProperties(properties: AgentProperty[], from: string, to: string): AgentProperty[] {
  const move = (ref: CommandRef): CommandRef => (ref.device === from ? { ...ref, device: to } : ref);
  let changed = false;
  const next = properties.map((p): AgentProperty => {
    const moved: AgentProperty = p.kind === 'never-together' ? { ...p, first: move(p.first), second: move(p.second) } : { ...p, command: move(p.command) };
    if (JSON.stringify(moved) !== JSON.stringify(p)) changed = true;
    return moved;
  });
  return changed ? next : properties;
}
