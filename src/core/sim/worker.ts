/// <reference lib="webworker" />
/**
 * Simulation worker entry point. Owns one SimulationEngine and translates
 * messages from the UI thread into engine calls.
 */
import './models/register';
import { SimulationEngine } from './engine/engine';
import type { SimCommand, SimEvent } from './types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let engine: SimulationEngine | null = null;

const post = (ev: SimEvent) => ctx.postMessage(ev);

ctx.onmessage = (e: MessageEvent<SimCommand>) => {
  const cmd = e.data;
  try {
    switch (cmd.type) {
      case 'setup':
        engine?.stop();
        engine = new SimulationEngine(cmd.setup, cmd.settings, post);
        break;
      case 'update-circuit':
        engine?.updateCircuit(cmd.setup, cmd.restart);
        break;
      case 'start':
        engine?.start();
        break;
      case 'pause':
        engine?.pause();
        break;
      case 'resume':
        engine?.resume();
        break;
      case 'stop':
        engine?.stop();
        break;
      case 'reset':
        engine?.reset();
        break;
      case 'step':
        engine?.step(cmd.kind);
        break;
      case 'settings':
        engine?.updateSettings(cmd.settings);
        break;
      case 'input':
        engine?.input(cmd.componentId, cmd.key, cmd.value);
        break;
      case 'set-prop':
        engine?.setProp(cmd.componentId, cmd.key, cmd.value);
        break;
      case 'serial-write':
        engine?.serialWrite(cmd.componentId, cmd.data);
        break;
      case 'probes':
        engine?.setProbes(cmd.probes);
        break;
    }
  } catch (err) {
    post({ type: 'error', message: (err as Error).message ?? String(err) });
  }
};
