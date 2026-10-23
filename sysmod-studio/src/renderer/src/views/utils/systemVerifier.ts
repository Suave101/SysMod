import { Node, Edge } from '@xyflow/react';
import { FRCNodeData, FRCEdgeData, MAX_HIGH_CHANNELS, MAX_LOW_CHANNELS } from '../store/useRobotStore';

export interface VerificationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  nodeIds?: string[];
}

export interface VerificationReport {
  passed: boolean;
  score: number; // 0 - 100%
  issues: VerificationIssue[];
}

export function verifySystemProperties(nodes: Node<FRCNodeData>[], edges: Edge[]): VerificationReport {
  const issues: VerificationIssue[] = [];

  const pdhNode = nodes.find((n) => n.data?.deviceType === 'PDH');
  const rioNode = nodes.find((n) => n.data?.deviceType === 'roboRIO');
  const batteryNode = nodes.find((n) => n.data?.deviceType === 'Battery12V');

  // ── Rule 1: Battery Main Power Link ──
  if (!batteryNode) {
    issues.push({
      id: 'no-battery',
      severity: 'error',
      title: 'Missing 12V Battery',
      message: 'No 12V FRC Battery component found on the canvas.',
    });
  } else if (pdhNode) {
    const batteryToPdh = edges.some(
      (e) => e.source === batteryNode.id && e.target === pdhNode.id && e.targetHandle === 'pwr-12v-in'
    );
    if (!batteryToPdh) {
      issues.push({
        id: 'battery-unlinked',
        severity: 'error',
        title: 'Unconnected Main Battery',
        message: 'The 12V Battery must be connected directly to the REV PDH main power input.',
        nodeIds: [batteryNode.id, pdhNode.id],
      });
    }
  }

  // ── Rule 2: roboRIO Power Connection ──
  if (!rioNode) {
    issues.push({
      id: 'no-roborio',
      severity: 'error',
      title: 'Missing roboRIO',
      message: 'No roboRIO 2.0 controller found on the canvas.',
    });
  } else if (pdhNode) {
    const rioPowerEdge = edges.find((e) => e.target === rioNode.id && e.targetHandle === 'pwr-12v-in');

    if (!rioPowerEdge) {
      issues.push({
        id: 'rio-unpowered',
        severity: 'error',
        title: 'Unpowered roboRIO',
        message: 'roboRIO 2.0 has no power connection from the REV PDH.',
        nodeIds: [rioNode.id],
      });
    } else if (rioPowerEdge.sourceHandle === 'pwr-high-out') {
      issues.push({
        id: 'rio-high-current-violation',
        severity: 'error',
        title: 'Illegal roboRIO Breaker Connection',
        message: 'roboRIO cannot be powered from a 40A high-current breaker port! Move connection to a Low-Current 15A port (Ports 20–22).',
        nodeIds: [rioNode.id, pdhNode.id],
      });
    }
  }

  // ── Rule 3: CAN Bus Topology & 120Ω Termination ──
  if (rioNode && pdhNode) {
    const canStartEdge = edges.find((e) => e.source === rioNode.id && e.sourceHandle === 'can-start');
    const canTermEdge = edges.find((e) => e.target === pdhNode.id && e.targetHandle === 'can-term');

    if (!canStartEdge) {
      issues.push({
        id: 'can-no-start',
        severity: 'error',
        title: 'CAN Bus Not Originated',
        message: 'The CAN bus must originate at the roboRIO "CAN Bus Start" port.',
        nodeIds: [rioNode.id],
      });
    }

    if (!canTermEdge) {
      issues.push({
        id: 'can-no-term',
        severity: 'error',
        title: 'CAN Bus Unterminated (120Ω Missing)',
        message: 'FRC Rules require the CAN bus to terminate at the REV PDH built-in 120Ω resistor ("can-term" port).',
        nodeIds: [pdhNode.id],
      });
    }
  }

  // ── Rule 4: Device Power & Isolation Check ──
  nodes.forEach((node) => {
    const devType = node.data?.deviceType;
    if (devType === 'Battery12V' || devType === 'PDH') return;

    const hasPower = edges.some((e) => e.target === node.id && e.targetHandle?.includes('pwr'));
    const hasData = edges.some((e) => e.source === node.id || e.target === node.id);

    if (!hasPower) {
      issues.push({
        id: `unpowered-${node.id}`,
        severity: 'warning',
        title: `Unpowered Device: ${node.data?.label}`,
        message: `${node.data?.label} is missing a 12V power link from the PDH.`,
        nodeIds: [node.id],
      });
    }

    if (!hasData) {
      issues.push({
        id: `isolated-${node.id}`,
        severity: 'info',
        title: `Isolated Device: ${node.data?.label}`,
        message: `${node.data?.label} has no CAN or signal wires connected.`,
        nodeIds: [node.id],
      });
    }
  });

  // Calculate Verification Score
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const rawScore = Math.max(0, 100 - errorCount * 25 - warningCount * 10);

  return {
    passed: errorCount === 0,
    score: rawScore,
    issues,
  };
}