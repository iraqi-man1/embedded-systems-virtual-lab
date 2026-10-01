/**
 * Real-time quasi-static circuit solver (Modified Nodal Analysis, Norton form).
 *
 * Scope (see ADR-003): DC operating point of linear conductances, Thevenin
 * sources (every source has a non-zero internal resistance, so no extra MNA
 * rows are required) and piecewise-linear diodes solved by state iteration.
 * Reactive elements (C, L) are not modelled here — they belong to the ngspice
 * analysis backend. The solver is re-run whenever the discrete state of the
 * circuit changes (an MCU pin toggles, a button is pressed...), and only for
 * the electrically connected "islands" that contain a changed net.
 */

export const GMIN = 1e-12;

export interface Conductance {
  a: number;
  b: number;
  g: number;
}

/** Ideal current source pushing `i` amps from net `from` into net `to` (through the source). */
export interface CurrentSource {
  from: number;
  to: number;
  i: number;
}

/**
 * Voltage-controlled current source: element current gm·(V(cp) − V(cn))
 * flows through the element from net `from` to net `to`.
 */
export interface Vccs {
  from: number;
  to: number;
  cp: number;
  cn: number;
  gm: number;
}

/** A piecewise-linear diode: off = leakage, on = vOn + i·rOn. */
export interface PwlDiode {
  anode: number;
  cathode: number;
  vOn: number;
  rOn: number;
  gOff: number;
  /** Mutable conduction state carried between solves (warm start). */
  on: boolean;
}

/** Collects element stamps for one solve. Net index < 0 means "not connected". */
export class StampCollector {
  conductances: Conductance[] = [];
  sources: CurrentSource[] = [];
  diodes: PwlDiode[] = [];
  vccs: Vccs[] = [];
  /** Internal resistances of sources (so measurements can remove them). */
  sourceConductances = new Set<Conductance>();

  conductance(a: number, b: number, g: number) {
    if (a < 0 || b < 0 || a === b || !(g > 0)) return;
    this.conductances.push({ a, b, g });
  }
  resistor(a: number, b: number, ohms: number) {
    this.conductance(a, b, 1 / Math.max(ohms, 1e-6));
  }
  /** Voltage source `v` from `neg` to `pos` with internal resistance `r` (Norton equivalent). */
  voltageSource(pos: number, neg: number, v: number, r: number) {
    if (pos < 0 || neg < 0 || pos === neg) return;
    const g = 1 / Math.max(r, 1e-6);
    const c = { a: pos, b: neg, g };
    this.conductances.push(c);
    this.sourceConductances.add(c);
    this.sources.push({ from: neg, to: pos, i: v * g });
  }
  currentSource(from: number, to: number, i: number) {
    if (from < 0 || to < 0 || from === to) return;
    this.sources.push({ from, to, i });
  }
  diode(d: PwlDiode) {
    if (d.anode < 0 || d.cathode < 0 || d.anode === d.cathode) return;
    this.diodes.push(d);
  }
  controlledSource(from: number, to: number, cp: number, cn: number, gm: number) {
    if (from < 0 || to < 0 || cp < 0 || cn < 0 || from === to || cp === cn || gm === 0) return;
    this.vccs.push({ from, to, cp, cn, gm });
  }
  clear() {
    this.sourceConductances.clear();
    this.vccs.length = 0;
    this.conductances.length = 0;
    this.sources.length = 0;
    this.diodes.length = 0;
  }
}

export interface SolveResult {
  /** Voltage of every net relative to the reference of its island. */
  voltages: Float64Array;
  /** For every net: index of its island, or -1 if no element touches it. */
  island: Int32Array;
  /** True if the island contains a source (i.e. its voltages are meaningful). */
  islandDriven: boolean[];
  iterations: number;
  converged: boolean;
}

/**
 * Solves the circuit. `netCount` nets, `referenceNets` are preferred island
 * references (e.g. the board GND net). `dirtyNets` (optional) restricts
 * solving to islands containing them; other nets keep `previous` values.
 */
export function solve(
  netCount: number,
  stamps: StampCollector,
  referenceNets: number[],
  previous?: SolveResult,
  dirtyNets?: Set<number>,
): SolveResult {
  // 1. Islands: union-find over every element that can conduct.
  const parent = new Int32Array(netCount);
  for (let i = 0; i < netCount; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const touched = new Uint8Array(netCount);
  const join = (a: number, b: number) => {
    touched[a] = touched[b] = 1;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (const c of stamps.conductances) join(c.a, c.b);
  for (const s of stamps.sources) join(s.from, s.to);
  for (const d of stamps.diodes) join(d.anode, d.cathode);
  for (const g of stamps.vccs) {
    join(g.from, g.to);
    join(g.from, g.cp);
    join(g.from, g.cn);
  }

  const island = new Int32Array(netCount).fill(-1);
  const islandRoots: number[] = [];
  const rootIndex = new Map<number, number>();
  for (let n = 0; n < netCount; n++) {
    if (!touched[n]) continue;
    const r = find(n);
    let idx = rootIndex.get(r);
    if (idx === undefined) {
      idx = islandRoots.length;
      rootIndex.set(r, idx);
      islandRoots.push(r);
    }
    island[n] = idx;
  }
  const islandCount = islandRoots.length;
  const members: number[][] = Array.from({ length: islandCount }, () => []);
  for (let n = 0; n < netCount; n++) if (island[n] >= 0) members[island[n]].push(n);

  const voltages = new Float64Array(netCount);
  const islandDriven = new Array<boolean>(islandCount).fill(false);
  for (const s of stamps.sources) islandDriven[island[s.from]] = true;

  // Which islands need solving?
  const needSolve = new Uint8Array(islandCount);
  if (!previous || !dirtyNets) needSolve.fill(1);
  else {
    for (const n of dirtyNets) if (n >= 0 && n < netCount && island[n] >= 0) needSolve[island[n]] = 1;
    // Islands whose membership changed must also be re-solved.
    for (let k = 0; k < islandCount; k++) {
      if (needSolve[k]) continue;
      for (const n of members[k]) {
        const prevIsland = previous.island[n];
        if (prevIsland < 0) {
          needSolve[k] = 1;
          break;
        }
      }
    }
    for (let n = 0; n < netCount; n++) if (island[n] >= 0 && !needSolve[island[n]]) voltages[n] = previous.voltages[n];
  }

  // Group elements per island.
  const conds: Conductance[][] = Array.from({ length: islandCount }, () => []);
  const srcs: CurrentSource[][] = Array.from({ length: islandCount }, () => []);
  const diodes: PwlDiode[][] = Array.from({ length: islandCount }, () => []);
  const ctrl: Vccs[][] = Array.from({ length: islandCount }, () => []);
  for (const g of stamps.vccs) if (needSolve[island[g.from]]) ctrl[island[g.from]].push(g);
  for (const c of stamps.conductances) if (needSolve[island[c.a]]) conds[island[c.a]].push(c);
  for (const s of stamps.sources) if (needSolve[island[s.from]]) srcs[island[s.from]].push(s);
  for (const d of stamps.diodes) if (needSolve[island[d.anode]]) diodes[island[d.anode]].push(d);

  const refSet = new Set(referenceNets);
  let totalIterations = 0;
  let allConverged = true;

  for (let k = 0; k < islandCount; k++) {
    if (!needSolve[k]) continue;
    const nodes = members[k];
    // Reference: a preferred ground net if present, else the first member.
    let ref = nodes[0];
    for (const n of nodes)
      if (refSet.has(n)) {
        ref = n;
        break;
      }
    const local = new Map<number, number>();
    for (const n of nodes) if (n !== ref) local.set(n, local.size);
    const size = local.size;
    if (size === 0) continue;

    let converged = false;
    let iter = 0;
    let x: Float64Array = new Float64Array(size);
    for (; iter < 40; iter++) {
      const A = new Float64Array(size * size);
      const b = new Float64Array(size);
      const stampG = (na: number, nb: number, g: number) => {
        const ia = na === ref ? -1 : local.get(na)!;
        const ib = nb === ref ? -1 : local.get(nb)!;
        if (ia >= 0) A[ia * size + ia] += g;
        if (ib >= 0) A[ib * size + ib] += g;
        if (ia >= 0 && ib >= 0) {
          A[ia * size + ib] -= g;
          A[ib * size + ia] -= g;
        }
      };
      const stampI = (from: number, to: number, i: number) => {
        const ifrom = from === ref ? -1 : local.get(from)!;
        const ito = to === ref ? -1 : local.get(to)!;
        if (ito >= 0) b[ito] += i;
        if (ifrom >= 0) b[ifrom] -= i;
      };
      for (let i = 0; i < size; i++) A[i * size + i] += GMIN;
      for (const c of conds[k]) stampG(c.a, c.b, c.g);
      for (const s of srcs[k]) stampI(s.from, s.to, s.i);
      for (const g of ctrl[k]) {
        const ifr = g.from === ref ? -1 : local.get(g.from)!;
        const ito = g.to === ref ? -1 : local.get(g.to)!;
        const icp = g.cp === ref ? -1 : local.get(g.cp)!;
        const icn = g.cn === ref ? -1 : local.get(g.cn)!;
        if (ifr >= 0) {
          if (icp >= 0) A[ifr * size + icp] += g.gm;
          if (icn >= 0) A[ifr * size + icn] -= g.gm;
        }
        if (ito >= 0) {
          if (icp >= 0) A[ito * size + icp] -= g.gm;
          if (icn >= 0) A[ito * size + icn] += g.gm;
        }
      }
      for (const d of diodes[k]) {
        if (d.on) {
          const g = 1 / d.rOn;
          stampG(d.anode, d.cathode, g);
          // I = g·(Va−Vc) − g·vOn: the constant term is a source injecting g·vOn into the anode.
          stampI(d.cathode, d.anode, d.vOn * g);
        } else stampG(d.anode, d.cathode, d.gOff);
      }
      x = gaussianSolve(A, b, size);
      // Check diode states.
      let changed = false;
      for (const d of diodes[k]) {
        const va = d.anode === ref ? 0 : x[local.get(d.anode)!];
        const vc = d.cathode === ref ? 0 : x[local.get(d.cathode)!];
        const v = va - vc;
        if (d.on && (v - d.vOn) / d.rOn < -1e-9) {
          d.on = false;
          changed = true;
        } else if (!d.on && v > d.vOn + 1e-9) {
          d.on = true;
          changed = true;
        }
      }
      if (!changed) {
        converged = true;
        iter++;
        break;
      }
    }
    totalIterations += iter;
    if (!converged) allConverged = false;
    voltages[ref] = 0;
    for (const [n, i] of local) voltages[n] = x[i];
  }

  return { voltages, island, islandDriven, iterations: totalIterations, converged: allConverged };
}

/** Dense Gaussian elimination with partial pivoting. Islands are small (< ~50 nodes). */
export function gaussianSolve(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    let max = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r * n + col]);
      if (v > max) {
        max = v;
        pivot = r;
      }
    }
    if (max < 1e-30) continue;
    if (pivot !== col) {
      for (let c = 0; c < n; c++) {
        const t = A[col * n + c];
        A[col * n + c] = A[pivot * n + c];
        A[pivot * n + c] = t;
      }
      const t = b[col];
      b[col] = b[pivot];
      b[pivot] = t;
    }
    const diag = A[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / diag;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r * n + c] -= f * A[col * n + c];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r * n + c] * x[c];
    const d = A[r * n + r];
    x[r] = Math.abs(d) < 1e-30 ? 0 : s / d;
  }
  return x;
}

/** Current through a diode for a given solution. */
export function diodeCurrent(d: PwlDiode, v: Float64Array): number {
  const vd = v[d.anode] - v[d.cathode];
  return d.on ? (vd - d.vOn) / d.rOn : vd * d.gOff;
}
