import { Node, Edge } from '@xyflow/react';
import { FRCNodeData } from '../store/useRobotStore';
import { verifySystemProperties } from './systemVerifier';
import { Dir, Point, Rect, RouteRequest, routeWires } from './schematicRouter';
import {
  buildWiringModel,
  CHANNEL_SLOT,
  CHANNEL_TYPE_NAME,
  compressRefs,
  PrintPin,
  TraceKind,
  WireRun,
  WiringModel,
} from './wiringSchedule';

/** One style per legend entry; the legend and the traces both read from here */
export const TRACE_STYLES: Record<TraceKind, { label: string; color: string; width: number; dash?: string }> = {
  power: { label: '12V Main Power (+12V)', color: '#c81e1e', width: 3 },
  can: { label: 'CAN / CAN FD Bus', color: '#15803d', width: 2.2 },
  network: { label: 'Ethernet Network', color: '#1d4ed8', width: 2.2, dash: '10 3 2 3' },
  control: { label: 'Control / Pneumatic', color: '#7c3aed', width: 1.6, dash: '5 3' },
};
/** The 6 AWG battery → breaker → PDH feed is drawn heavier than branch circuits */
const MAIN_FEED_WIDTH = 5;

/** Logical sheets of the printout; the title block counts these */
const SHEET_COUNT = 2;

/** Width ÷ height of the drawing area on a letter-landscape sheet */
const SHEET_ASPECT = 1.6;

// ── Drawing geometry (all multiples of the routing grid) ───────────────────────────────────

const GRID = 10;
const STUB = 20;
const PIN_PITCH = 20;
const HEADER_H = 30;
const TITLE_LINE_H = 16;
const NOTE_LINE_H = 14;
const ROW_GAP = 60;
const MIN_BOX_W = 240;
const MAX_TITLE_CHARS = 34;

const PIN_FONT = 10;
const TITLE_FONT = 12;
const HEADER_FONT = 12;
const NOTE_FONT = 9.5;
const CALLOUT_FONT = 9;
/** Width of one monospace character as a fraction of the font size */
const CHAR_W = 0.6;

const ceilTo = (v: number, step = GRID): number => Math.ceil(v / step) * step;
const textW = (text: string, size: number): number => text.length * size * CHAR_W;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Block {
  node: Node<FRCNodeData>;
  ref: string;
  devType: string;
  titleLines: string[];
  inputs: PrintPin[];
  outputs: PrintPin[];
  notes: string[];
  pinTop: number;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** Wraps on spaces so words are never cut */
function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  text.split(/\s+/).forEach((word) => {
    if (!line) line = word;
    else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
    else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function pinText(pin: PrintPin, note: string | undefined): string {
  return note ? `${pin.label} — ${note}` : pin.label;
}

function measureBlock(node: Node<FRCNodeData>, model: WiringModel): Block {
  const devType = node.data?.deviceType || 'Device';
  const ref = model.refs.get(node.id) || 'U?';
  const { inputs, outputs } = model.pins.get(node.id) || { inputs: [], outputs: [] };
  const notes = model.deviceNotes.get(node.id) || [];
  const titleLines = wrapWords(node.data?.label || node.id, MAX_TITLE_CHARS);

  const noteOf = (pin: PrintPin): string | undefined => model.pinNotes.get(`${node.id}:${pin.key}`);
  const rows = Math.max(inputs.length, outputs.length, 1);
  let w = MIN_BOX_W;
  w = Math.max(w, textW(ref, HEADER_FONT) + textW(devType, PIN_FONT) + 40);
  titleLines.forEach((line) => {
    w = Math.max(w, textW(line, TITLE_FONT) + 24);
  });
  for (let i = 0; i < rows; i++) {
    const left = inputs[i] ? textW(`▸ ${pinText(inputs[i], noteOf(inputs[i]))}`, PIN_FONT) : 0;
    const right = outputs[i] ? textW(`${pinText(outputs[i], noteOf(outputs[i]))} ◂`, PIN_FONT) : 0;
    w = Math.max(w, left + right + 36);
  }
  notes.forEach((note) => {
    w = Math.max(w, textW(note, NOTE_FONT) + 24);
  });

  const pinTop = ceilTo(HEADER_H + titleLines.length * TITLE_LINE_H + 16);
  const pinsEnd = pinTop + (rows - 1) * PIN_PITCH;
  const h = ceilTo(pinsEnd + 16 + notes.length * NOTE_LINE_H + 8);
  return { node, ref, devType, titleLines, inputs, outputs, notes, pinTop, w: ceilTo(w), h, x: 0, y: 0 };
}

const COLUMN_OF: Record<string, number> = {
  Battery12V: 0,
  MainBreaker120A: 0,
  PDH: 1,
  VRM: 1,
  MPM: 1,
  BuckConverter: 1,
  SystemCore: 2,
  roboRIO: 2,
  NetworkSwitch: 2,
  RadioSwitch: 2,
  CANivore: 2,
  PneumaticsHub: 2,
};

/** Places blocks in power-flow columns, splitting a tall device column so the sheet stays landscape */
function layoutBlocks(blocks: Block[], model: WiringModel): { columns: Block[][]; width: number; height: number } {
  const byCol: Block[][] = [[], [], [], []];
  blocks.forEach((b) => byCol[COLUMN_OF[b.devType] ?? 3].push(b));
  const stackH = (col: Block[]): number => col.reduce((s, b) => s + b.h, 0) + Math.max(0, col.length - 1) * ROW_GAP;

  const fixed = byCol.slice(0, 3).filter((c) => c.length > 0);
  const fixedH = Math.max(0, ...fixed.map(stackH));
  const colW = (col: Block[]): number => Math.max(...col.map((b) => b.w));

  // Split the device column into as many columns as makes the drawing closest to the page shape
  const devices = byCol[3];
  const splitInto = (k: number): Block[][] => {
    const target = Math.max(fixedH, stackH(devices) / k);
    const cols: Block[][] = [];
    devices.forEach((b) => {
      const last = cols[cols.length - 1];
      if (last && stackH([...last, b]) <= target + 1) last.push(b);
      else cols.push([b]);
    });
    return cols;
  };
  let deviceCols: Block[][] = [];
  let bestScore = Infinity;
  for (let k = 1; k <= Math.max(1, devices.length); k++) {
    const cols = devices.length ? splitInto(k) : [];
    const all = [...fixed, ...cols];
    const w = all.reduce((s, c) => s + colW(c), 0) + Math.max(0, all.length - 1) * 180 + 120;
    const h = Math.max(fixedH, ...cols.map(stackH)) + 120 + 130;
    const score = Math.abs(Math.log(w / h / SHEET_ASPECT));
    if (score < bestScore - 1e-9) {
      bestScore = score;
      deviceCols = cols;
    }
  }
  const columns = [...fixed, ...deviceCols];

  const colIndex = new Map<string, number>();
  columns.forEach((col, i) => col.forEach((b) => colIndex.set(b.node.id, i)));

  // Gutters grow with the number of wires that pass through them
  const gutterLoad = new Array(Math.max(0, columns.length)).fill(0);
  model.wires.forEach((w) => {
    const a = colIndex.get(w.fromNode) ?? 0;
    const b = colIndex.get(w.toNode) ?? 0;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (lo === hi) gutterLoad[lo] += 1;
    for (let i = lo; i < hi; i++) gutterLoad[i] += 1;
  });

  const height = Math.max(...columns.map(stackH), 0);
  let x = 0;
  columns.forEach((col, i) => {
    const colW = Math.max(...col.map((b) => b.w));
    let y = ceilTo((height - stackH(col)) / 2);
    col.forEach((b) => {
      b.x = x;
      b.y = y;
      y += b.h + ROW_GAP;
    });
    const gutter = ceilTo(Math.min(320, Math.max(140, 70 + gutterLoad[i] * 2 * GRID)));
    x += colW + (i < columns.length - 1 ? gutter : 0);
  });
  return { columns, width: x, height };
}

interface PinAnchor {
  /** Stub end, where the trace starts */
  point: Point;
  dir: Dir;
}

function pinAnchors(block: Block): Map<string, PinAnchor> {
  const anchors = new Map<string, PinAnchor>();
  block.inputs.forEach((pin, i) => {
    anchors.set(pin.key, { point: { x: block.x - STUB, y: block.y + block.pinTop + i * PIN_PITCH }, dir: 2 });
  });
  block.outputs.forEach((pin, i) => {
    // A pin listed on both sides keeps its input position
    if (!anchors.has(pin.key)) {
      anchors.set(pin.key, { point: { x: block.x + block.w + STUB, y: block.y + block.pinTop + i * PIN_PITCH }, dir: 0 });
    }
  });
  return anchors;
}

function renderBlock(block: Block, model: WiringModel, connected: Set<string>): string {
  const { w, h, pinTop } = block;
  const noteOf = (pin: PrintPin): string | undefined => model.pinNotes.get(`${block.node.id}:${pin.key}`);
  const pinRow = (pin: PrintPin, i: number, side: 'in' | 'out'): string => {
    const y = pinTop + i * PIN_PITCH;
    const note = noteOf(pin);
    const noteSpan = note ? `<tspan fill="#c2410c"> — ${escapeHtml(note)}</tspan>` : '';
    if (side === 'in') {
      return `
        <line x1="${-STUB}" y1="${y}" x2="0" y2="${y}" stroke="#0f172a" stroke-width="1.6" />
        <circle cx="${-STUB}" cy="${y}" r="2.5" fill="#0f172a" />
        <text x="8" y="${y + 3.5}" class="pin">▸ ${escapeHtml(pin.label)}${noteSpan}</text>`;
    }
    // An unwired bus end gets a resistor symbol on its stub, standing for the terminator
    const stub =
      note && !connected.has(`${block.node.id}:${pin.key}`)
        ? `<polyline points="${w},${y} ${w + 3},${y} ${w + 5},${y - 4} ${w + 8},${y + 4} ${w + 11},${y - 4} ${w + 14},${y + 4} ${w + 16},${y} ${w + STUB},${y}" fill="none" stroke="#c2410c" stroke-width="1.4" />`
        : `<line x1="${w}" y1="${y}" x2="${w + STUB}" y2="${y}" stroke="#0f172a" stroke-width="1.6" />`;
    return `
        ${stub}
        <circle cx="${w + STUB}" cy="${y}" r="2.5" fill="#0f172a" />
        <text x="${w - 8}" y="${y + 3.5}" class="pin" text-anchor="end">${escapeHtml(pin.label)}${noteSpan} ◂</text>`;
  };
  const rows = Math.max(block.inputs.length, block.outputs.length, 1);
  const notesTop = pinTop + (rows - 1) * PIN_PITCH + 16;

  return `
    <g transform="translate(${block.x}, ${block.y})">
      <rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff" stroke="#0f172a" stroke-width="1.8" rx="3" />
      <rect x="0" y="0" width="${w}" height="${HEADER_H - 8}" fill="#f1f5f9" stroke="#0f172a" stroke-width="1.2" rx="3" />
      <text x="8" y="16" class="ref">${escapeHtml(block.ref)}</text>
      <text x="${w - 8}" y="16" class="devtype" text-anchor="end">${escapeHtml(block.devType)}</text>
      ${block.titleLines.map((line, i) => `<text x="10" y="${HEADER_H + 6 + i * TITLE_LINE_H}" class="title">${escapeHtml(line)}</text>`).join('')}
      <line x1="8" y1="${pinTop - 12}" x2="${w - 8}" y2="${pinTop - 12}" stroke="#cbd5e1" stroke-width="1" />
      ${block.inputs.map((p, i) => pinRow(p, i, 'in')).join('')}
      ${block.outputs.map((p, i) => pinRow(p, i, 'out')).join('')}
      ${block.notes.length ? `<line x1="8" y1="${notesTop - 6}" x2="${w - 8}" y2="${notesTop - 6}" stroke="#e2e8f0" stroke-width="1" />` : ''}
      ${block.notes.map((note, i) => `<text x="10" y="${notesTop + 8 + i * NOTE_LINE_H}" class="note">${escapeHtml(note)}</text>`).join('')}
    </g>`;
}

function strokeAttrs(wire: WireRun): string {
  const style = TRACE_STYLES[wire.kind];
  const width = wire.isMain ? MAIN_FEED_WIDTH : style.width;
  return `stroke="${style.color}" stroke-width="${width}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''}`;
}

/** Path with a small hop wherever this wire runs over another */
function tracePath(points: Point[], hops: Point[]): string {
  const r = 4;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.y === b.y) {
      const right = b.x > a.x;
      hops
        .filter((h) => h.y === a.y && (right ? h.x > a.x && h.x < b.x : h.x < a.x && h.x > b.x))
        .sort((p, q) => (right ? p.x - q.x : q.x - p.x))
        .forEach((h) => {
          const x0 = right ? h.x - r : h.x + r;
          const x1 = right ? h.x + r : h.x - r;
          d += ` L ${x0} ${a.y} A ${r} ${r} 0 0 ${right ? 1 : 0} ${x1} ${a.y}`;
        });
    }
    d += ` L ${b.x} ${b.y}`;
  }
  return d;
}

const rectsOverlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Off-sheet style net flag, used only if a wire can't be routed without crossing a component */
function netFlag(anchor: PinAnchor, text: string, wire: WireRun): string {
  const style = TRACE_STYLES[wire.kind];
  const w = textW(text, CALLOUT_FONT) + 16;
  const { x, y } = anchor.point;
  const sign = anchor.dir === 0 ? 1 : -1;
  const x0 = x + sign * 14;
  const tip = x0 + sign * (w + 8);
  const body = sign > 0 ? `${x0},${y - 7} ${x0 + w},${y - 7} ${tip},${y} ${x0 + w},${y + 7} ${x0},${y + 7}` : `${x0},${y - 7} ${x0 - w},${y - 7} ${tip},${y} ${x0 - w},${y + 7} ${x0},${y + 7}`;
  const tx = sign > 0 ? x0 + 6 : x0 - 6;
  return `
    <line x1="${x}" y1="${y}" x2="${x0}" y2="${y}" ${strokeAttrs(wire)} />
    <polygon points="${body}" fill="#ffffff" stroke="${style.color}" stroke-width="1.2" />
    <text x="${tx}" y="${y + 3}" class="callout" text-anchor="${sign > 0 ? 'start' : 'end'}">${escapeHtml(text)}</text>`;
}

export interface Schematic {
  svg: string;
  /** Component boxes and routed wire corner points, for tests */
  boxes: (Rect & { nodeId: string })[];
  traces: { id: string; points: Point[] }[];
  /** Wires that had to be drawn as net flags instead of a continuous trace */
  flagged: string[];
}

export function generateCadSchematicSVG(model: WiringModel, date: string): Schematic {
  if (model.nodes.length === 0) {
    return { svg: `<div class="empty">No components on canvas to generate schematic.</div>`, flagged: [], boxes: [], traces: [] };
  }

  const blocks = model.nodes.map((n) => measureBlock(n, model));
  const layout = layoutBlocks(blocks, model);

  const margin = 120;
  const bounds: Rect = { x: -margin, y: -margin, w: layout.width + 2 * margin, h: layout.height + 2 * margin };
  const anchors = new Map<string, Map<string, PinAnchor>>();
  blocks.forEach((b) => anchors.set(b.node.id, pinAnchors(b)));
  const anchorOf = (nodeId: string, pin: PrintPin): PinAnchor | undefined => anchors.get(nodeId)?.get(pin.key);

  // Route: main feed first, then shortest wires, so long wires go around short ones
  const requests: RouteRequest[] = [];
  const wireAnchors = new Map<string, { from: PinAnchor; to: PinAnchor }>();
  model.wires.forEach((w) => {
    const from = anchorOf(w.fromNode, w.fromPin);
    const to = anchorOf(w.toNode, w.toPin);
    if (!from || !to) return;
    wireAnchors.set(w.id, { from, to });
    requests.push({
      id: w.id,
      net: `${w.fromNode}:${w.fromPin.key}`,
      from: from.point,
      fromDir: from.dir,
      fromPin: `${w.fromNode}:${w.fromPin.key}`,
      to: to.point,
      toDir: to.dir,
      toPin: `${w.toNode}:${w.toPin.key}`,
    });
  });
  const dist = (r: RouteRequest): number => Math.abs(r.from.x - r.to.x) + Math.abs(r.from.y - r.to.y);
  const isMain = (r: RouteRequest): boolean => !!model.wires.find((w) => w.id === r.id)?.isMain;
  requests.sort((a, b) => Number(isMain(b)) - Number(isMain(a)) || dist(a) - dist(b));

  const pins = blocks.flatMap((b) => [...(anchors.get(b.node.id)?.entries() || [])].map(([key, a]) => ({ point: a.point, pin: `${b.node.id}:${key}` })));
  const routing = routeWires(requests, {
    grid: GRID,
    bounds,
    obstacles: blocks.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
    pins,
  });
  const routed = new Map(routing.wires.map((r) => [r.id, r]));
  const connected = new Set(model.wires.flatMap((w) => [`${w.fromNode}:${w.fromPin.key}`, `${w.toNode}:${w.toPin.key}`]));

  // Labels: gauge/color callouts placed where they hide no component, label or other wire
  const blockRects: Rect[] = blocks.map((b) => ({ x: b.x - STUB, y: b.y, w: b.w + 2 * STUB, h: b.h }));
  const placed: Rect[] = [];
  const otherWiresUnder = (rect: Rect, net: string): number => {
    let n = 0;
    for (let x = ceilTo(rect.x); x <= rect.x + rect.w; x += GRID) {
      for (let y = ceilTo(rect.y); y <= rect.y + rect.h; y += GRID) {
        if (routing.netsAt({ x, y }).some((other) => other !== net)) n++;
      }
    }
    return n;
  };

  const flagged: string[] = [];
  const traceSvg: string[] = [];
  const labelSvg: string[] = [];
  model.wires.forEach((wire) => {
    const ends = wireAnchors.get(wire.id);
    const r = routed.get(wire.id);
    if (!ends) return;
    const net = `${wire.fromNode}:${wire.fromPin.key}`;
    const style = TRACE_STYLES[wire.kind];
    if (!r?.points) {
      flagged.push(wire.id);
      const toRef = `${model.refs.get(wire.toNode)}:${wire.toPin.short}`;
      const fromRef = `${model.refs.get(wire.fromNode)}:${wire.fromPin.short}`;
      traceSvg.push(netFlag(ends.from, `${wire.id} → ${toRef}`, wire), netFlag(ends.to, `${wire.id} ← ${fromRef}`, wire));
      return;
    }
    const pts = r.points;
    traceSvg.push(`
      <g>
        <path d="${tracePath(pts, r.hops)}" fill="none" ${strokeAttrs(wire)} stroke-linejoin="round" />
        <circle cx="${pts[0].x}" cy="${pts[0].y}" r="3" fill="${style.color}" />
        <circle cx="${pts[pts.length - 1].x}" cy="${pts[pts.length - 1].y}" r="3" fill="${style.color}" />
      </g>`);

    // One line if it fits, else the gauge/color on a second line
    const parts = wire.callout.split(' · ');
    const layouts = [[wire.callout]];
    if (parts.length > 1) layouts.push([parts.slice(0, -1).join(' · '), parts[parts.length - 1]]);
    const LINE_H = 11;
    type Candidate = { rect: Rect; lines: string[]; score: number };
    let best: Candidate | null = null;
    layouts.forEach((lines, layoutIndex) => {
      const lw = Math.max(...lines.map((l) => textW(l, CALLOUT_FONT))) + 8;
      const lh = lines.length * LINE_H + 2;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const horizontal = a.y === b.y;
        const len = Math.abs(horizontal ? b.x - a.x : b.y - a.y);
        for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          const cx = a.x + (b.x - a.x) * f;
          const cy = a.y + (b.y - a.y) * f;
          const options: Rect[] = horizontal
            ? [{ x: cx - lw / 2, y: cy - lh - 2, w: lw, h: lh }, { x: cx - lw / 2, y: cy + 3, w: lw, h: lh }]
            : [{ x: cx + 5, y: cy - lh / 2, w: lw, h: lh }, { x: cx - 5 - lw, y: cy - lh / 2, w: lw, h: lh }];
          options.forEach((rect) => {
            let score = layoutIndex * 8;
            if (horizontal && len < lw + 10) score += 40;
            if (!horizontal) score += 20;
            if (blockRects.some((br) => rectsOverlap(rect, br))) score += 1000;
            if (placed.some((p) => rectsOverlap(rect, p))) score += 500;
            if (rect.x < bounds.x || rect.x + rect.w > bounds.x + bounds.w) score += 1000;
            score += otherWiresUnder(rect, net) * 25;
            // A label right next to another wire reads as that wire's label
            score += otherWiresUnder({ x: rect.x - GRID, y: rect.y - GRID, w: rect.w + 2 * GRID, h: rect.h + 2 * GRID }, net) * 6;
            if (!best || score < best.score) best = { rect, lines, score };
          });
        }
      }
    });
    const chosen = best as Candidate | null;
    if (chosen) {
      const { rect, lines } = chosen;
      placed.push(rect);
      labelSvg.push(`
        <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#ffffff" fill-opacity="0.92" stroke="${style.color}" stroke-width="0.6" rx="2" />
        ${lines.map((line, i) => `<text x="${rect.x + rect.w / 2}" y="${rect.y + (i + 1) * LINE_H - 2}" class="callout" fill="${style.color}" text-anchor="middle">${escapeHtml(line)}</text>`).join('')}`);
    }
  });

  const junctionSvg = routing.junctions
    .map((p) => {
      const color = TRACE_STYLES[model.wires.find((w) => routing.netsAt(p).includes(`${w.fromNode}:${w.fromPin.key}`))?.kind || 'control'].color;
      return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}" />`;
    })
    .join('');

  // Crop to what was drawn, so the drawing prints as large as possible
  const extent = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (x: number, y: number): void => {
    extent.x0 = Math.min(extent.x0, x);
    extent.y0 = Math.min(extent.y0, y);
    extent.x1 = Math.max(extent.x1, x);
    extent.y1 = Math.max(extent.y1, y);
  };
  blockRects.forEach((r) => {
    grow(r.x, r.y);
    grow(r.x + r.w, r.y + r.h);
  });
  routing.wires.forEach((r) => r.points?.forEach((p) => grow(p.x, p.y)));
  placed.forEach((r) => {
    grow(r.x, r.y);
    grow(r.x + r.w, r.y + r.h);
  });
  flagged.forEach((id) => {
    const ends = wireAnchors.get(id);
    [ends?.from, ends?.to].forEach((a) => a && grow(a.point.x + (a.dir === 0 ? 260 : -260), a.point.y));
  });

  // Title block sits under the drawing, so nothing is drawn over it
  const tbW = 600;
  const tbH = 112;
  const pad = 30;
  const frameX = extent.x0 - pad;
  const frameY = extent.y0 - pad;
  const frameW = Math.max(extent.x1 - extent.x0 + 2 * pad, tbW + 40);
  const tbX = frameX + frameW - tbW - 16;
  const tbY = extent.y1 + 16;
  const frameH = tbY + tbH + 16 - frameY;

  const svg = `
    <svg class="schematic" viewBox="${frameX} ${frameY} ${frameW} ${frameH}" preserveAspectRatio="xMidYMin meet" xmlns="http://www.w3.org/2000/svg">
      <style>
        .ref { font: bold ${HEADER_FONT}px monospace; fill: #000; }
        .devtype { font: bold ${PIN_FONT}px monospace; fill: #475569; }
        .title { font: bold ${TITLE_FONT}px monospace; fill: #000; }
        .pin { font: bold ${PIN_FONT}px monospace; fill: #0f172a; }
        .note { font: ${NOTE_FONT}px monospace; fill: #334155; }
        .callout { font: bold ${CALLOUT_FONT}px monospace; }
        .tb { font: 10px monospace; fill: #1e293b; }
        .tb-b { font: bold 12px monospace; fill: #000; }
        .tb-note { font: bold 10px monospace; fill: #b91c1c; }
      </style>
      <defs>
        <pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="1"/>
        </pattern>
      </defs>
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" fill="url(#cadGrid)" />
      <rect x="${frameX + 6}" y="${frameY + 6}" width="${frameW - 12}" height="${frameH - 12}" fill="none" stroke="#0f172a" stroke-width="2" />

      ${traceSvg.join('')}
      ${junctionSvg}
      ${blocks.map((b) => renderBlock(b, model, connected)).join('')}
      ${labelSvg.join('')}

      <g transform="translate(${tbX}, ${tbY})">
        <rect x="0" y="0" width="${tbW}" height="${tbH}" fill="#ffffff" stroke="#0f172a" stroke-width="2" />
        <line x1="0" y1="28" x2="${tbW}" y2="28" stroke="#0f172a" stroke-width="1.5" />
        <line x1="0" y1="66" x2="${tbW}" y2="66" stroke="#0f172a" stroke-width="1.5" />
        <line x1="380" y1="66" x2="380" y2="${tbH}" stroke="#0f172a" stroke-width="1.5" />
        <text x="10" y="19" class="tb-b">TITLE: FRC ROBOT ELECTRICAL SCHEMATIC</text>
        <text x="10" y="44" class="tb-note">SINGLE-LINE DIAGRAM: ALL 12V POWER TRACES REPRESENT +12V / GND PAIRS</text>
        <text x="10" y="59" class="tb">WIRE GAUGES PER FRC GAME MANUAL WIRE-SIZE TABLE · SEE SHEET 2 FOR WIRE SCHEDULE</text>
        <text x="10" y="84" class="tb">DRAWN: SYSMOD STUDIO</text>
        <text x="10" y="102" class="tb">DATE: ${escapeHtml(date)}</text>
        <text x="390" y="84" class="tb">REV: 1.0</text>
        <text x="390" y="102" class="tb-b">SHEET 1 OF ${SHEET_COUNT}</text>
      </g>
    </svg>`;

  // Wires that couldn't be routed are flagged on sheet 2 so no connection is silently dropped
  return {
    svg,
    flagged,
    boxes: blocks.map((b) => ({ nodeId: b.node.id, x: b.x, y: b.y, w: b.w, h: b.h })),
    traces: routing.wires.filter((r) => r.points).map((r) => ({ id: r.id, points: r.points as Point[] })),
  };
}

function legendHtml(): string {
  return (Object.keys(TRACE_STYLES) as TraceKind[])
    .map((kind) => {
      const s = TRACE_STYLES[kind];
      const width = kind === 'power' ? MAIN_FEED_WIDTH : s.width;
      const extra = kind === 'power' ? ' <span class="muted">(heavy = 6 AWG main feed)</span>' : '';
      return `<span class="legend-item"><svg width="34" height="10"><line x1="1" y1="5" x2="33" y2="5" stroke="${s.color}" stroke-width="${width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} /></svg>${escapeHtml(s.label)}${extra}</span>`;
    })
    .join('');
}

function canChainHtml(model: WiringModel): string {
  if (model.canBuses.length === 0) return '';
  return model.canBuses
    .map((bus) => {
      const terminated = new Set(bus.terminations.map((t) => t.nodeId));
      const seq = bus.order
        .map((id, i) => {
          const ref = escapeHtml(model.refs.get(id) || id);
          const isEnd = terminated.has(id) && (i === 0 || i === bus.order.length - 1 || bus.branched);
          return isEnd ? `<strong>${ref}</strong> <span class="term">[120Ω]</span>` : ref;
        })
        .join(' → ');
      const warning = bus.branched ? ' <span class="warn">BRANCHED: CAN should be one daisy chain with two ends.</span>' : '';
      const unterminated = bus.terminations.length < 2 ? ' <span class="warn">Only one bus end found.</span>' : '';
      return `<div class="chain"><strong>${bus.name} daisy chain:</strong> ${seq}${warning}${unterminated}</div>`;
    })
    .join('');
}

const money = (v: number): string => `$${v.toFixed(2)}`;

function bomTableHtml(model: WiringModel): string {
  const rows = model.bom
    .map(
      (row, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="mono">${escapeHtml(compressRefs(row.refs))}</td>
        <td class="num">${row.qty}</td>
        <td><strong>${escapeHtml(row.part)}</strong><span class="sub">${escapeHtml(row.description)}</span></td>
        <td>${escapeHtml(row.category)}</td>
        <td><code>${escapeHtml(row.protocol)}</code></td>
        <td class="mono small">${escapeHtml(row.addresses.join(' · ') || '—')}</td>
        <td class="num">${row.priced ? money(row.unitCost) : 'TBD'}</td>
        <td class="num">${row.priced ? money(row.extCost) : 'TBD'}</td>
      </tr>`,
    )
    .join('');
  const unpriced = model.bom.some((r) => !r.priced);
  return `
    <table class="bom">
      <thead><tr><th>#</th><th>RefDes</th><th>Qty</th><th>Part</th><th>Category</th><th>Interface</th><th>Address</th><th>Unit Cost</th><th>Ext. Cost</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9">No components on schematic.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2"></td><td class="num">${model.nodes.length}</td><td colspan="5"><strong>Total</strong>${unpriced ? ' <span class="muted">(excludes TBD prices)</span>' : ''}</td><td class="num"><strong>${money(model.totalCost)}</strong></td></tr></tfoot>
    </table>`;
}

function wireScheduleHtml(model: WiringModel, flagged: string[]): string {
  const ref = (id: string): string => escapeHtml(model.refs.get(id) || id);
  const rows = model.wires
    .map(
      (w) => `
      <tr>
        <td class="mono"><span class="swatch" style="background:${TRACE_STYLES[w.kind].color}"></span>${w.id}${flagged.includes(w.id) ? '*' : ''}</td>
        <td class="mono">${ref(w.fromNode)}:${escapeHtml(w.fromPin.short)}</td>
        <td class="mono">${ref(w.toNode)}:${escapeHtml(w.toPin.short)}</td>
        <td>${escapeHtml(w.signal)}${w.can ? ` <span class="muted">(${w.can.bus} ${w.can.seq}/${w.can.of})</span>` : ''}</td>
        <td class="mono">${escapeHtml(w.awg)}</td>
        <td>${escapeHtml(w.color)}</td>
      </tr>`,
    )
    .join('');
  return `
    <table>
      <thead><tr><th>Wire ID</th><th>From (RefDes:Pin)</th><th>To (RefDes:Pin)</th><th>Signal / Rail</th><th>AWG</th><th>Insulation Color</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No wires on schematic.</td></tr>'}</tbody>
    </table>
    ${flagged.length ? '<p class="muted small">* Drawn on sheet 1 as net flags because no clear path existed.</p>' : ''}`;
}

function pdhMapsHtml(model: WiringModel): string {
  if (model.pdhMaps.length === 0) return '<p class="muted small">No REV PDH on the diagram.</p>';
  return model.pdhMaps
    .map(({ nodeId, rows }) => {
      const used = rows.filter((r) => r.nodeId).length;
      const rowHtml = (r: (typeof rows)[number]): string => `
        <tr class="${r.nodeId ? '' : 'open'}">
          <td class="num">${r.num}</td>
          <td>${CHANNEL_TYPE_NAME[r.type]}</td>
          <td class="mono">${r.nodeId ? escapeHtml(model.refs.get(r.nodeId) || '') : 'open'}</td>
          <td>${r.protection ? `<strong>${escapeHtml(r.protection.text)}</strong>` : '—'}</td>
          <td class="mono">${r.wireId ? `${r.wireId} · ${escapeHtml(r.awg || '')}` : ''}</td>
        </tr>`;
      const half = (list: typeof rows): string => `
        <table class="pdh">
          <thead><tr><th>CH</th><th>Slot</th><th>Device</th><th>Breaker / Fuse</th><th>Wire</th></tr></thead>
          <tbody>${list.map(rowHtml).join('')}</tbody>
        </table>`;
      return `
        <div class="pdh-title"><span class="mono">${escapeHtml(model.refs.get(nodeId) || '')}</span> ${escapeHtml(model.nodeById.get(nodeId)?.data?.label || 'REV PDH')} — ${used} of 24 channels used, ${24 - used} open</div>
        <div class="pdh-halves">${half(rows.slice(0, 12))}${half(rows.slice(12))}</div>
        <p class="muted small">Slots: CH 0–19 High (${CHANNEL_SLOT.high}) · CH 20–22 Low (${CHANNEL_SLOT.low}) · CH 23 Switchable (${CHANNEL_SLOT.switched}).</p>`;
    })
    .join('');
}

export function generateArchitectureReportHtml(nodes: Node<FRCNodeData>[], edges: Edge[]): string {
  const report = verifySystemProperties(nodes, edges);
  const model = buildWiringModel(nodes, edges);
  const date = new Date().toLocaleDateString();
  const schematic = generateCadSchematicSVG(model, date);

  const issuesRows = report.issues
    .map(
      (issue) => `
    <li class="issue-${issue.severity}">
      <strong>[${issue.severity.toUpperCase()}] ${escapeHtml(issue.title)}:</strong> ${escapeHtml(issue.message)}
    </li>`,
    )
    .join('');

  const sheetHeader = (sheet: number, title: string): string => `
    <div class="header">
      <div>
        <h1>${title}</h1>
        <p>SysMod Studio · Printable Engineering Drawing</p>
      </div>
      <div class="right">
        <p><strong>Date:</strong> ${escapeHtml(date)} · <strong>Rules:</strong> ${report.score}/100 (${report.passed ? 'PASSED' : 'ATTENTION REQUIRED'})</p>
        <p class="sheetno">SHEET ${sheet} OF ${SHEET_COUNT}</p>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FRC Electrical Schematic</title>
  <style>
    /* Zero page margins stop the browser printing its URL/date header and footer; each sheet pads itself */
    @page { size: letter landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a; background: #ffffff; line-height: 1.35;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .sheet {
      width: 279.4mm; padding: 9mm 11mm; margin: 0 auto;
      break-after: page; page-break-after: always;
      -webkit-box-decoration-break: clone; box-decoration-break: clone;
    }
    .sheet:last-child { break-after: auto; page-break-after: auto; }
    .sheet-1 { height: 215mm; overflow: hidden; display: flex; flex-direction: column; }
    @media screen {
      body { background: #cbd5e1; padding: 12px 0; }
      .sheet { background: #fff; margin: 0 auto 12px; box-shadow: 0 2px 10px rgba(0,0,0,.25); min-height: 215.9mm; }
    }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 5px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header h1 { margin: 0; font-size: 17px; font-family: monospace; text-transform: uppercase; }
    .header p { margin: 1px 0 0; font-size: 9.5px; color: #475569; }
    .header .right { text-align: right; }
    .sheetno { font-family: monospace; font-weight: bold; color: #0f172a !important; font-size: 11px !important; }
    .meta { display: flex; gap: 8px; margin-bottom: 5px; font-family: monospace; font-size: 10px; }
    .meta span { border: 1px solid #0f172a; border-radius: 3px; padding: 2px 8px; }
    .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 9.5px; font-family: monospace; padding: 3px 8px; border: 1px solid #cbd5e1; }
    .legend-item { display: inline-flex; align-items: center; gap: 5px; }
    .chain { font-family: monospace; font-size: 9.5px; padding: 3px 8px 0; }
    .term { color: #c2410c; font-weight: bold; }
    .warn { color: #b91c1c; font-weight: bold; }
    .muted { color: #64748b; font-weight: normal; }
    .small { font-size: 8.5px; }
    .schematic-wrap { flex: 1; min-height: 0; margin-top: 5px; display: flex; }
    svg.schematic { width: 100%; height: 100%; background: #fff; }
    .empty { text-align: center; padding: 40px; color: #64748b; font-family: monospace; }
    h2 { font-size: 11.5px; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin: 10px 0 4px; font-family: monospace; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th, td { border: 1px solid #cbd5e1; padding: 2.5px 5px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    tfoot td { background: #f8fafc; border-top: 2px solid #0f172a; }
    tr { break-inside: avoid; }
    .num { text-align: right; font-family: monospace; white-space: nowrap; }
    .mono { font-family: monospace; white-space: nowrap; }
    .sub { color: #64748b; font-size: 8px; display: inline; margin-left: 4px; }
    code { font-family: monospace; background: #f1f5f9; padding: 0 3px; border-radius: 2px; color: #0369a1; }
    .swatch { display: inline-block; width: 8px; height: 8px; margin-right: 4px; border-radius: 1px; }
    .cols { display: grid; grid-template-columns: 1.15fr 1fr; gap: 10px; align-items: start; }
    .pdh-title { font-size: 9.5px; margin: 2px 0 3px; }
    .pdh-halves { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    table.pdh td, table.pdh th { padding: 1.5px 4px; font-size: 8.5px; white-space: nowrap; }
    table.pdh tr.open td { color: #94a3b8; }
    ul.issues { margin: 4px 0; padding-left: 18px; }
    .issue-error { color: #b91c1c; font-size: 9.5px; }
    .issue-warning { color: #b45309; font-size: 9.5px; }
    .issue-info { color: #1d4ed8; font-size: 9.5px; }
    .footer { margin-top: 10px; border-top: 1px solid #cbd5e1; padding-top: 4px; font-size: 8.5px; color: #64748b; text-align: center; font-family: monospace; }
  </style>
</head>
<body>
  <section class="sheet sheet-1">
    ${sheetHeader(1, 'FRC Robot Electrical Schematic')}
    <div class="meta">
      <span>${nodes.length} components</span>
      <span>${nodes.filter((n) => n.data?.canId !== undefined).length} CAN devices</span>
      <span>${model.wires.length} wires</span>
      <span>BOM ${money(model.totalCost)}</span>
    </div>
    <div class="legend">${legendHtml()}</div>
    ${canChainHtml(model)}
    <div class="schematic-wrap">${schematic.svg}</div>
  </section>

  <section class="sheet sheet-2">
    ${sheetHeader(2, 'BOM &amp; Wiring Documentation')}
    <h2>1. Component Inventory &amp; Bill of Materials</h2>
    ${bomTableHtml(model)}
    <div class="cols">
      <div>
        <h2>2. Wire &amp; Cable Run Schedule</h2>
        ${wireScheduleHtml(model, schematic.flagged)}
      </div>
      <div>
        <h2>3. REV PDH Channel Map (0–23)</h2>
        ${pdhMapsHtml(model)}
        <p class="muted small">Breaker/fuse ratings are SysMod's recommendation: high channels sized to each motor's supply current limit (20/30/40A), other high-channel devices 20A, low and switchable channels 10A. Wire gauge follows the protection rating.</p>
      </div>
    </div>
    <h2>4. System Rules &amp; Compliance Verification</h2>
    <ul class="issues">
      ${issuesRows || '<li style="color: #15803d;"><strong>[PASSED]</strong> All FRC system wiring rules satisfied.</li>'}
    </ul>
    <div class="footer">SysMod Studio · Engineering Schematic &amp; Architecture Specification · Sheet 2 of ${SHEET_COUNT}</div>
  </section>
</body>
</html>`;
}
