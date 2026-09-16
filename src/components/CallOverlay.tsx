import React, { useEffect, useState } from 'react';
import { Bell, BellOff, MessageSquare } from 'lucide-react';
import { Acknowledgment } from '../types';

interface CallOverlayProps {
  isSender: boolean;
  callerName: string;
  targetDeviceName?: string;
  tag?: string;
  lastAcknowledgment?: Acknowledgment;
  onSilence: () => void;
  onAcknowledge: (text: string) => void;
}

const ACK_OPTIONS = [
  'Coming now!',
  'Give me 5 mins',
  'Understood 👍',
  'Busy right now'
];

export const CallOverlay: React.FC<CallOverlayProps> = ({
  isSender,
  callerName,
  targetDeviceName,
  tag,
  lastAcknowledgment,
  onSilence,
  onAcknowledge
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between py-12 px-6 bg-gradient-to-b from-[#E05D25] via-[#D4541F] to-[#B94416] text-white transition-opacity duration-300">
      {/* Top Bar: Timer and Target Badge */}
      <div className="w-full max-w-sm flex items-center justify-between">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/15 backdrop-blur-md rounded-full text-xs font-mono font-bold tracking-wider">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          <span>{formatTimer(elapsedSeconds)}</span>
        </div>

        {targetDeviceName ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/20 backdrop-blur-md rounded-full text-[11px] font-semibold text-white/90">
            <span>Direct: {targetDeviceName}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-semibold text-white/80">
            <span>Broadcast to All</span>
          </div>
        )}
      </div>

      {/* Center Bell Animation & Status */}
      <div className="flex flex-col items-center text-center my-auto w-full max-w-sm">
        {tag && (
          <div className="mb-6 px-4 py-2 bg-white/20 backdrop-blur-md rounded-2xl text-sm font-bold tracking-wide shadow-sm animate-pulse">
            {tag}
          </div>
        )}

        <div className="relative flex items-center justify-center w-40 h-40 sm:w-48 sm:h-48 mb-6">
          <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
          <div className="absolute inset-4 bg-white/15 rounded-full" />
          <Bell className="w-20 h-20 sm:w-24 sm:h-24 text-white relative z-10 animate-bounce" strokeWidth={1.5} />
        </div>

        <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-2">
          {isSender ? (
            targetDeviceName ? `Calling ${targetDeviceName}...` : 'Calling Everyone...'
          ) : (
            `${callerName || 'Someone'} is calling`
          )}
        </h2>

        <p className="text-white/80 text-sm font-medium mb-6">
          {isSender
            ? 'Sound is ringing on the target device(s).'
            : 'Chime is actively alerting on this device.'}
        </p>

        {/* Live Acknowledgment banner if anyone sent one */}
        {lastAcknowledgment && (
          <div className="w-full p-3.5 bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl text-left flex items-start gap-3 shadow-lg animate-in slide-in-from-bottom-2 mb-4">
            <div className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-white/80 block">
                {lastAcknowledgment.by} responded:
              </span>
              <span className="text-sm font-bold text-white block">
                "{lastAcknowledgment.text}"
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls: Quick Replies (for receivers) & Silence Button */}
      <div className="w-full max-w-sm flex flex-col items-center gap-4">
        {!isSender && (
          <div className="w-full">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/70 block mb-2 text-center">
              Quick Response & Silence
            </span>
            <div className="grid grid-cols-2 gap-2">
              {ACK_OPTIONS.map((reply, i) => (
                <button
                  key={i}
                  onClick={() => onAcknowledge(reply)}
                  className="py-2.5 px-3 bg-white/15 hover:bg-white/25 active:scale-95 backdrop-blur-md rounded-xl text-xs font-semibold text-white transition-all text-center border border-white/20"
                >
                  {reply}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onSilence}
          className="w-full py-4 px-6 bg-white text-[#E05D25] rounded-2xl font-bold text-base hover:bg-orange-50 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-2"
        >
          <BellOff className="w-5 h-5" />
          <span>{isSender ? 'Cancel Call' : 'Silence Chime'}</span>
        </button>
      </div>
    </div>
  );
};
