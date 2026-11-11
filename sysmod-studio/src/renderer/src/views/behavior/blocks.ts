/**
 * The behavior blocks, ported from the SoarBlocks editor (github.com/Suave101/SoarBlocks).
 *
 * Block type names are kept from SoarBlocks so its saved workspaces still load. Changes:
 *  - the device block lists the subsystem frames and devices on the architecture diagram instead
 *    of a built-in CLAW, ARM and DRIVE_BASE
 *  - the preference block, which could not snap into anything, is now a choice on the proposal.
 *    The old block is still defined so SoarBlocks files load, but it isn't in the toolbox.
 */
import * as Blockly from 'blockly';

const TYPE_CONDITION = 'Condition';
const TYPE_APPLY_RULE = 'ApplyRule';
const TYPE_ACTION = 'Action';
const TYPE_DEVICE = 'HardwareInput';
const TYPE_VALUE = 'HardwareState';
const TYPE_PREFERENCE = 'Preference';

export const COLOURS = { rule: 225, apply: 0, elaborate: 45, condition: 90, action: 270, device: 160, value: 190, legacy: 20 };

/**
 * SoarBlocks' preference choices, and the Operator priority each one becomes. Reject has no
 * priority to become, so it stays an old block.
 */
export const LEGACY_PREFERENCES: [label: string, value: string, priority: string | null][] = [
  ['acceptable (+)', 'ACCEPTABLE', 'NORMAL'],
  ['reject (-)', 'REJECT', null],
  ['require (!)', 'REQUIRE', 'REQUIRE'],
  ['better (>)', 'BETTER', 'BEST'],
  ['worse (<)', 'WORSE', 'WORST'],
];

/** One choice in the device dropdown: what students see, and the Soar attribute it becomes */
export interface DeviceOption {
  label: string;
  attribute: string;
}

// Nothing is built in: with an empty diagram, the dropdown says where devices come from
const NO_DEVICES: DeviceOption[] = [{ label: 'add a subsystem on the diagram', attribute: 'subsystem' }];

let deviceOptions: DeviceOption[] = NO_DEVICES;

/** Set by the workbench from the diagram's subsystem frames and devices, so the dropdown matches the robot */
export function setDeviceOptions(options: DeviceOption[]): void {
  deviceOptions = options.length > 0 ? options : NO_DEVICES;
}

/**
 * A dropdown that keeps a device it doesn't know. Deleting a motor from the diagram shouldn't
 * silently rewrite a student's rules, so the old name stays and is marked as missing.
 */
class DeviceField extends Blockly.FieldDropdown {
  /** The value being set, so the options can include it before it becomes the field's value */
  private incoming?: string;

  constructor() {
    super(function (this: DeviceField) {
      const current = this.incoming ?? this.getValue?.();
      const options: Blockly.MenuOption[] = deviceOptions.map((d) => [d.label, d.attribute]);
      if (current && !deviceOptions.some((d) => d.attribute === current)) options.push([`${current} (not on diagram)`, current]);
      return options;
    } as Blockly.MenuGeneratorFunction);
  }

  protected override doClassValidation_(newValue?: string): string | null {
    return typeof newValue === 'string' && newValue ? newValue : null;
  }

  // Blockly shows the label of the cached option that matches the value. The cache was made
  // before this value arrived, so a device that isn't on the diagram would show the first
  // device's label. Rebuilding the options first makes it show "<name> (not on diagram)".
  protected override doValueUpdate_(newValue: string): void {
    this.incoming = newValue;
    try {
      this.getOptions(false);
    } finally {
      this.incoming = undefined;
    }
    super.doValueUpdate_(newValue);
  }
}

const COMPARISONS: Blockly.MenuOption[] = [
  ['equals', '=='],
  ['does not equal', '!='],
  ['is greater than', '>'],
  ['is less than', '<'],
];

export const BLOCKS: Record<string, { init: (this: Blockly.Block) => void }> = {
  soar_propose_operator: {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('Operator').appendField(new Blockly.FieldTextInput('grab-game-piece'), 'propose_operator_name');
      this.appendDummyInput()
        .appendField('priority')
        .appendField(
          new Blockly.FieldDropdown([
            ['normal', 'NORMAL'],
            ['best', 'BEST'],
            ['worst', 'WORST'],
            ['required', 'REQUIRE'],
          ]),
          'PREFERENCE',
        );
      this.appendStatementInput('LHS').setCheck(TYPE_CONDITION).appendField('propose when');
      this.appendStatementInput('RHS').setCheck(TYPE_APPLY_RULE).appendField('apply with');
      this.setTooltip('Proposes an operator when its conditions are true. Soar picks one proposed operator each decision, then its apply rules run.');
      this.setColour(COLOURS.rule);
    },
  },

  soar_apply_rule: {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('Apply').appendField(new Blockly.FieldTextInput('close-claw'), 'apply_operator_name');
      this.appendStatementInput('apply_operator_conditions').setCheck(TYPE_CONDITION).appendField('if also');
      this.appendStatementInput('apply_operator_actions').setCheck(TYPE_ACTION).appendField('then');
      this.setPreviousStatement(true, TYPE_APPLY_RULE);
      this.setNextStatement(true, TYPE_APPLY_RULE);
      this.setTooltip('Runs when its operator is selected and these extra conditions are true');
      this.setColour(COLOURS.apply);
    },
  },

  soar_elaboration_rule: {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('Elaborate').appendField(new Blockly.FieldTextInput('piece-ready'), 'ELAB_NAME');
      this.appendStatementInput('LHS').setCheck(TYPE_CONDITION).appendField('when');
      this.appendStatementInput('RHS').setCheck(TYPE_ACTION).appendField('then');
      this.setTooltip('Adds facts whenever its conditions are true, and removes them when they stop being true');
      this.setColour(COLOURS.elaborate);
    },
  },

  soar_wme_condition: {
    init(this: Blockly.Block) {
      this.appendValueInput('WorkingMemoryElement').setCheck(TYPE_DEVICE).appendField('if');
      this.appendDummyInput().appendField(new Blockly.FieldDropdown(COMPARISONS), 'Operator');
      this.appendValueInput('Value').setCheck(TYPE_VALUE);
      this.setInputsInline(true);
      this.setPreviousStatement(true, TYPE_CONDITION);
      this.setNextStatement(true, TYPE_CONDITION);
      this.setTooltip('True when a device reports this value on the input link');
      this.setColour(COLOURS.condition);
    },
  },

  soar_wme_negated_condition: {
    init(this: Blockly.Block) {
      this.appendValueInput('WorkingMemoryElement').setCheck(TYPE_DEVICE).appendField('if not');
      this.appendDummyInput().appendField(new Blockly.FieldDropdown(COMPARISONS), 'Operator');
      this.appendValueInput('Value').setCheck(TYPE_VALUE);
      this.setInputsInline(true);
      this.setPreviousStatement(true, TYPE_CONDITION);
      this.setNextStatement(true, TYPE_CONDITION);
      this.setTooltip('True when a device does NOT report this value');
      this.setColour(COLOURS.condition);
    },
  },

  soar_state_check: {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('if robot mode is').appendField(new Blockly.FieldTextInput('autonomous'), 'agent_state');
      this.setPreviousStatement(true, TYPE_CONDITION);
      this.setNextStatement(true, TYPE_CONDITION);
      this.setTooltip('True when the agent’s mode matches, such as autonomous or teleop');
      this.setColour(COLOURS.condition);
    },
  },

  soar_set_output: {
    init(this: Blockly.Block) {
      this.appendValueInput('hardware_input').setCheck(TYPE_DEVICE).appendField('set');
      this.appendValueInput('hardware_state').setCheck(TYPE_VALUE).appendField('to');
      this.setInputsInline(true);
      this.setPreviousStatement(true, TYPE_ACTION);
      this.setNextStatement(true, TYPE_ACTION);
      this.setTooltip('Sends a command to a device on the output link');
      this.setColour(COLOURS.action);
    },
  },

  soar_wme_modify: {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown([
            ['remember', 'ADD'],
            ['forget', 'REMOVE'],
          ]),
          'ACTION_TYPE',
        );
      this.appendValueInput('ATTRIBUTE').setCheck(TYPE_DEVICE);
      this.appendValueInput('VALUE').setCheck(TYPE_VALUE).appendField('is');
      this.setInputsInline(true);
      this.setPreviousStatement(true, TYPE_ACTION);
      this.setNextStatement(true, TYPE_ACTION);
      this.setTooltip('Adds or removes a fact in the agent’s own memory');
      this.setColour(COLOURS.action);
    },
  },

  hardware_input: {
    init(this: Blockly.Block) {
      // Blockly's field typings don't accept a dropdown subclass directly; it is a FieldDropdown
      this.appendDummyInput().appendField(new DeviceField() as unknown as Blockly.Field<string | undefined>, 'hardware_input');
      this.setOutput(true, TYPE_DEVICE);
      this.setTooltip('A subsystem frame or device on your architecture diagram');
      this.setColour(COLOURS.device);
    },
  },

  hardware_state: {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(new Blockly.FieldTextInput('closed'), 'state');
      this.setOutput(true, TYPE_VALUE);
      this.setTooltip('A value, such as open, closed, true or 42');
      this.setColour(COLOURS.value);
    },
  },

  /**
   * SoarBlocks' standalone preference block. It isn't in the toolbox; it exists so old
   * workspaces still load. Opening a file moves its choice onto the matching Operator when it can
   * (see blockFiles.ts), and any left over say what to do instead. It generates nothing.
   */
  soar_preference: {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('old preference')
        .appendField(new Blockly.FieldDropdown(LEGACY_PREFERENCES.map(([label, value]) => [label, value])), 'PREFERENCE_TYPE');
      this.appendDummyInput().appendField('for').appendField(new Blockly.FieldTextInput('OperatorName'), 'OPERATOR_NAME');
      this.appendDummyInput().appendField('use the priority on the Operator instead');
      this.setPreviousStatement(true, TYPE_PREFERENCE);
      this.setNextStatement(true, TYPE_PREFERENCE);
      this.setTooltip('From SoarBlocks. It does nothing here: set the priority on the Operator block, then delete this one.');
      this.setColour(COLOURS.legacy);
    },
  },
};

Blockly.common.defineBlocks(BLOCKS);

export const TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Rules', colour: String(COLOURS.rule), contents: [{ kind: 'block', type: 'soar_propose_operator' }, { kind: 'block', type: 'soar_apply_rule' }, { kind: 'block', type: 'soar_elaboration_rule' }] },
    { kind: 'category', name: 'Conditions', colour: String(COLOURS.condition), contents: [{ kind: 'block', type: 'soar_wme_condition' }, { kind: 'block', type: 'soar_wme_negated_condition' }, { kind: 'block', type: 'soar_state_check' }] },
    { kind: 'category', name: 'Actions', colour: String(COLOURS.action), contents: [{ kind: 'block', type: 'soar_set_output' }, { kind: 'block', type: 'soar_wme_modify' }] },
    { kind: 'category', name: 'Robot', colour: String(COLOURS.device), contents: [{ kind: 'block', type: 'hardware_input' }, { kind: 'block', type: 'hardware_state' }] },
  ],
};
