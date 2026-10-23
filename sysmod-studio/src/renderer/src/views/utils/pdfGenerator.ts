import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';
import { verifySystemProperties } from './systemVerifier';

export interface HardwareCostMap {
  [key: string]: number;
}

const DEFAULT_COSTS: HardwareCostMap = {
  Battery12V: 50.00,
  MainBreaker120A: 35.00,
  PDH: 240.00,
  roboRIO: 450.00,
  RSL: 35.00,
  RadioSwitch: 150.00,
  PneumaticsHub: 120.00,
  PressureSwitch: 15.00,
  VRM_MPM: 45.00,
  BuckConverter: 15.00,
  CANivore: 300.00,
  CANHub: 25.00,
  KrakenX60: 180.00,
  Falcon500: 180.00,
  SparkMaxNEO: 125.00,
  NEOVortex: 180.00,
  NEO550: 45.00,
  BrushedController: 50.00,
  PWMServo: 20.00,
  Compressor: 110.00,
  SolenoidValve: 45.00,
  Limelight: 400.00,
  PhotonVision: 120.00,
  CANcoder: 65.00,
  ThroughBore: 45.00,
  Pigeon2: 199.00,
  NavX2: 100.00,
  LimitSwitch: 10.00,
  BeamBreak: 15.00,
  TimeOfFlight: 35.00,
  ColorSensor: 20.00,
  Coprocessor: 120.00,
};

const REF_DES_PREFIX: Record<string, string> = {
  Battery12V: 'BT',
  MainBreaker120A: 'CB',
  PDH: 'U',
  roboRIO: 'U',
  RadioSwitch: 'U',
  RSL: 'DS',
  PneumaticsHub: 'U',
  KrakenX60: 'M',
  Falcon500: 'M',
  SparkMaxNEO: 'M',
  NEO550: 'M',
  NEOVortex: 'M',
  CANcoder: 'E',
  Pigeon2: 'U',
  Limelight: 'CAM',
  PhotonVision: 'CAM',
};

interface TerminalPin {
  id: string;
  label: string;
}

interface DevicePinSpecs {
  inputs: TerminalPin[];
  outputs: TerminalPin[];
}

interface Point {
  x: number;
  y: number;
}

interface TraceSegment {
  p1: Point;
  p2: Point;
  edgeId: string;
}

interface RoutedTrace {
  edgeId: string;
  points: Point[];
  strokeColor: string;
  strokeDash: string;
  label: string;
}

/**
 * Returns discrete multi-terminal pin specifications for FRC hardware components.
 */
function getDevicePinSpecs(devType: string): DevicePinSpecs {
  const pinSpecsMap: Record<string, DevicePinSpecs> = {
    Battery12V: {
      inputs: [],
      outputs: [
        { id: 'pwr-battery-out', label: '12V SB50 OUT' }
      ]
    },
    MainBreaker120A: {
      inputs: [
        { id: 'pwr-battery-in', label: '12V BATT IN' }
      ],
      outputs: [
        { id: 'pwr-pdh-out', label: '120A BUS OUT' }
      ]
    },
    PDH: {
      inputs: [
        { id: 'pwr-12v-in', label: '120A MAIN IN' },
        { id: 'can-term', label: 'CAN 120Ω TERM' }
      ],
      outputs: [
        { id: 'pwr-high-out', label: '40A ATO (0-19)' },
        { id: 'pwr-low-out', label: '15A ATM (20-22)' },
        { id: 'pwr-switched-out', label: '15A SWITCHED' }
      ]
    },
    roboRIO: {
      inputs: [
        { id: 'pwr-12v-in', label: '12V PWR IN' },
        { id: 'eth-in', label: 'ETH IN' }
      ],
      outputs: [
        { id: 'can-start', label: 'CAN BUS START' },
        { id: 'rsl-out', label: 'RSL OUT' },
        { id: 'eth-out', label: 'ETH OUT' }
      ]
    },
    RadioSwitch: {
      inputs: [
        { id: 'pwr-12v-in', label: '12V PoE IN' },
        { id: 'eth-rio', label: 'RIO PORT (ETH)' }
      ],
      outputs: [
        { id: 'eth-aux', label: 'AUX PORT (ETH)' }
      ]
    },
    RSL: {
      inputs: [
        { id: 'rsl-in', label: 'RSL SIGNAL IN' }
      ],
      outputs: []
    },
    CANivore: {
      inputs: [
        { id: 'usb-in', label: 'USB IN' },
        { id: 'pwr-12v-in', label: '12V PWR IN' }
      ],
      outputs: [
        { id: 'can-fd-start', label: 'CAN FD START' }
      ]
    }
  };

  if (pinSpecsMap[devType]) {
    return pinSpecsMap[devType];
  }

  // Actuators & Motors
  if (['KrakenX60', 'Falcon500', 'SparkMaxNEO', 'NEOVortex', 'NEO550', 'BrushedController'].includes(devType)) {
    return {
      inputs: [
        { id: 'pwr-12v-in', label: '12V PWR IN' },
        { id: 'can-in', label: 'CAN IN' }
      ],
      outputs: [
        { id: 'can-out', label: 'CAN OUT' }
      ]
    };
  }

  // Vision & Coprocessors
  if (['Limelight', 'PhotonVision', 'Coprocessor'].includes(devType)) {
    return {
      inputs: [
        { id: 'pwr-12v-in', label: '12V PWR IN' },
        { id: 'eth-in', label: 'ETH IN' }
      ],
      outputs: [
        { id: 'eth-out', label: 'ETH OUT' }
      ]
    };
  }

  return {
    inputs: [{ id: 'in', label: 'IN' }],
    outputs: [{ id: 'out', label: 'OUT' }]
  };
}

/**
 * Calculates a structured 4-column EDA schematic layout with dynamic vertical spacing.
 */
function calculateEdaLayout(nodes: Node<FRCNodeData>[]): Map<string, Point> {
  const colMap: Record<string, number> = {
    Battery12V: 0,
    MainBreaker120A: 1,
    PDH: 1,
    VRM_MPM: 1,
    BuckConverter: 1,
    roboRIO: 2,
    RadioSwitch: 2,
    CANivore: 2,
    PneumaticsHub: 2,
  };

  const columns: Record<number, Node<FRCNodeData>[]> = { 0: [], 1: [], 2: [], 3: [] };

  nodes.forEach((node) => {
    const dev = node.data?.deviceType || 'Device';
    const cIdx = colMap[dev] !== undefined ? colMap[dev] : 3;
    columns[cIdx].push(node);
  });

  const activeCols = [0, 1, 2, 3].filter((c) => columns[c].length > 0);
  const layoutPositions = new Map<string, Point>();

  const startX = 60;
  const xSpacing = 420;
  const yStart = 60;

  activeCols.forEach((colNum, idx) => {
    const xPos = startX + idx * xSpacing;
    const colNodes = columns[colNum];

    let currentY = yStart;
    colNodes.forEach((node) => {
      const devType = node.data?.deviceType || 'Device';
      const specs = getDevicePinSpecs(devType);
      const numPins = Math.max(specs.inputs.length, specs.outputs.length, 1);
      const boxH = 58 + numPins * 24 + 42;

      layoutPositions.set(node.id, {
        x: xPos,
        y: currentY,
      });

      currentY += boxH + 50; // Spacing between stacked nodes in the same column
    });
  });

  return layoutPositions;
}

/**
 * Generates an EDA CAD Electrical Schematic SVG (Print-Optimized, Gutter-Routed & Overlap-Free)
 */
function generateCadSchematicSVG(nodes: Node<FRCNodeData>[], edges: Edge[]): string {
  if (nodes.length === 0) {
    return `<div style="text-align:center; padding: 40px; color: #64748b; font-family: monospace;">No components on canvas to generate schematic.</div>`;
  }

  const layoutPositions = calculateEdaLayout(nodes);

  const refCounters: Record<string, number> = {};
  const nodeRefMap = new Map<string, string>();
  nodes.forEach((node) => {
    const dev = node.data?.deviceType || 'Component';
    const prefix = REF_DES_PREFIX[dev] || 'U';
    refCounters[prefix] = (refCounters[prefix] || 0) + 1;
    nodeRefMap.set(node.id, `${prefix}${refCounters[prefix]}`);
  });

  // Calculate terminal pin coordinates: (nodeId:pinId) -> Point
  const pinTerminalCoords = new Map<string, Point>();
  const boxWidth = 300;

  nodes.forEach((node) => {
    const pos = layoutPositions.get(node.id) || { x: 0, y: 0 };
    const devType = node.data?.deviceType || 'Device';
    const specs = getDevicePinSpecs(devType);

    // Inputs (Left side)
    specs.inputs.forEach((pin, idx) => {
      const py = pos.y + 58 + idx * 24;
      pinTerminalCoords.set(`${node.id}:${pin.id}`, { x: pos.x - 12, y: py });
    });

    // Outputs (Right side)
    specs.outputs.forEach((pin, idx) => {
      const py = pos.y + 58 + idx * 24;
      pinTerminalCoords.set(`${node.id}:${pin.id}`, { x: pos.x + boxWidth + 12, y: py });
    });
  });

  // Calculate trace paths
  const routedTraces: RoutedTrace[] = [];
  const allVerticalSegments: TraceSegment[] = [];

  edges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    const sourcePos = layoutPositions.get(edge.source);
    const targetPos = layoutPositions.get(edge.target);
    if (!sourcePos || !targetPos) return;

    const sourceSpecs = getDevicePinSpecs(sourceNode?.data?.deviceType || '');
    const targetSpecs = getDevicePinSpecs(targetNode?.data?.deviceType || '');

    const sourceKey = `${edge.source}:${edge.sourceHandle || ''}`;
    const targetKey = `${edge.target}:${edge.targetHandle || ''}`;

    // Fallback to first output/input pin if handle is unspecified
    let srcPt = pinTerminalCoords.get(sourceKey);
    if (!srcPt && sourceSpecs.outputs.length > 0) {
      srcPt = pinTerminalCoords.get(`${edge.source}:${sourceSpecs.outputs[0].id}`);
    }
    if (!srcPt) {
      srcPt = { x: sourcePos.x + boxWidth + 12, y: sourcePos.y + 58 };
    }

    let tgtPt = pinTerminalCoords.get(targetKey);
    if (!tgtPt && targetSpecs.inputs.length > 0) {
      tgtPt = pinTerminalCoords.get(`${edge.target}:${targetSpecs.inputs[0].id}`);
    }
    if (!tgtPt) {
      tgtPt = { x: targetPos.x - 12, y: targetPos.y + 58 };
    }

    const sx = srcPt.x;
    const sy = srcPt.y;
    const tx = tgtPt.x;
    const ty = tgtPt.y;

    let points: Point[] = [];

    if (sy === ty && tx >= sx + 20) {
      points = [{ x: sx, y: sy }, { x: tx, y: ty }];
    } else if (tx < sx + 20) {
      // Same column or target is to the left: Route out around the right-hand gutter
      const gutterX = Math.max(sourcePos.x, targetPos.x) + boxWidth + 40;
      points = [
        { x: sx, y: sy },
        { x: gutterX, y: sy },
        { x: gutterX, y: ty },
        { x: tx, y: ty },
      ];
    } else {
      // Standard left-to-right Manhattan routing
      const midX = sx + (tx - sx) / 2;
      points = [
        { x: sx, y: sy },
        { x: midX, y: sy },
        { x: midX, y: ty },
        { x: tx, y: ty },
      ];
    }

    let strokeColor = '#000000';
    let strokeDash = '';
    const styleKey = edge.style?.stroke;

    if (styleKey === '#dc2626' || styleKey === '#ef4444') {
      strokeColor = '#b91c1c';
    } else if (styleKey === '#eab308' || styleKey === '#f59e0b') {
      strokeColor = '#15803d';
    } else if (styleKey === '#10b981') {
      strokeColor = '#1d4ed8';
    } else if (styleKey === '#e11d48' || styleKey === '#0284c7') {
      strokeColor = '#0369a1';
      strokeDash = 'stroke-dasharray="4,3"';
    }

    const wireLabel = edge.label ? String(edge.label) : '';

    routedTraces.push({
      edgeId: edge.id,
      points,
      strokeColor,
      strokeDash,
      label: wireLabel,
    });

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (p1.x === p2.x && p1.y !== p2.y) {
        allVerticalSegments.push({ p1, p2, edgeId: edge.id });
      }
    }
  });

  // Calculate viewport bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((node) => {
    const pos = layoutPositions.get(node.id) || { x: 0, y: 0 };
    const devType = node.data?.deviceType || 'Device';
    const specs = getDevicePinSpecs(devType);
    const numPins = Math.max(specs.inputs.length, specs.outputs.length, 1);
    const boxH = 58 + numPins * 24 + 42;

    minX = Math.min(minX, pos.x - 40);
    minY = Math.min(minY, pos.y - 20);
    maxX = Math.max(maxX, pos.x + boxWidth + 60);
    maxY = Math.max(maxY, pos.y + boxH + 30);
  });

  const margin = 80;
  const width = Math.max(1150, maxX - minX + margin * 2);
  const height = Math.max(680, maxY - minY + margin * 2);
  const viewBox = `${minX - margin} ${minY - margin} ${width} ${height}`;

  // Render SVG Traces with Wire Jump Bridges
  const jumpRadius = 5;
  const svgTraces = routedTraces.map((trace) => {
    const { points, strokeColor, strokeDash, label, edgeId } = trace;
    let pathD = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      if (p1.y === p2.y) {
        const hy = p1.y;
        const minHx = Math.min(p1.x, p2.x);
        const maxHx = Math.max(p1.x, p2.x);
        const isRightward = p2.x >= p1.x;

        const crossings: number[] = [];

        allVerticalSegments.forEach((vSeg) => {
          if (vSeg.edgeId === edgeId) return;
          const vx = vSeg.p1.x;
          const minVy = Math.min(vSeg.p1.y, vSeg.p2.y);
          const maxVy = Math.max(vSeg.p1.y, vSeg.p2.y);

          if (minHx + 10 < vx && vx < maxHx - 10 && minVy + 5 < hy && hy < maxVy - 5) {
            crossings.push(vx);
          }
        });

        if (crossings.length > 0) {
          crossings.sort((a, b) => (isRightward ? a - b : b - a));

          crossings.forEach((cx) => {
            if (isRightward) {
              const startX = cx - jumpRadius;
              const endX = cx + jumpRadius;
              pathD += ` L ${startX} ${hy} A ${jumpRadius} ${jumpRadius} 0 0 1 ${endX} ${hy}`;
            } else {
              const startX = cx + jumpRadius;
              const endX = cx - jumpRadius;
              pathD += ` L ${startX} ${hy} A ${jumpRadius} ${jumpRadius} 0 0 1 ${endX} ${hy}`;
            }
          });
        }
        pathD += ` L ${p2.x} ${p2.y}`;
      } else {
        pathD += ` L ${p2.x} ${p2.y}`;
      }
    }

    const startPt = points[0];
    const endPt = points[points.length - 1];
    const midIndex = Math.floor(points.length / 2);
    const midPt = points[midIndex];

    return `
      <g class="cad-trace">
        <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2" ${strokeDash} stroke-linejoin="round" />
        <circle cx="${startPt.x}" cy="${startPt.y}" r="3" fill="${strokeColor}" />
        <circle cx="${endPt.x}" cy="${endPt.y}" r="3" fill="${strokeColor}" />
        ${label ? `
          <g>
            <rect x="${midPt.x - (label.length * 3)}" y="${midPt.y - 14}" width="${label.length * 6}" height="11" fill="#ffffff" opacity="0.9" rx="2" />
            <text x="${midPt.x}" y="${midPt.y - 5}" fill="#334155" font-family="monospace" font-size="8" font-weight="bold" text-anchor="middle">${label}</text>
          </g>
        ` : ''}
      </g>
    `;
  }).join('');

  // Render Component Symbols
  const svgSymbols = nodes.map((node) => {
    const pos = layoutPositions.get(node.id) || { x: 0, y: 0 };
    const x = pos.x;
    const y = pos.y;
    const rawLabel = node.data?.label || node.id;
    const refDes = nodeRefMap.get(node.id) || 'U?';
    const devType = node.data?.deviceType || 'Device';
    const pwrChan = node.data?.powerChannel || 'UNASSIGNED';

    const cleanLabel = rawLabel.length > 30 ? rawLabel.substring(0, 30) + '…' : rawLabel;
    const cleanProto = (node.data?.protocol || 'CAN').substring(0, 24);

    let portText = 'N/A';
    if (node.data?.canId !== undefined) portText = `CAN ID: ${node.data.canId}`;
    else if (node.data?.dioPort !== undefined) portText = `DIO: ${node.data.dioPort}`;
    else if (node.data?.pwmPort !== undefined) portText = `PWM: ${node.data.pwmPort}`;

    const specs = getDevicePinSpecs(devType);
    const numPins = Math.max(specs.inputs.length, specs.outputs.length, 1);

    const pinsStartY = 58;
    const pinSpacing = 24;
    const footerLineY = pinsStartY + numPins * pinSpacing + 8;
    const boxH = footerLineY + 34;

    // Render Input Pins
    const inputElements = specs.inputs.map((pin, idx) => {
      const py = pinsStartY + idx * pinSpacing;
      return `
        <line x1="-12" y1="${py}" x2="0" y2="${py}" stroke="#0f172a" stroke-width="2" />
        <circle cx="-12" cy="${py}" r="2.5" fill="#0f172a" />
        <text x="8" y="${py + 3}" fill="#0f172a" font-family="monospace" font-size="8" font-weight="bold">▸ ${pin.label}</text>
      `;
    }).join('');

    // Render Output Pins
    const outputElements = specs.outputs.map((pin, idx) => {
      const py = pinsStartY + idx * pinSpacing;
      return `
        <line x1="${boxWidth}" y1="${py}" x2="${boxWidth + 12}" y2="${py}" stroke="#0f172a" stroke-width="2" />
        <circle cx="${boxWidth + 12}" cy="${py}" r="2.5" fill="#0f172a" />
        <text x="${boxWidth - 8}" y="${py + 3}" fill="#0f172a" font-family="monospace" font-size="8" font-weight="bold" text-anchor="end">${pin.label} ◂</text>
      `;
    }).join('');

    return `
      <g transform="translate(${x}, ${y})" class="cad-component">
        <!-- Outer Box -->
        <rect x="0" y="0" width="${boxWidth}" height="${boxH}" fill="#ffffff" stroke="#0f172a" stroke-width="2" rx="3" />
        
        <!-- Header Bar -->
        <rect x="0" y="0" width="${boxWidth}" height="24" fill="#f1f5f9" stroke="#0f172a" stroke-width="1.5" rx="3" />
        <text x="8" y="16" fill="#000000" font-family="monospace" font-size="11" font-weight="bold">${refDes}</text>
        <text x="${boxWidth - 8}" y="16" fill="#475569" font-family="monospace" font-size="9" font-weight="bold" text-anchor="end">${devType}</text>

        <!-- Title -->
        <text x="10" y="38" fill="#000000" font-family="sans-serif" font-size="10" font-weight="bold">${cleanLabel}</text>
        <line x1="8" y1="44" x2="${boxWidth - 8}" y2="44" stroke="#cbd5e1" stroke-width="1" />

        <!-- Pins -->
        ${inputElements}
        ${outputElements}

        <!-- Specs Footer -->
        <line x1="8" y1="${footerLineY}" x2="${boxWidth - 8}" y2="${footerLineY}" stroke="#e2e8f0" stroke-width="1" />
        <text x="10" y="${footerLineY + 12}" fill="#334155" font-family="monospace" font-size="8">BUS: <tspan fill="#0284c7" font-weight="bold">${cleanProto}</tspan> | ADDR: <tspan fill="#b45309" font-weight="bold">${portText}</tspan></text>
        <text x="10" y="${footerLineY + 24}" fill="#334155" font-family="monospace" font-size="8">POWER FEED: <tspan fill="#b91c1c" font-weight="bold">${pwrChan}</tspan></text>
      </g>
    `;
  }).join('');

  const titleBlockX = minX - margin + width - 360;
  const titleBlockY = minY - margin + height - 95;

  return `
    <svg viewBox="${viewBox}" width="100%" height="auto" style="background: #ffffff; border: 2px solid #0f172a; font-family: monospace;">
      <defs>
        <pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="1"/>
        </pattern>
      </defs>
      
      <rect x="${minX - margin}" y="${minY - margin}" width="${width}" height="${height}" fill="url(#cadGrid)" />
      <rect x="${minX - margin + 10}" y="${minY - margin + 10}" width="${width - 20}" height="${height - 20}" fill="none" stroke="#0f172a" stroke-width="2" />

      ${svgTraces}
      ${svgSymbols}

      <!-- Title Block -->
      <g transform="translate(${titleBlockX}, ${titleBlockY})" class="cad-title-block">
        <rect x="0" y="0" width="340" height="85" fill="#ffffff" stroke="#0f172a" stroke-width="2" />
        <line x1="0" y1="28" x2="340" y2="28" stroke="#0f172a" stroke-width="1.5" />
        <line x1="0" y1="56" x2="340" y2="56" stroke="#0f172a" stroke-width="1.5" />
        <line x1="190" y1="28" x2="190" y2="85" stroke="#0f172a" stroke-width="1.5" />

        <text x="10" y="18" fill="#000000" font-family="monospace" font-size="11" font-weight="bold">TITLE: FRC SYSTEM ELECTRICAL SCHEMATIC</text>
        <text x="10" y="44" fill="#334155" font-family="monospace" font-size="8.5">SYSMOD STUDIO ARCHITECTURE ENGINE</text>
        <text x="10" y="73" fill="#334155" font-family="monospace" font-size="8.5">DATE: ${new Date().toLocaleDateString()}</text>
        <text x="200" y="44" fill="#334155" font-family="monospace" font-size="8.5">REV: 1.0</text>
        <text x="200" y="73" fill="#334155" font-family="monospace" font-size="8.5">SHEET 1 OF 1</text>
      </g>
    </svg>
  `;
}

export function generateArchitectureReportHtml(nodes: Node<FRCNodeData>[], edges: Edge[]): string {
  const report = verifySystemProperties(nodes, edges);
  
  let totalCost = 0;
  const bomRows = nodes.map((node) => {
    const devType = node.data?.deviceType || 'Unknown';
    const cost = DEFAULT_COSTS[devType] || 0.00;
    totalCost += cost;

    let portInfo = 'N/A';
    if (node.data?.canId !== undefined) portInfo = `CAN ID: ${node.data.canId}`;
    else if (node.data?.dioPort !== undefined) portInfo = `DIO Port: ${node.data.dioPort}`;
    else if (node.data?.pwmPort !== undefined) portInfo = `PWM Port: ${node.data.pwmPort}`;

    return `
      <tr>
        <td><strong>${node.data?.label || node.id}</strong></td>
        <td>${node.data?.category || 'General'}</td>
        <td><code>${node.data?.protocol || 'Standard'}</code></td>
        <td>${portInfo}</td>
        <td>${node.data?.powerChannel || 'Unassigned'}</td>
        <td>$${cost.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const issuesRows = report.issues.map((issue) => `
    <li class="issue-${issue.severity}">
      <strong>[${issue.severity.toUpperCase()}] ${issue.title}:</strong> ${issue.message}
    </li>
  `).join('');

  const schematicSVG = generateCadSchematicSVG(nodes, edges);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>FRC System Electrical Schematic & Specification Report</title>
      <style>
        @page {
          size: letter landscape;
          margin: 10mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 20px;
          color: #0f172a;
          background-color: #ffffff;
          line-height: 1.4;
          margin: 0;
        }
        .header {
          border-bottom: 2px solid #0f172a;
          padding-bottom: 8px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .header h1 {
          margin: 0;
          font-size: 20px;
          color: #000000;
          font-family: monospace;
          text-transform: uppercase;
        }
        .header p {
          margin: 2px 0 0 0;
          font-size: 10px;
          color: #475569;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }
        .meta-card {
          background: #ffffff;
          border: 1px solid #0f172a;
          border-radius: 4px;
          padding: 8px;
          text-align: center;
        }
        .meta-card .val {
          font-size: 18px;
          font-weight: bold;
          color: #0f172a;
          font-family: monospace;
        }
        .meta-card .lbl {
          font-size: 9px;
          text-transform: uppercase;
          color: #475569;
          font-weight: bold;
        }
        h2 {
          font-size: 13px;
          border-bottom: 1.5px solid #0f172a;
          padding-bottom: 4px;
          margin-top: 18px;
          color: #000000;
          font-family: monospace;
          text-transform: uppercase;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          font-size: 10px;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 5px 7px;
          text-align: left;
        }
        th {
          background: #f1f5f9;
          font-weight: bold;
          color: #0f172a;
        }
        code {
          font-family: monospace;
          background: #f1f5f9;
          padding: 1px 4px;
          border-radius: 3px;
          color: #0369a1;
        }
        .schematic-container {
          width: 100%;
          page-break-inside: avoid;
        }
        .legend {
          display: flex;
          gap: 16px;
          font-size: 9px;
          font-family: monospace;
          margin-top: 6px;
          background: #ffffff;
          padding: 5px 8px;
          border: 1px solid #cbd5e1;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .legend-line {
          width: 16px;
          height: 3px;
          display: inline-block;
        }
        .issue-error { color: #b91c1c; margin-bottom: 4px; font-size: 10px; }
        .issue-warning { color: #b45309; margin-bottom: 4px; font-size: 10px; }
        .issue-info { color: #1d4ed8; margin-bottom: 4px; font-size: 10px; }
        .footer {
          margin-top: 24px;
          border-top: 1px solid #cbd5e1;
          padding-top: 8px;
          font-size: 9px;
          color: #64748b;
          text-align: center;
          font-family: monospace;
        }
        @media print {
          body {
            padding: 0;
            background: #ffffff;
          }
          .schematic-container {
            page-break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>FRC System Electrical Schematic</h1>
          <p>SysMod Studio CAD Engine · Printable Engineering Drawing</p>
        </div>
        <div style="text-align: right;">
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Rules Verification:</strong> ${report.score}/100 (${report.passed ? 'PASSED' : 'ATTENTION REQUIRED'})</p>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-card"><div class="val">${nodes.length}</div><div class="lbl">Schematic Components</div></div>
        <div class="meta-card"><div class="val">${nodes.filter((n) => n.data?.canId !== undefined).length}</div><div class="lbl">CAN Bus Nodes</div></div>
        <div class="meta-card"><div class="val">${edges.length}</div><div class="lbl">Electrical Traces</div></div>
        <div class="meta-card"><div class="val">$${totalCost.toFixed(2)}</div><div class="lbl">Est. Hardware BOM</div></div>
      </div>

      <h2>1. Electrical System CAD Schematic Diagram</h2>
      <div class="legend">
        <span class="legend-item"><span class="legend-line" style="background: #b91c1c;"></span> 12V Main Power (+12V)</span>
        <span class="legend-item"><span class="legend-line" style="background: #15803d;"></span> CAN / CAN FD Bus</span>
        <span class="legend-item"><span class="legend-line" style="background: #1d4ed8;"></span> Ethernet Network</span>
        <span class="legend-item"><span class="legend-line" style="background: #0369a1; border-top: 1px dashed #0369a1;"></span> Control / Pneumatic</span>
      </div>
      <div class="schematic-container">
        ${schematicSVG}
      </div>

      <h2>2. Component Inventory & Bill of Materials (BOM)</h2>
      <table>
        <thead>
          <tr>
            <th>Component Label</th>
            <th>Category</th>
            <th>Protocol</th>
            <th>Port / CAN ID</th>
            <th>Power Channel</th>
            <th>Unit Cost</th>
          </tr>
        </thead>
        <tbody>
          ${bomRows.length > 0 ? bomRows : '<tr><td colspan="6">No components on schematic.</td></tr>'}
        </tbody>
      </table>

      <h2>3. System Rules & Compliance Verification</h2>
      <ul>
        ${issuesRows.length > 0 ? issuesRows : '<li style="color: #15803d;"><strong>[PASSED]</strong> All FRC system wiring rules satisfied successfully.</li>'}
      </ul>

      <div class="footer">
        SysMod Studio · Engineering Schematic & Architecture Specification
      </div>
    </body>
    </html>
  `;
}