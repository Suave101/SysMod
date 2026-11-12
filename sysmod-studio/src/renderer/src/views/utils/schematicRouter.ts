/**
 * Orthogonal wire router for the printable schematic.
 *
 * Wires run on a square grid. Component boxes (plus one grid step of clearance) are walls, so a
 * wire can never be drawn over a component or its pin labels. Each grid point remembers which
 * wires pass through it horizontally and vertically:
 *  - two different wires never share a horizontal or vertical run (no wire hides another);
 *  - a wire may cross another at a right angle, but neither may turn at that point, so every
 *    crossing is a clean "+" that the drawing shows with a hop;
 *  - wires that start at the same pin (one net, like an Ethernet switch port) may share runs.
 * Each wire is found with A* over (grid point, heading), with extra cost for bends, crossings and
 * running right next to another wire, so routes come out short, square and spread apart.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 0 = right, 1 = down, 2 = left, 3 = up */
export type Dir = 0 | 1 | 2 | 3;

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

export interface RouteRequest {
  id: string;
  /** Wires with the same net may overlap; use the source pin so a shared port fans out cleanly */
  net: string;
  from: Point;
  /** The way the wire leaves its first pin (away from the component) */
  fromDir: Dir;
  fromPin: string;
  to: Point;
  /** The way the last pin points away from its component */
  toDir: Dir;
  toPin: string;
}

export interface PinKeepout {
  point: Point;
  pin: string;
}

export interface RouterOptions {
  grid: number;
  bounds: Rect;
  /** Component boxes; they get one grid step of clearance */
  obstacles: Rect[];
  /** Pin ends: only wires that start or end at a pin may touch it */
  pins: PinKeepout[];
}

export interface RoutedWire {
  id: string;
  net: string;
  /** Corner points from the first pin to the last, or null when no clean route exists */
  points: Point[] | null;
  /** Points where this wire runs horizontally across a vertical wire of another net */
  hops: Point[];
}

export interface RoutingResult {
  wires: RoutedWire[];
  /** Points where two or more wires of one net split, drawn as junction dots */
  junctions: Point[];
  /** Nets passing through a point, for placing labels where they hide nothing */
  netsAt: (p: Point) => string[];
}

const BEND_COST = 8;
const CROSS_COST = 14;
const NEAR_COST = 2;
const MAX_EXPANSIONS = 600_000;

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, val: number): void {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      vals[i] = vals[parent];
      i = parent;
    }
    keys[i] = key;
    vals[i] = val;
  }

  pop(): number {
    const { keys, vals } = this;
    const top = vals[0];
    const lastKey = keys.pop() as number;
    const lastVal = vals.pop() as number;
    if (keys.length > 0) {
      let i = 0;
      const n = keys.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = lastKey;
      vals[i] = lastVal;
    }
    return top;
  }
}

export function routeWires(requests: RouteRequest[], options: RouterOptions): RoutingResult {
  const { grid, bounds } = options;
  const cols = Math.floor(bounds.w / grid) + 1;
  const rows = Math.floor(bounds.h / grid) + 1;
  const cellCount = cols * rows;

  const toCell = (p: Point): number => {
    const cx = Math.round((p.x - bounds.x) / grid);
    const cy = Math.round((p.y - bounds.y) / grid);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return -1;
    return cy * cols + cx;
  };
  const toPoint = (cell: number): Point => ({ x: bounds.x + (cell % cols) * grid, y: bounds.y + Math.floor(cell / cols) * grid });

  const blocked = new Uint8Array(cellCount);
  options.obstacles.forEach((r) => {
    const x0 = Math.max(0, Math.ceil((r.x - grid - bounds.x) / grid));
    const x1 = Math.min(cols - 1, Math.floor((r.x + r.w + grid - bounds.x) / grid));
    const y0 = Math.max(0, Math.ceil((r.y - grid - bounds.y) / grid));
    const y1 = Math.min(rows - 1, Math.floor((r.y + r.h + grid - bounds.y) / grid));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) blocked[cy * cols + cx] = 1;
  });

  const pinAt = new Map<number, string>();
  options.pins.forEach(({ point, pin }) => {
    const cell = toCell(point);
    if (cell >= 0) pinAt.set(cell, pin);
  });

  // Nets using each cell, per axis (0 = horizontal, 1 = vertical)
  const occupied: [Map<number, Set<string>>, Map<number, Set<string>>] = [new Map(), new Map()];
  const mark = (cell: number, axis: number, net: string): void => {
    const map = occupied[axis];
    const set = map.get(cell);
    if (set) set.add(net);
    else map.set(cell, new Set([net]));
  };
  const othersOn = (cell: number, axis: number, net: string): boolean => {
    const set = occupied[axis].get(cell);
    if (!set) return false;
    for (const n of set) if (n !== net) return true;
    return false;
  };

  const g = new Float64Array(cellCount * 4);
  const came = new Int32Array(cellCount * 4);
  const touched: number[] = [];

  const route = (req: RouteRequest): Point[] | null => {
    const start = toCell(req.from);
    const goal = toCell(req.to);
    if (start < 0 || goal < 0) return null;
    const goalX = goal % cols;
    const goalY = Math.floor(goal / cols);
    const arriveDir = (req.toDir + 2) % 4;
    const allowedPin = (cell: number): boolean => {
      const pin = pinAt.get(cell);
      return pin === undefined || pin === req.fromPin || pin === req.toPin;
    };

    touched.forEach((s) => {
      g[s] = Infinity;
    });
    touched.length = 0;

    const heap = new MinHeap();
    const startState = start * 4 + req.fromDir;
    g[startState] = 0;
    came[startState] = -1;
    touched.push(startState);
    const h = (cell: number): number => Math.abs((cell % cols) - goalX) + Math.abs(Math.floor(cell / cols) - goalY);
    heap.push(h(start), startState);

    let expansions = 0;
    let found = -1;
    while (heap.size > 0) {
      const state = heap.pop();
      const cell = state >> 2;
      const dir = state & 3;
      if (cell === goal) {
        found = state;
        break;
      }
      if (++expansions > MAX_EXPANSIONS) break;
      const base = g[state];
      const cx = cell % cols;
      const cy = Math.floor(cell / cols);
      // No turning where another wire passes, so crossings stay clean
      const atCrossing = othersOn(cell, 0, req.net) || othersOn(cell, 1, req.net);

      for (let nd = 0; nd < 4; nd++) {
        if (nd === (dir + 2) % 4) continue;
        if (atCrossing && nd !== dir && cell !== start) continue;
        const nx = cx + DX[nd];
        const ny = cy + DY[nd];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = ny * cols + nx;
        if (blocked[next] && next !== goal) continue;
        if (!allowedPin(next)) continue;
        const axis = nd & 1;
        if (othersOn(next, axis, req.net)) continue;
        const crossing = othersOn(next, 1 - axis, req.net);
        if (crossing && next === goal) continue;

        let cost = 1;
        if (nd !== dir) cost += BEND_COST;
        if (crossing) cost += CROSS_COST;
        // Keep parallel wires a little apart when there is room
        const sx = axis === 0 ? 0 : 1;
        const sy = axis === 0 ? 1 : 0;
        for (const side of [-1, 1]) {
          const ax = nx + sx * side;
          const ay = ny + sy * side;
          if (ax >= 0 && ay >= 0 && ax < cols && ay < rows && othersOn(ay * cols + ax, axis, req.net)) cost += NEAR_COST;
        }
        if (next === goal && nd !== arriveDir) cost += BEND_COST;

        const nextState = next * 4 + nd;
        const ng = base + cost;
        if (ng < g[nextState]) {
          if (g[nextState] === Infinity) touched.push(nextState);
          g[nextState] = ng;
          came[nextState] = state;
          heap.push(ng + h(next), nextState);
        }
      }
    }
    if (found < 0) return null;

    const cells: number[] = [];
    for (let s = found; s >= 0; s = came[s]) cells.push(s >> 2);
    cells.reverse();
    return cells.map(toPoint);
  };

  g.fill(Infinity);

  const wires: RoutedWire[] = [];
  const pathsByNet = new Map<string, Point[][]>();
  requests.forEach((req) => {
    const path = route(req);
    if (!path) {
      wires.push({ id: req.id, net: req.net, points: null, hops: [] });
      return;
    }
    for (let i = 0; i < path.length - 1; i++) {
      const axis = path[i].y === path[i + 1].y ? 0 : 1;
      mark(toCell(path[i]), axis, req.net);
      mark(toCell(path[i + 1]), axis, req.net);
    }
    pathsByNet.set(req.net, [...(pathsByNet.get(req.net) || []), path]);
    wires.push({ id: req.id, net: req.net, points: simplify(path), hops: [] });
  });

  // Hops: a horizontal run over a vertical run of another net
  wires.forEach((wire) => {
    const pts = wire.points;
    if (!pts) return;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.y !== b.y) continue;
      const step = b.x > a.x ? grid : -grid;
      for (let x = a.x + step; x !== b.x; x += step) {
        if (othersOn(toCell({ x, y: a.y }), 1, wire.net)) wire.hops.push({ x, y: a.y });
      }
    }
  });

  // Junctions: a point where one net's wires branch three or more ways
  const junctions: Point[] = [];
  pathsByNet.forEach((paths) => {
    if (paths.length < 2) return;
    const links = new Map<number, Set<number>>();
    paths.forEach((path) => {
      for (let i = 0; i < path.length - 1; i++) {
        const a = toCell(path[i]);
        const b = toCell(path[i + 1]);
        if (!links.has(a)) links.set(a, new Set());
        if (!links.has(b)) links.set(b, new Set());
        links.get(a)?.add(b);
        links.get(b)?.add(a);
      }
    });
    links.forEach((n, cell) => {
      if (n.size >= 3) junctions.push(toPoint(cell));
    });
  });

  const netsAt = (p: Point): string[] => {
    const cell = toCell(p);
    if (cell < 0) return [];
    return [...(occupied[0].get(cell) || []), ...(occupied[1].get(cell) || [])];
  };

  return { wires, junctions, netsAt };
}

/** Drops points in the middle of straight runs */
function simplify(path: Point[]): Point[] {
  if (path.length <= 2) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1];
    const b = path[i];
    const c = path[i + 1];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!collinear) out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}
