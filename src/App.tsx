import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { 
  Bell, 
  Users, 
  History, 
  Edit2, 
  Check, 
  X, 
  Sparkles, 
  Volume2, 
  LogOut, 
  ArrowRight, 
  Plus, 
  SlidersHorizontal, 
  QrCode, 
  Radio, 
  MessageSquare, 
  XCircle,
  Smartphone
} from 'lucide-react';
import { db } from './firebase';
import { doc, setDoc, onSnapshot, collection, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { ActiveDevice, SoundTone, CallPresetTag, Acknowledgment, BellState } from './types';
import { playTone, ensureAudioRunning, unlockPersistentAudio, isAudioAuthorized } from './utils/audio';
import { ShareModal } from './components/ShareModal';
import { SettingsModal } from './components/SettingsModal';
import { CallOverlay } from './components/CallOverlay';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PWAInstallModal } from './components/PWAInstallModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { StartupAnimation } from './components/StartupAnimation';

const deviceId = (() => {
  let id = localStorage.getItem('bell_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('bell_device_id', id);
  }
  return id;
})();

const defaultDeviceName = (() => {
  let name = localStorage.getItem('bell_device_name');
  if (!name || name.match(/^Device \d$/)) {
    name = 'Device ' + Math.floor(1000 + Math.random() * 9000);
    localStorage.setItem('bell_device_name', name);
  }
  return name;
})();

function formatRelativeTime(date: number, now: number) {
  const diffInSeconds = Math.floor((now - date) / 1000);
  if (diffInSeconds < 10) return 'just now';
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return diffInMinutes === 1 ? '1m ago' : `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return diffInHours === 1 ? '1h ago' : `${diffInHours}h ago`;
  return 'a while ago';
}

const PRESET_TAGS: CallPresetTag[] = [
  { id: 'general', label: 'General', emoji: '🔔' },
  { id: 'dinner', label: 'Dinner Ready', emoji: '🍲' },
  { id: 'doorbell', label: 'Doorbell', emoji: '📦' },
  { id: 'question', label: 'Quick Question', emoji: '💬' },
  { id: 'urgent', label: 'Urgent', emoji: '🚨' },
];

export default function App() {
  const [roomId, setRoomId] = useState<string>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    return localStorage.getItem('bell_room_id') || '';
  });
  const [joinRoomInput, setJoinRoomInput] = useState(roomId);
  const [joined, setJoined] = useState(() => localStorage.getItem('bell_joined') === 'true');
  
  const [roomName, setRoomName] = useState(roomId);
  const [isEditingRoomName, setIsEditingRoomName] = useState(false);
  const [tempRoomName, setTempRoomName] = useState('');

  const [ringing, setRinging] = useState(false);
  const [callerName, setCallerName] = useState('');
  const [callerId, setCallerId] = useState('');
  const [incomingTag, setIncomingTag] = useState<string>('');
  const [incomingTargetName, setIncomingTargetName] = useState<string>('');
  const [lastAck, setLastAck] = useState<Acknowledgment | null>(null);

  const [selectedTag, setSelectedTag] = useState<CallPresetTag>(PRESET_TAGS[0]);
  const [targetDevice, setTargetDevice] = useState<ActiveDevice | null>(null);

  const [soundTone, setSoundTone] = useState<SoundTone>(() => {
    return (localStorage.getItem('omni_sound_tone') as SoundTone) || 'classic';
  });

  const [showShareModal, setShowShareModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Cool startup animation on initial open
  const [showStartup, setShowStartup] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('omni_startup_shown');
  });

  const handleStartupComplete = useCallback(() => {
    try {
      sessionStorage.setItem('omni_startup_shown', 'true');
    } catch (e) {}
    setShowStartup(false);
  }, []);

  const [presenceDocs, setPresenceDocs] = useState<ActiveDevice[]>([]);
  const [recentRings, setRecentRings] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const [audioReady, setAudioReady] = useState(false);
  const [serverSkew, setServerSkew] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    'Notification' in window && Notification.permission === 'granted'
  );

  // Performance-optimized memoized device lists (zero redundant re-renders)
  const activeDevices = useMemo(() => {
    const estimatedServerNow = now + serverSkew;
    return presenceDocs.filter(d => (estimatedServerNow - d.lastSeen) < 25000);
  }, [presenceDocs, now, serverSkew]);

  const otherDevices = useMemo(() => {
    return activeDevices.filter(d => d.id !== deviceId);
  }, [activeDevices]);

  // Wake Lock state
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockSentinelRef = useRef<any>(null);
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  
  const [currentDeviceName, setCurrentDeviceName] = useState(defaultDeviceName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(defaultDeviceName);
  
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localRingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedRingIdRef = useRef<string>('');
  const serverSkewRef = useRef<number>(0);
  const writeStartTimeRef = useRef<number>(0);
  const soundToneRef = useRef<SoundTone>(soundTone);

  useEffect(() => {
    soundToneRef.current = soundTone;
    localStorage.setItem('omni_sound_tone', soundTone);
  }, [soundTone]);

  const triggerVibration = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([300, 150, 300, 150, 500]);
      } catch (e) {}
    }
  };

  const stopVibration = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch (e) {}
    }
  };

  const stopAlarmLocally = () => {
    setRinging(false);
    stopVibration();
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (localRingTimeoutRef.current) {
      clearTimeout(localRingTimeoutRef.current);
      localRingTimeoutRef.current = null;
    }
  };

  const triggerAlarmLoopLocally = () => {
    setRinging(true);
    playTone(soundToneRef.current);
    triggerVibration();
    
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    alarmIntervalRef.current = setInterval(() => {
      playTone(soundToneRef.current);
      triggerVibration();
    }, 2200);

    if (localRingTimeoutRef.current) clearTimeout(localRingTimeoutRef.current);
    localRingTimeoutRef.current = setTimeout(() => {
      stopAlarmLocally();
    }, 18000); // Ring for max 18 seconds locally
  };

  // Wake Lock handling
  const toggleWakeLock = async () => {
    if (!wakeLockSupported) return;
    if (wakeLockActive) {
      if (wakeLockSentinelRef.current) {
        try {
          await wakeLockSentinelRef.current.release();
        } catch (e) {}
        wakeLockSentinelRef.current = null;
      }
      setWakeLockActive(false);
      localStorage.setItem('omni_wake_lock', 'false');
    } else {
      try {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinelRef.current = sentinel;
        setWakeLockActive(true);
        localStorage.setItem('omni_wake_lock', 'true');
        sentinel.addEventListener('release', () => {
          setWakeLockActive(false);
          wakeLockSentinelRef.current = null;
        });
      } catch (err) {
        console.warn('Wake Lock request error:', err);
      }
    }
  };

  useEffect(() => {
    if (wakeLockSupported && localStorage.getItem('omni_wake_lock') === 'true') {
      toggleWakeLock();
    }
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        localStorage.getItem('omni_wake_lock') === 'true' &&
        !wakeLockSentinelRef.current &&
        wakeLockSupported
      ) {
        (navigator as any).wakeLock.request('screen').then((sentinel: any) => {
          wakeLockSentinelRef.current = sentinel;
          setWakeLockActive(true);
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinelRef.current) {
        wakeLockSentinelRef.current.release().catch(() => {});
      }
    };
  }, []);

  // Main Room & Presence Firestore Sync
  useEffect(() => {
    if (!joined || !roomId) return;

    // Listen to Room Metadata
    const roomDocRef = doc(db, 'rooms', roomId);
    const unsubscribeRoom = onSnapshot(roomDocRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().name) {
        setRoomName(docSnap.data().name);
      } else {
        setRoomName(roomId);
      }
    });

    // Listen to Bell state
    const bellDocRef = doc(db, 'rooms', roomId, 'bell', 'state');
    const unsubscribeBell = onSnapshot(bellDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as BellState;
        const status = data.status || 'silenced';
        const ringId = data.ringId || '';
        const caller = data.triggeredBy || '';
        const callerDeviceId = data.triggeredById || '';
        
        setCallerName(caller);
        setCallerId(callerDeviceId);
        setIncomingTag(data.tag || '');
        setIncomingTargetName(data.targetDeviceName || '');
        
        if (data.lastAcknowledgment) {
          setLastAck(data.lastAcknowledgment);
        }
        
        if (status === 'ringing') {
          const isNewRing = ringId !== lastProcessedRingIdRef.current;
          const isDirectForSomeoneElse = data.targetDeviceId && data.targetDeviceId !== deviceId && callerDeviceId !== deviceId;

          if (isNewRing) {
            let shouldRing = !isDirectForSomeoneElse;
            if (!lastProcessedRingIdRef.current) {
              const lastRingAt = data.lastRingAt || 0;
              const estimatedServerNow = Date.now() + serverSkewRef.current;
              // If the ring is older than 18 seconds, don't ring upon fresh load
              if (estimatedServerNow - lastRingAt > 18000) {
                shouldRing = false;
              }
            }
            
            lastProcessedRingIdRef.current = ringId;
            if (shouldRing) {
              triggerAlarmLoopLocally();
              
              // Trigger notification if browser in background
              if (document.hidden || document.visibilityState !== 'visible') {
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification("Omni Chime", {
                    body: `${caller || 'Someone'} is ringing ${data.tag || 'the chime'} in ${roomName || roomId}!`,
                    icon: '/favicon.ico'
                  });
                }
              }
            } else {
              stopAlarmLocally();
            }
          }
        } else if (status === 'silenced') {
          lastProcessedRingIdRef.current = ringId;
          stopAlarmLocally();
        }

        if (data.recentRings) {
          const sorted = [...data.recentRings].sort((a: number, b: number) => b - a).slice(0, 5);
          setRecentRings(sorted);
        }
      }
    }, (error) => {
      console.error('Firestore Bell state stream error:', error);
    });

    const presenceDocRef = doc(db, 'rooms', roomId, 'presence', deviceId);
    const updatePresence = async () => {
      try {
        writeStartTimeRef.current = Date.now();
        await setDoc(presenceDocRef, { 
          lastSeenLocal: Date.now(),
          lastSeenServer: serverTimestamp(),
          name: currentDeviceName 
        }, { merge: true });
      } catch (err) {
        console.error('Error updating presence:', err);
      }
    };

    updatePresence();
    const presenceInterval = setInterval(updatePresence, 10000);

    const unsubscribePresence = onSnapshot(collection(db, 'rooms', roomId, 'presence'), (snapshot) => {
      const docs: ActiveDevice[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.lastSeenServer) {
          let serverTimeMs = Date.now();
          if (typeof data.lastSeenServer.toDate === 'function') {
            serverTimeMs = data.lastSeenServer.toDate().getTime();
          } else if (data.lastSeenServer.seconds) {
            serverTimeMs = data.lastSeenServer.seconds * 1000;
          }

          docs.push({ 
            id: docSnap.id, 
            name: data.name || 'Unnamed Device', 
            lastSeen: serverTimeMs 
          });

          if (docSnap.id === deviceId && data.lastSeenLocal) {
            const rtt = Date.now() - writeStartTimeRef.current;
            const estimatedServerTimeAtReceipt = serverTimeMs + (rtt / 2);
            const computedSkew = estimatedServerTimeAtReceipt - Date.now();
            
            setServerSkew(computedSkew);
            serverSkewRef.current = computedSkew;
          }
        }
      });
      setPresenceDocs(docs);
    }, (error) => {
      console.error('Firestore Presence stream error:', error);
    });

    const timeInterval = setInterval(() => setNow(Date.now()), 5000);

    const handleUnload = () => {
      setDoc(presenceDocRef, { lastSeenServer: null }, { merge: true });
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      unsubscribeBell();
      unsubscribePresence();
      clearInterval(presenceInterval);
      clearInterval(timeInterval);
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
      stopAlarmLocally();
      unsubscribeRoom();
    };
  }, [joined, roomId, currentDeviceName]);

  // Persistent Always-On Audio initialization
  useEffect(() => {
    if (!joined) return;

    // If audio was previously authorized, eagerly unlock and prime it
    if (isAudioAuthorized()) {
      unlockPersistentAudio().then(ready => setAudioReady(ready));
    } else {
      ensureAudioRunning().then(ready => setAudioReady(ready));
    }

    const handleInteraction = () => {
      unlockPersistentAudio().then(ready => setAudioReady(ready));
    };

    window.addEventListener('click', handleInteraction, { passive: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true });

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [joined]);

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

  const handleJoinOrCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    unlockPersistentAudio().then(ready => setAudioReady(ready));
    requestNotificationPermission();
    let finalRoomId = joinRoomInput.trim().toUpperCase();
    if (!finalRoomId) {
      finalRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    }
    setRoomId(finalRoomId);
    window.location.hash = finalRoomId;
    localStorage.setItem('bell_room_id', finalRoomId);
    localStorage.setItem('bell_joined', 'true');
    setJoined(true);
  };

  const joinRoomById = (id: string) => {
    unlockPersistentAudio().then(ready => setAudioReady(ready));
    requestNotificationPermission();
    const finalRoomId = id.trim().toUpperCase();
    setRoomId(finalRoomId);
    window.location.hash = finalRoomId;
    localStorage.setItem('bell_room_id', finalRoomId);
    localStorage.setItem('bell_joined', 'true');
    setJoined(true);
  };

  const handleRing = async () => {
    unlockPersistentAudio().then(ready => setAudioReady(ready));
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(35); } catch (e) {}
    }

    const bellDocRef = doc(db, 'rooms', roomId, 'bell', 'state');
    
    if (ringing) {
      try {
        await setDoc(bellDocRef, { status: 'silenced' }, { merge: true });
        stopAlarmLocally();
      } catch (err) {
        console.error('Error stopping alarm:', err);
      }
    } else {
      try {
        const estimatedRingTime = Date.now() + serverSkewRef.current;
        const newRingId = 'ring_' + estimatedRingTime + '_' + Math.random().toString(36).substring(2, 9);
        
        const payload: any = {
          ringId: newRingId,
          status: 'ringing',
          lastRingAt: estimatedRingTime,
          triggeredBy: currentDeviceName,
          triggeredById: deviceId,
          recentRings: arrayUnion(estimatedRingTime),
          tag: selectedTag ? `${selectedTag.emoji} ${selectedTag.label}` : '🔔 General Chime',
        };

        if (targetDevice) {
          payload.targetDeviceId = targetDevice.id;
          payload.targetDeviceName = targetDevice.name;
        } else {
          payload.targetDeviceId = null;
          payload.targetDeviceName = null;
        }

        await setDoc(bellDocRef, payload, { merge: true });
        triggerAlarmLoopLocally();
      } catch (err) {
        console.error('Error ringing bell:', err);
      }
    }
  };

  const handleAcknowledge = async (text: string) => {
    if (!roomId) return;
    const bellDocRef = doc(db, 'rooms', roomId, 'bell', 'state');
    try {
      const ack: Acknowledgment = {
        text,
        by: currentDeviceName,
        deviceId,
        timestamp: Date.now()
      };
      await setDoc(bellDocRef, {
        status: 'silenced',
        lastAcknowledgment: ack
      }, { merge: true });
      stopAlarmLocally();
    } catch (err) {
      console.error('Error acknowledging call:', err);
    }
  };

  const saveDeviceName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    localStorage.setItem('bell_device_name', trimmed);
    setCurrentDeviceName(trimmed);
    setIsEditingName(false);
    
    if (joined && roomId) {
      const presenceDocRef = doc(db, 'rooms', roomId, 'presence', deviceId);
      try {
        writeStartTimeRef.current = Date.now();
        await setDoc(presenceDocRef, { 
          lastSeenLocal: Date.now(),
          lastSeenServer: serverTimestamp(),
          name: trimmed 
        }, { merge: true });
      } catch (err) {
        console.error('Error syncing name on Firebase:', err);
      }
    }
  };

  const openRenameModal = () => {
    setTempName(currentDeviceName);
    setIsEditingName(true);
  };

  const leaveRoom = () => {
    if (joined && roomId) {
      const presenceDocRef = doc(db, 'rooms', roomId, 'presence', deviceId);
      setDoc(presenceDocRef, { lastSeenServer: null }, { merge: true });
    }
    setJoined(false);
    setRoomId('');
    setJoinRoomInput('');
    window.location.hash = '';
    localStorage.removeItem('bell_joined');
    localStorage.removeItem('bell_room_id');
    stopAlarmLocally();
  };

  const saveRoomName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setIsEditingRoomName(false);
      return;
    }
    setIsEditingRoomName(false);
    
    if (joined && roomId) {
      try {
        await setDoc(doc(db, 'rooms', roomId), { name: trimmed }, { merge: true });
      } catch (err) {
        console.error('Error saving room name:', err);
      }
    }
  };

  if (!joined || !roomId) {
    return (
      <div className="min-h-screen bg-[#FAF9F7] flex flex-col items-center justify-center p-4 sm:p-6 text-[#1C1917] font-sans relative selection:bg-[#E05D25]/20">
        {/* Startup Animation on Cold Boot */}
        {showStartup && (
          <StartupAnimation 
            onComplete={handleStartupComplete} 
            appName="Omni" 
          />
        )}

        <div className="max-w-md w-full bg-white rounded-[32px] p-7 sm:p-9 shadow-[0_12px_40px_rgb(0,0,0,0.04)] border border-[#F0EEEB] flex flex-col items-center text-center relative overflow-hidden">
          {/* Subtle top accent bar */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#E05D25] via-[#F97316] to-[#FCA5A5]" />
          
          {/* Acoustic Chime Emblem */}
          <div className="relative flex items-center justify-center w-20 h-20 mb-5">
            <div className="absolute inset-0 rounded-full bg-[#E05D25]/10 animate-ping opacity-60" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-2 rounded-full border border-[#E05D25]/20" />
            <div className="relative z-10 w-16 h-16 bg-gradient-to-tr from-[#E05D25] to-[#F97316] rounded-full flex items-center justify-center text-white shadow-[0_8px_20px_-4px_rgba(224,93,37,0.4)]">
              <Bell className="w-8 h-8 text-white" strokeWidth={1.75} />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-[#1C1917] mb-1">
            Omni
          </h1>
          <p className="text-[#78716C] mb-7 text-xs sm:text-sm font-medium leading-relaxed max-w-xs">
            Spatial chime and presence network for all your connected devices.
          </p>
          
          <form onSubmit={handleJoinOrCreateRoom} className="w-full flex flex-col gap-3">
            <div className="relative w-full">
              <input 
                type="text"
                value={joinRoomInput}
                onChange={(e) => setJoinRoomInput(e.target.value.toUpperCase())}
                placeholder="Enter Room Code (e.g. XY3V)"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck="false"
                maxLength={12}
                className="w-full px-5 py-4 bg-[#FAF9F7] border border-[#E5E5E5] rounded-2xl text-base font-bold text-center outline-none focus:border-[#E05D25] focus:ring-2 focus:ring-[#E05D25]/20 transition-all uppercase placeholder:normal-case placeholder:font-medium placeholder:text-[#A8A29E]"
              />
              {joinRoomInput && (
                <button
                  type="button"
                  onClick={() => setJoinRoomInput('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-[#A8A29E] hover:text-[#1C1917] bg-white rounded-full border border-[#E5E5E5] transition-colors"
                  aria-label="Clear code"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            
            <button 
              type="submit"
              className="w-full py-4 min-h-[52px] bg-[#E05D25] hover:bg-[#D4541F] active:scale-98 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-[0_12px_24px_-8px_rgba(224,93,37,0.45)] outline-none cursor-pointer touch-manipulation"
            >
              {joinRoomInput.trim() ? (
                <>
                  <ArrowRight className="w-5 h-5" />
                  <span>Join Room {joinRoomInput.trim()}</span>
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  <span>Create New Room</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Alternative Action */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
                joinRoomById(randomId);
              }}
              className="text-xs font-semibold text-[#78716C] hover:text-[#E05D25] transition-colors py-1 px-2"
            >
              or generate random private room
            </button>
          </div>

          <div className="w-full mt-4">
            <PWAInstallButton variant="banner" />
          </div>
          
          <p className="mt-5 text-[10px] font-semibold text-[#A8A29E] uppercase tracking-wider">
            Persistent audio chime unlocked upon room join
          </p>
        </div>
        <OfflineIndicator />
      </div>
    );
  }

  const isSender = callerId === deviceId;
  const recentAckActive = lastAck && (now - lastAck.timestamp < 35000);

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col items-center pt-6 sm:pt-10 pb-16 px-4 sm:px-6 text-[#1C1917] font-sans overflow-x-hidden selection:bg-[#E05D25]/20">
      
      {/* Startup Animation on Cold Boot */}
      {showStartup && (
        <StartupAnimation 
          onComplete={handleStartupComplete} 
          appName="Omni" 
        />
      )}

      {/* Audio Suspended Standby Banner */}
      {!audioReady && (
        <div 
          onClick={() => ensureAudioRunning().then(r => setAudioReady(r))}
          className="fixed top-4 left-4 right-4 z-40 max-w-md mx-auto bg-white border border-[#E05D25]/30 text-[#E05D25] px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between shadow-lg cursor-pointer transition-transform hover:scale-[1.01] active:scale-95 animate-pulse"
        >
          <div className="flex items-center gap-2.5">
            <Volume2 className="w-4 h-4 shrink-0" />
            <span>Audio paused by browser. Tap to enable chime.</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-[#E05D25]/10 px-2 py-0.5 rounded-md">
            Enable
          </span>
        </div>
      )}

      {/* Ringing Fullscreen Call Overlay */}
      {ringing && (
        <CallOverlay
          isSender={isSender}
          callerName={callerName}
          targetDeviceName={incomingTargetName}
          tag={incomingTag}
          lastAcknowledgment={lastAck || undefined}
          onSilence={handleRing}
          onAcknowledge={handleAcknowledge}
        />
      )}

      <div className="flex flex-col items-center relative z-10 w-full max-w-md mx-auto">
        
        {/* Top Control Bar: Optimized for all screens */}
        <div className="w-full flex items-center justify-between gap-2 mb-6 sm:mb-8">
          {/* Room ID Badge & Share Trigger */}
          <div className="flex items-center gap-2 min-w-0">
            <button 
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-orange-50 border border-[#F0EEEB] rounded-full text-[11px] font-bold text-[#1C1917] tracking-wider uppercase shadow-2xs transition-all active:scale-95 cursor-pointer touch-manipulation"
              title="Invite & Share Room Code"
              aria-label={`Room code ${roomId}, tap to share`}
            >
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
              <span className="truncate max-w-[80px] sm:max-w-none">{roomId}</span>
              <QrCode className="w-3.5 h-3.5 text-[#E05D25] shrink-0" />
            </button>

            {/* Network Latency Indicator */}
            <div className="hidden xs:inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold text-[#78716C] bg-white px-2.5 py-1.5 rounded-full border border-[#F0EEEB] shadow-2xs shrink-0">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span>{Math.abs(Math.round(serverSkew))}ms</span>
            </div>
          </div>

          {/* Action Buttons Group (Comfortable touch targets >= 40px) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton variant="icon" />
            
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-white hover:bg-[#FAF9F7] active:scale-95 border border-[#F0EEEB] rounded-full text-[#78716C] hover:text-[#E05D25] shadow-2xs transition-all cursor-pointer touch-manipulation"
              title="Preferences, Tones & Volume"
              aria-label="Settings and Preferences"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            
            <button 
              onClick={leaveRoom}
              className="h-9 sm:h-10 px-3 bg-white hover:bg-rose-50 active:scale-95 border border-[#F0EEEB] hover:border-rose-200 rounded-full text-[11px] font-bold text-rose-600 tracking-wider uppercase shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer touch-manipulation"
              title="Leave Room"
              aria-label="Leave Room"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>

        {/* Brand & Room Name Header */}
        <div className="mb-6 sm:mb-8 w-full flex flex-col items-center">
          <span className="text-[11px] font-black tracking-[0.25em] text-[#E05D25] uppercase mb-1.5 pl-0.5">
            Omni
          </span>
          
          {isEditingRoomName ? (
            <form 
              onSubmit={(e) => { e.preventDefault(); saveRoomName(tempRoomName); }}
              className="flex items-center justify-center gap-2 w-full max-w-xs px-2"
            >
              <input
                type="text"
                value={tempRoomName}
                onChange={(e) => setTempRoomName(e.target.value)}
                className="w-full px-2 py-1.5 text-2xl sm:text-3xl font-display font-bold text-center border-b-2 border-[#E05D25] bg-transparent outline-none"
                autoFocus
                onBlur={() => saveRoomName(tempRoomName)}
                maxLength={24}
              />
            </form>
          ) : (
            <div 
              className="group flex items-center justify-center gap-2 cursor-pointer relative w-full"
              onClick={() => { setTempRoomName(roomName); setIsEditingRoomName(true); }}
              title="Tap to rename room"
            >
              <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-center truncate px-2">
                {roomName}
              </h2>
              <span 
                className="text-[#A8A29E] group-hover:text-[#E05D25] transition-colors p-1 rounded-full"
                aria-label="Rename room"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </span>
            </div>
          )}
          
          <p className="text-[#78716C] text-xs font-medium text-center mt-1.5">
            Ready • Tap the bell to alert devices
          </p>
        </div>

        {/* Live Acknowledgment Toast Banner */}
        {recentAckActive && (
          <div className="w-full mb-5 p-3.5 bg-white border border-emerald-200 rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in duration-300">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="text-left truncate">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block truncate">
                  {lastAck.by} responded:
                </span>
                <span className="text-xs font-semibold text-[#1C1917] block truncate">
                  "{lastAck.text}"
                </span>
              </div>
            </div>
            <span className="text-[10px] text-[#A8A29E] font-medium shrink-0 ml-2">
              {formatRelativeTime(lastAck.timestamp, now)}
            </span>
          </div>
        )}

        {/* Call Context Preset Tags: Smooth Touch Snapping */}
        <div className="w-full mb-6">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] font-bold text-[#A8A29E] tracking-widest uppercase">
              Call Reason
            </span>
            <span className="text-[11px] font-semibold text-[#78716C]">
              {selectedTag.label}
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x -mx-2 px-2">
            {PRESET_TAGS.map(tag => {
              const isSelected = selectedTag.id === tag.id;
              return (
                <button
                  key={tag.id}
                  onClick={() => setSelectedTag(tag)}
                  className={`snap-start px-3.5 py-2 min-h-[38px] rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 cursor-pointer border touch-manipulation ${
                    isSelected
                      ? 'bg-[#E05D25] text-white border-[#E05D25] shadow-xs'
                      : 'bg-white text-[#78716C] hover:text-[#1C1917] border-[#F0EEEB]'
                  }`}
                >
                  <span className="mr-1.5">{tag.emoji}</span>
                  <span>{tag.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Targeted Device Indicator (if device paging is active) */}
        {targetDevice && (
          <div className="w-full mb-4 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs animate-in fade-in">
            <div className="flex items-center gap-2 text-amber-900 font-semibold truncate">
              <Radio className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="truncate">Direct paging to: {targetDevice.name}</span>
            </div>
            <button
              onClick={() => setTargetDevice(null)}
              className="text-amber-700 hover:text-amber-900 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1 ml-2 shrink-0 cursor-pointer p-1"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Broadcast</span>
            </button>
          </div>
        )}

        {/* Tactile Bell Button with Concentric Acoustic Rings */}
        <div className="relative my-6 sm:my-8 flex justify-center w-full">
          {/* Ambient Acoustic Aura Rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-72 h-72 sm:w-80 sm:h-80 rounded-full border border-[#E05D25]/15 ${ringing ? 'animate-ping' : ''}`} />
            <div className="absolute w-64 h-64 sm:w-72 sm:h-72 rounded-full border border-[#E05D25]/20" />
          </div>

          <button
            onClick={handleRing}
            aria-label="Ring the chime"
            className={`
              relative z-10 flex flex-col items-center justify-center w-56 h-56 sm:w-64 sm:h-64 rounded-full cursor-pointer
              transition-all duration-300 outline-none select-none active:scale-95 touch-manipulation
              ${ringing 
                ? 'bg-[#CC511E] text-white shadow-inner scale-95 ring-8 ring-[#E05D25]/25' 
                : 'bg-gradient-to-br from-[#E05D25] via-[#E86732] to-[#D4541F] text-white hover:scale-[1.02] shadow-[0_24px_48px_-12px_rgba(224,93,37,0.4)]'
              }
            `}
          >
            <Bell className={`w-20 h-20 sm:w-24 sm:h-24 ${ringing ? 'animate-bounce' : ''}`} strokeWidth={1.5} />
            <span className="mt-2.5 text-xs font-bold uppercase tracking-widest text-white/90">
              {ringing ? 'Silence' : (targetDevice ? `Page ${targetDevice.name}` : 'Ring Everyone')}
            </span>
          </button>
        </div>

        {/* Info Cards Container */}
        <div className="w-full space-y-4 mt-4">
          
          {/* Presence Card */}
          <div className="bg-white border border-[#F0EEEB] rounded-[24px] p-5 sm:p-6 shadow-[0_8px_24px_rgb(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#A8A29E]" />
                <h3 className="text-xs font-bold text-[#A8A29E] tracking-widest uppercase">
                  Connected ({activeDevices.length})
                </h3>
              </div>
              <button 
                onClick={openRenameModal}
                className="text-xs font-bold text-[#E05D25] hover:text-[#CC511E] transition-colors flex items-center gap-1.5 px-3 py-1.5 bg-[#E05D25]/10 rounded-full cursor-pointer active:scale-95"
              >
                <Edit2 className="w-3 h-3" />
                Rename You
              </button>
            </div>
            
            <div className="flex flex-col gap-2.5">
              {/* Current Device ("You") */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF9F7] border border-[#F0EEEB]">
                <div className="flex items-center gap-2.5 truncate">
                  <span className="w-2.5 h-2.5 bg-[#E05D25] rounded-full shrink-0 shadow-xs" />
                  <span className="text-sm font-bold text-[#1C1917] truncate">{currentDeviceName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-[#E5E5E5]">
                    This Device
                  </span>
                  <button
                    onClick={openRenameModal}
                    className="p-1 text-[#A8A29E] hover:text-[#E05D25] transition-colors"
                    title="Rename this device"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              
              {/* Other Devices with 1-Tap Direct Paging */}
              {otherDevices.length === 0 ? (
                <div className="py-3 text-center text-xs text-[#A8A29E] font-medium">
                  Waiting for other devices to join room {roomId}...
                </div>
              ) : (
                otherDevices.map((device) => {
                  const isTargeted = targetDevice?.id === device.id;
                  return (
                    <div 
                      key={device.id} 
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-colors ${
                        isTargeted ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-[#F0EEEB]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                        <span className="text-sm font-semibold text-[#1C1917] truncate">{device.name}</span>
                      </div>

                      <button
                        onClick={() => setTargetDevice(isTargeted ? null : device)}
                        className={`text-xs font-bold px-3 py-1.5 min-h-[34px] rounded-xl transition-all active:scale-95 cursor-pointer touch-manipulation ${
                          isTargeted
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-[#FAF9F7] hover:bg-orange-50 text-[#78716C] hover:text-[#E05D25] border border-[#E5E5E5]'
                        }`}
                        title={isTargeted ? 'Reset to call everyone' : `Page only ${device.name}`}
                      >
                        {isTargeted ? 'Targeted' : 'Page'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* History Card */}
          <div className="bg-white border border-[#F0EEEB] rounded-[24px] p-5 sm:p-6 shadow-[0_8px_24px_rgb(0,0,0,0.02)]">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-[#A8A29E]" />
              <h3 className="text-xs font-bold text-[#A8A29E] tracking-widest uppercase">Activity Log</h3>
            </div>
            
            {recentRings.length === 0 ? (
              <p className="text-xs text-[#78716C] font-medium text-center py-3">No chimes yet in this room.</p>
            ) : (
              <div className="space-y-2.5">
                {recentRings.map((timestamp, index) => (
                  <div key={index} className="flex items-center justify-between text-xs py-1">
                    <span className={`font-semibold ${index === 0 ? 'text-[#1C1917]' : 'text-[#78716C]'}`}>
                      {index === 0 ? 'Latest Chime' : 'Previous Chime'}
                    </span>
                    <span className="font-bold text-[#A8A29E] bg-[#FAF9F7] px-2 py-1 rounded-md border border-[#F0EEEB]">
                      {formatRelativeTime(timestamp, now)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
        </div>
      </div>

      {/* Share / QR Modal */}
      {showShareModal && (
        <ShareModal 
          roomId={roomId}
          roomName={roomName}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Preferences / Tones Modal */}
      {showSettingsModal && (
        <SettingsModal
          currentTone={soundTone}
          onSelectTone={(tone) => setSoundTone(tone)}
          wakeLockActive={wakeLockActive}
          onToggleWakeLock={toggleWakeLock}
          wakeLockSupported={wakeLockSupported}
          notificationsEnabled={notificationsEnabled}
          onRequestNotifications={requestNotificationPermission}
          onOpenInstallModal={() => setShowInstallModal(true)}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* PWA Install Guide Modal */}
      {showInstallModal && (
        <PWAInstallModal
          onClose={() => setShowInstallModal(false)}
        />
      )}

      {/* Connectivity Alert */}
      <OfflineIndicator />

      {/* Rename Device Modal */}
      {isEditingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-[#F5F3F0] w-full max-w-sm rounded-[32px] p-7 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-bold text-xl text-[#1C1917]">Your Device Name</h3>
              <button 
                onClick={() => setIsEditingName(false)} 
                className="text-[#A8A29E] hover:text-[#1C1917] transition-colors bg-[#FAF9F7] p-2 rounded-full active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[#78716C] font-medium mb-5 leading-relaxed">
              Identify this device so room members know who is chiming.
            </p>
            <input 
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="e.g. Kitchen Tablet"
              maxLength={20}
              autoFocus
              className="w-full px-4 py-3.5 bg-[#FAF9F7] border border-[#E5E5E5] rounded-2xl text-sm font-semibold mb-5 outline-none focus:border-[#E05D25] focus:ring-2 focus:ring-[#E05D25]/20 transition-all"
            />
            <button 
              onClick={() => saveDeviceName(tempName)}
              className="w-full py-3.5 bg-[#E05D25] hover:bg-[#D4541F] text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm cursor-pointer text-sm"
            >
              <Check className="w-4 h-4" strokeWidth={3} />
              Save Name
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
