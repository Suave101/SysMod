import { Node, Edge } from '@xyflow/react';
import { FRCEdgeData, FRCNodeData } from '../store/useRobotStore';
import { getWireFamily, groupWiresByNetwork, isMismatchedWire, WireFamily } from './aadlGenerator';
import { analyzeHardware, HardwareAnalysis, HardwareIssue } from './hardwareValidation';
import { CONTROLLER_CAN_HANDLES, CONTROLLER_TYPES, CONTROLLERS, findController } from './controllers';

export interface VerificationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  nodeIds?: string[];
  /** Set on issues from the hardware validation engine, which are alerted on the canvas */
  category?: HardwareIssue['category'];
}

export interface VerificationReport {
  passed: boolean;
  score: number;
  issues: VerificationIssue[];
}

const SINGLE_INSTANCE_DEVICES: Record<string, string> = {
  Battery12V: '12V Battery',
  MainBreaker120A: '120A Main Breaker',
  PDH: 'Power Distribution Hub',
  RadioSwitch: 'FRC Radio',
};

const MOTOR_DEVICES = ['KrakenX60', 'KrakenX44', 'Falcon500', 'SparkMaxNEO', 'NEOVortex', 'NEO550', 'BrushedController'];
const ETHERNET_DEVICES = ['Limelight', 'Coprocessor', 'NetworkSwitch'];
const POWERED_DEVICES = [...MOTOR_DEVICES, ...ETHERNET_DEVICES, 'SystemCore', 'roboRIO', 'RadioSwitch', 'PneumaticsHub', 'BuckConverter', 'VRM', 'MPM'];
const CAN_DEVICES = [...MOTOR_DEVICES, 'CANcoder', 'Pigeon2', 'TimeOfFlight', 'PneumaticsHub'];
const CAN_FD_DEVICES = ['KrakenX60', 'KrakenX44', 'Falcon500', 'CANcoder', 'Pigeon2'];
const PNEUMATIC_DEVICES = ['Compressor', 'SolenoidValve', 'PressureSwitch'];
const MAX_SOLENOID_CHANNELS = 16;

// Devices that wire to a controller header or a coprocessor rather than a bus
const SIGNAL_DEVICES: Record<string, { family: WireFamily; port: string }> = {
  LimitSwitch: { family: 'dio', port: 'a controller DIO or Smart I/O port' },
  BeamBreak: { family: 'dio', port: 'a controller DIO or Smart I/O port' },
  ThroughBore: { family: 'dio', port: 'a controller DIO or Smart I/O port' },
  PWMServo: { family: 'pwm', port: 'a controller PWM or Smart I/O port' },
  ColorSensor: { family: 'i2c', port: 'a controller I2C port' },
  NavX2: { family: 'mxp', port: 'the roboRIO MXP port' },
  CANivore: { family: 'usb', port: 'a controller USB port' },
  PhotonVision: { family: 'usb', port: 'a coprocessor USB port' },
};

export function verifySystemProperties(
  nodes: Node<FRCNodeData>[],
  edges: Edge[],
  hardware: HardwareAnalysis = analyzeHardware(nodes, edges),
): VerificationReport {
  const issues: VerificationIssue[] = [];

  const nodesOfType = (...types: string[]): Node<FRCNodeData>[] => nodes.filter((n) => types.includes(n.data?.deviceType));
  const wiresInto = (id: string, family: WireFamily): Edge[] =>
    edges.filter((e) => e.target === id && getWireFamily(e.targetHandle) === family);
  const touchesFamily = (id: string, family: WireFamily): boolean =>
    edges.some((e) =>
      (e.source === id && getWireFamily(e.sourceHandle) === family) ||
      (e.target === id && getWireFamily(e.targetHandle) === family)
    );
  const nodeName = (n: Node<FRCNodeData>): string => n.data?.label || n.id;

  const batteryNode = nodes.find((n) => n.data?.deviceType === 'Battery12V');
  const mainBreakerNode = nodes.find((n) => n.data?.deviceType === 'MainBreaker120A');
  const pdhNode = nodes.find((n) => n.data?.deviceType === 'PDH');
  // SystemCore from 2027, or a roboRIO for 2026 and earlier. Rules below apply to whichever is there.
  const controller = findController(nodes);
  const rioNode = controller?.node;
  const radioNode = nodes.find((n) => n.data?.deviceType === 'RadioSwitch');
  const rslNode = nodes.find((n) => n.data?.deviceType === 'RSL');

  // ── Rule 1: CAN Bus Origin Verification ──
  edges.forEach((e) => {
    if (e.source === radioNode?.id && (e.sourceHandle?.includes('can') || e.targetHandle?.includes('can'))) {
      issues.push({
        id: 'illegal-radio-can',
        severity: 'error',
        title: 'Illegal CAN Bus Connection at Radio',
        message: 'The CAN bus CANNOT originate or connect to the FRC Radio! Standard CAN starts at the robot controller (SystemCore or roboRIO) and CTRE CAN FD can also start at a CANivore.',
        nodeIds: [radioNode.id],
      });
    }
  });

  // ── Rule 2: Radio RIO Port Reservation ──
  if (radioNode) {
    const rioPortEdge = edges.find((e) => 
      (e.source === radioNode.id && e.sourceHandle === 'eth-rio') ||
      (e.target === radioNode.id && e.targetHandle === 'eth-rio')
    );

    if (rioPortEdge) {
      const connectedNodeId = rioPortEdge.source === radioNode.id ? rioPortEdge.target : rioPortEdge.source;
      if (connectedNodeId !== rioNode?.id) {
        // Any second controller is reported below; this is about anything else on the RIO port
        issues.push({
          id: 'radio-rio-port-violation',
          severity: 'error',
          title: 'Radio RIO Port Violation',
          message: 'The Radio RIO port is reserved for the robot controller (SystemCore or roboRIO). Other devices connect to an AUX port or an Ethernet switch.',
          nodeIds: [radioNode.id, connectedNodeId],
        });
      }
    }
  }

  // ── Rule 3: Main Power Sequence (Battery -> 120A Breaker -> PDH) ──
  if (!batteryNode) {
    issues.push({ id: 'no-battery', severity: 'error', title: 'Missing 12V Battery', message: 'No 12V FRC Battery found on canvas.' });
  }

  if (!mainBreakerNode) {
    issues.push({ id: 'no-main-breaker', severity: 'error', title: 'Missing 120A Main Circuit Breaker', message: 'Mandatory 120A Main Breaker is missing! Battery power must pass through this breaker to feed the PDH.' });
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

  // ── Rule 4: Mandatory Robot Signal Light (RSL) ──
  if (!rioNode) {
    issues.push({ id: 'no-controller', severity: 'error', title: 'Missing Robot Controller', message: 'Add a SystemCore (2027 season and later) or a roboRIO 2.0 (2026 and earlier).' });
  } else {
    if (!rslNode) {
      issues.push({ id: 'no-rsl', severity: 'error', title: 'Missing Robot Signal Light (RSL)', message: 'FRC Rules require an approved RSL (Allen-Bradley 855PB-B12ME522 or AndyMark am-3583) connected to the robot controller’s RSL port.' });
    } else {
      const rslConnected = edges.some((e) => e.source === rioNode.id && e.target === rslNode.id && e.sourceHandle === 'rsl-out');
      if (!rslConnected) {
        issues.push({ id: 'rsl-unconnected', severity: 'error', title: 'Unconnected RSL', message: 'The Robot Signal Light must connect to the robot controller’s RSL port.' });
      }
    }
  }

  // ── Rule 5: CAN Bus 120Ω Termination ──
  if (rioNode && pdhNode) {
    const canStart = edges.some((e) => e.source === rioNode.id && CONTROLLER_CAN_HANDLES.includes(e.sourceHandle || ''));
    const canTerm = edges.some((e) => e.target === pdhNode.id && e.targetHandle === 'can-term');

    if (!canStart) {
      issues.push({ id: 'can-no-start', severity: 'error', title: 'CAN Bus Not Originated', message: 'The CAN bus must start at a CAN port on the robot controller.' });
    }
    // SystemCore has five buses, each terminated at its far end, so the PDH is optional there (see Rule 10)
    if (!canTerm && controller?.type === 'roboRIO') {
      issues.push({ id: 'can-no-term', severity: 'error', title: 'CAN Bus Unterminated (120Ω Missing)', message: 'The CAN bus must terminate at the REV PDH built-in 120Ω resistor.' });
    }
  }

  // ── Rule 6: Wire Type Compatibility ──
  edges.filter(isMismatchedWire).forEach((e) => {
    issues.push({
      id: `wire-mismatch-${e.id}`,
      severity: 'error',
      title: 'Incompatible Wire Connection',
      message: `"${e.sourceHandle}" on ${e.source} cannot connect to "${e.targetHandle}" on ${e.target}. This wire is left out of the AADL model until it is fixed.`,
      nodeIds: [e.source, e.target],
    });
  });

  // ── Rule 7: Required & Single-Instance Hardware ──
  if (!pdhNode) {
    issues.push({ id: 'no-pdh', severity: 'error', title: 'Missing Power Distribution Hub', message: 'A robot needs one REV PDH to distribute power from the 120A Main Breaker.' });
  }
  if (!radioNode) {
    issues.push({ id: 'no-radio', severity: 'error', title: 'Missing FRC Radio', message: 'A robot needs an FRC Radio to communicate with the field.' });
  }

  Object.entries(SINGLE_INSTANCE_DEVICES).forEach(([type, name]) => {
    const matches = nodesOfType(type);
    if (matches.length > 1) {
      issues.push({
        id: `multiple-${type}`,
        severity: 'error',
        title: `Multiple ${name} Devices`,
        message: `A robot may only have one ${name}, but this diagram has ${matches.length}.`,
        nodeIds: matches.map((n) => n.id),
      });
    }
  });

  // ── Rule 8: Device Power Feeds ──
  nodesOfType(...POWERED_DEVICES).forEach((node) => {
    const feeds = wiresInto(node.id, 'power');
    if (feeds.length === 0) {
      issues.push({ id: `unpowered-${node.id}`, severity: 'error', title: 'Unpowered Device', message: `${nodeName(node)} has no power connection.`, nodeIds: [node.id] });
    } else if (feeds.length > 1) {
      issues.push({ id: `multi-feed-${node.id}`, severity: 'error', title: 'Multiple Power Feeds', message: `${nodeName(node)} has ${feeds.length} power feeds. Each device takes one supply.`, nodeIds: [node.id] });
    }
  });

  // ── Rule 9: Motor Controller & roboRIO Protection ──
  nodesOfType(...MOTOR_DEVICES).forEach((node) => {
    wiresInto(node.id, 'power').forEach((feed) => {
      if (nodes.find((n) => n.id === feed.source)?.data?.deviceType !== 'PDH') {
        issues.push({ id: `motor-not-pdh-${feed.id}`, severity: 'error', title: 'Motor Not Fed From PDH', message: `${nodeName(node)} must be powered from a PDH high-current channel.`, nodeIds: [node.id, feed.source] });
      } else if ((feed.data as FRCEdgeData | undefined)?.channelType !== 'high') {
        issues.push({ id: `motor-low-channel-${feed.id}`, severity: 'error', title: 'Motor On Undersized Channel', message: `${nodeName(node)} needs a 40A high-current channel (Ports 0–19), not a 15A channel.`, nodeIds: [node.id] });
      }
    });
  });

  // The roboRIO must be on a low-current channel. SystemCore's power rules come with the 2027 game manual.
  if (rioNode && controller?.type === 'roboRIO') {
    wiresInto(rioNode.id, 'power').forEach((feed) => {
      if ((feed.data as FRCEdgeData | undefined)?.channelType !== 'low') {
        issues.push({ id: `rio-power-${feed.id}`, severity: 'error', title: 'roboRIO Power Channel Violation', message: 'The roboRIO must be powered from a PDH low-current channel (Ports 20–22).', nodeIds: [rioNode.id] });
      }
    });
  }

  nodesOfType('Coprocessor').forEach((node) => {
    if (wiresInto(node.id, 'power').some((feed) => feed.sourceHandle !== 'pwr-regulated-out')) {
      issues.push({ id: `coprocessor-raw-power-${node.id}`, severity: 'warning', title: 'Unregulated Coprocessor Power', message: `${nodeName(node)} is on raw battery voltage, which sags under load. Use a buck converter so it does not brown out.`, nodeIds: [node.id] });
    }
  });

  // ── Rule 10: CAN Bus Topology & Device IDs ──
  const canNetworks = groupWiresByNetwork(edges.filter((e) => !isMismatchedWire(e)), (e) => e, 'can');
  const networkNodeIds = (network: Edge[]): Set<string> => new Set(network.flatMap((e) => [e.source, e.target]));

  if (rioNode && pdhNode) {
    const rioNetwork = canNetworks.find((network) => network.some((e) => e.source === rioNode.id && e.sourceHandle === 'can-start'));
    if (controller?.type === 'SystemCore') {
      // Each SystemCore bus has 120Ω built in at the controller and needs another at its far end
      CONTROLLERS.SystemCore.canBuses.forEach(({ handle, label }) => {
        const network = canNetworks.find((n) => n.some((e) => e.source === rioNode.id && e.sourceHandle === handle));
        if (network && !network.some((e) => e.target === pdhNode.id && e.targetHandle === 'can-term')) {
          issues.push({ id: `can-term-${handle}`, severity: 'info', title: `Terminate ${label}`, message: `SystemCore ${label} needs a 120Ω terminator at the far end of its chain. End it at the PDH, or add a terminator the diagram can't show.`, nodeIds: [rioNode.id] });
        }
      });
    }
    const isTerminated = rioNetwork?.some((e) => e.target === pdhNode.id && e.targetHandle === 'can-term');
    if (rioNetwork && edges.some((e) => e.target === pdhNode.id && e.targetHandle === 'can-term') && !isTerminated) {
      issues.push({ id: 'can-broken-chain', severity: 'error', title: 'Broken CAN Chain', message: 'The controller’s CAN start and the PDH 120Ω terminator are not on the same chain. Every link between them must be wired.', nodeIds: [rioNode.id, pdhNode.id] });
    }
  }

  nodesOfType(...CAN_DEVICES).forEach((node) => {
    if (!touchesFamily(node.id, 'can')) {
      issues.push({ id: `can-unconnected-${node.id}`, severity: 'error', title: 'Device Not On CAN Bus', message: `${nodeName(node)} is not wired to a CAN bus.`, nodeIds: [node.id] });
    }
  });

  // A branch is two wires out of one CAN port; SystemCore's five ports each start their own bus
  nodes.filter((n) => n.data?.deviceType !== 'CANHub').forEach((node) => {
    const canOut = edges.filter((e) => e.source === node.id && getWireFamily(e.sourceHandle) === 'can');
    if (new Set(canOut.map((e) => e.sourceHandle)).size < canOut.length) {
      issues.push({ id: `can-branch-${node.id}`, severity: 'warning', title: 'CAN Bus Branch', message: `${nodeName(node)} splits the CAN bus. CAN should be a single daisy chain unless it passes through a CAN hub.`, nodeIds: [node.id] });
    }
  });

  // Duplicate CAN IDs are checked by the hardware validation engine, with DIO, PWM and PDH channels

  // ── Rule 11: CAN FD Bus Compatibility ──
  canNetworks.filter((network) => network.some((e) => e.sourceHandle === 'can-fd-start')).forEach((network, networkIdx) => {
    const ids = networkNodeIds(network);
    const devices = nodes.filter((n) => ids.has(n.id));
    devices
      .filter((n) => !CAN_FD_DEVICES.includes(n.data?.deviceType) && !['CANivore', 'CANHub'].includes(n.data?.deviceType))
      .forEach((node) => {
        issues.push({ id: `can-fd-device-${node.id}`, severity: 'error', title: 'Device Not Supported On CANivore', message: `${nodeName(node)} cannot run on the CAN FD bus. Only CTRE Phoenix 6 devices belong on a CANivore.`, nodeIds: [node.id] });
      });
    issues.push({ id: `can-fd-term-${networkIdx}`, severity: 'info', title: 'Terminate CAN FD Bus', message: 'The CAN FD bus needs its own 120Ω resistor at the far end. The diagram cannot show this, so check it on the robot.' });
  });

  // ── Rule 12: Pneumatics ──
  const pneumaticNodes = nodesOfType(...PNEUMATIC_DEVICES);
  if (pneumaticNodes.length > 0 && nodesOfType('PneumaticsHub').length === 0) {
    issues.push({ id: 'pneumatics-no-hub', severity: 'error', title: 'Missing Pneumatics Hub', message: 'Pneumatic devices must be controlled through a Pneumatics Hub.', nodeIds: pneumaticNodes.map((n) => n.id) });
  }
  if (nodesOfType('Compressor').length > 0 && nodesOfType('PressureSwitch').length === 0) {
    issues.push({ id: 'compressor-no-switch', severity: 'error', title: 'Missing Pressure Switch', message: 'A compressor needs a pressure switch so it cuts off at 120 PSI.', nodeIds: nodesOfType('Compressor').map((n) => n.id) });
  }
  nodesOfType('Compressor').forEach((node) => {
    if (!touchesFamily(node.id, 'comp')) {
      issues.push({ id: `compressor-unwired-${node.id}`, severity: 'error', title: 'Compressor Not Wired', message: `Connect ${nodeName(node)} to the Pneumatic Hub compressor output. It does not run from the PDH.`, nodeIds: [node.id] });
    }
  });
  nodesOfType('PressureSwitch').forEach((node) => {
    if (!touchesFamily(node.id, 'press')) {
      issues.push({ id: `press-unwired-${node.id}`, severity: 'error', title: 'Pressure Switch Not Wired', message: `Connect ${nodeName(node)} to the Pneumatic Hub pressure switch input.`, nodeIds: [node.id] });
    }
  });
  nodesOfType('SolenoidValve').forEach((node) => {
    if (!touchesFamily(node.id, 'sol')) {
      issues.push({ id: `sol-unwired-${node.id}`, severity: 'error', title: 'Solenoid Not Wired', message: `Connect ${nodeName(node)} to a Pneumatic Hub solenoid channel.`, nodeIds: [node.id] });
    }
  });
  nodesOfType('PneumaticsHub').forEach((node) => {
    const used = edges.filter((e) => e.source === node.id && e.sourceHandle === 'sol-out').length;
    if (used > MAX_SOLENOID_CHANNELS) {
      issues.push({ id: `sol-limit-${node.id}`, severity: 'error', title: 'Too Many Solenoids', message: `${nodeName(node)} has ${used} solenoids wired, but only ${MAX_SOLENOID_CHANNELS} channels.`, nodeIds: [node.id] });
    }
  });
  if (nodesOfType('SolenoidValve').length > 0 && nodesOfType('Compressor').length === 0) {
    issues.push({ id: 'solenoid-no-compressor', severity: 'warning', title: 'No Air Source', message: 'Solenoid valves are on the diagram, but there is no compressor to supply air.', nodeIds: nodesOfType('SolenoidValve').map((n) => n.id) });
  }

  // ── Rule 13: Robot Network ──
  if (radioNode && rioNode) {
    const radioLinked = edges.some((e) => e.source === rioNode.id && e.target === radioNode.id && e.targetHandle === 'eth-rio');
    if (!radioLinked) {
      issues.push({ id: 'radio-rio-unlinked', severity: 'error', title: 'Controller Not Linked To Radio', message: 'Connect the robot controller’s Ethernet port to the Radio RIO port, or the robot cannot talk to the field.', nodeIds: [rioNode.id, radioNode.id] });
    }
  }

  nodesOfType(...ETHERNET_DEVICES).forEach((node) => {
    if (!touchesFamily(node.id, 'eth')) {
      issues.push({ id: `eth-unconnected-${node.id}`, severity: 'warning', title: 'Device Not On Network', message: `${nodeName(node)} has no Ethernet connection, so the robot controller cannot read from it.`, nodeIds: [node.id] });
    }
  });

  // ── Rule 14: Sensor & Signal Wiring ──
  Object.entries(SIGNAL_DEVICES).forEach(([type, { family, port }]) => {
    nodesOfType(type).forEach((node) => {
      if (!touchesFamily(node.id, family)) {
        issues.push({ id: `signal-unwired-${node.id}`, severity: 'warning', title: 'Device Not Wired', message: `${nodeName(node)} must connect to ${port}.`, nodeIds: [node.id] });
      }
    });
  });

  if (rioNode && controller) {
    controller.spec.portLimits.forEach(({ handles, name, limit }) => {
      const used = edges.filter((e) => (e.target === rioNode.id && handles.includes(e.targetHandle || '')) || (e.source === rioNode.id && handles.includes(e.sourceHandle || ''))).length;
      if (used > limit) {
        issues.push({ id: `rio-limit-${name}`, severity: 'error', title: `Too Many ${name} Devices`, message: `The ${controller.spec.name} has ${limit} ${name} ports, but ${used} devices are wired to them.`, nodeIds: [rioNode.id] });
      }
    });
  }

  // ── Rule 15: Controller Generation ──
  const controllers = nodesOfType(...CONTROLLER_TYPES);
  if (controllers.length > 1) {
    issues.push({ id: 'multiple-controllers', severity: 'error', title: 'More Than One Robot Controller', message: 'A robot has one controller: a SystemCore (2027 and later) or a roboRIO (2026 and earlier), not both.', nodeIds: controllers.map((n) => n.id) });
  }
  if (controller?.type === 'roboRIO') {
    issues.push({ id: 'legacy-roborio', severity: 'info', title: 'roboRIO Is For 2026 And Earlier', message: 'Starting with the 2027 season, FRC robots use SystemCore, and WPILib 2027 no longer supports the roboRIO. Keep the roboRIO for 2026 robots and offseason events.', nodeIds: [controller.node.id] });
  }
  if (controller && !controller.spec.hasMxp) {
    nodesOfType('NavX2').forEach((node) => {
      issues.push({ id: `no-mxp-${node.id}`, severity: 'error', title: 'No MXP Port On SystemCore', message: `SystemCore has no MXP port, so ${nodeName(node)} can't plug in. Use SystemCore's built-in IMU or a CAN IMU such as the Pigeon 2.0.`, nodeIds: [node.id] });
    });
  }
  nodesOfType('NetworkSwitch').forEach((node) => {
    if (wiresInto(node.id, 'eth').length === 0) {
      issues.push({ id: `switch-no-uplink-${node.id}`, severity: 'warning', title: 'Ethernet Switch Not Connected', message: `Connect the uplink of ${nodeName(node)} to a radio AUX port, or nothing on it can reach the robot controller.`, nodeIds: [node.id] });
    }
  });

  // ── Rules 15 to 17: Hardware Validation Engine (CAN load, current limits, port and ID conflicts) ──
  issues.push(...hardware.issues);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const rawScore = Math.max(0, 100 - errorCount * 25 - warningCount * 10);

  return { passed: errorCount === 0, score: rawScore, issues };
}