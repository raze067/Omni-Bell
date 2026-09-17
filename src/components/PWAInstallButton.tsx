import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';

interface PWAInstallButtonProps {
  variant?: 'pill' | 'banner' | 'icon';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'pill' }) => {
  const { isInstalled, isInstallable, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  // If already running inside installed standalone PWA, no need to show install button
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const res = await install();
      if (!res) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      {variant === 'pill' && (
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-orange-50 border border-[#F5F3F0] rounded-full text-[11px] font-bold text-[#E05D25] tracking-wider uppercase shadow-sm transition-all active:scale-95 cursor-pointer"
          title="Download & Install App"
        >
          <Download className="w-3.5 h-3.5 text-[#E05D25]" />
          <span>Install App</span>
        </button>
      )}

      {variant === 'banner' && (
        <div 
          onClick={handleClick}
          className="w-full p-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-[#F5D0C0] rounded-2xl flex items-center justify-between cursor-pointer hover:shadow-sm transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-[#E05D25] text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="text-left">
              <span className="text-xs font-bold text-[#1C1917] block">Get the Phone App</span>
              <span className="text-[10px] text-[#78716C] block">Install Omni on your home screen</span>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-[#E05D25] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">
            Install
          </span>
        </div>
      )}

      {variant === 'icon' && (
        <button
          onClick={handleClick}
          className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-white hover:bg-orange-50 active:scale-95 border border-[#F0EEEB] rounded-full text-[#E05D25] shadow-2xs transition-colors cursor-pointer touch-manipulation"
          title="Install Omni App"
          aria-label="Install Omni App"
        >
          <Download className="w-4 h-4" />
        </button>
      )}

      {showModal && <PWAInstallModal onClose={() => setShowModal(false)} />}
    </>
  );
};
