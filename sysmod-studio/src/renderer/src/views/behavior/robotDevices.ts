/**
 * What a behavior rule can talk about: the subsystem frames on the architecture diagram, and the
 * actuators and sensors on it. Wiring and power parts are left out, since an agent doesn't
 * command a breaker.
 */
import { useEffect, useState } from 'react';
import { Node } from '@xyflow/react';
import { FRC_DEVICE_DEFAULTS, FRCNodeData } from '../store/useRobotStore';
import { SubsystemGroup, subsystemOfDevice } from '../utils/subsystems';
import type { DeviceOption } from './blocks';
import { soarName } from './soarNames';

const BEHAVIOR_DEVICE_TYPES = new Set([
  'KrakenX60', 'KrakenX44', 'Falcon500', 'SparkMaxNEO', 'NEOVortex', 'NEO550', 'BrushedController', 'PWMServo',
  'Compressor', 'SolenoidValve', 'PressureSwitch',
  'CANcoder', 'ThroughBore', 'Pigeon2', 'NavX2', 'LimitSwitch', 'BeamBreak', 'TimeOfFlight', 'ColorSensor',
  'Limelight', 'PhotonVision',
]);

const SENSOR_TYPES = new Set(['LimitSwitch', 'BeamBreak', 'TimeOfFlight', 'ColorSensor', 'Limelight', 'PhotonVision', 'CANcoder', 'ThroughBore', 'PressureSwitch']);

export interface BehaviorDevice extends DeviceOption {
  kind: 'subsystem' | 'sensor' | 'actuator';
}

/** Subsystems first, then each device, marked with the subsystem it is in */
export function behaviorDevices(nodes: Node<FRCNodeData>[], subsystems: SubsystemGroup[]): BehaviorDevice[] {
  const owner = subsystemOfDevice(subsystems);
  const fromSubsystems: BehaviorDevice[] = subsystems.map((s) => ({ label: `${s.label} (subsystem)`, attribute: s.attribute, kind: 'subsystem' }));
  const fromDiagram: BehaviorDevice[] = nodes
    .filter((n) => BEHAVIOR_DEVICE_TYPES.has(n.data?.deviceType))
    .map((n) => {
      const group = owner.get(n.id);
      const name = `${FRC_DEVICE_DEFAULTS[n.data.deviceType]?.label || n.data.deviceType} · ${n.id}`;
      return { label: group ? `${name} · in ${group.label}` : name, attribute: soarName(n.id, 'device'), kind: SENSOR_TYPES.has(n.data.deviceType) ? 'sensor' : 'actuator' };
    });
  const seen = new Set<string>();
  return [...fromSubsystems, ...fromDiagram].filter((d) => !seen.has(d.attribute) && seen.add(d.attribute));
}

/** The subsystem names from the Brainstorming page, saved in the workspace file */
export function useTeamSubsystems(): string[] {
  const [subsystems, setSubsystems] = useState<string[]>([]);
  useEffect(() => {
    const apply = (data: { subsystems?: { name?: string }[] } | null): void =>
      setSubsystems((data?.subsystems || []).map((s) => s.name || '').filter(Boolean));
    if (window.electronAPI?.loadData) {
      window.electronAPI.loadData().then(apply).catch(() => undefined);
    } else {
      try {
        const raw = localStorage.getItem('workspace-data');
        if (raw) apply(JSON.parse(raw));
      } catch {
        // No saved subsystems; the diagram's frames are still listed
      }
    }
  }, []);
  return subsystems;
}

/**
 * A first program to learn from: when a sensor sees a game piece, set a subsystem to "closed".
 * It uses the robot's own subsystem and sensor when the diagram has them. Without them, the
 * names it uses show as "(not on diagram)" until you add a subsystem with those names.
 */
export function exampleBehavior(devices: BehaviorDevice[]): object {
  const sensor = devices.find((d) => d.kind === 'sensor')?.attribute || 'intake-sensor';
  const target = (devices.find((d) => d.kind === 'subsystem') || devices.find((d) => d.kind === 'actuator'))?.attribute || 'intake';
  const deviceBlock = (attribute: string) => ({ block: { type: 'hardware_input', fields: { hardware_input: attribute } } });
  const valueBlock = (v: string) => ({ block: { type: 'hardware_state', fields: { state: v } } });
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'soar_propose_operator',
          x: 40,
          y: 40,
          fields: { propose_operator_name: 'grab-game-piece', PREFERENCE: 'NORMAL' },
          inputs: {
            LHS: { block: { type: 'soar_wme_condition', fields: { Operator: '==' }, inputs: { WorkingMemoryElement: deviceBlock(sensor), Value: valueBlock('blocked') } } },
            RHS: {
              block: {
                type: 'soar_apply_rule',
                fields: { apply_operator_name: 'hold-piece' },
                inputs: { apply_operator_actions: { block: { type: 'soar_set_output', inputs: { hardware_input: deviceBlock(target), hardware_state: valueBlock('closed') } } } },
              },
            },
          },
        },
      ],
    },
  };
}
