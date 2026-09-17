import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell } from 'lucide-react';

interface StartupAnimationProps {
  onComplete: () => void;
  appName?: string;
}

export const StartupAnimation: React.FC<StartupAnimationProps> = ({ 
  onComplete, 
  appName = 'Omni' 
}) => {
  const [phase, setPhase] = useState<'intro' | 'resonating' | 'exit'>('intro');

  useEffect(() => {
    // Stage 1: Initial resonance pulse
    const timer1 = setTimeout(() => {
      setPhase('resonating');
    }, 450);

    // Stage 2: Smooth exit and reveal main app
    const timer2 = setTimeout(() => {
      setPhase('exit');
    }, 1250);

    // Stage 3: Complete transition
    const timer3 = setTimeout(() => {
      onComplete();
    }, 1500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onComplete]);

  // Tap anywhere to skip instantly
  const handleSkip = () => {
    onComplete();
  };

  return (
    <AnimatePresence>
      {phase !== 'exit' && (
        <motion.div
          key="omni-startup"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          onClick={handleSkip}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#FAF9F7] select-none cursor-pointer overflow-hidden"
          style={{ touchAction: 'none' }}
        >
          {/* Ambient Acoustic Background Glow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 0.7, scale: [0.8, 1.2, 1] }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="absolute w-96 h-96 rounded-full bg-gradient-to-tr from-[#E05D25]/15 via-[#F97316]/10 to-transparent blur-3xl pointer-events-none"
          />

          {/* Concentric Acoustic Resonance Rings */}
          <div className="relative flex items-center justify-center w-48 h-48 sm:w-56 sm:h-56">
            
            {/* Wave 3 (Outer) */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ 
                scale: [0.6, 1.55, 1.75], 
                opacity: [0, 0.45, 0] 
              }}
              transition={{ duration: 1.4, ease: [0.25, 1, 0.5, 1], delay: 0.15 }}
              className="absolute inset-0 rounded-full border border-[#E05D25]/30 pointer-events-none"
            />

            {/* Wave 2 (Middle) */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ 
                scale: [0.7, 1.35, 1.5], 
                opacity: [0, 0.6, 0] 
              }}
              transition={{ duration: 1.2, ease: [0.25, 1, 0.5, 1], delay: 0.08 }}
              className="absolute inset-0 rounded-full border border-[#E05D25]/40 pointer-events-none"
            />

            {/* Wave 1 (Inner pulse) */}
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ 
                scale: [0.8, 1.2, 1.25], 
                opacity: [0, 0.8, 0] 
              }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full border-2 border-[#E05D25]/50 pointer-events-none"
            />

            {/* Central Chime Resonator Disc */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
              animate={{ 
                scale: [0.6, 1.08, 1], 
                opacity: 1, 
                rotate: [0, -3, 3, 0] 
              }}
              transition={{ 
                duration: 0.75, 
                ease: [0.34, 1.56, 0.64, 1] 
              }}
              className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-[#E05D25] via-[#E86732] to-[#CC511E] shadow-[0_16px_36px_-8px_rgba(224,93,37,0.45)] flex items-center justify-center text-white"
            >
              {/* Inner subtle specular sheen */}
              <div className="absolute inset-1 rounded-full border border-white/25 pointer-events-none" />
              
              <motion.div
                animate={{ 
                  scale: [1, 1.15, 1],
                  rotate: [0, -6, 6, 0] 
                }}
                transition={{ 
                  duration: 0.6, 
                  delay: 0.25, 
                  ease: 'easeInOut' 
                }}
              >
                <Bell className="w-10 h-10 sm:w-12 sm:h-12 text-white" strokeWidth={1.75} />
              </motion.div>
            </motion.div>
          </div>

          {/* Soundwave Frequency Equalizer Bars */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="flex items-center gap-1.5 mt-6 mb-4 h-6"
          >
            {[0.4, 0.8, 1, 0.65, 0.9, 0.5, 0.3].map((heightRatio, i) => (
              <motion.div
                key={i}
                animate={{
                  height: [
                    `${heightRatio * 14}px`,
                    `${heightRatio * 24}px`,
                    `${heightRatio * 10}px`,
                    `${heightRatio * 18}px`
                  ]
                }}
                transition={{
                  repeat: Infinity,
                  repeatType: 'reverse',
                  duration: 0.55 + (i * 0.08),
                  ease: 'easeInOut'
                }}
                className="w-1 bg-[#E05D25] rounded-full"
                style={{ opacity: 0.4 + (i % 3) * 0.2 }}
              />
            ))}
          </motion.div>

          {/* App Name & Typography */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.45 }}
            className="text-center"
          >
            <h1 className="text-2xl sm:text-3xl font-display font-black tracking-[0.25em] text-[#1C1917] uppercase pl-1">
              {appName}
            </h1>
            <p className="text-[11px] font-semibold text-[#A8A29E] tracking-widest uppercase mt-1">
              Spatial Chime Network
            </p>
          </motion.div>

          {/* Tap anywhere hint */}
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.8, duration: 0.3 }}
            className="absolute bottom-8 text-[10px] text-[#A8A29E] font-medium tracking-wider"
          >
            Tap anywhere to launch
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
