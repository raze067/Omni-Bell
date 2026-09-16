import React, { useEffect, useState } from 'react';
import { X, Copy, Check, Share2, QrCode } from 'lucide-react';
import QRCode from 'qrcode';

interface ShareModalProps {
  roomId: string;
  roomName: string;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ roomId, roomName, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}#${roomId}`
    : '';

  useEffect(() => {
    if (shareUrl) {
      QRCode.toDataURL(shareUrl, {
        width: 220,
        margin: 1.5,
        color: {
          dark: '#1C1917',
          light: '#FFFFFF'
        }
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('QR code error:', err));
    }
  }, [shareUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${roomName} on Omni`,
          text: `Join the spatial chime room "${roomName}" with code ${roomId}`,
          url: shareUrl
        });
      } catch (err) {
        // User dismissed or aborted
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/30 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-[#F5F3F0] w-full max-w-sm rounded-[32px] p-7 shadow-2xl flex flex-col items-center text-center relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[#A8A29E] hover:text-[#1C1917] transition-colors bg-[#FAF9F7] p-2 rounded-full active:scale-95"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 bg-[#E05D25]/10 rounded-full flex items-center justify-center mb-3 text-[#E05D25]">
          <QrCode className="w-6 h-6" />
        </div>

        <h3 className="font-display font-bold text-2xl text-[#1C1917] mb-1">
          Share Room
        </h3>
        <p className="text-xs text-[#78716C] font-medium mb-5 max-w-[260px]">
          Scan to connect phone, laptop, or tablet instantly without typing.
        </p>

        {/* QR Code Container */}
        <div className="p-3 bg-white border border-[#F0EEEB] rounded-2xl shadow-sm mb-5 flex items-center justify-center min-h-[190px] min-w-[190px]">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Room QR Code" className="w-44 h-44 rounded-lg object-contain" />
          ) : (
            <div className="w-44 h-44 flex items-center justify-center text-xs text-[#A8A29E]">Generating QR...</div>
          )}
        </div>

        {/* Room Code Pill */}
        <div className="w-full flex items-center justify-between p-3.5 bg-[#FAF9F7] border border-[#E5E5E5] rounded-2xl mb-3">
          <div className="text-left pl-1">
            <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider block">Room Code</span>
            <span className="text-lg font-mono font-bold text-[#1C1917] tracking-widest">{roomId}</span>
          </div>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-orange-50 border border-[#E5E5E5] rounded-xl text-xs font-bold text-[#E05D25] transition-all active:scale-95 shadow-sm"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex gap-2">
          <button
            onClick={handleCopyLink}
            className="flex-1 py-3.5 bg-[#FAF9F7] hover:bg-[#F3F1ED] active:scale-95 border border-[#E5E5E5] text-[#1C1917] rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-600">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#78716C]" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          {'share' in navigator && (
            <button
              onClick={handleNativeShare}
              className="py-3.5 px-4 bg-[#E05D25] hover:bg-[#D4541F] active:scale-95 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
