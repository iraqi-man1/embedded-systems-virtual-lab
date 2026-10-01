/** Plays tones for simulated sound sources (buzzers) through Web Audio. */
import { useEditor } from '../state/editor';

let ctx: AudioContext | null = null;
const voices = new Map<string, { osc: OscillatorNode; gain: GainNode }>();

function context(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const audio = {
  /** Sets the tone of a source; frequency 0 silences it. */
  set(id: string, frequency: number): void {
    const enabled = useEditor.getState().sound;
    const v = voices.get(id);
    if (!enabled || !(frequency > 20 && frequency < 20000)) {
      if (v) {
        v.gain.gain.setTargetAtTime(0, v.gain.context.currentTime, 0.01);
      }
      return;
    }
    const ac = context();
    if (!ac) return;
    if (!v) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'square';
      gain.gain.value = 0;
      osc.connect(gain).connect(ac.destination);
      osc.start();
      voices.set(id, { osc, gain });
      return audio.set(id, frequency);
    }
    v.osc.frequency.setTargetAtTime(frequency, ac.currentTime, 0.005);
    v.gain.gain.setTargetAtTime(0.06, ac.currentTime, 0.01);
  },
  stop(id: string) {
    const v = voices.get(id);
    if (!v) return;
    v.gain.gain.value = 0;
    v.osc.stop();
    voices.delete(id);
  },
  stopAll() {
    for (const id of [...voices.keys()]) audio.stop(id);
  },
};
