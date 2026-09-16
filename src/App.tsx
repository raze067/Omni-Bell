import React, { useEffect, useState, useRef } from 'react';
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
import { playTone, ensureAudioRunning } from './utils/audio';
import { ShareModal } from './components/ShareModal';
import { SettingsModal } from './components/SettingsModal';
import { CallOverlay } from './components/CallOverlay';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PWAInstallModal } from './components/PWAInstallModal';
import { OfflineIndicator } from './components/OfflineIndicator';

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

  const [presenceDocs, setPresenceDocs] = useState<ActiveDevice[]>([]);
  const [activeDevices, setActiveDevices] = useState<ActiveDevice[]>([]);
  const [recentRings, setRecentRings] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const [audioReady, setAudioReady] = useState(false);
  const [serverSkew, setServerSkew] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    'Notification' in window && Notification.permission === 'granted'
  );

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

    const timeInterval = setInterval(() => setNow(Date.now()), 1000);

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

  // Derive active devices locally
  useEffect(() => {
    const estimatedServerNow = now + serverSkew;
    const list = presenceDocs.filter(d => (estimatedServerNow - d.lastSeen) < 25000);
    setActiveDevices(list);
  }, [presenceDocs, now, serverSkew]);

  // Unlock audio context on initial interaction
  useEffect(() => {
    if (!joined) return;

    ensureAudioRunning().then(ready => setAudioReady(ready));

    const handleInteraction = () => {
      ensureAudioRunning().then(ready => setAudioReady(ready));
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);

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
    ensureAudioRunning().then(ready => setAudioReady(ready));
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

  const handleRing = async () => {
    ensureAudioRunning().then(ready => setAudioReady(ready));
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
      <div className="min-h-screen bg-[#FAF9F7] flex flex-col items-center justify-center p-6 text-[#1C1917] font-sans">
        <div className="max-w-sm w-full bg-white rounded-[32px] p-8 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#F5F3F0] flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#E05D25] to-[#FCA5A5]" />
          <div className="w-20 h-20 bg-[#E05D25]/10 rounded-full flex items-center justify-center mb-6 text-[#E05D25]">
            <Bell className="w-10 h-10" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-display font-bold tracking-tight mb-2">Omni</h1>
          <p className="text-[#78716C] mb-8 text-sm leading-relaxed">
            Connect to the spatial chime network. Host or join a room.
          </p>
          
          <form onSubmit={handleJoinOrCreateRoom} className="w-full flex flex-col gap-3.5">
            <div className="relative">
              <input 
                type="text"
                value={joinRoomInput}
                onChange={(e) => setJoinRoomInput(e.target.value.toUpperCase())}
                placeholder="Enter Room Code (e.g. XY3V)"
                className="w-full px-5 py-4 bg-[#FAF9F7] border border-[#E5E5E5] rounded-2xl text-base font-semibold text-center outline-none focus:border-[#E05D25] focus:ring-2 focus:ring-[#E05D25]/20 transition-all uppercase placeholder:normal-case placeholder:font-medium placeholder:text-[#A8A29E]"
              />
            </div>
            
            <button 
              type="submit"
              className="w-full py-4 bg-[#E05D25] hover:bg-[#D4541F] active:scale-95 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-[0_10px_20px_-10px_rgba(224,93,37,0.4)] outline-none cursor-pointer"
            >
              {joinRoomInput ? (
                <>
                  <ArrowRight className="w-5 h-5" />
                  Join Room
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Create New Room
                </>
              )}
            </button>
          </form>

          <div className="w-full mt-5">
            <PWAInstallButton variant="banner" />
          </div>
          
          <p className="mt-6 text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider">
            Audio & Network chime requested upon join
          </p>
        </div>
        <OfflineIndicator />
      </div>
    );
  }

  const isSender = callerId === deviceId;
  const recentAckActive = lastAck && (now - lastAck.timestamp < 35000);

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col items-center pt-8 sm:pt-12 pb-16 px-4 sm:px-6 text-[#1C1917] font-sans overflow-x-hidden">
      
      {/* Audio Suspended Standby Banner */}
      {!audioReady && (
        <div 
          onClick={() => ensureAudioRunning().then(r => setAudioReady(r))}
          className="fixed top-4 left-4 right-4 z-40 max-w-sm mx-auto bg-white border border-[#E05D25]/30 text-[#E05D25] px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between shadow-lg cursor-pointer transition-transform hover:scale-[1.01] active:scale-95 animate-pulse"
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

      <div className="flex flex-col items-center relative z-10 w-full max-w-sm">
        
        {/* Top Control Bar */}
        <div className="w-full flex items-center justify-between mb-8">
          {/* Room ID Badge & Share Trigger */}
          <button 
            onClick={() => setShowShareModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-orange-50 border border-[#F5F3F0] rounded-full text-[11px] font-bold text-[#1C1917] tracking-wider uppercase shadow-sm transition-all active:scale-95"
            title="Invite & Share Room"
          >
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span>{roomId}</span>
            <QrCode className="w-3.5 h-3.5 text-[#E05D25]" />
          </button>

          {/* Network Latency Indicator */}
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold text-[#A8A29E] bg-white px-2.5 py-1 rounded-full border border-[#F5F3F0] shadow-2xs">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            <span>{Math.abs(Math.round(serverSkew))}ms</span>
          </div>

          {/* Preferences, Install & Leave Controls */}
          <div className="flex items-center gap-1.5">
            <PWAInstallButton variant="icon" />
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="p-2 bg-white hover:bg-[#FAF9F7] active:scale-95 border border-[#F5F3F0] rounded-full text-[#78716C] hover:text-[#E05D25] shadow-sm transition-colors cursor-pointer"
              title="Preferences, Tones & Volume"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={leaveRoom}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-rose-50 active:scale-95 border border-[#F5F3F0] rounded-full text-[10px] font-bold text-rose-600 tracking-wider uppercase shadow-sm transition-colors cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              Leave
            </button>
          </div>
        </div>

        {/* Brand & Room Name Header */}
        <div className="mb-8 w-full flex flex-col items-center">
          <h1 className="text-xs font-bold tracking-widest text-[#E05D25] uppercase mb-2">
            Omni
          </h1>
          
          {isEditingRoomName ? (
            <form 
              onSubmit={(e) => { e.preventDefault(); saveRoomName(tempRoomName); }}
              className="flex items-center justify-center gap-2 w-full max-w-xs px-2"
            >
              <input
                type="text"
                value={tempRoomName}
                onChange={(e) => setTempRoomName(e.target.value)}
                className="w-full px-2 py-1.5 text-3xl font-display font-bold text-center border-b-2 border-[#E05D25] bg-transparent outline-none"
                autoFocus
                onBlur={() => saveRoomName(tempRoomName)}
                maxLength={24}
              />
            </form>
          ) : (
            <div 
              className="group flex items-center justify-center gap-1.5 cursor-pointer relative w-full"
              onClick={() => { setTempRoomName(roomName); setIsEditingRoomName(true); }}
            >
              <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-center truncate px-6">
                {roomName}
              </h2>
              <button 
                className="text-gray-300 group-hover:text-[#E05D25] transition-colors p-1 rounded-full"
                aria-label="Rename room"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <p className="text-[#78716C] text-xs font-medium text-center mt-2">
            Tap the bell to alert connected devices.
          </p>
        </div>

        {/* Live Acknowledgment Toast Banner */}
        {recentAckActive && (
          <div className="w-full mb-6 p-3 bg-white border border-emerald-200 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in duration-300">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                  {lastAck.by} responded:
                </span>
                <span className="text-xs font-semibold text-[#1C1917]">
                  "{lastAck.text}"
                </span>
              </div>
            </div>
            <span className="text-[10px] text-[#A8A29E] font-medium shrink-0">
              {formatRelativeTime(lastAck.timestamp, now)}
            </span>
          </div>
        )}

        {/* Call Context Preset Tags */}
        <div className="w-full mb-6">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] font-bold text-[#A8A29E] tracking-widest uppercase">
              Call Reason
            </span>
            <span className="text-[10px] font-medium text-[#78716C]">
              {selectedTag.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none -mx-1 px-1">
            {PRESET_TAGS.map(tag => {
              const isSelected = selectedTag.id === tag.id;
              return (
                <button
                  key={tag.id}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 cursor-pointer border ${
                    isSelected
                      ? 'bg-[#E05D25] text-white border-[#E05D25] shadow-xs'
                      : 'bg-white text-[#78716C] hover:text-[#1C1917] border-[#F0EEEB]'
                  }`}
                >
                  <span className="mr-1">{tag.emoji}</span>
                  <span>{tag.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Targeted Device Indicator (if device paging is active) */}
        {targetDevice && (
          <div className="w-full mb-4 px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-amber-900 font-semibold truncate">
              <Radio className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">Direct paging to: {targetDevice.name}</span>
            </div>
            <button
              onClick={() => setTargetDevice(null)}
              className="text-amber-700 hover:text-amber-900 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1 ml-2 shrink-0 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Broadcast</span>
            </button>
          </div>
        )}

        {/* Tactile Bell Button */}
        <div className="relative mb-14 flex justify-center w-full">
          <button
            onClick={handleRing}
            aria-label="Ring the chime"
            className={`
              flex flex-col items-center justify-center w-60 h-60 sm:w-64 sm:h-64 rounded-full cursor-pointer
              transition-all duration-300 outline-none select-none active:scale-95
              ${ringing 
                ? 'bg-[#CC511E] text-white shadow-inner scale-95 ring-8 ring-[#E05D25]/20' 
                : 'bg-[#E05D25] text-white hover:bg-[#E86732] hover:scale-[1.02] shadow-[0_24px_48px_-12px_rgba(224,93,37,0.35)]'
              }
            `}
          >
            <Bell className={`w-20 h-20 sm:w-24 sm:h-24 ${ringing ? 'animate-bounce' : ''}`} strokeWidth={1.5} />
            <span className="mt-2 text-xs font-bold uppercase tracking-widest opacity-80">
              {ringing ? 'Silence' : (targetDevice ? 'Page Device' : 'Ring Everyone')}
            </span>
          </button>
        </div>

        {/* Info Cards */}
        <div className="w-full space-y-4">
          
          {/* Presence Card */}
          <div className="bg-white border border-[#F5F3F0] rounded-[24px] p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#A8A29E]" />
                <h3 className="text-xs font-bold text-[#A8A29E] tracking-widest uppercase">
                  Connected ({activeDevices.length})
                </h3>
              </div>
              <button 
                onClick={openRenameModal}
                className="text-xs font-bold text-[#E05D25] hover:text-[#CC511E] transition-colors flex items-center gap-1.5 px-3 py-1 bg-[#E05D25]/10 rounded-full cursor-pointer"
              >
                <Edit2 className="w-3 h-3" />
                Rename You
              </button>
            </div>
            
            <div className="flex flex-col gap-2.5">
              {/* Current Device ("You") */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF9F7] border border-[#F0EEEB]">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 bg-[#E05D25] rounded-full shrink-0" />
                  <span className="text-sm font-semibold text-[#1C1917] truncate">{currentDeviceName}</span>
                </div>
                <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-[#E5E5E5] shrink-0">
                  This Device
                </span>
              </div>
              
              {/* Other Devices with 1-Tap Paging */}
              {activeDevices.filter(d => d.id !== deviceId).length === 0 ? (
                <div className="py-2 text-center text-xs text-[#A8A29E]">
                  Waiting for other devices to join room {roomId}...
                </div>
              ) : (
                activeDevices.filter(d => d.id !== deviceId).map((device) => {
                  const isTargeted = targetDevice?.id === device.id;
                  return (
                    <div 
                      key={device.id} 
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                        isTargeted ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-[#F0EEEB]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                        <span className="text-sm font-medium text-[#1C1917] truncate">{device.name}</span>
                      </div>

                      <button
                        onClick={() => setTargetDevice(isTargeted ? null : device)}
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all active:scale-95 cursor-pointer ${
                          isTargeted
                            ? 'bg-amber-500 text-white'
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
          <div className="bg-white border border-[#F5F3F0] rounded-[24px] p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-[#A8A29E]" />
              <h3 className="text-xs font-bold text-[#A8A29E] tracking-widest uppercase">Activity Log</h3>
            </div>
            
            {recentRings.length === 0 ? (
              <p className="text-xs text-[#78716C] font-medium text-center py-3">No chimes yet in this room.</p>
            ) : (
              <div className="space-y-3">
                {recentRings.map((timestamp, index) => (
                  <div key={index} className="flex items-center justify-between text-xs">
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
