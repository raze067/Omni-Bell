export interface ActiveDevice {
  id: string;
  name: string;
  lastSeen: number;
}

export type SoundTone = 'classic' | 'tibetan' | 'doorbell' | 'marimba' | 'cyber';

export interface CallPresetTag {
  id: string;
  label: string;
  emoji: string;
}

export interface Acknowledgment {
  text: string;
  by: string;
  deviceId: string;
  timestamp: number;
}

export interface BellState {
  ringId?: string;
  status?: 'ringing' | 'silenced';
  lastRingAt?: number;
  triggeredBy?: string;
  triggeredById?: string;
  targetDeviceId?: string; // If set, only rings this device
  targetDeviceName?: string;
  tag?: string;
  recentRings?: number[];
  lastAcknowledgment?: Acknowledgment;
}
