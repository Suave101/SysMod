import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';

export interface VerificationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  nodeIds?: string[];
}

export interface VerificationReport {
  passed: boolean;
  score: number;
  issues: VerificationIssue[];
}

export function verifySystemProperties(nodes: Node<FRCNodeData>[], edges: Edge[]): VerificationReport {
  const issues: VerificationIssue[] = [];

  const batteryNode = nodes.find((n) => n.data?.deviceType === 'Battery12V');
  const mainBreakerNode = nodes.find((n) => n.data?.deviceType === 'MainBreaker120A');
  const pdhNode = nodes.find((n) => n.data?.deviceType === 'PDH');
  const rioNode = nodes.find((n) => n.data?.deviceType === 'roboRIO');
  const rslNode = nodes.find((n) => n.data?.deviceType === 'RSL');
  const phNode = nodes.find((n) => n.data?.deviceType === 'PneumaticsHub');
  const pressureSwitchNode = nodes.find((n) => n.data?.deviceType === 'PressureSwitch');
  const coprocessors = nodes.filter((n) => n.data?.deviceType === 'Coprocessor');
  const buckConverters = nodes.filter((n) => n.data?.deviceType === 'BuckConverter');

  // ── Rule 1: Mandatory Main Power Sequence (Battery -> 120A Breaker -> PDH) ──
  if (!batteryNode) {
    issues.push({ id: 'no-battery', severity: 'error', title: 'Missing 12V Battery', message: 'No 12V FRC Battery found on canvas.' });
  }

  if (!mainBreakerNode) {
    issues.push({ id: 'no-main-breaker', severity: 'error', title: 'Missing 120A Main Circuit Breaker', message: 'Mandatory 120A Main Breaker is missing! Battery must pass through this breaker to power the PDH.' });
  } else if (batteryNode && mainBreakerNode) {
    const battToBreaker = edges.some((e) => e.source === batteryNode.id && e.target === mainBreakerNode.id);
    if (!battToBreaker) {
      issues.push({ id: 'breaker-unlinked', severity: 'error', title: '120A Main Breaker Unconnected', message: '12V Battery must link directly into the 120A Main Circuit Breaker.' });
    }
  }

  if (mainBreakerNode && pdhNode) {
    const breakerToPdh = edges.some((e) => e.source === mainBreakerNode.id && e.target === pdhNode.id);
    if (!breakerToPdh) {
      issues.push({ id: 'pdh-unlinked-breaker', severity: 'error', title: 'PDH Missing 120A Breaker Input', message: 'REV PDH must be powered directly from the 120A Main Circuit Breaker.' });
    }
  }

  // ── Rule 2: Mandatory Robot Signal Light (RSL) ──
  if (!rioNode) {
    issues.push({ id: 'no-roborio', severity: 'error', title: 'Missing roboRIO 2.0', message: 'No roboRIO controller found.' });
  } else {
    if (!rslNode) {
      issues.push({ id: 'no-rsl', severity: 'error', title: 'Missing Robot Signal Light (RSL)', message: 'FRC Rules require an Allen-Bradley 855T RSL connected to the roboRIO RSL header.' });
    } else {
      const rslConnected = edges.some((e) => e.source === rioNode.id && e.target === rslNode.id && e.sourceHandle === 'rsl-out');
      if (!rslConnected) {
        issues.push({ id: 'rsl-unconnected', severity: 'error', title: 'Unconnected RSL', message: 'Robot Signal Light must connect to the roboRIO dedicated "rsl-out" header.' });
      }
    }
  }

  // ── Rule 3: Pneumatic System Pressure Switch Safety ──
  const hasPneumatics = nodes.some((n) => ['Compressor', 'SolenoidValve'].includes(n.data?.deviceType || ''));
  if (hasPneumatics) {
    if (!phNode) {
      issues.push({ id: 'missing-ph', severity: 'error', title: 'Missing Pneumatics Hub', message: 'Pneumatic actuators require a REV Pneumatics Hub controller.' });
    } else if (!pressureSwitchNode) {
      issues.push({ id: 'missing-pressure-switch', severity: 'error', title: 'Missing Pneumatic Pressure Switch', message: 'Mandatory 120 PSI Pressure Switch is missing! Required for automated compressor cutoff.' });
    }
  }

  // ── Rule 4: Coprocessor Regulated Power Protection ──
  if (coprocessors.length > 0) {
    coprocessors.forEach((coproc) => {
      const poweredByBuck = edges.some((e) => e.target === coproc.id && buckConverters.some((b) => b.id === e.source));
      if (!poweredByBuck) {
        issues.push({
          id: `coproc-unregulated-${coproc.id}`,
          severity: 'warning',
          title: `Unregulated Power: ${coproc.data?.label}`,
          message: 'Coprocessors (Orange Pi/Jetson) should be powered through a 5V/12V DC-DC Buck Converter to prevent power spikes or brownout resets.',
          nodeIds: [coproc.id],
        });
      }
    });
  }

  // ── Rule 5: CAN Bus 120Ω Termination ──
  if (rioNode && pdhNode) {
    const canStart = edges.some((e) => e.source === rioNode.id && e.sourceHandle === 'can-start');
    const canTerm = edges.some((e) => e.target === pdhNode.id && e.targetHandle === 'can-term');

    if (!canStart) {
      issues.push({ id: 'can-no-start', severity: 'error', title: 'CAN Bus Not Originated', message: 'The CAN bus must start at the roboRIO "can-start" port.' });
    }
    if (!canTerm) {
      issues.push({ id: 'can-no-term', severity: 'error', title: 'CAN Bus Unterminated (120Ω Missing)', message: 'The CAN bus must terminate at the REV PDH built-in 120Ω resistor.' });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const rawScore = Math.max(0, 100 - errorCount * 25 - warningCount * 10);

  return { passed: errorCount === 0, score: rawScore, issues };
}