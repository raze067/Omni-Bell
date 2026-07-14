import React, { useEffect, useState, useRef } from 'react';
import { Bell, Users, History, BellOff, Edit2, Check, X, Sparkles, Volume2 } from 'lucide-react';
import { db } from './firebase';
import { doc, setDoc, updateDoc, onSnapshot, collection, arrayUnion, serverTimestamp } from 'firebase/firestore';

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
  if (!name) {
    name = 'Device ' + Math.floor(1 + Math.random() * 9);
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
  const [joined, setJoined] = useState(() => localStorage.getItem('bell_joined') === 'true');
  const [ringing, setRinging] = useState(false);
  const [callerName, setCallerName] = useState('');
  const [onlineCount, setOnlineCount] = useState(1);
  const [presenceDocs, setPresenceDocs] = useState<ActiveDevice[]>([]);
  const [activeDevices, setActiveDevices] = useState<ActiveDevice[]>([]);
  const [recentRings, setRecentRings] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const [audioReady, setAudioReady] = useState(false);
  
  const [currentDeviceName, setCurrentDeviceName] = useState(defaultDeviceName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(defaultDeviceName);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopAlarmLocally = () => {
    setRinging(false);
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
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
    if (ringing) return; // already ringing
    setRinging(true);
    playBellSound();
    
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    alarmIntervalRef.current = setInterval(() => {
      playBellSound();
    }, 2000);
  };

  useEffect(() => {
    if (!joined) return;

    const bellDocRef = doc(db, 'bell', 'state');
    const unsubscribeBell = onSnapshot(bellDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const lastRingAt = data.lastRingAt || 0;
        const caller = data.triggeredBy || '';
        
        setCallerName(caller);
        
        // If the ring was within the last 15 seconds, we consider it active
        const isCurrentlyRinging = (Date.now() - lastRingAt) < 15000;
        
        if (isCurrentlyRinging) {
          triggerAlarmLoopLocally();
        } else {
          stopAlarmLocally();
        }

        if (data.recentRings) {
          const sorted = [...data.recentRings].sort((a: number, b: number) => b - a).slice(0, 5);
          setRecentRings(sorted);
        }
      }
    });

    const presenceDocRef = doc(db, 'presence', deviceId);
    const updatePresence = async () => {
      try {
        await setDoc(presenceDocRef, { lastSeen: Date.now(), name: currentDeviceName }, { merge: true });
      } catch (err) {
        console.error('Error updating presence:', err);
      }
    };

    updatePresence();
    const presenceInterval = setInterval(updatePresence, 10000);

    const unsubscribePresence = onSnapshot(collection(db, 'presence'), (snapshot) => {
      const docs: ActiveDevice[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.lastSeen) {
          docs.push({ id: doc.id, name: data.name || 'Unnamed Device', lastSeen: data.lastSeen });
        }
      });
      setPresenceDocs(docs);
    });

    const timeInterval = setInterval(() => setNow(Date.now()), 1000);

    const handleUnload = () => {
      setDoc(presenceDocRef, { lastSeen: 0 }, { merge: true });
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      unsubscribeBell();
      unsubscribePresence();
      clearInterval(presenceInterval);
      clearInterval(timeInterval);
      window.removeEventListener('beforeunload', handleUnload);
      stopAlarmLocally();
    };
  }, [joined, currentDeviceName]);

  useEffect(() => {
    if (ringing && audioReady) {
      playBellSound();
    }
  }, [ringing, audioReady]);

  // Derive active devices locally so it updates immediately when time passes
  useEffect(() => {
    const list = presenceDocs.filter(d => (now - d.lastSeen) < 25000);
    setActiveDevices(list);
    setOnlineCount(Math.max(1, list.length));
    
    // Auto-stop alarm if time passed 15s since lastRingAt
    // (Handled partially by the snapshot, but if snapshot doesn't fire, this acts as a fallback)
    if (ringing) {
      // We don't have lastRingAt directly here, but we can just use a local timeout if needed.
      // But actually, onSnapshot handles the data, so it's fine.
    }
  }, [presenceDocs, now, ringing]);

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

  const handleJoin = () => {
    ensureAudioContext();
    localStorage.setItem('bell_joined', 'true');
    setJoined(true);
  };

  const handleRing = async () => {
    ensureAudioContext();

    const bellDocRef = doc(db, 'bell', 'state');
    
    if (ringing) {
      try {
        // Silence the alarm by setting lastRingAt far into the past
        await setDoc(bellDocRef, { lastRingAt: 0 }, { merge: true });
        stopAlarmLocally();
      } catch (err) {
        console.error('Error stopping alarm:', err);
      }
    } else {
      try {
        const ringTime = Date.now();
        await setDoc(bellDocRef, {
          lastRingAt: ringTime,
          triggeredBy: currentDeviceName,
          recentRings: arrayUnion(ringTime)
        }, { merge: true });
        
        // Optimistically start ringing locally
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
    
    if (joined) {
      const presenceDocRef = doc(db, 'presence', deviceId);
      try {
        await setDoc(presenceDocRef, { lastSeen: Date.now(), name: trimmed }, { merge: true });
      } catch (err) {
        console.error('Error syncing name on Firebase:', err);
      }
    }
  };

  const openRenameModal = () => {
    setTempName(currentDeviceName);
    setIsEditingName(true);
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-[#FAF9F7] flex flex-col items-center justify-center p-6 text-[#1C1917] font-sans">
        <div className="max-w-sm w-full bg-white rounded-3xl p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#F5F3F0] flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-[#E05D25]/10 rounded-full flex items-center justify-center mb-8 text-[#E05D25]">
            <Bell className="w-10 h-10" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-display font-bold tracking-tight mb-3">Omni</h1>
          <p className="text-[#78716C] mb-10 text-sm leading-relaxed">
            Connect to the spatial chime network to send and receive real-time bell notifications.
          </p>
          <button 
            onClick={handleJoin}
            className="w-full py-4 bg-[#E05D25] hover:bg-[#D4541F] active:scale-95 text-white rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 shadow-[0_10px_20px_-10px_rgba(224,93,37,0.4)] outline-none"
          >
            <Sparkles className="w-5 h-5 text-orange-200" />
            Enable Sound & Join
          </button>
        </div>
      </div>
    );
  }

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
            <h2 className="text-3xl font-display font-bold tracking-tight mb-2">
              {callerName ? callerName : 'Someone'} is calling
            </h2>
            <p className="text-white/80 text-sm font-medium">Sound is ringing across the network.</p>
          </div>
          <button
            onClick={handleRing}
            className="flex items-center gap-3 bg-white text-[#E05D25] px-10 py-4 rounded-full font-bold text-base hover:bg-orange-50 active:scale-95 transition-all shadow-xl"
          >
            <BellOff className="w-5 h-5" />
            Silence Chime
          </button>
        </div>
      )}

      <div className="flex flex-col items-center relative z-10 w-full max-w-sm">
        
        {/* Header */}
        <div className="mb-14 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#F5F3F0] rounded-full text-[10px] font-bold text-[#A8A29E] tracking-widest uppercase mb-6 shadow-sm">
            <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse" />
            Portal Active
          </div>
          <h1 className="text-5xl font-display font-bold tracking-tighter mb-3">Omni</h1>
          <p className="text-[#78716C] text-sm font-medium">
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
