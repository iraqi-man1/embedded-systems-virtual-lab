/**
 * Right-button gesture on the canvas: drag pans, click opens the context menu,
 * whatever order the platform fires `contextmenu` in.
 */
import { describe, expect, it } from 'vitest';
import { ContextMenuGate } from '../src/ui/workspace/contextMenuGate';

const at = (x: number, y: number) => ({ target: null, x, y });

describe('context menu gate — Windows order (menu after release)', () => {
  it('a click opens the menu', () => {
    const g = new ContextMenuGate();
    g.down(100, 100);
    expect(g.move(101, 101)).toBe(false);
    expect(g.up(10)).toBeNull();
    expect(g.contextMenu(11, at(101, 101))).toBe(true);
  });

  it('a drag pans and swallows the menu that follows', () => {
    const g = new ContextMenuGate();
    g.down(100, 100);
    expect(g.move(130, 100)).toBe(true);
    expect(g.dragging).toBe(true);
    expect(g.up(10)).toBeNull();
    expect(g.contextMenu(12, at(130, 100))).toBe(false);
    // Only that one event: the next right-click works again.
    expect(g.contextMenu(20, at(130, 100))).toBe(true);
  });

  it('the swallow window expires if the menu event never comes', () => {
    const g = new ContextMenuGate(4, 400);
    g.down(0, 0);
    g.move(50, 0);
    g.up(1000);
    // Keyboard context-menu key much later.
    expect(g.contextMenu(2000, at(0, 0))).toBe(true);
  });
});

describe('context menu gate — Linux/macOS order (menu on press)', () => {
  it('a click holds the menu back and hands it out on release', () => {
    const g = new ContextMenuGate();
    g.down(40, 50);
    expect(g.contextMenu(1, at(40, 50))).toBe(false);
    const held = g.up(5);
    expect(held).toEqual(at(40, 50));
    // The replayed event passes.
    g.replaying = true;
    expect(g.contextMenu(6, held!)).toBe(true);
    g.replaying = false;
  });

  it('a drag drops the held menu and does not swallow the next one', () => {
    const g = new ContextMenuGate();
    g.down(40, 50);
    expect(g.contextMenu(1, at(40, 50))).toBe(false);
    expect(g.move(90, 80)).toBe(true);
    expect(g.up(5)).toBeNull();
    // Next right-click (keyboard or press) is not blocked.
    expect(g.contextMenu(6, at(0, 0))).toBe(true);
  });
});

describe('context menu gate — other cases', () => {
  it('menu events without a press (keyboard menu key) pass', () => {
    expect(new ContextMenuGate().contextMenu(0, at(0, 0))).toBe(true);
  });

  it('small jitter below the threshold is still a click', () => {
    const g = new ContextMenuGate(4);
    g.down(10, 10);
    expect(g.move(13, 12)).toBe(false);
    expect(g.up(1)).toBeNull();
    expect(g.contextMenu(2, at(13, 12))).toBe(true);
  });

  it('a cancelled gesture neither opens nor swallows', () => {
    const g = new ContextMenuGate();
    g.down(10, 10);
    g.contextMenu(1, at(10, 10));
    g.move(60, 10);
    g.cancel();
    expect(g.up(2)).toBeNull();
    expect(g.contextMenu(3, at(0, 0))).toBe(true);
  });
});
