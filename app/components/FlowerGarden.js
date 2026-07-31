"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  Pencil,
  Flower2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PLANT_COOLDOWN_MS = 8000;
const MAX_HISTORY = 20;

// Virtual garden size (px) — scrollable
const GARDEN_W = 1600;
const GARDEN_H = 1100;

const FLOWER_TYPES = [
  { id: "rose", label: "Rose", emoji: "🌹", color: "#E91E63" },
  { id: "sunflower", label: "Sunflower", emoji: "🌻", color: "#F9A825" },
  { id: "tulip", label: "Tulip", emoji: "🌷", color: "#EC407A" },
  { id: "daisy", label: "Daisy", emoji: "🌼", color: "#FFEB3B" },
  { id: "cherry", label: "Cherry Blossom", emoji: "🌸", color: "#F8BBD0" },
];

const QUICK_COLORS = [
  "#E91E63", "#F9A825", "#EC407A", "#FFEB3B", "#F8BBD0",
  "#FFFFFF", "#EF9A9A", "#CE93D8", "#FFCC80", "#81D4FA",
];

const BRUSH_TYPES = { NORMAL: "normal", GLOW: "glow", SPRAY: "spray", FLOWER: "flower" };
const THICKNESS_OPTIONS = [2, 4, 8, 12];

/** Deterministic position inside the large garden canvas */
function positionForId(id) {
  const s = String(id);
  let h1 = 2166136261;
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 16777619);
    h2 ^= s.charCodeAt(s.length - 1 - i);
    h2 = Math.imul(h2, 16777619);
  }
  // Padding so flowers aren't cut off at edges
  const pad = 80;
  const x = pad + (Math.abs(h1) % (GARDEN_W - pad * 2));
  const y = pad + (Math.abs(h2) % (GARDEN_H - pad * 2));
  // Slight size variation 56–88px
  const size = 56 + (Math.abs(h1 + h2) % 33);
  return { x, y, size };
}

function relativeTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  if (sec < 60) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function FlowerGarden() {
  const [mode, setMode] = useState("quick");
  const [gardenerName, setGardenerName] = useState("");
  const [nameEditing, setNameEditing] = useState(false);
  const [userId, setUserId] = useState(null);

  const [selectedType, setSelectedType] = useState(FLOWER_TYPES[0]);
  const [selectedColor, setSelectedColor] = useState(FLOWER_TYPES[0].color);

  const [isDrawing, setIsDrawing] = useState(false);
  const [customColor, setCustomColor] = useState("#FF69B4");
  const [brushType, setBrushType] = useState(BRUSH_TYPES.NORMAL);
  const [thickness, setThickness] = useState(4);
  const canvasRef = useRef(null);
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [flowers, setFlowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showGallery, setShowGallery] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [exporting, setExporting] = useState(false);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const gardenScrollRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("flowerGardenName");
    if (saved) setGardenerName(saved);
    else setNameEditing(true);
  }, []);

  // Center the scrollable garden on load
  useEffect(() => {
    const el = gardenScrollRef.current;
    if (!el || loading) return;
    el.scrollLeft = (GARDEN_W - el.clientWidth) / 2;
    el.scrollTop = (GARDEN_H - el.clientHeight) / 2;
  }, [loading]);

  const saveName = (name) => {
    const cleaned = name.trim().slice(0, 20) || "Anonymous";
    setGardenerName(cleaned);
    localStorage.setItem("flowerGardenName", cleaned);
    setNameEditing(false);
  };

  // --- canvas helpers (unchanged) ---
  const getCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const drawGlow = useCallback((ctx, x, y) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, thickness * 2);
    g.addColorStop(0, selectedColor);
    g.addColorStop(0.5, selectedColor + "80");
    g.addColorStop(1, selectedColor + "00");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, thickness * 2, 0, Math.PI * 2);
    ctx.fill();
  }, [selectedColor, thickness]);

  const drawSpray = useCallback((ctx, x, y) => {
    for (let i = 0; i < 15; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * thickness * 2;
      ctx.fillStyle = selectedColor;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.random() * 2 + 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [selectedColor, thickness]);

  const drawFlowerBrush = useCallback((ctx, x, y) => {
    const petalSize = thickness * 1.5;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.fillStyle = selectedColor;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * petalSize, y + Math.sin(a) * petalSize, petalSize * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#FFEB3B";
    ctx.beginPath();
    ctx.arc(x, y, petalSize * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }, [selectedColor, thickness]);

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !historyRef.current.length) return;
    const ctx = canvas.getContext("2d");
    redoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(historyRef.current.pop(), 0, 0);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !redoRef.current.length) return;
    const ctx = canvas.getContext("2d");
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(redoRef.current.pop(), 0, 0);
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
    const ctx = canvas.getContext("2d");
    pushHistory();
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = thickness;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setIsDrawing(true);
    if (brushType === BRUSH_TYPES.GLOW) drawGlow(ctx, x, y);
    else if (brushType === BRUSH_TYPES.SPRAY) drawSpray(ctx, x, y);
    else if (brushType === BRUSH_TYPES.FLOWER) drawFlowerBrush(ctx, x, y);
    else { ctx.beginPath(); ctx.moveTo(x, y); }
  }, [getCoords, selectedColor, thickness, brushType, drawGlow, drawSpray, drawFlowerBrush, pushHistory]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (brushType === BRUSH_TYPES.GLOW) drawGlow(ctx, x, y);
    else if (brushType === BRUSH_TYPES.SPRAY) drawSpray(ctx, x, y);
    else if (brushType === BRUSH_TYPES.FLOWER) drawFlowerBrush(ctx, x, y);
    else { ctx.lineTo(x, y); ctx.stroke(); ctx.moveTo(x, y); }
  }, [getCoords, isDrawing, brushType, drawGlow, drawSpray, drawFlowerBrush]);

  const stopDrawing = useCallback(() => setIsDrawing(false), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "draw") return;
    const ts = (e) => { e.preventDefault(); startDrawing(e); };
    const tm = (e) => { e.preventDefault(); draw(e); };
    const te = (e) => { e.preventDefault(); stopDrawing(); };
    canvas.addEventListener("touchstart", ts, { passive: false });
    canvas.addEventListener("touchmove", tm, { passive: false });
    canvas.addEventListener("touchend", te, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", ts);
      canvas.removeEventListener("touchmove", tm);
      canvas.removeEventListener("touchend", te);
    };
  }, [mode, startDrawing, draw, stopDrawing]);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) { setUserId(session.user.id); return; }
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        setUserId(data.user?.id ?? null);
      } catch (err) { console.error(err); }
    })();
  }, []);

  const loadFlowers = async () => {
    try {
      const { data, error } = await supabase
        .from("flowers")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(200);
      if (error) throw error;
      setFlowers(data || []);
    } catch (err) {
      console.error(err);
      setMessage("Failed to load garden 😢");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFlowers(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("flowers-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "flowers" }, (payload) => {
        setFlowers((prev) => prev.some((f) => f.id === payload.new.id) ? prev : [payload.new, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "flowers" }, (payload) => {
        setFlowers((prev) => prev.map((f) => (f.id === payload.new.id ? payload.new : f)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "flowers" }, (payload) => {
        setFlowers((prev) => prev.filter((f) => f.id !== payload.old.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const ch = supabase.channel("garden-presence", {
      config: { presence: { key: crypto.randomUUID() } },
    });
    ch.on("presence", { event: "sync" }, () => {
      setOnlineCount(Math.max(1, Object.keys(ch.presenceState()).length));
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") await ch.track({ online_at: new Date().toISOString() });
    });
    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    const last = Number(localStorage.getItem("flowerGardenLastPlantedAt") || 0);
    const rem = PLANT_COOLDOWN_MS - (Date.now() - last);
    if (rem > 0) setCooldownRemaining(rem);
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const t = setInterval(() => setCooldownRemaining((p) => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(t);
  }, [cooldownRemaining > 0]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    resetHistory();
    setMessage("");
  };

  const plantQuick = async () => {
    if (cooldownRemaining > 0) {
      setMessage(`Wait ${Math.ceil(cooldownRemaining / 1000)}s 🌱`);
      setTimeout(() => setMessage(""), 2000);
      return;
    }
    if (!userId) {
      setMessage("Connecting… 🌱");
      setTimeout(() => setMessage(""), 2000);
      return;
    }
    if (!gardenerName.trim()) {
      setNameEditing(true);
      setMessage("Add your name first!");
      setTimeout(() => setMessage(""), 2000);
      return;
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="140" viewBox="0 0 120 140">
        <line x1="60" y1="70" x2="60" y2="130" stroke="#2E7D32" stroke-width="6" stroke-linecap="round"/>
        <ellipse cx="48" cy="100" rx="14" ry="8" fill="#66BB6A" transform="rotate(-30 48 100)"/>
        <ellipse cx="72" cy="105" rx="12" ry="7" fill="#66BB6A" transform="rotate(25 72 105)"/>
        ${[0,1,2,3,4,5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return `<circle cx="${60 + Math.cos(a) * 28}" cy="${48 + Math.sin(a) * 28}" r="18" fill="${selectedColor}"/>`;
        }).join("")}
        <circle cx="60" cy="48" r="14" fill="#FFEB3B"/>
        <circle cx="60" cy="48" r="7" fill="#F9A825"/>
      </svg>`;
    const imageData = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));

    try {
      const { data, error } = await supabase.from("flowers").insert([{
        image: imageData,
        timestamp: new Date().toISOString(),
        waters: 0,
        user_id: userId,
        planter_name: gardenerName.trim(),
        flower_type: selectedType.id,
        color: selectedColor,
      }]).select();
      if (error) throw error;
      setFlowers([data[0], ...flowers]);
      localStorage.setItem("flowerGardenLastPlantedAt", String(Date.now()));
      setCooldownRemaining(PLANT_COOLDOWN_MS);
      setMessage(`${selectedType.emoji} ${selectedType.label} planted!`);
      setTimeout(() => setMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setMessage("Failed to plant 😢");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const plantDrawn = async () => {
    if (cooldownRemaining > 0) {
      setMessage(`Wait ${Math.ceil(cooldownRemaining / 1000)}s 🌱`);
      setTimeout(() => setMessage(""), 2000);
      return;
    }
    if (!userId) {
      setMessage("Connecting… 🌱");
      setTimeout(() => setMessage(""), 2000);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (!pixelData.data.some((c) => c !== 0)) {
      setMessage("Draw something first! 🎨");
      setTimeout(() => setMessage(""), 2000);
      return;
    }
    try {
      const { data, error } = await supabase.from("flowers").insert([{
        image: canvas.toDataURL("image/png"),
        timestamp: new Date().toISOString(),
        waters: 0,
        user_id: userId,
        planter_name: gardenerName.trim() || "Anonymous",
        flower_type: "custom",
        color: selectedColor,
      }]).select();
      if (error) throw error;
      setFlowers([data[0], ...flowers]);
      localStorage.setItem("flowerGardenLastPlantedAt", String(Date.now()));
      setCooldownRemaining(PLANT_COOLDOWN_MS);
      setMessage("🌸 Custom flower planted!");
      setTimeout(() => setMessage(""), 2500);
      clearCanvas();
    } catch (err) {
      console.error(err);
      setMessage("Failed to plant 😢");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const waterFlower = async (flower) => {
    const next = (flower.waters || 0) + 1;
    setFlowers((prev) => prev.map((f) => (f.id === flower.id ? { ...f, waters: next } : f)));
    const { error } = await supabase.rpc("increment_waters", { flower_id: flower.id });
    if (error) console.error(error);
  };

  const deleteFlower = async (flower) => {
    if (!window.confirm("Delete this flower?")) return;
    setFlowers((prev) => prev.filter((f) => f.id !== flower.id));
    const { error } = await supabase.from("flowers").delete().eq("id", flower.id);
    if (error) { setMessage("Failed to delete"); loadFlowers(); }
  };

  const exportGarden = async () => {
    if (!flowers.length) return;
    setExporting(true);
    try {
      const cols = 6, cell = 160;
      const rows = Math.ceil(flowers.length / cols);
      const c = document.createElement("canvas");
      c.width = cols * cell;
      c.height = rows * cell + 60;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#E8F5E9";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#2E7D32";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Community Flower Garden 🌸", c.width / 2, 40);
      await Promise.all(flowers.map((f, i) => new Promise((res) => {
        const img = new window.Image();
        img.onload = () => {
          const col = i % cols, row = Math.floor(i / cols);
          const scale = Math.min(cell / img.width, cell / img.height) * 0.85;
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, col * cell + (cell - w) / 2, row * cell + 60 + (cell - h) / 2, w, h);
          res();
        };
        img.onerror = res;
        img.src = f.image;
      })));
      const a = document.createElement("a");
      a.download = `garden-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = c.toDataURL("image/png");
      a.click();
    } finally {
      setExporting(false);
    }
  };

  const typeCounts = FLOWER_TYPES.reduce((acc, t) => {
    acc[t.id] = flowers.filter((f) => f.flower_type === t.id).length;
    return acc;
  }, {});
  const maxTypeCount = Math.max(1, ...Object.values(typeCounts));
  const recent = flowers.slice(0, 8);

  if (showGallery) {
    return (
      <div className="min-h-screen bg-[#F7F4ED] p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-[#2E7D32]">Flower Gallery</h2>
            <button onClick={() => setShowGallery(false)}
              className="px-5 py-2.5 rounded-full bg-[#66BB6A] text-white font-semibold hover:bg-[#43A047] transition">
              ← Back to Garden
            </button>
          </div>
          <div className="flex flex-wrap gap-3 mb-6 items-center">
            <span className="text-[#558B2F] font-medium">{flowers.length} flowers</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border text-sm text-[#2E7D32]">
              <Users size={14} /> {onlineCount} online
            </span>
            <button onClick={exportGarden} disabled={exporting || !flowers.length}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-semibold disabled:opacity-50">
              <Download size={14} /> {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {flowers.map((f) => (
              <div key={f.id} className="bg-white rounded-2xl p-3 shadow-sm border border-[#C8E6C9] hover:shadow-md transition">
                <img src={f.image} alt="" className="w-full h-28 object-contain" />
                <div className="mt-2 flex items-center justify-between text-xs text-[#689F38]">
                  <span className="truncate max-w-[70%]">{f.planter_name || "Anon"}</span>
                  <button onClick={() => waterFlower(f)} className="inline-flex items-center gap-1 text-[#E91E63] font-semibold">
                    <Heart size={12} fill={f.waters ? "#E91E63" : "none"} /> {f.waters || 0}
                  </button>
                </div>
                {f.user_id === userId && (
                  <button onClick={() => deleteFlower(f)} className="mt-1 text-[10px] text-red-500">Delete</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#F5F0E8] text-[#2E3A2E] overflow-hidden">
      {/* ===== HEADER ===== */}
      <header className="shrink-0 z-30 bg-[#FAF7F2]/90 backdrop-blur-md border-b border-[#E8E0D0]">
        <div className="px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#E8F5E9] flex items-center justify-center shrink-0">
              <Flower2 size={16} className="text-[#43A047]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] md:text-base font-semibold text-[#1B3A1B] leading-tight truncate">
                Community Flower Garden
              </h1>
              <p className="text-[11px] text-[#8A9A8A] hidden sm:block leading-tight">
                Plant together · grows live
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setLeftOpen((v) => !v)}
              className="p-2 rounded-lg hover:bg-[#EDE8DC] text-[#5A6A5A] transition lg:hidden"
              title="Plant panel"
            >
              {leftOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>

            <button
              onClick={() => { setRefreshing(true); loadFlowers().finally(() => setRefreshing(false)); }}
              className="p-2 rounded-lg hover:bg-[#EDE8DC] text-[#5A6A5A] transition"
              title="Refresh"
            >
              <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
            </button>

            <button
              onClick={() => setShowGallery(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[#3D5A3D] hover:bg-[#EDE8DC] transition"
            >
              <ImageIcon size={15} />
              <span className="hidden sm:inline">Gallery</span>
            </button>

            <button
              onClick={() => setRightOpen((v) => !v)}
              className="p-2 rounded-lg hover:bg-[#EDE8DC] text-[#5A6A5A] transition hidden lg:inline-flex"
              title="Stats"
            >
              {rightOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        {/* LEFT */}
        <aside className={`
          shrink-0 border-r border-[#E8E0D0] bg-[#FAF7F2] overflow-y-auto
          transition-all duration-300 ease-in-out
          ${leftOpen ? "w-[270px] opacity-100" : "w-0 opacity-0 overflow-hidden border-r-0"}
          absolute lg:static inset-y-0 left-0 z-20 lg:z-0 shadow-xl lg:shadow-none
        `}>
          <div className="p-4 space-y-4 w-[270px]">
            <div className="hidden lg:flex justify-end -mt-1">
              <button onClick={() => setLeftOpen(false)} className="p-1 rounded-md hover:bg-[#EDE8DC] text-[#8A9A8A]">
                <PanelLeftClose size={15} />
              </button>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A9A8A] mb-1">Gardening as</p>
              {nameEditing ? (
                <form onSubmit={(e) => { e.preventDefault(); saveName(gardenerName); }} className="flex gap-1.5">
                  <input autoFocus value={gardenerName} onChange={(e) => setGardenerName(e.target.value)}
                    placeholder="Your name" maxLength={20}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#D4CBB8] text-sm outline-none focus:ring-2 focus:ring-[#81C784]" />
                  <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-[#66BB6A] text-white text-sm font-semibold">Save</button>
                </form>
              ) : (
                <button onClick={() => setNameEditing(true)} className="flex items-center gap-1.5 text-[15px] font-semibold text-[#1B3A1B] hover:opacity-70">
                  {gardenerName || "Anonymous"} <Pencil size={12} className="text-[#8A9A8A]" />
                </button>
              )}
            </div>

            <div className="flex rounded-lg border border-[#D4CBB8] overflow-hidden text-[13px] font-medium">
              <button onClick={() => setMode("quick")}
                className={`flex-1 py-2 flex items-center justify-center gap-1 ${mode === "quick" ? "bg-[#E8F5E9] text-[#2E7D32]" : "bg-white text-[#6B7C6B]"}`}>
                <Flower2 size={13} /> Quick plant
              </button>
              <button onClick={() => setMode("draw")}
                className={`flex-1 py-2 flex items-center justify-center gap-1 ${mode === "draw" ? "bg-[#E8F5E9] text-[#2E7D32]" : "bg-white text-[#6B7C6B]"}`}>
                <Pencil size={13} /> Draw
              </button>
            </div>

            {mode === "quick" ? (
              <>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A9A8A] mb-2">Flower Type</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FLOWER_TYPES.map((t) => (
                      <button key={t.id} onClick={() => { setSelectedType(t); setSelectedColor(t.color); }}
                        className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border-2 transition ${
                          selectedType.id === t.id ? "border-[#66BB6A] bg-[#E8F5E9]" : "border-transparent bg-white hover:bg-[#F5F1E8]"
                        }`}>
                        <span className="text-lg">{t.emoji}</span>
                        <span className="text-[11px] font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A9A8A] mb-2">Color</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_COLORS.map((c) => (
                      <button key={c} onClick={() => setSelectedColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition ${selectedColor === c ? "border-[#1B3A1B] scale-110" : "border-white shadow-sm"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="mt-2 h-1 rounded-full" style={{ backgroundColor: selectedColor }} />
                </div>
                <button onClick={plantQuick} disabled={cooldownRemaining > 0}
                  className="w-full py-2.5 rounded-xl bg-[#66BB6A] hover:bg-[#43A047] text-white font-semibold text-sm shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <Leaf size={16} />
                  {cooldownRemaining > 0 ? `Wait ${Math.ceil(cooldownRemaining / 1000)}s` : "Plant flower"}
                </button>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A9A8A] mb-1.5">Colors</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_COLORS.map((c) => (
                      <button key={c} onClick={() => setSelectedColor(c)}
                        className={`w-6 h-6 rounded-full border-2 ${selectedColor === c ? "border-[#1B3A1B] scale-110" : "border-white shadow-sm"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                    <input type="color" value={customColor}
                      onChange={(e) => { setCustomColor(e.target.value); setSelectedColor(e.target.value); }}
                      className="w-6 h-6 rounded-full cursor-pointer" />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A9A8A] mb-1.5">Brush</p>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    {[[BRUSH_TYPES.NORMAL, Circle, "Normal"], [BRUSH_TYPES.GLOW, Sparkles, "Glow"],
                      [BRUSH_TYPES.SPRAY, Droplet, "Spray"], [BRUSH_TYPES.FLOWER, Flower2, "Flower"]].map(([type, Icon, label]) => (
                      <button key={type} onClick={() => setBrushType(type)}
                        className={`flex items-center gap-1 px-1.5 py-1.5 rounded-lg border ${
                          brushType === type ? "bg-[#E8F5E9] border-[#66BB6A] text-[#2E7D32]" : "bg-white border-[#E0D9C8]"
                        }`}>
                        <Icon size={11} /> {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A9A8A] mb-1.5">Thickness</p>
                  <div className="flex gap-1.5">
                    {THICKNESS_OPTIONS.map((s) => (
                      <button key={s} onClick={() => setThickness(s)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                          thickness === s ? "border-[#1B3A1B] bg-[#E8F5E9]" : "border-white bg-white shadow-sm"
                        }`}>
                        <div className="rounded-full bg-[#2E7D32]" style={{ width: s * 1.4, height: s * 1.4 }} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={undo} disabled={!canUndo} className="flex-1 py-1.5 rounded-lg border text-[11px] disabled:opacity-40">
                    <Undo2 size={11} className="inline mr-0.5" /> Undo
                  </button>
                  <button onClick={redo} disabled={!canRedo} className="flex-1 py-1.5 rounded-lg border text-[11px] disabled:opacity-40">
                    <Redo2 size={11} className="inline mr-0.5" /> Redo
                  </button>
                </div>
                <div className="rounded-xl overflow-hidden border-2 border-dashed border-[#C8E6C9] bg-white">
                  <canvas ref={canvasRef} width={400} height={280}
                    className="w-full cursor-crosshair" style={{ touchAction: "none" }}
                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} />
                </div>
                <div className="flex gap-1.5">
                  <button onClick={clearCanvas} className="flex-1 py-2 rounded-xl border border-[#D4CBB8] text-[11px] font-medium">
                    <RotateCcw size={11} className="inline mr-0.5" /> Clear
                  </button>
                  <button onClick={plantDrawn} disabled={cooldownRemaining > 0}
                    className="flex-[2] py-2 rounded-xl bg-[#66BB6A] text-white font-semibold text-[11px] disabled:opacity-50">
                    <Leaf size={11} className="inline mr-0.5" />
                    {cooldownRemaining > 0 ? `Wait ${Math.ceil(cooldownRemaining / 1000)}s` : "Plant drawing"}
                  </button>
                </div>
              </>
            )}

            {message && (
              <div className="text-center text-[12px] font-medium text-[#2E7D32] bg-[#E8F5E9] rounded-lg py-2 px-2">
                {message}
              </div>
            )}
          </div>
        </aside>

        {!leftOpen && (
          <button onClick={() => setLeftOpen(true)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white border border-[#D4CBB8] shadow-md hover:bg-[#F0EBE0] hidden lg:flex"
            title="Open plant panel">
            <PanelLeftOpen size={16} />
          </button>
        )}

        {/* ===== SCROLLABLE GARDEN ===== */}
        <main
          ref={gardenScrollRef}
          className="flex-1 min-w-0 overflow-auto bg-[#E4EED8]"
          style={{ scrollbarWidth: "thin" }}
        >
          <div
            className="relative"
            style={{ width: GARDEN_W, height: GARDEN_H }}
          >
            {/* soft grass texture */}
            <div
              className="absolute inset-0 pointer-events-none opacity-40"
              style={{
                backgroundImage: `
                  radial-gradient(ellipse at 20% 30%, rgba(255,200,220,0.25) 0%, transparent 50%),
                  radial-gradient(ellipse at 80% 60%, rgba(255,220,180,0.2) 0%, transparent 45%),
                  radial-gradient(ellipse at 50% 80%, rgba(200,230,180,0.3) 0%, transparent 40%)
                `,
              }}
            />

            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-[#558B2F] text-lg">
                Loading garden… 🌱
              </div>
            ) : flowers.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-center text-[#558B2F]">
                <div>
                  <p className="text-4xl mb-2">🌱</p>
                  <p className="text-xl font-semibold">The garden is waiting</p>
                  <p className="text-sm mt-1">Plant the first flower!</p>
                </div>
              </div>
            ) : (
              flowers.map((f) => {
                const { x, y, size } = positionForId(f.id);
                return (
                  <div
                    key={f.id}
                    className="absolute hover:scale-110 hover:z-20 transition-transform duration-150 cursor-default"
                    style={{
                      left: x,
                      top: y,
                      width: size,
                      height: size * 1.15,
                      transform: "translate(-50%, -50%)",
                    }}
                    title={`${f.planter_name || "Anon"} · ${relativeTime(f.timestamp)}`}
                  >
                    <img
                      src={f.image}
                      alt=""
                      className="w-full h-full object-contain"
                      style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))" }}
                      draggable={false}
                    />
                  </div>
                );
              })
            )}
          </div>
        </main>

        {/* RIGHT */}
        <aside className={`
          shrink-0 border-l border-[#E8E0D0] bg-[#FAF7F2] overflow-y-auto
          transition-all duration-300 ease-in-out
          ${rightOpen ? "w-[220px] opacity-100" : "w-0 opacity-0 overflow-hidden border-l-0"}
          hidden lg:block
        `}>
          <div className="p-4 space-y-4 w-[220px]">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1B3A1B]">Garden Stats</h3>
                <p className="text-[10px] text-[#8A9A8A]">Live activity</p>
              </div>
              <button onClick={() => setRightOpen(false)} className="p-1 rounded-md hover:bg-[#EDE8DC] text-[#8A9A8A]">
                <PanelRightClose size={14} />
              </button>
            </div>

            <div className="rounded-xl bg-[#E8F5E9] p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#66BB6A]">
                <Flower2 size={15} />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1B3A1B] leading-none">{flowers.length}</p>
                <p className="text-[10px] text-[#558B2F]">Flowers planted</p>
              </div>
            </div>

            <div className="rounded-xl bg-[#FFF3E0] p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#FB8C00]">
                <Users size={15} />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1B3A1B] leading-none">{onlineCount}</p>
                <p className="text-[10px] text-[#E65100]">Gardeners online</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A9A8A] mb-2">Species</p>
              <div className="space-y-1.5">
                {FLOWER_TYPES.map((t) => (
                  <div key={t.id}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span>{t.label}</span>
                      <span className="text-[#8A9A8A]">{typeCounts[t.id]}</span>
                    </div>
                    <div className="h-1 rounded-full bg-[#EDE8DC] overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${(typeCounts[t.id] / maxTypeCount) * 100}%`, backgroundColor: t.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A9A8A] mb-2">Recent</p>
              <div className="space-y-2">
                {recent.map((f) => {
                  const type = FLOWER_TYPES.find((t) => t.id === f.flower_type) || { emoji: "🌸", label: "Custom" };
                  return (
                    <div key={f.id} className="flex items-start gap-1.5 text-sm">
                      <span className="text-sm leading-none mt-0.5">{type.emoji}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-[#1B3A1B] truncate text-[12px]">{f.planter_name || "Anonymous"}</p>
                        <p className="text-[10px] text-[#8A9A8A]">
                          {type.label} · {relativeTime(f.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {!recent.length && <p className="text-xs text-[#8A9A8A]">No activity yet</p>}
              </div>
            </div>
          </div>
        </aside>

        {!rightOpen && (
          <button onClick={() => setRightOpen(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white border border-[#D4CBB8] shadow-md hover:bg-[#F0EBE0] hidden lg:flex"
            title="Open stats">
            <PanelRightOpen size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
