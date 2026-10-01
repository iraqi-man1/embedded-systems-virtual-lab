/** Programmatic circuit construction for examples and templates. */
import type { CircuitDocument, ComponentInstance, Point, PropValue, Rotation, Wire } from '../core/model/circuit';
import type { ComponentRegistry } from '../core/registry/registry';
import { pinWorld } from '../core/circuit/geometry';
import { defaultProps } from '../core/sim/setup';

export class CircuitBuilder {
  doc: CircuitDocument = { components: [], wires: [] };
  private n = 0;
  private counters = new Map<string, number>();

  constructor(private registry: ComponentRegistry) {}

  add(type: string, x = 0, y = 0, props: Record<string, PropValue> = {}, rotation: Rotation = 0): ComponentInstance {
    const def = this.registry.require(type);
    const k = (this.counters.get(def.designator) ?? 0) + 1;
    this.counters.set(def.designator, k);
    const inst: ComponentInstance = {
      id: `${def.designator.toLowerCase()}${k}-${++this.n}`,
      type,
      x,
      y,
      rotation,
      label: `${def.designator}${k}`,
      props: { ...defaultProps(def), ...props },
    };
    this.doc.components.push(inst);
    return inst;
  }

  pin(inst: ComponentInstance, pinId: string): Point {
    const def = this.registry.require(inst.type);
    const pin = def.pins.find((p) => p.id === pinId);
    if (!pin) throw new Error(`${inst.type} has no pin ${pinId}`);
    return pinWorld(inst, def, pin);
  }

  /** Moves `inst` so its pin lands exactly on `target`'s pin (e.g. a breadboard hole). */
  insert(inst: ComponentInstance, pinId: string, target: ComponentInstance, targetPin: string): this {
    const here = this.pin(inst, pinId);
    const there = this.pin(target, targetPin);
    inst.x += there.x - here.x;
    inst.y += there.y - here.y;
    return this;
  }

  wire(a: ComponentInstance, ap: string, b: ComponentInstance, bp: string, color = '#2ecc71', points: Point[] = []): Wire {
    this.pin(a, ap);
    this.pin(b, bp);
    const w: Wire = { id: `w${++this.n}`, from: { componentId: a.id, pinId: ap }, to: { componentId: b.id, pinId: bp }, points, color };
    this.doc.wires.push(w);
    return w;
  }
}

export const WIRE = { red: '#e74c3c', black: '#222222', green: '#2ecc71', blue: '#3498db', yellow: '#f1c40f', orange: '#e67e22', purple: '#9b59b6', white: '#ecf0f1' };
