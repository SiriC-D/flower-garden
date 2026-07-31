"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Leaf,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  Circle,
  Droplet,
  RefreshCw,
  Users,
  Heart,
  Undo2,
  Redo2,
  Download,
  Trash2,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Minimum time a visitor must wait between planting flowers (client-side throttle
// to discourage casual spam; real abuse prevention should also live in Supabase
// RLS / an Edge Function, since anything client-side can be bypassed).
const PLANT_COOLDOWN_MS = 15000;

// How many undo steps to keep in memory. The canvas is small (450x450) so each
// snapshot is cheap, but we still cap it so a long doodling session can't grow forever.
const MAX_HISTORY = 20;

const COLORS = [
  '#E91E63', // Pink
  '#FFCDD2', // Light Pink
  '#FFEB3B', // Yellow
  '#81D4FA', // Light Blue
  '#2E7D32', // Green
];

const BRUSH_TYPES = {
  NORMAL: 'normal',
  GLOW: 'glow',
  SPRAY: 'spray',
  FLOWER: 'flower'
};

const THICKNESS_OPTIONS = [2, 4, 8, 12];

export default function FlowerGarden() {
  const [flowers, setFlowers] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [customColor, setCustomColor] = useState('#FF69B4');
  const [brushType, setBrushType] = useState(BRUSH_TYPES.NORMAL);
  const [thickness, setThickness] = useState(4);
  const [showGallery, setShowGallery] = useState(false);
  const [message, setMessage] = useState('');
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [userId, setUserId] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Undo/redo history lives in refs (not state) since we don't want every
  // brush stroke to trigger a re-render; canUndo/canRedo mirror it for the UI.
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // --- Core Utility Functions ---

  const getCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const xVisual = clientX - rect.left;
    const yVisual = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = xVisual * scaleX;
    const y = yVisual * scaleY;
    
    return { x, y };
  }, []);

  const drawGlow = useCallback((ctx, x, y) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, thickness * 2);
    gradient.addColorStop(0, selectedColor);
    gradient.addColorStop(0.5, selectedColor + '80');
    gradient.addColorStop(1, selectedColor + '00');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, thickness * 2, 0, Math.PI * 2);
    ctx.fill();
  }, [selectedColor, thickness]);

  const drawSpray = useCallback((ctx, x, y) => {
    const numDots = 15;
    const radius = thickness * 2;
    
    for (let i = 0; i < numDots; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      const dotX = x + Math.cos(angle) * distance;
      const dotY = y + Math.sin(angle) * distance;
      const dotSize = Math.random() * 2 + 1;
      
      ctx.fillStyle = selectedColor;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [selectedColor, thickness]);

  const drawFlower = useCallback((ctx, x, y) => {
    const petalCount = 5;
    const petalSize = thickness * 1.5;
    
    // Draw petals
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2;
      const petalX = x + Math.cos(angle) * petalSize;
      const petalY = y + Math.sin(angle) * petalSize;
      
      ctx.fillStyle = selectedColor;
      ctx.beginPath();
      ctx.arc(petalX, petalY, petalSize * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw center
    ctx.fillStyle = '#FFEB3B';
    ctx.beginPath();
    ctx.arc(x, y, petalSize * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }, [selectedColor, thickness]);

  // --- Undo / Redo ---

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || historyRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    redoRef.current.push(current);

    const previous = historyRef.current.pop();
    ctx.putImageData(previous, 0, 0);

    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || redoRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(current);

    const next = redoRef.current.pop();
    ctx.putImageData(next, 0, 0);

    setCanRedo(redoRef.current.length > 0);
    setCanUndo(true);
  }, []);

  const resetHistory = useCallback(() => {
    historyRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const startDrawing = useCallback((e) => {
    const { x, y } = getCoords(e);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    pushHistory();
    
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    setIsDrawing(true);
    
    // Draw initial point based on brush type
    if (brushType === BRUSH_TYPES.GLOW) {
      drawGlow(ctx, x, y);
    } else if (brushType === BRUSH_TYPES.SPRAY) {
      drawSpray(ctx, x, y);
    } else if (brushType === BRUSH_TYPES.FLOWER) {
      drawFlower(ctx, x, y);
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }, [getCoords, selectedColor, thickness, brushType, drawGlow, drawSpray, drawFlower, pushHistory]);

  const stopDrawing = useCallback(() => setIsDrawing(false), []);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    
    const { x, y } = getCoords(e);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (brushType === BRUSH_TYPES.GLOW) {
      drawGlow(ctx, x, y);
    } else if (brushType === BRUSH_TYPES.SPRAY) {
      drawSpray(ctx, x, y);
    } else if (brushType === BRUSH_TYPES.FLOWER) {
      drawFlower(ctx, x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.moveTo(x, y);
    }
  }, [getCoords, isDrawing, brushType, drawGlow, drawSpray, drawFlower]);

  // --- Event Handlers for Touch ---

  const handleTouchStart = useCallback((e) => {
    e.preventDefault(); 
    startDrawing(e);
  }, [startDrawing]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    draw(e);
  }, [draw]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    stopDrawing();
  }, [stopDrawing]);

  // --- useEffect to Attach Touch Listeners ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // --- Auth: sign visitors in anonymously so they can own & delete their flowers ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUserId(session.user.id);
          return;
        }
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        setUserId(data.user?.id ?? null);
      } catch (error) {
        console.error('Error signing in anonymously:', error);
      }
    };
    initAuth();
  }, []);

  // --- Supabase Storage Functions ---

  const loadFlowers = async () => {
    try {
      const { data, error } = await supabase
        .from('flowers')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100); // Limit to 100 most recent flowers

      if (error) throw error;
      
      setFlowers(data || []);
    } catch (error) {
      console.error('Error loading flowers:', error);
      setMessage('Failed to load flowers 😢');
      setTimeout(() => setMessage(''), 3000);
      setFlowers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    loadFlowers();
  }, []);

  // --- Realtime: new/removed flowers appear instantly for everyone ---
  useEffect(() => {
    const channel = supabase
      .channel('flowers-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'flowers' },
        (payload) => {
          setFlowers((prev) =>
            prev.some((f) => f.id === payload.new.id) ? prev : [payload.new, ...prev]
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'flowers' },
        (payload) => {
          setFlowers((prev) =>
            prev.map((f) => (f.id === payload.new.id ? payload.new : f))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'flowers' },
        (payload) => {
          setFlowers((prev) => prev.filter((f) => f.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // --- Presence: live "gardeners online" count ---
  useEffect(() => {
    const presenceChannel = supabase.channel('garden-presence', {
      config: { presence: { key: crypto.randomUUID() } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setOnlineCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, []);

  // --- Client-side cooldown so one visitor can't flood the garden ---
  // This reads a value from localStorage (an external source) once on mount.
  // We intentionally keep it as an effect + direct setState rather than a
  // lazy useState initializer: this component renders on the server first
  // (where localStorage doesn't exist), so computing it during render would
  // cause a hydration mismatch between server and client output.
  useEffect(() => {
    const lastPlantedAt = Number(localStorage.getItem('flowerGardenLastPlantedAt') || 0);
    const remaining = PLANT_COOLDOWN_MS - (Date.now() - lastPlantedAt);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (remaining > 0) setCooldownRemaining(remaining);
  }, []);

  const isOnCooldown = cooldownRemaining > 0;
  useEffect(() => {
    if (!isOnCooldown) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOnCooldown]);

  const refreshGarden = async () => {
    setRefreshing(true);
    await loadFlowers();
    setRefreshing(false);
    setMessage('🌸 Garden refreshed! 🌸');
    setTimeout(() => setMessage(''), 2000);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMessage('');
    resetHistory();
  };

  const plantFlower = async () => {
    if (cooldownRemaining > 0) {
      setMessage(`Whoa, one at a time! Wait ${Math.ceil(cooldownRemaining / 1000)}s 🌱`);
      setTimeout(() => setMessage(''), 2000);
      return;
    }

    if (!userId) {
      setMessage('Still connecting you to the garden, one sec... 🌱');
      setTimeout(() => setMessage(''), 2000);
      return;
    }

    const canvas = canvasRef.current;
    const imageData = canvas.toDataURL('image/png');
    const ctx = canvas.getContext('2d');
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const isEmpty = !pixelData.data.some(channel => channel !== 0);
    
    if (isEmpty) {
      setMessage('Draw something first! 🎨');
      setTimeout(() => setMessage(''), 2000);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('flowers')
        .insert([
          { 
            image: imageData,
            timestamp: new Date().toISOString(),
            waters: 0,
            user_id: userId
          }
        ])
        .select();

      if (error) throw error;

      // Add the new flower to the beginning of the array (realtime will also
      // deliver this insert to us; the id check there prevents duplicates)
      setFlowers([data[0], ...flowers]);

      localStorage.setItem('flowerGardenLastPlantedAt', String(Date.now()));
      setCooldownRemaining(PLANT_COOLDOWN_MS);

      setMessage('🌸 Planted! 🌸');
      setTimeout(() => setMessage(''), 2000);
      clearCanvas();
    } catch (error) {
      console.error('Error planting flower:', error);
      setMessage('Failed to plant flower 😢');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const waterFlower = async (flower) => {
    const newCount = (flower.waters || 0) + 1;
    setFlowers((prev) =>
      prev.map((f) => (f.id === flower.id ? { ...f, waters: newCount } : f))
    );
    // Uses a Postgres function (see supabase-migration.sql) rather than a raw
    // update, so anyone can bump the water count without also being able to
    // edit the flower's image, owner, or timestamp via RLS.
    const { error } = await supabase.rpc('increment_waters', { flower_id: flower.id });
    if (error) console.error('Error watering flower:', error);
  };

  const deleteFlower = async (flower) => {
    const confirmed = window.confirm('Delete this flower? This can\'t be undone.');
    if (!confirmed) return;

    setFlowers((prev) => prev.filter((f) => f.id !== flower.id));
    const { error } = await supabase.from('flowers').delete().eq('id', flower.id);
    if (error) {
      console.error('Error deleting flower:', error);
      setMessage('Failed to delete flower 😢');
      setTimeout(() => setMessage(''), 3000);
      loadFlowers(); // resync in case the optimistic removal was wrong
    }
  };

  const downloadFlowerImage = (flower) => {
    const link = document.createElement('a');
    link.download = `flower-${flower.id}.png`;
    link.href = flower.image;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportGardenAsImage = async () => {
    if (flowers.length === 0) return;
    setExporting(true);
    try {
      const cols = 6;
      const cellSize = 160;
      const rows = Math.ceil(flowers.length / cols);

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = cols * cellSize;
      exportCanvas.height = rows * cellSize + 60;
      const ctx = exportCanvas.getContext('2d');

      // Background
      ctx.fillStyle = '#DCEDC8';
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      ctx.fillStyle = '#2E7D32';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Community Flower Garden 🌸', exportCanvas.width / 2, 40);

      await Promise.all(
        flowers.map(
          (flower, idx) =>
            new Promise((resolve) => {
              const img = new window.Image();
              img.onload = () => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const cellX = col * cellSize;
                const cellY = row * cellSize + 60;
                const scale = Math.min(cellSize / img.width, cellSize / img.height) * 0.85;
                const w = img.width * scale;
                const h = img.height * scale;
                ctx.drawImage(
                  img,
                  cellX + (cellSize - w) / 2,
                  cellY + (cellSize - h) / 2,
                  w,
                  h
                );
                resolve();
              };
              img.onerror = resolve;
              img.src = flower.image;
            })
        )
      );

      const link = document.createElement('a');
      link.download = `flower-garden-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = exportCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setExporting(false);
    }
  };

  // --- Render Logic ---

  if (showGallery) {
    return (
      <div className="min-h-screen p-4" style={{ 
        background: 'linear-gradient(to bottom, #F0F4C3, #C5E1A5)',
        fontFamily: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive'
      }}>
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-8" style={{ border: '4px solid #81C784' }}>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-5xl font-bold" style={{ color: '#2E7D32', textShadow: '3px 3px 0px #A5D6A7' }}>Flower Gallery</h2>
              <button
                onClick={() => setShowGallery(false)}
                className="px-6 py-3 text-white rounded-full text-xl font-bold shadow-lg transform hover:scale-105 transition"
                style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: '3px solid #2E7D32' }}
              >
                ← Back to Garden
              </button>
            </div>
            
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <p className="text-2xl" style={{ color: '#558B2F' }}>{flowers.length} total flowers 🌺</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
                  style={{ background: '#E8F5E9', color: '#2E7D32', border: '2px solid #81C784' }}
                >
                  <Users size={16} />
                  {onlineCount} gardening now
                </div>
                <button
                  onClick={exportGardenAsImage}
                  disabled={exporting || flowers.length === 0}
                  aria-label="Export the whole garden as an image"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold shadow transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{ background: 'linear-gradient(135deg, #42A5F5, #1E88E5)', color: 'white', border: '2px solid #1565C0' }}
                >
                  <Download size={16} />
                  {exporting ? 'Exporting...' : 'Export garden'}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {flowers.map((flower) => (
                <div key={flower.id} className="bg-white rounded-2xl p-3 shadow-lg transform hover:scale-110 transition" style={{ border: '3px solid #AED581' }}>
                  <img src={flower.image} alt="Community flower" className="w-full h-32 object-contain" />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm" style={{ color: '#689F38' }}>
                      {new Date(flower.timestamp).toLocaleDateString()}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => waterFlower(flower)}
                        aria-label="Water this flower"
                        className="inline-flex items-center gap-1 text-sm font-bold px-2 py-1 rounded-full transition transform hover:scale-110"
                        style={{ color: '#E91E63' }}
                      >
                        <Heart size={14} fill={flower.waters ? '#E91E63' : 'none'} />
                        {flower.waters || 0}
                      </button>
                      <button
                        onClick={() => downloadFlowerImage(flower)}
                        aria-label="Download this flower"
                        className="p-1 rounded-full transition transform hover:scale-110"
                        style={{ color: '#1E88E5' }}
                      >
                        <Download size={14} />
                      </button>
                      {flower.user_id && flower.user_id === userId && (
                        <button
                          onClick={() => deleteFlower(flower)}
                          aria-label="Delete this flower"
                          className="p-1 rounded-full transition transform hover:scale-110"
                          style={{ color: '#E53935' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {flowers.length === 0 && (
              <div className="text-center py-16 text-3xl" style={{ color: '#7CB342' }}>
                No flowers yet! 🌱<br/>Be the first to plant one!
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4" style={{ background: 'linear-gradient(to bottom, #F0F4C3, #C5E1A5)', fontFamily: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold mb-3" style={{ color: '#2E7D32', textShadow: '4px 4px 0px #A5D6A7', letterSpacing: '2px' }}>
            Flower Gallery
          </h1>
          <p className="text-2xl mb-3" style={{ color: '#558B2F' }}>{flowers.length} total flowers</p>
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
            style={{ background: '#E8F5E9', color: '#2E7D32', border: '2px solid #81C784' }}
          >
            <Users size={16} />
            {onlineCount} {onlineCount === 1 ? 'gardener' : 'gardeners'} here right now
          </div>
        </div>

        {/* Garden Display */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-8" style={{ border: '4px solid #81C784' }}>
          <div className="relative rounded-3xl p-8 min-h-80 overflow-hidden shadow-inner" style={{ background: 'linear-gradient(to bottom, #7CB342, #558B2F)', border: '5px solid #33691E' }}>
            <div className="absolute inset-0 opacity-30">
              <div className="h-full w-full" style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(139, 195, 74, 0.3) 8px, rgba(139, 195, 74, 0.3) 10px)` }}></div>
            </div>
            
            <div className="relative grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-6 justify-items-center">
              {loading ? (
                <div className="col-span-full text-center text-white text-2xl">Loading garden... 🌱</div>
              ) : flowers.slice(0, 30).map((flower, idx) => (
                <div key={flower.id} className="transform hover:scale-110 transition" style={{ animation: `float ${2 + (idx % 3)}s ease-in-out infinite`, animationDelay: `${idx * 0.1}s` }}>
                  <img src={flower.image} alt="Planted flower" className="w-full h-24 object-contain" style={{ filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))' }} />
                </div>
              ))}
            </div>
            
            {!loading && flowers.length === 0 && <div className="text-center text-white text-3xl font-bold">The garden is waiting! 🌱<br/>Plant the first flower!</div>}
          </div>
          
          <div className="mt-6 flex gap-4 justify-center flex-wrap">
            <button 
              onClick={refreshGarden} 
              disabled={refreshing}
              className="inline-flex items-center gap-3 px-6 py-3 text-white rounded-full text-xl font-bold shadow-lg transform hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #42A5F5, #1E88E5)', border: '3px solid #1565C0' }}
            >
              <RefreshCw size={24} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh Garden'}
            </button>
            
            <button 
              onClick={() => setShowGallery(true)} 
              className="inline-flex items-center gap-3 px-8 py-4 text-white rounded-full text-2xl font-bold shadow-lg transform hover:scale-105 transition" 
              style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: '3px solid #2E7D32' }}
            >
              <ImageIcon size={28} />
              See flower gallery
            </button>

            <button
              onClick={exportGardenAsImage}
              disabled={exporting || flowers.length === 0}
              className="inline-flex items-center gap-3 px-6 py-3 text-white rounded-full text-xl font-bold shadow-lg transform hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #AB47BC, #8E24AA)', border: '3px solid #6A1B9A' }}
            >
              <Download size={24} />
              {exporting ? 'Exporting...' : 'Export garden'}
            </button>
          </div>
        </div>

        {/* Drawing Area */}
        <div className="bg-white rounded-3xl shadow-2xl p-8" style={{ border: '4px solid #81C784' }}>
          <h3 className="text-4xl font-bold mb-6 text-center" style={{ color: '#2E7D32', textShadow: '2px 2px 0px #A5D6A7' }}>Add flowers to our shared garden!</h3>
          <p className="text-center text-lg mb-6" style={{ color: '#558B2F' }}>🌍 All flowers you plant will be visible to everyone! 🌍</p>
          
          {/* Color Palette */}
          <div className="mb-6">
            <p className="text-lg font-bold mb-3 text-center" style={{ color: '#558B2F' }}>Colors</p>
            <div className="flex gap-4 justify-center flex-wrap items-center">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-14 h-14 rounded-full border-4 transition transform hover:scale-110 ${selectedColor === color ? 'scale-125 border-gray-800' : 'border-white'}`}
                  style={{ backgroundColor: color, boxShadow: selectedColor === color ? '0 0 0 4px rgba(46, 125, 50, 0.3)' : '0 4px 6px rgba(0,0,0,0.2)' }}
                />
              ))}
              
              {/* Custom Color Picker */}
              <div className="relative">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    setSelectedColor(e.target.value);
                  }}
                  className="w-14 h-14 rounded-full border-4 cursor-pointer transition transform hover:scale-110"
                  style={{ 
                    border: selectedColor === customColor ? '4px solid #1B5E20' : '4px solid white',
                    boxShadow: selectedColor === customColor ? '0 0 0 4px rgba(46, 125, 50, 0.3)' : '0 4px 6px rgba(0,0,0,0.2)'
                  }}
                  title="Choose custom color"
                />
                <div 
                  className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs font-bold whitespace-nowrap"
                  style={{ color: '#558B2F' }}
                >
                  Custom
                </div>
              </div>
            </div>
          </div>

          {/* Brush Type Selector */}
          <div className="mb-6">
            <p className="text-lg font-bold mb-3 text-center" style={{ color: '#558B2F' }}>Brush Type</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={() => setBrushType(BRUSH_TYPES.NORMAL)}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-full text-lg font-bold shadow-lg transform hover:scale-105 transition ${brushType === BRUSH_TYPES.NORMAL ? 'scale-110' : ''}`}
                style={{ 
                  background: brushType === BRUSH_TYPES.NORMAL ? 'linear-gradient(135deg, #66BB6A, #43A047)' : '#E8F5E9',
                  color: brushType === BRUSH_TYPES.NORMAL ? 'white' : '#2E7D32',
                  border: `3px solid ${brushType === BRUSH_TYPES.NORMAL ? '#2E7D32' : '#81C784'}`
                }}
              >
                <Circle size={20} />
                Normal
              </button>
              <button
                onClick={() => setBrushType(BRUSH_TYPES.GLOW)}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-full text-lg font-bold shadow-lg transform hover:scale-105 transition ${brushType === BRUSH_TYPES.GLOW ? 'scale-110' : ''}`}
                style={{ 
                  background: brushType === BRUSH_TYPES.GLOW ? 'linear-gradient(135deg, #66BB6A, #43A047)' : '#E8F5E9',
                  color: brushType === BRUSH_TYPES.GLOW ? 'white' : '#2E7D32',
                  border: `3px solid ${brushType === BRUSH_TYPES.GLOW ? '#2E7D32' : '#81C784'}`
                }}
              >
                <Sparkles size={20} />
                Glow
              </button>
              <button
                onClick={() => setBrushType(BRUSH_TYPES.SPRAY)}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-full text-lg font-bold shadow-lg transform hover:scale-105 transition ${brushType === BRUSH_TYPES.SPRAY ? 'scale-110' : ''}`}
                style={{ 
                  background: brushType === BRUSH_TYPES.SPRAY ? 'linear-gradient(135deg, #66BB6A, #43A047)' : '#E8F5E9',
                  color: brushType === BRUSH_TYPES.SPRAY ? 'white' : '#2E7D32',
                  border: `3px solid ${brushType === BRUSH_TYPES.SPRAY ? '#2E7D32' : '#81C784'}`
                }}
              >
                <Droplet size={20} />
                Spray
              </button>
              <button
                onClick={() => setBrushType(BRUSH_TYPES.FLOWER)}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-full text-lg font-bold shadow-lg transform hover:scale-105 transition ${brushType === BRUSH_TYPES.FLOWER ? 'scale-110' : ''}`}
                style={{ 
                  background: brushType === BRUSH_TYPES.FLOWER ? 'linear-gradient(135deg, #66BB6A, #43A047)' : '#E8F5E9',
                  color: brushType === BRUSH_TYPES.FLOWER ? 'white' : '#2E7D32',
                  border: `3px solid ${brushType === BRUSH_TYPES.FLOWER ? '#2E7D32' : '#81C784'}`
                }}
              >
                🌸
                Flower
              </button>
            </div>
          </div>

          {/* Thickness Selector */}
          <div className="mb-6">
            <p className="text-lg font-bold mb-3 text-center" style={{ color: '#558B2F' }}>Thickness</p>
            <div className="flex gap-3 justify-center flex-wrap">
              {THICKNESS_OPTIONS.map((size) => (
                <button
                  key={size}
                  onClick={() => setThickness(size)}
                  className={`flex items-center justify-center w-14 h-14 rounded-full border-4 transition transform hover:scale-110 ${thickness === size ? 'scale-125 border-gray-800' : 'border-white'}`}
                  style={{ 
                    backgroundColor: thickness === size ? '#66BB6A' : '#E8F5E9',
                    boxShadow: thickness === size ? '0 0 0 4px rgba(46, 125, 50, 0.3)' : '0 4px 6px rgba(0,0,0,0.2)'
                  }}
                >
                  <div 
                    className="rounded-full"
                    style={{ 
                      width: `${size * 2}px`, 
                      height: `${size * 2}px`, 
                      backgroundColor: thickness === size ? 'white' : '#2E7D32'
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Undo / Redo */}
          <div className="mb-6 flex gap-3 justify-center">
            <button
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo last stroke"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-lg font-bold shadow-lg transform hover:scale-105 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: '#E3F2FD', color: '#1565C0', border: '3px solid #90CAF9' }}
            >
              <Undo2 size={20} />
              Undo
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo last undone stroke"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-lg font-bold shadow-lg transform hover:scale-105 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: '#E3F2FD', color: '#1565C0', border: '3px solid #90CAF9' }}
            >
              <Redo2 size={20} />
              Redo
            </button>
          </div>

          {/* Canvas */}
          <div className="rounded-2xl mb-6 bg-white mx-auto shadow-inner" style={{ border: '5px dashed #81C784', maxWidth: '500px' }}>
            <canvas
              ref={canvasRef}
              width={450}
              height={450}
              className="w-full cursor-crosshair rounded-2xl"
              style={{ touchAction: 'none' }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
          </div>

          {/* Message */}
          {message && <div className="mb-6 p-4 rounded-2xl text-center text-2xl font-bold" style={{ background: '#C5E1A5', color: '#33691E', border: '3px solid #7CB342' }}>{message}</div>}

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center flex-wrap">
            <button onClick={clearCanvas} className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xl font-bold shadow-lg transform hover:scale-105 transition" style={{ background: '#FFF9C4', color: '#F57F17', border: '3px solid #FBC02D' }}>
              <RotateCcw size={24} />
              Clear
            </button>
            
            <button
              onClick={plantFlower}
              disabled={cooldownRemaining > 0}
              className="inline-flex items-center gap-3 px-8 py-3 text-white rounded-full text-2xl font-bold shadow-lg transform hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: '3px solid #2E7D32' }}
            >
              <Leaf size={28} />
              {cooldownRemaining > 0 ? `Wait ${Math.ceil(cooldownRemaining / 1000)}s` : 'Plant'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}
