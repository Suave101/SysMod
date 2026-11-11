/**
 * Turns behavior blocks into Soar productions, ported from SoarBlocks and fixed so the output
 * loads in Soar:
 *  - devices are read from ^io.input-link and commanded on ^io.output-link, Soar's standard
 *    I/O links, and the output link is bound in a condition before an action uses it
 *  - names and values become valid Soar symbols, quoted with |…| when they need to be
 *  - blocks that aren't inside a rule are skipped instead of producing broken lines
 */
import * as Blockly from 'blockly';
import './blocks';

export const SoarGenerator = new Blockly.CodeGenerator('Soar');
SoarGenerator.INDENT = '';

const ORDER_ATOMIC = 0;

import { soarName, soarValue } from './soarNames';

export { soarName, soarValue };

const MATCH: Record<string, (v: string) => string> = {
  '==': (v) => v,
  '!=': (v) => `<> ${v}`,
  '>': (v) => `> ${v}`,
  '<': (v) => `< ${v}`,
};

const PREFERENCES: Record<string, string> = { NORMAL: '+ =', BEST: '+ >', WORST: '+ <', REQUIRE: '!' };

// Statement blocks chain to the next block in the stack
SoarGenerator.scrub_ = function (block, code, thisOnly) {
  const next = block.nextConnection?.targetBlock();
  return next && !thisOnly ? code + SoarGenerator.blockToCode(next) : code;
};

// A device or value block floating on its own makes no rule
SoarGenerator.scrubNakedValue = () => '';

const RULE_TYPES = ['soar_propose_operator', 'soar_apply_rule', 'soar_elaboration_rule'];

/** Conditions and actions only mean something inside a rule */
const isInRule = (block: Blockly.Block): boolean => {
  for (let parent = block.getSurroundParent(); parent; parent = parent.getSurroundParent()) {
    if (RULE_TYPES.includes(parent.type)) return true;
  }
  return false;
};

const device = (block: Blockly.Block, input: string): string => SoarGenerator.valueToCode(block, input, ORDER_ATOMIC) || 'device';
const value = (block: Blockly.Block, input: string): string => SoarGenerator.valueToCode(block, input, ORDER_ATOMIC) || 'true';

// The old SoarBlocks preference block is kept only so files load; the Operator's priority replaced it
SoarGenerator.forBlock['soar_preference'] = () => '';

SoarGenerator.forBlock['hardware_input'] = (block) => [soarName(block.getFieldValue('hardware_input'), 'device'), ORDER_ATOMIC];
SoarGenerator.forBlock['hardware_state'] = (block) => [soarValue(block.getFieldValue('state')), ORDER_ATOMIC];

const condition = (negated: boolean) => (block: Blockly.Block): string => {
  if (!isInRule(block)) return '';
  const match = (MATCH[block.getFieldValue('Operator')] || MATCH['=='])(value(block, 'Value'));
  return `   ${negated ? '-' : ''}(<s> ^io.input-link.${device(block, 'WorkingMemoryElement')} ${match})\n`;
};
SoarGenerator.forBlock['soar_wme_condition'] = condition(false);
SoarGenerator.forBlock['soar_wme_negated_condition'] = condition(true);

SoarGenerator.forBlock['soar_state_check'] = (block) =>
  isInRule(block) ? `   (<s> ^mode ${soarValue(block.getFieldValue('agent_state'))})\n` : '';

// <ol> is the output link, bound by the rule that contains this action
SoarGenerator.forBlock['soar_set_output'] = (block) =>
  isInRule(block) ? `   (<ol> ^${device(block, 'hardware_input')} ${value(block, 'hardware_state')})\n` : '';

SoarGenerator.forBlock['soar_wme_modify'] = (block) => {
  if (!isInRule(block)) return '';
  const symbol = block.getFieldValue('ACTION_TYPE') === 'REMOVE' ? '-' : '+';
  return `   (<s> ^${device(block, 'ATTRIBUTE')} ${value(block, 'VALUE')} ${symbol})\n`;
};

/** Output actions need the output link bound on the condition side first */
const outputBinding = (actions: string): string => (actions.includes('(<ol> ') ? '   (<s> ^io.output-link <ol>)\n' : '');

const rule = (name: string, conditions: string[], actions: string): string =>
  `sp {${name}\n${conditions.join('')}-->\n${actions || '   # add an action\n'}}\n\n`;

SoarGenerator.forBlock['soar_propose_operator'] = (block) => {
  const op = soarName(block.getFieldValue('propose_operator_name'), 'operator');
  const preference = PREFERENCES[block.getFieldValue('PREFERENCE')] || PREFERENCES.NORMAL;
  const conditions = SoarGenerator.statementToCode(block, 'LHS');
  const propose = rule(`propose*${op}`, ['   (state <s> ^type state)\n', conditions], `   (<s> ^operator <o> ${preference})\n   (<o> ^name ${op})\n`);
  return propose + SoarGenerator.statementToCode(block, 'RHS');
};

SoarGenerator.forBlock['soar_apply_rule'] = (block) => {
  let op = 'operator';
  for (let parent = block.getSurroundParent(); parent; parent = parent.getSurroundParent()) {
    if (parent.type === 'soar_propose_operator') {
      op = soarName(parent.getFieldValue('propose_operator_name'), 'operator');
      break;
    }
  }
  const name = soarName(block.getFieldValue('apply_operator_name'), 'apply');
  const actions = SoarGenerator.statementToCode(block, 'apply_operator_actions');
  const conditions = SoarGenerator.statementToCode(block, 'apply_operator_conditions');
  return rule(`apply*${op}*${name}`, ['   (state <s> ^operator <o>)\n', `   (<o> ^name ${op})\n`, outputBinding(actions), conditions], actions);
};

SoarGenerator.forBlock['soar_elaboration_rule'] = (block) => {
  const name = soarName(block.getFieldValue('ELAB_NAME'), 'elaboration');
  const actions = SoarGenerator.statementToCode(block, 'RHS');
  const conditions = SoarGenerator.statementToCode(block, 'LHS');
  return rule(`elaborate*${name}`, ['   (state <s> ^type state)\n', outputBinding(actions), conditions], actions);
};

const HEADER = `# Generated by SysMod Studio from the robot behavior blocks.
# Sensors are read from ^io.input-link and commands go to ^io.output-link.

`;

/** Saved block state from the editor, as Blockly's JSON serialization */
export type BehaviorState = object | null;

/** Generates Soar from saved block state, without needing the editor on screen */
export function generateSoar(state: BehaviorState): string {
  if (!state) return `${HEADER}# No behavior blocks yet. Open the Behavior tab to add some.\n`;
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state, workspace);
    const code = SoarGenerator.workspaceToCode(workspace).trim();
    return code ? `${HEADER}${code}\n` : `${HEADER}# No rules yet. Start with an Operator block from Rules.\n`;
  } finally {
    workspace.dispose();
  }
}
