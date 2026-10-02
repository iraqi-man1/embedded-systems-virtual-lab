/** Locked parts stay in place: not moved, rotated, flipped or deleted until unlocked; copies are free. */
import { beforeEach, describe, expect, it } from 'vitest';
import { newProject, parseProject, serializeProject } from '../src/core/project/schema';
import { useEditor } from '../src/state/editor';
import { createInstance, useProject } from '../src/state/project';
import { copySelection, deleteSelection, duplicateSelection, flipSelection, nudgeSelection, rotateSelection, toggleLockSelection } from '../src/ui/workspace/actions';
import { lookup } from './helpers';

const ed = () => useEditor.getState();
const parts = () => useProject.getState().project.circuit.components;
const byLabel = (label: string) => parts().find((c) => c.label === label)!;

beforeEach(() => {
  const p = newProject('Lock');
  for (const [type, x] of [
    ['evlab.breadboard-half', 0],
    ['evlab.resistor', 400],
    ['evlab.led', 600],
  ] as const) {
    p.circuit.components.push(createInstance(lookup(type)!, x, 0, p.circuit));
  }
  useProject.getState().load(p, null);
  ed().clearSelection();
});

describe('locked parts', () => {
  it('Ctrl+L locks the selection, and unlocks it when all are locked', () => {
    ed().select([byLabel('BB1').id, byLabel('R1').id]);
    toggleLockSelection();
    expect(byLabel('BB1').locked).toBe(true);
    expect(byLabel('R1').locked).toBe(true);
    toggleLockSelection();
    expect(byLabel('BB1').locked).toBeUndefined();
    // A mixed selection locks them all.
    ed().select([byLabel('R1').id]);
    toggleLockSelection();
    ed().select([byLabel('R1').id, byLabel('LED1').id]);
    toggleLockSelection();
    expect(byLabel('LED1').locked).toBe(true);
    expect(byLabel('R1').locked).toBe(true);
  });

  it('are not deleted, moved, rotated or flipped with the rest of the selection', () => {
    ed().select([byLabel('BB1').id]);
    toggleLockSelection();
    const before = { ...byLabel('BB1') };
    ed().select([byLabel('BB1').id, byLabel('R1').id]);
    nudgeSelection(9.6, 0);
    rotateSelection(90);
    flipSelection();
    expect(byLabel('BB1')).toMatchObject({ x: before.x, y: before.y, rotation: before.rotation });
    expect(byLabel('BB1').flip).toBeFalsy();
    expect(byLabel('R1').rotation).toBe(90);
    deleteSelection();
    expect(parts().map((c) => c.label).sort()).toEqual(['BB1', 'LED1']);
  });

  it('copies of a locked part are free to move', () => {
    ed().select([byLabel('R1').id]);
    toggleLockSelection();
    duplicateSelection();
    const copy = parts().find((c) => c.type === 'evlab.resistor' && c.label !== 'R1')!;
    expect(copy.locked).toBeUndefined();
    copySelection();
  });

  it('stay locked in the saved project', () => {
    ed().select([byLabel('BB1').id]);
    toggleLockSelection();
    const back = parseProject(serializeProject(useProject.getState().project));
    expect(back.circuit.components.find((c) => c.label === 'BB1')?.locked).toBe(true);
    expect(back.circuit.components.find((c) => c.label === 'R1')?.locked).toBeUndefined();
  });
});
