/**
 * Soar names and values, kept apart from the generator so the diagram store and code generators
 * can use them without loading Blockly.
 */

/** A rule, operator or attribute name: letters, digits, - and _ only */
export function soarName(raw: string | null | undefined, fallback: string): string {
  const name = (raw || '').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[A-Za-z]/.test(name) ? name : name ? `x-${name}` : fallback;
}

/** A value: a number, a plain Soar symbol, or a |quoted| string for anything else */
export function soarValue(raw: string | null | undefined): string {
  const value = (raw || '').trim();
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return value;
  return `|${value.replace(/\|/g, '\\|')}|`;
}

/** The Soar attribute a subsystem is read and commanded by, such as "Claw Arm" → claw-arm */
export const subsystemAttribute = (label: string): string => soarName(label.toLowerCase(), 'subsystem');
