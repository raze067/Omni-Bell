import React from 'react';
import { X, Download, Smartphone, Share, PlusSquare, Check, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallModalProps {
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-[#F5F3F0] w-full max-w-sm rounded-[32px] p-6 sm:p-7 shadow-2xl flex flex-col relative text-center">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[#A8A29E] hover:text-[#1C1917] transition-colors bg-[#FAF9F7] p-2 rounded-full active:scale-95"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#D4541F] to-[#E86732] shadow-[0_8px_20px_-4px_rgba(224,93,37,0.4)] flex items-center justify-center mx-auto mb-4 p-3">
          <img src="/pwa-192x192.png" alt="Omni" className="w-full h-full object-contain rounded-xl" />
        </div>

        <h3 className="font-display font-bold text-2xl text-[#1C1917] mb-1">
          Install Omni App
        </h3>
        <p className="text-xs text-[#78716C] font-medium mb-5 leading-relaxed">
          Add Omni to your home screen for fullscreen experience, faster loading, and background chimes.
        </p>

        {isInstalled ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center gap-2 text-emerald-800 text-xs font-bold mb-4">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Omni is already installed on this device!</span>
          </div>
        ) : isInstallable ? (
          /* Direct Chrome/Android/Desktop Prompt */
          <div className="space-y-4 mb-2">
            <div className="p-4 bg-[#FAF9F7] border border-[#F0EEEB] rounded-2xl text-left space-y-2 text-xs text-[#78716C]">
              <div className="flex items-center gap-2 font-semibold text-[#1C1917]">
                <Sparkles className="w-3.5 h-3.5 text-[#E05D25]" />
                <span>Features when installed:</span>
              </div>
              <p>• Runs fullscreen with zero browser address bar</p>
              <p>• One-tap launch directly from your home screen</p>
              <p>• Fast local caching and instant connectivity</p>
            </div>

            <button
              onClick={handleInstallClick}
              className="w-full py-4 bg-[#E05D25] hover:bg-[#D4541F] active:scale-95 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-[0_10px_20px_-8px_rgba(224,93,37,0.4)] text-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download & Install Now</span>
            </button>
          </div>
        ) : isIOS ? (
          /* Guided iOS Safari Flow */
          <div className="space-y-4 mb-2 text-left">
            <div className="p-4 bg-[#FAF9F7] border border-[#F0EEEB] rounded-2xl space-y-3 text-xs text-[#1C1917]">
              <span className="font-bold text-[10px] text-[#A8A29E] uppercase tracking-wider block">
                How to install on iPhone / iPad (Safari):
              </span>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white border border-[#E5E5E5] flex items-center justify-center text-[#E05D25] font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div className="leading-tight">
                  <span>Tap the </span>
                  <span className="inline-flex items-center gap-1 font-semibold bg-white border border-[#E5E5E5] px-1.5 py-0.5 rounded text-[11px]">
                    <Share className="w-3 h-3 text-[#E05D25]" /> Share
                  </span>
                  <span> button in the Safari bottom bar.</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white border border-[#E5E5E5] flex items-center justify-center text-[#E05D25] font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div className="leading-tight">
                  <span>Scroll down and tap </span>
                  <span className="inline-flex items-center gap-1 font-semibold bg-white border border-[#E5E5E5] px-1.5 py-0.5 rounded text-[11px]">
                    <PlusSquare className="w-3 h-3 text-[#E05D25]" /> Add to Home Screen
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white border border-[#E5E5E5] flex items-center justify-center text-[#E05D25] font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div className="leading-tight">
                  <span>Tap </span>
                  <span className="font-bold text-[#E05D25]">Add</span>
                  <span> in the top-right corner. Omni will appear on your phone screen!</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3.5 bg-[#FAF9F7] hover:bg-[#F0EEEB] active:scale-95 text-[#1C1917] border border-[#E5E5E5] rounded-2xl font-bold transition-all text-xs text-center"
            >
              Got it, thanks!
            </button>
          </div>
        ) : (
          /* General fallback for other browsers */
          <div className="space-y-4 mb-2 text-left">
            <div className="p-4 bg-[#FAF9F7] border border-[#F0EEEB] rounded-2xl space-y-2 text-xs text-[#78716C]">
              <span className="font-semibold text-[#1C1917] block">To install from this browser:</span>
              <p>1. Open your browser settings or menu (three dots <strong>⋮</strong> or browser bar).</p>
              <p>2. Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3.5 bg-[#FAF9F7] hover:bg-[#F0EEEB] active:scale-95 text-[#1C1917] border border-[#E5E5E5] rounded-2xl font-bold transition-all text-xs text-center"
            >
              Understood
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
