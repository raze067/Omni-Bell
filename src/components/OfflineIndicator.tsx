import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 max-w-sm mx-auto z-50 flex items-center justify-center gap-2 rounded-2xl bg-[#1C1917] text-white px-4 py-2.5 text-xs font-semibold shadow-2xl border border-white/10 animate-in slide-in-from-bottom-3">
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <span>Offline — Reconnecting when network resumes...</span>
    </div>
  );
};
