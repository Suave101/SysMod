/**
 * How generated robot code connects each device to the Soar agent through the FRC-Soar bridge
 * (github.com/Suave101/FRC-Soar, docs/io-mapping.md). Shared by Robot.java and robot.py so the
 * two always send the same values.
 *
 * Inputs: every loop the robot writes ^io.input-link.match.mode, each subsystem's current state
 * (^ground-intake closed), and one reading per device (^beambreak8 blocked). Behavior blocks
 * compare against these, so the words are fixed here and listed in the docs.
 *
 * Commands: the agent sends (<ol> ^name <c>) (<c> ^state value). A subsystem's command calls its
 * setState. A device the agent commands directly gets set(value) when that makes sense.
 */
import type { Node } from '@xyflow/react';
import type { FRCNodeData } from '../store/useRobotStore';
import { soarName } from '../behavior/soarNames';
import { soarConstant } from '../behavior/behaviorModel';
import type { ReadingDomain } from '../behavior/agentAgree';
import type { SubsystemGroup } from './subsystems';

/** What the generated code needs to know about the agent */
export interface SoarAgentInfo {
  /** Every name the agent commands, with the values it sends (from subsystemCommands) */
  commands: Map<string, string[]>;
}

type Kind = 'string' | 'number' | 'bool';

interface Reading {
  kind: Kind;
  /** For a word reading, every word it can send */
  words?: string[];
  /** Java expression for the value, given the device's field name */
  java?: (field: string) => string;
  /** Python expression for the value, given the device's attribute (self.x) */
  python?: (field: string) => string;
  /** What the value means, for the generated comment */
  meaning: string;
}

const TALON = { kind: 'number', java: (f) => `${f}.getVelocity().getValueAsDouble()`, python: (f) => `${f}.get_velocity().value`, meaning: 'rotor velocity, rotations per second' } satisfies Reading;
const SPARK = { kind: 'number', java: (f) => `${f}.getEncoder().getVelocity()`, python: (f) => `${f}.getEncoder().getVelocity()`, meaning: 'motor velocity, RPM' } satisfies Reading;

/** One reading per device type, in words a behavior block can compare against */
export const READINGS: Record<string, Reading> = {
  // Most FRC infrared beam breaks read true while the beam is unbroken
  BeamBreak: { kind: 'string', words: ['blocked', 'clear'], java: (f) => `${f}.get() ? "clear" : "blocked"`, python: (f) => `"clear" if ${f}.get() else "blocked"`, meaning: 'blocked or clear' },
  // A normally open switch with the controller's pull-up reads true until it is pressed
  LimitSwitch: { kind: 'string', words: ['pressed', 'released'], java: (f) => `${f}.get() ? "released" : "pressed"`, python: (f) => `"released" if ${f}.get() else "pressed"`, meaning: 'pressed or released' },
  ThroughBore: { kind: 'number', java: (f) => `${f}.get()`, python: (f) => `${f}.get()`, meaning: 'absolute position, rotations' },
  KrakenX60: TALON,
  KrakenX44: TALON,
  Falcon500: TALON,
  SparkMaxNEO: SPARK,
  NEOVortex: SPARK,
  NEO550: SPARK,
  BrushedController: SPARK,
  CANcoder: { kind: 'number', java: (f) => `${f}.getAbsolutePosition().getValueAsDouble()`, python: (f) => `${f}.get_absolute_position().value`, meaning: 'absolute position, rotations' },
  Pigeon2: { kind: 'number', java: (f) => `${f}.getYaw().getValueAsDouble()`, python: (f) => `${f}.get_yaw().value`, meaning: 'yaw, degrees' },
  NavX2: { kind: 'number', python: (f) => `${f}.getYaw()`, meaning: 'yaw, degrees' },
  PWMServo: { kind: 'number', java: (f) => `${f}.get()`, python: (f) => `${f}.get()`, meaning: 'position, 0 to 1' },
  SolenoidValve: { kind: 'bool', java: (f) => `${f}.get()`, python: (f) => `${f}.get()`, meaning: 'true when on' },
  Compressor: { kind: 'bool', java: (f) => `${f}.isEnabled()`, python: (f) => `${f}.isEnabled()`, meaning: 'true while running' },
  // robot.py keeps a Limelight's NetworkTables table as <id>_table
  Limelight: { kind: 'number', python: (f) => `${f}_table.getNumber("tx", 0.0)`, meaning: 'horizontal offset to the target, degrees' },
  PhotonVision: { kind: 'bool', python: (f) => `${f}.getLatestResult().hasTargets()`, meaning: 'true when a target is in view' },
};

const MOTOR_COMMAND = { java: (f: string) => `${f}.set(c.getDouble("state"))`, python: (f: string) => `${f}.set(c.get_number("state"))`, meaning: 'percent output, -1 to 1' };

/** Devices the agent can command directly with "set <device> to <value>" */
export const DEVICE_COMMANDS: Record<string, { java: (field: string) => string; python: (field: string) => string; meaning: string }> = {
  KrakenX60: MOTOR_COMMAND,
  KrakenX44: MOTOR_COMMAND,
  Falcon500: MOTOR_COMMAND,
  SparkMaxNEO: MOTOR_COMMAND,
  NEOVortex: MOTOR_COMMAND,
  NEO550: MOTOR_COMMAND,
  BrushedController: MOTOR_COMMAND,
  PWMServo: { java: (f) => `${f}.set(c.getDouble("state"))`, python: (f) => `${f}.set(c.get_number("state"))`, meaning: 'position, 0 to 1' },
  SolenoidValve: { java: (f) => `${f}.set(c.getBoolean("state", false))`, python: (f) => `${f}.set(c.get_bool("state"))`, meaning: 'true or false' },
};

/** The Soar attribute a device is read and commanded by, as the behavior editor names it */
export const deviceAttribute = (n: Node<FRCNodeData>): string => soarName(n.id, 'device');

const SETTERS: Record<Kind, { java: string; python: string }> = {
  string: { java: 'setString', python: 'set_string' },
  number: { java: 'setNumber', python: 'set_number' },
  bool: { java: 'setBool', python: 'set_bool' },
};

/** soar.setString("beambreak8", ...); for a device that has a reading in this language */
export function readingLine(n: Node<FRCNodeData>, field: string, language: 'java' | 'python', soar: string): string | undefined {
  const reading = READINGS[n.data?.deviceType];
  const expression = reading?.[language]?.(field);
  if (!reading || !expression) return undefined;
  const call = `${soar}.${SETTERS[reading.kind][language]}(${JSON.stringify(deviceAttribute(n))}, ${expression})`;
  return language === 'java' ? `${call};` : call;
}

/**
 * soar.onCommand("krakenx607", c -> ...); for a device the agent commands. A device that can't
 * take a command (a sensor) still gets a handler, so the bridge doesn't reject the command,
 * with a TODO saying why it does nothing.
 */
export function deviceCommandLine(n: Node<FRCNodeData>, field: string, language: 'java' | 'python', soar: string): string {
  const name = JSON.stringify(deviceAttribute(n));
  const command = DEVICE_COMMANDS[n.data?.deviceType];
  if (language === 'java') {
    return command
      ? `${soar}.onCommand(${name}, c -> ${command.java(field)});  // ${command.meaning}`
      : `${soar}.onCommand(${name}, c -> {});  // TODO: the agent commands ${n.id}, which only sends readings`;
  }
  return command
    ? `${soar}.on_command(${name}, lambda c: ${command.python(field)})  # ${command.meaning}`
    : `${soar}.on_command(${name}, lambda c: None)  # TODO: the agent commands ${n.id}, which only sends readings`;
}

/**
 * What the robot can send for each reading, for behavior proofs: device readings from READINGS
 * (the bridge sends a bool as the word true or false), and each subsystem's state, which is
 * "none" or a word the agent set it to. A subsystem the agent sets to a number is left open,
 * since the word the bridge turns a number into isn't pinned down here. Names used twice are
 * left open too.
 */
export function readingDomains(devices: Node<FRCNodeData>[], subsystems: SubsystemGroup[]): Map<string, ReadingDomain> {
  const found = new Map<string, ReadingDomain | null>();
  const add = (attribute: string, domain: ReadingDomain | null): void => {
    found.set(attribute, found.has(attribute) ? null : domain);
  };
  subsystems.forEach((g) => {
    const values = g.commands.map((raw) => soarConstant(raw));
    const words = values.every((v) => v.kind === 'string') ? [...new Set(['none', ...values.map((v) => v.value as string)])] : null;
    add(g.attribute, words ? { kind: 'words', words, source: `the subsystem “${g.label}”` } : null);
  });
  devices.forEach((n) => {
    const type = n.data?.deviceType;
    const reading = READINGS[type];
    const source = `a ${type} on the diagram`;
    if (!reading) add(deviceAttribute(n), { kind: 'none', source });
    else if (reading.kind === 'number') add(deviceAttribute(n), { kind: 'numbers', source });
    else add(deviceAttribute(n), { kind: 'words', words: reading.kind === 'bool' ? ['false', 'true'] : reading.words || [], source });
  });
  const domains = new Map<string, ReadingDomain>();
  found.forEach((d, a) => d && domains.set(a, d));
  return domains;
}

/** The commands the agent sends to names that aren't a subsystem or a device on the diagram */
export function unknownCommandNames(agent: SoarAgentInfo, known: Set<string>): string[] {
  return [...agent.commands.keys()].filter((name) => !known.has(name));
}
