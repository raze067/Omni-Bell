import { SoundTone } from '../types';

let audioCtx: AudioContext | null = null;
let masterGainNode: GainNode | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      masterGainNode = audioCtx.createGain();
      const savedVolume = localStorage.getItem('omni_volume');
      const volumeVal = savedVolume !== null ? parseFloat(savedVolume) : 0.8;
      masterGainNode.gain.setValueAtTime(isNaN(volumeVal) ? 0.8 : volumeVal, audioCtx.currentTime);
      masterGainNode.connect(audioCtx.destination);
    }
  }
  return audioCtx;
}

export function setMasterVolume(volume: number) {
  const ctx = getAudioContext();
  if (ctx && masterGainNode) {
    const clamped = Math.max(0, Math.min(1, volume));
    masterGainNode.gain.setValueAtTime(clamped, ctx.currentTime);
    localStorage.setItem('omni_volume', clamped.toString());
  }
}

export function getMasterVolume(): number {
  if (typeof window === 'undefined') return 0.8;
  const saved = localStorage.getItem('omni_volume');
  if (saved !== null) {
    const val = parseFloat(saved);
    return isNaN(val) ? 0.8 : val;
  }
  return 0.8;
}

export async function ensureAudioRunning(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {
      console.warn('AudioContext resume error:', e);
    }
  }
  return ctx.state === 'running';
}

export function playTone(tone: SoundTone = 'classic') {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running' || !masterGainNode) return;

  const t = ctx.currentTime;

  switch (tone) {
    case 'tibetan': {
      // Warm resonant singing bowl (432Hz fundamental + harmonic warmth + soft shimmer)
      const fundamental = 432;
      const partials = [
        { freq: fundamental, gain: 0.35, decay: 2.8 },
        { freq: fundamental * 2.02, gain: 0.18, decay: 2.2 },
        { freq: fundamental * 3.01, gain: 0.08, decay: 1.6 }
      ];

      partials.forEach(p => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.freq, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(p.gain, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);

        osc.connect(gain);
        gain.connect(masterGainNode!);
        osc.start(t);
        osc.stop(t + p.decay + 0.1);
      });
      break;
    }

    case 'doorbell': {
      // Classic Ding-Dong (G5 784Hz -> E5 659.25Hz)
      const playChime = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(masterGainNode!);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);
      };

      playChime(783.99, t, 1.2);       // Ding (G5)
      playChime(659.25, t + 0.4, 1.6);  // Dong (E5)
      break;
    }

    case 'marimba': {
      // Gentle wooden acoustic percussion notes
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const startTime = t + (idx * 0.12);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.25, startTime + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

        osc.connect(gain);
        gain.connect(masterGainNode!);
        osc.start(startTime);
        osc.stop(startTime + 0.7);
      });
      break;
    }

    case 'cyber': {
      // Modern electronic digital ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, t);
      osc.frequency.exponentialRampToValueAtTime(1600, t + 0.12);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.28);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

      osc.connect(gain);
      gain.connect(masterGainNode!);
      osc.start(t);
      osc.stop(t + 0.9);
      break;
    }

    case 'classic':
    default: {
      // Signature 4-note ascending bell chime
      const playNote = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(masterGainNode!);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);
      };

      playNote(698.46, t, 1.4);        // F5
      playNote(880.00, t + 0.2, 1.2);   // A5
      playNote(1046.50, t + 0.4, 1.0);  // C6
      playNote(1396.91, t + 0.6, 1.6);  // F6
      break;
    }
  }
}
