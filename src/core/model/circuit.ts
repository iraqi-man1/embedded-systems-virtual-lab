/**
 * Circuit Model — the persisted document describing a design.
 *
 * Junctions and net labels are ordinary component instances, which keeps the
 * netlist algorithm free of special cases.
 */

export type PropValue = string | number | boolean;

export type Rotation = 0 | 90 | 180 | 270;

export interface ComponentInstance {
  id: string;
  type: string;
  /** Top-left of the unrotated bounding box, in world pixels. */
  x: number;
  y: number;
  rotation: Rotation;
  flip?: boolean;
  /** Reference designator shown on the canvas, e.g. "R1". */
  label: string;
  props: Record<string, PropValue>;
}

export interface PinRef {
  componentId: string;
  pinId: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Wire {
  id: string;
  from: PinRef;
  to: PinRef;
  /** Intermediate waypoints (world coordinates). Empty = auto orthogonal route. */
  points: Point[];
  color: string;
  label?: string;
}

export interface CircuitDocument {
  components: ComponentInstance[];
  wires: Wire[];
}

export const emptyCircuit = (): CircuitDocument => ({ components: [], wires: [] });

export const pinKey = (ref: PinRef): string => `${ref.componentId}:${ref.pinId}`;

export const WIRE_COLORS = [
  { value: '#2ecc71', label: 'Green' },
  { value: '#e74c3c', label: 'Red' },
  { value: '#222222', label: 'Black' },
  { value: '#3498db', label: 'Blue' },
  { value: '#f1c40f', label: 'Yellow' },
  { value: '#e67e22', label: 'Orange' },
  { value: '#9b59b6', label: 'Purple' },
  { value: '#ecf0f1', label: 'White' },
  { value: '#95a5a6', label: 'Grey' },
  { value: '#8b5a2b', label: 'Brown' },
];
