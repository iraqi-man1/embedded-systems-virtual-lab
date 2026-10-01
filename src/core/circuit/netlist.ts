import type { ComponentDefinition, PinDefinition } from '../model/component';
import type { CircuitDocument, ComponentInstance, PinRef } from '../model/circuit';
import { pinKey } from '../model/circuit';
import { pinWorld } from './geometry';

export type DefinitionLookup = (type: string) => ComponentDefinition | undefined;

export interface Net {
  id: number;
  name: string;
  pins: PinRef[];
  /** True if a ground pin is part of this net. */
  hasGround: boolean;
  /** Names of power pins (e.g. "5V") present on this net. */
  powerPins: string[];
  /** Distinct supply voltages driven onto this net by power pins. */
  powerVoltages: number[];
  /**
   * Number of distinct components attached with a non-socket pin. < 2 means
   * nothing is really connected (e.g. only a board's duplicated header pins).
   */
  activePinCount: number;
}

export interface Netlist {
  nets: Net[];
  /** `componentId:pinId` -> net id. */
  pinNet: Map<string, number>;
  /** Pin insertions detected (pin -> socket), for UI highlighting. */
  insertions: { pin: PinRef; socket: PinRef }[];
  netOf(ref: PinRef): number | undefined;
}

class UnionFind {
  private parent = new Map<string, string>();
  add(k: string) {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }
  find(k: string): string {
    let root = k;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // path compression
    let cur = k;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
  keys() {
    return this.parent.keys();
  }
}

export interface NetlistOptions {
  /** Max distance (px) between a pin and a socket for it to count as inserted. */
  insertionTolerance?: number;
}

/**
 * Builds electrical connectivity from the document:
 *  1. every pin is a node;
 *  2. pins listed together in `internalConnections` are joined (breadboard
 *     strips, duplicated GND pins, push-button leg pairs...);
 *  3. wires join their endpoints;
 *  4. a pin lying on a `socket` pin of another component is joined to it
 *     (component legs inserted into breadboard holes);
 *  5. net-label components with equal names are joined.
 */
export function buildNetlist(doc: CircuitDocument, lookup: DefinitionLookup, opts: NetlistOptions = {}): Netlist {
  const tol = opts.insertionTolerance ?? 3.6;
  const uf = new UnionFind();
  const pinDefs = new Map<string, { inst: ComponentInstance; def: ComponentDefinition; pin: PinDefinition }>();
  const labelGroups = new Map<string, string[]>();

  // Spatial hash of socket pins for insertion detection.
  const cell = 9.6;
  const sockets = new Map<string, { key: string; x: number; y: number; componentId: string }[]>();
  const cellKey = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;

  for (const inst of doc.components) {
    const def = lookup(inst.type);
    if (!def) continue;
    for (const pin of def.pins) {
      const key = pinKey({ componentId: inst.id, pinId: pin.id });
      uf.add(key);
      pinDefs.set(key, { inst, def, pin });
      if (pin.kind === 'socket') {
        const p = pinWorld(inst, def, pin);
        const ck = cellKey(p.x, p.y);
        if (!sockets.has(ck)) sockets.set(ck, []);
        sockets.get(ck)!.push({ key, x: p.x, y: p.y, componentId: inst.id });
      }
    }
    for (const group of def.internalConnections ?? []) {
      for (let i = 1; i < group.length; i++) {
        uf.union(pinKey({ componentId: inst.id, pinId: group[0] }), pinKey({ componentId: inst.id, pinId: group[i] }));
      }
    }
    const labelName =
      def.netLabelFixed ?? (def.netLabelProperty ? String(inst.props[def.netLabelProperty] ?? '').trim() : '');
    if (labelName && def.pins.length) {
      const k = pinKey({ componentId: inst.id, pinId: def.pins[0].id });
      if (!labelGroups.has(labelName)) labelGroups.set(labelName, []);
      labelGroups.get(labelName)!.push(k);
    }
  }

  for (const w of doc.wires) {
    const a = pinKey(w.from);
    const b = pinKey(w.to);
    if (pinDefs.has(a) && pinDefs.has(b)) uf.union(a, b);
  }

  const insertions: Netlist['insertions'] = [];
  if (sockets.size) {
    for (const [key, { inst, def, pin }] of pinDefs) {
      if (pin.kind === 'socket') continue;
      const p = pinWorld(inst, def, pin);
      let best: { key: string; d: number } | null = null;
      const cx = Math.floor(p.x / cell);
      const cy = Math.floor(p.y / cell);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iy = cy - 1; iy <= cy + 1; iy++) {
          for (const s of sockets.get(`${ix},${iy}`) ?? []) {
            if (s.componentId === inst.id) continue;
            const d = Math.hypot(s.x - p.x, s.y - p.y);
            if (d <= tol && (!best || d < best.d)) best = { key: s.key, d };
          }
        }
      }
      if (best) {
        uf.union(key, best.key);
        insertions.push({ pin: parsePinKey(key), socket: parsePinKey(best.key) });
      }
    }
  }

  for (const [, keys] of labelGroups) for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i]);

  // Materialise nets in a deterministic order (document order of pins).
  const rootToNet = new Map<string, Net>();
  const attached = new Map<Net, Set<string>>();
  const nets: Net[] = [];
  const pinNet = new Map<string, number>();
  for (const key of pinDefs.keys()) {
    const root = uf.find(key);
    let net = rootToNet.get(root);
    if (!net) {
      net = { id: nets.length, name: '', pins: [], hasGround: false, powerPins: [], powerVoltages: [], activePinCount: 0 };
      rootToNet.set(root, net);
      nets.push(net);
    }
    const info = pinDefs.get(key)!;
    net.pins.push(parsePinKey(key));
    if (info.pin.kind !== 'socket') {
      let set = attached.get(net);
      if (!set) attached.set(net, (set = new Set()));
      set.add(info.inst.id);
      net.activePinCount = set.size;
    }
    if (info.pin.kind === 'ground') net.hasGround = true;
    if (info.pin.kind === 'power') {
      net.powerPins.push(info.pin.label ?? info.pin.id);
      const v = info.pin.voltage;
      if (v !== undefined && !net.powerVoltages.includes(v)) net.powerVoltages.push(v);
    }
    pinNet.set(key, net.id);
  }

  const labelOfNet = new Map<number, string>();
  for (const [name, keys] of labelGroups) labelOfNet.set(pinNet.get(keys[0])!, name);
  for (const net of nets) net.name = nameNet(net, labelOfNet.get(net.id), pinDefs);

  return {
    nets,
    pinNet,
    insertions,
    netOf: (ref) => pinNet.get(pinKey(ref)),
  };
}

function parsePinKey(key: string): PinRef {
  const i = key.indexOf(':');
  return { componentId: key.slice(0, i), pinId: key.slice(i + 1) };
}

function nameNet(
  net: Net,
  label: string | undefined,
  pinDefs: Map<string, { inst: ComponentInstance; def: ComponentDefinition; pin: PinDefinition }>,
): string {
  if (label) return label;
  if (net.hasGround) return 'GND';
  if (net.powerPins.length) return net.powerPins[0];
  // Prefer an MCU pin name, then any non-socket pin.
  let fallback = '';
  for (const ref of net.pins) {
    const info = pinDefs.get(pinKey(ref))!;
    if (info.def.mcu && info.pin.kind !== 'socket') return `${info.inst.label}.${info.pin.label ?? info.pin.id}`;
    if (!fallback && info.pin.kind !== 'socket') fallback = `${info.inst.label}.${info.pin.label ?? info.pin.id}`;
  }
  return fallback || `N${net.id}`;
}
