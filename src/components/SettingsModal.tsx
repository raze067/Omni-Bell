import React, { useState } from 'react';
import { X, Volume2, VolumeX, Play, Sun, BellRing, Smartphone, Sparkles, Check, Download } from 'lucide-react';
import { SoundTone } from '../types';
import { playTone, setMasterVolume, getMasterVolume } from '../utils/audio';

interface SettingsModalProps {
  currentTone: SoundTone;
  onSelectTone: (tone: SoundTone) => void;
  wakeLockActive: boolean;
  onToggleWakeLock: () => void;
  wakeLockSupported: boolean;
  notificationsEnabled: boolean;
  onRequestNotifications: () => void;
  onOpenInstallModal: () => void;
  onClose: () => void;
}

const TONES: { id: SoundTone; name: string; desc: string }[] = [
  { id: 'classic', name: 'Ascending Bell', desc: 'Harmonious 4-note chime' },
  { id: 'tibetan', name: 'Tibetan Bowl', desc: 'Warm 432Hz meditative resonance' },
  { id: 'doorbell', name: 'Two-Tone Doorbell', desc: 'Classic welcoming Ding-Dong' },
  { id: 'marimba', name: 'Gentle Marimba', desc: 'Acoustic warm wooden melody' },
  { id: 'cyber', name: 'Digital Ping', desc: 'Crisp, modern electronic chime' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  currentTone,
  onSelectTone,
  wakeLockActive,
  onToggleWakeLock,
  wakeLockSupported,
  notificationsEnabled,
  onRequestNotifications,
  onOpenInstallModal,
  onClose
}) => {
  const [volume, setVolumeState] = useState<number>(getMasterVolume());
  const [playingTone, setPlayingTone] = useState<SoundTone | null>(null);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolumeState(val);
    setMasterVolume(val);
  };

  const handlePreviewTone = (tone: SoundTone, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPlayingTone(tone);
    playTone(tone);
    setTimeout(() => setPlayingTone(null), 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/30 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-[#F5F3F0] w-full max-w-sm rounded-[32px] p-6 sm:p-7 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E05D25]/10 flex items-center justify-center text-[#E05D25]">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="font-display font-bold text-xl text-[#1C1917]">Preferences</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#A8A29E] hover:text-[#1C1917] transition-colors bg-[#FAF9F7] p-2 rounded-full active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Volume Slider */}
        <div className="p-4 bg-[#FAF9F7] border border-[#F0EEEB] rounded-2xl mb-5">
          <div className="flex items-center justify-between text-xs font-bold text-[#78716C] mb-2.5">
            <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              {volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5 text-[#E05D25]" />}
              Chime Volume
            </span>
            <span className="text-[#1C1917] font-mono">{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolumeChange}
            className="w-full accent-[#E05D25] h-1.5 bg-[#E5E5E5] rounded-lg cursor-pointer"
          />
        </div>

        {/* Sound Tone Selector */}
        <div className="mb-5">
          <label className="text-[10px] font-bold text-[#A8A29E] tracking-widest uppercase block mb-2 px-1">
            Sound Signature
          </label>
          <div className="space-y-2">
            {TONES.map(t => {
              const isSelected = currentTone === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTone(t.id)}
                  className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-orange-50/50 border-[#E05D25] shadow-sm'
                      : 'bg-[#FAF9F7] hover:bg-[#F5F3F0] border-[#F0EEEB]'
                  }`}
                >
                  <div className="flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${isSelected ? 'text-[#E05D25]' : 'text-[#1C1917]'}`}>
                        {t.name}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#E05D25]" />}
                    </div>
                    <span className="text-[11px] text-[#78716C] font-medium block leading-tight">{t.desc}</span>
                  </div>

                  <button
                    onClick={(e) => handlePreviewTone(t.id, e)}
                    className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-transform active:scale-90 ${
                      playingTone === t.id
                        ? 'bg-[#E05D25] text-white'
                        : 'bg-white text-[#78716C] hover:text-[#E05D25] border border-[#E5E5E5]'
                    }`}
                    title="Test tone"
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hardware & Mobile Settings */}
        <div className="space-y-2 pt-2 border-t border-[#F0EEEB]">
          {/* Wake Lock */}
          {wakeLockSupported && (
            <div className="flex items-center justify-between p-3 bg-[#FAF9F7] rounded-2xl border border-[#F0EEEB]">
              <div className="flex items-center gap-2.5">
                <Sun className={`w-4 h-4 ${wakeLockActive ? 'text-amber-500' : 'text-[#A8A29E]'}`} />
                <div>
                  <span className="text-xs font-bold text-[#1C1917] block">Keep Screen Awake</span>
                  <span className="text-[10px] text-[#78716C] block">Prevent standby for kiosk / tablet</span>
                </div>
              </div>
              <button
                onClick={onToggleWakeLock}
                className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 outline-none ${
                  wakeLockActive ? 'bg-[#E05D25]' : 'bg-[#D6D3D1]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${
                    wakeLockActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Notifications */}
          <div className="flex items-center justify-between p-3 bg-[#FAF9F7] rounded-2xl border border-[#F0EEEB]">
            <div className="flex items-center gap-2.5">
              <BellRing className={`w-4 h-4 ${notificationsEnabled ? 'text-emerald-600' : 'text-[#A8A29E]'}`} />
              <div>
                <span className="text-xs font-bold text-[#1C1917] block">Background Alerts</span>
                <span className="text-[10px] text-[#78716C] block">
                  {notificationsEnabled ? 'Browser notifications active' : 'Notify when tab is closed/minimized'}
                </span>
              </div>
            </div>
            {!notificationsEnabled ? (
              <button
                onClick={onRequestNotifications}
                className="px-3 py-1.5 bg-[#E05D25] text-white rounded-xl text-xs font-bold active:scale-95 transition-transform cursor-pointer"
              >
                Enable
              </button>
            ) : (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
                Active
              </span>
            )}
          </div>

          {/* Install App on Phone */}
          <div className="flex items-center justify-between p-3 bg-orange-50/50 rounded-2xl border border-[#F5D0C0]">
            <div className="flex items-center gap-2.5">
              <Download className="w-4 h-4 text-[#E05D25]" />
              <div>
                <span className="text-xs font-bold text-[#1C1917] block">Install App on Phone</span>
                <span className="text-[10px] text-[#78716C] block">Add to Home Screen as Web App</span>
              </div>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenInstallModal();
              }}
              className="px-3 py-1.5 bg-[#E05D25] text-white rounded-xl text-xs font-bold active:scale-95 transition-transform cursor-pointer"
            >
              Install
            </button>
          </div>

          {/* Haptics notice if supported */}
          {'vibrate' in navigator && (
            <div className="flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#78716C]">
              <Smartphone className="w-3.5 h-3.5 text-[#A8A29E]" />
              <span>Haptic vibration enabled for mobile chimes</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
