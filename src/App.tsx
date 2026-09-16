import React, { useEffect, useState, useRef } from 'react';
import { Bell, Users, History, BellOff, Edit2, Check, X, Sparkles, Volume2, LogOut, ArrowRight, Plus } from 'lucide-react';
import { db } from './firebase';
import { doc, setDoc, onSnapshot, collection, arrayUnion, serverTimestamp, writeBatch } from 'firebase/firestore';

interface ActiveDevice {
  id: string;
  name: string;
  lastSeen: number;
}

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
  const [onlineCount, setOnlineCount] = useState(1);
  const [presenceDocs, setPresenceDocs] = useState<ActiveDevice[]>([]);
  const [activeDevices, setActiveDevices] = useState<ActiveDevice[]>([]);
  const [recentRings, setRecentRings] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const [audioReady, setAudioReady] = useState(false);
  const [serverSkew, setServerSkew] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    'Notification' in window && Notification.permission === 'granted'
  );
  
  const [currentDeviceName, setCurrentDeviceName] = useState(defaultDeviceName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(defaultDeviceName);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localRingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedRingIdRef = useRef<string>('');
  const serverSkewRef = useRef<number>(0);
  const writeStartTimeRef = useRef<number>(0);

  const stopAlarmLocally = () => {
    setRinging(false);
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (localRingTimeoutRef.current) {
      clearTimeout(localRingTimeoutRef.current);
      localRingTimeoutRef.current = null;
    }
  };

  const ensureAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume()
          .then(() => {
            setAudioReady(audioCtxRef.current?.state === 'running');
          })
          .catch((err) => {
            console.error('Error resuming AudioContext:', err);
            setAudioReady(false);
          });
      } else if (audioCtxRef.current.state === 'running') {
        setAudioReady(true);
      }
    }
  };

  const playBellSound = () => {
    ensureAudioContext();
    if (!audioCtxRef.current || audioCtxRef.current.state !== 'running') {
      return;
    }
    const ctx = audioCtxRef.current;
    const t = ctx.currentTime;
    
    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.1);
    };

    playNote(698.46, t, 1.4);        // F5
    playNote(880.00, t + 0.2, 1.2);   // A5
    playNote(1046.50, t + 0.4, 1.0);  // C6
    playNote(1396.91, t + 0.6, 1.6);  // F6
  };

  const triggerAlarmLoopLocally = () => {
    setRinging(true);
    playBellSound();
    
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    alarmIntervalRef.current = setInterval(() => {
      playBellSound();
    }, 2000);

    if (localRingTimeoutRef.current) clearTimeout(localRingTimeoutRef.current);
    localRingTimeoutRef.current = setTimeout(() => {
      stopAlarmLocally();
    }, 15000); // Ring for max 15 seconds locally
  };

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

    // Use Room-specific paths
    const bellDocRef = doc(db, 'rooms', roomId, 'bell', 'state');
    const unsubscribeBell = onSnapshot(bellDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const status = data.status || 'silenced';
        const ringId = data.ringId || '';
        const caller = data.triggeredBy || '';
        const callerDeviceId = data.triggeredById || '';
        
        setCallerName(caller);
        setCallerId(callerDeviceId);
        
        if (status === 'ringing') {
          const isNewRing = ringId !== lastProcessedRingIdRef.current;
          if (isNewRing) {
            let shouldRing = true;
            if (!lastProcessedRingIdRef.current) {
              const lastRingAt = data.lastRingAt || 0;
              const estimatedServerNow = Date.now() + serverSkewRef.current;
              // If the ring is older than 15 seconds, don't ring upon page load
              if (estimatedServerNow - lastRingAt > 15000) {
                shouldRing = false;
              }
            }
            
            lastProcessedRingIdRef.current = ringId;
            if (shouldRing) {
              triggerAlarmLoopLocally();
              
              // Trigger local notification if in background
              if (document.hidden || document.visibilityState !== 'visible') {
                if ('Notification' in window && Notification.permission === 'granted') {
                  const notif = new Notification("Omni Chime", {
                    body: `${caller || 'Someone'} is ringing the chime in room ${roomId}!`,
                    icon: '/favicon.ico'
                  });
                  // Optionally play sound if allowed, but browsers restrict this if in background
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
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.lastSeenServer) {
          let serverTimeMs = Date.now();
          if (typeof data.lastSeenServer.toDate === 'function') {
            serverTimeMs = data.lastSeenServer.toDate().getTime();
          } else if (data.lastSeenServer.seconds) {
            serverTimeMs = data.lastSeenServer.seconds * 1000;
          }

          docs.push({ 
            id: doc.id, 
            name: data.name || 'Unnamed Device', 
            lastSeen: serverTimeMs 
          });

          if (doc.id === deviceId && data.lastSeenLocal) {
            const localTimeMs = data.lastSeenLocal;
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
      handleUnload(); // Call it explicitly on cleanup
      stopAlarmLocally();
      unsubscribeRoom();
    };
  }, [joined, roomId, currentDeviceName]);

  useEffect(() => {
    if (ringing && audioReady) {
      playBellSound();
    }
  }, [ringing, audioReady]);

  // Derive active devices locally so it updates immediately when time passes
  useEffect(() => {
    const estimatedServerNow = now + serverSkew;
    const list = presenceDocs.filter(d => (estimatedServerNow - d.lastSeen) < 25000);
    setActiveDevices(list);
    setOnlineCount(Math.max(1, list.length));
  }, [presenceDocs, now, serverSkew]);

  useEffect(() => {
    if (!joined) return;

    ensureAudioContext();

    const handleInteraction = () => {
      ensureAudioContext();
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
    ensureAudioContext();
    requestNotificationPermission(); // Ask for notifications when joining
    let finalRoomId = joinRoomInput.trim().toUpperCase();
    if (!finalRoomId) {
      // Create a random room if empty
      finalRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    }
    setRoomId(finalRoomId);
    window.location.hash = finalRoomId;
    localStorage.setItem('bell_room_id', finalRoomId);
    localStorage.setItem('bell_joined', 'true');
    setJoined(true);
  };

  const handleRing = async () => {
    ensureAudioContext();

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
        await setDoc(bellDocRef, {
          ringId: newRingId,
          status: 'ringing',
          lastRingAt: estimatedRingTime,
          triggeredBy: currentDeviceName,
          triggeredById: deviceId,
          recentRings: arrayUnion(estimatedRingTime)
        }, { merge: true });
        
        triggerAlarmLoopLocally();
      } catch (err) {
        console.error('Error ringing bell:', err);
      }
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
    // Clear presence
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
        <div className="max-w-sm w-full bg-white rounded-[32px] p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#F5F3F0] flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#E05D25] to-[#FCA5A5]" />
          <div className="w-20 h-20 bg-[#E05D25]/10 rounded-full flex items-center justify-center mb-6 text-[#E05D25]">
            <Bell className="w-10 h-10" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-display font-bold tracking-tight mb-2">Omni</h1>
          <p className="text-[#78716C] mb-8 text-sm leading-relaxed">
            Connect to the spatial chime network. Host or join a room.
          </p>
          
          <form onSubmit={handleJoinOrCreateRoom} className="w-full flex flex-col gap-4">
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
              className="w-full py-4 bg-[#E05D25] hover:bg-[#D4541F] active:scale-95 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-[0_10px_20px_-10px_rgba(224,93,37,0.4)] outline-none"
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
          
          <p className="mt-8 text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider">
            Audio & Notifications requested upon join
          </p>
        </div>
      </div>
    );
  }

  const isSender = callerId === deviceId;

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col items-center pt-20 pb-16 px-6 text-[#1C1917] font-sans">
      
      {/* Audio Suspended Standby Banner */}
      {!audioReady && (
        <div 
          onClick={ensureAudioContext}
          className="fixed top-6 left-6 right-6 z-40 max-w-sm mx-auto bg-white border border-[#F5F3F0] text-[#E05D25] px-5 py-4 rounded-2xl text-sm font-semibold flex items-center justify-center gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.06)] cursor-pointer transition-transform hover:scale-[1.02]"
        >
          <Volume2 className="w-5 h-5 opacity-80" />
          <span className="flex-1">Audio is standby. Tap to enable.</span>
        </div>
      )}
      
      {/* Ringing Overlay */}
      {ringing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#E05D25]/95 backdrop-blur-sm text-white transition-opacity duration-300">
          <div className="relative flex items-center justify-center w-48 h-48 mb-10">
            <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
            <Bell className="w-24 h-24 text-white relative z-10 animate-bounce" strokeWidth={1.5} />
          </div>
          <div className="text-center px-6 max-w-sm mb-12">
            {isSender ? (
              <>
                <h2 className="text-3xl font-display font-bold tracking-tight mb-2">
                  Calling Everyone...
                </h2>
                <p className="text-white/80 text-sm font-medium">They are hearing the chime.</p>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-display font-bold tracking-tight mb-2">
                  {callerName ? callerName : 'Someone'} is calling
                </h2>
                <p className="text-white/80 text-sm font-medium">Sound is ringing on your device.</p>
              </>
            )}
          </div>
          <button
            onClick={handleRing}
            className="flex items-center gap-3 bg-white text-[#E05D25] px-10 py-4 rounded-full font-bold text-base hover:bg-orange-50 active:scale-95 transition-all shadow-xl"
          >
            <BellOff className="w-5 h-5" />
            {isSender ? 'Stop Calling' : 'Silence Chime'}
          </button>
        </div>
      )}

      <div className="flex flex-col items-center relative z-10 w-full max-w-sm">
        
        {/* Header */}
        <div className="mb-12 w-full flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#F5F3F0] rounded-full text-[10px] font-bold text-[#A8A29E] tracking-widest uppercase shadow-sm">
              <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse" />
              Room ID: {roomId}
            </div>
            
            <button 
              onClick={leaveRoom}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#FAF9F7] active:bg-[#F5F3F0] border border-[#F5F3F0] rounded-full text-[10px] font-bold text-[#E05D25] tracking-widest uppercase shadow-sm transition-colors"
            >
              <LogOut className="w-3 h-3" />
              Leave
            </button>
          </div>
          
          <h1 className="text-xl font-bold tracking-widest text-[#E05D25] uppercase mb-4 opacity-80">Omni</h1>
          
          {isEditingRoomName ? (
            <form 
              onSubmit={(e) => { e.preventDefault(); saveRoomName(tempRoomName); }}
              className="flex items-center justify-center gap-2 w-full max-w-xs px-4"
            >
              <input
                type="text"
                value={tempRoomName}
                onChange={(e) => setTempRoomName(e.target.value)}
                className="w-full px-2 py-2 text-3xl sm:text-4xl font-display font-bold text-center border-b-2 border-[#E05D25] bg-transparent outline-none"
                autoFocus
                onBlur={() => saveRoomName(tempRoomName)}
                maxLength={24}
              />
            </form>
          ) : (
            <div 
              className="group flex items-center justify-center gap-2 cursor-pointer relative w-full"
              onClick={() => { setTempRoomName(roomName); setIsEditingRoomName(true); }}
            >
              <h2 className="text-4xl sm:text-5xl font-display font-bold tracking-tighter text-center w-full truncate px-8">
                {roomName}
              </h2>
              <button className="absolute right-0 p-2 text-gray-300 group-hover:text-[#E05D25] transition-colors rounded-full sm:-right-8">
                <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          )}
          
          <p className="text-[#78716C] text-sm font-medium text-center mt-4">
            {ringing ? 'Broadcasting chime...' : 'Tap the bell to call everyone.'}
          </p>
        </div>

        {/* Tactile Bell Button */}
        <div className="relative mb-20 flex justify-center w-full">
          <button
            onClick={handleRing}
            className={`
              flex items-center justify-center w-64 h-64 rounded-full cursor-pointer
              transition-all duration-300 outline-none
              ${ringing 
                ? 'bg-[#CC511E] text-white shadow-inner scale-95' 
                : 'bg-[#E05D25] text-white hover:bg-[#E86732] hover:scale-[1.02] active:scale-95 shadow-[0_24px_48px_-12px_rgba(224,93,37,0.35)]'
              }
            `}
          >
            <Bell className={`w-24 h-24 ${ringing ? 'animate-bounce' : ''}`} strokeWidth={1.5} />
          </button>
        </div>

        {/* Info Cards */}
        <div className="w-full space-y-4">
          
          {/* Presence Card */}
          <div className="bg-white border border-[#F5F3F0] rounded-[24px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-[#A8A29E]" />
                <h3 className="text-xs font-bold text-[#A8A29E] tracking-widest uppercase">Presence</h3>
              </div>
              <button 
                onClick={openRenameModal}
                className="text-xs font-bold text-[#E05D25] hover:text-[#CC511E] transition-colors flex items-center gap-1.5 px-3 py-1 bg-[#E05D25]/10 rounded-full"
              >
                <Edit2 className="w-3 h-3" />
                Rename
              </button>
            </div>
            
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between p-2 -mx-2 rounded-xl bg-[#FAF9F7]">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#E05D25] rounded-full" />
                  <span className="text-sm font-semibold text-[#1C1917]">{currentDeviceName}</span>
                </div>
                <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider">You</span>
              </div>
              
              {activeDevices.filter(d => d.id !== deviceId).map((device) => (
                <div key={device.id} className="flex items-center gap-2 px-2">
                  <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full" />
                  <span className="text-sm font-medium text-[#78716C]">{device.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* History Card */}
          <div className="bg-white border border-[#F5F3F0] rounded-[24px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            <div className="flex items-center gap-2.5 mb-5">
              <History className="w-4 h-4 text-[#A8A29E]" />
              <h3 className="text-xs font-bold text-[#A8A29E] tracking-widest uppercase">History</h3>
            </div>
            
            {recentRings.length === 0 ? (
              <p className="text-sm text-[#78716C] font-medium text-center py-4">No recent activity.</p>
            ) : (
              <div className="space-y-4">
                {recentRings.map((timestamp, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${index === 0 ? 'text-[#1C1917]' : 'text-[#A8A29E]'}`}>
                      {index === 0 ? 'Latest Summon' : 'Previous Summon'}
                    </span>
                    <span className="text-xs font-bold text-[#A8A29E] bg-[#FAF9F7] px-2 py-1 rounded-md">
                      {formatRelativeTime(timestamp, now)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
        </div>
      </div>

      {/* Rename Modal */}
      {isEditingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/20 backdrop-blur-sm transition-opacity">
          <div className="bg-white border border-[#F5F3F0] w-full max-w-sm rounded-[32px] p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-bold text-2xl text-[#1C1917]">Device Name</h3>
              <button onClick={() => setIsEditingName(false)} className="text-[#A8A29E] hover:text-[#1C1917] transition-colors bg-[#FAF9F7] p-2 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[#78716C] font-medium mb-6 leading-relaxed">
              Identify this device so others know who is ringing the chime.
            </p>
            <input 
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="e.g. Living Room"
              maxLength={20}
              autoFocus
              className="w-full px-5 py-4 bg-[#FAF9F7] border border-[#E5E5E5] rounded-2xl text-base font-semibold mb-6 outline-none focus:border-[#E05D25] focus:ring-2 focus:ring-[#E05D25]/20 transition-all"
            />
            <button 
              onClick={() => saveDeviceName(tempName)}
              className="w-full py-4 bg-[#E05D25] hover:bg-[#D4541F] text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 active:scale-95 shadow-[0_8px_16px_-4px_rgba(224,93,37,0.3)]"
            >
              <Check className="w-5 h-5" strokeWidth={3} />
              Save Name
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
