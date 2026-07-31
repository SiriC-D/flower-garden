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
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PLANT_COOLDOWN_MS = 8000;
const MAX_HISTORY = 20;

const FLOWER_TYPES = [
  { id: "rose", label: "Rose", emoji: "🌹", color: "#E91E63" },
  { id: "sunflower", label: "Sunflower", emoji: "🌻", color: "#F9A825" },
  { id: "tulip", label: "Tulip", emoji: "🌷", color: "#EC407A" },
  { id: "daisy", label: "Daisy", emoji: "🌼", color: "#FFEB3B" },
  { id: "cherry", label: "Cherry Blossom", emoji: "🌸", color: "#F8BBD0" },
];

const QUICK_COLORS = [
  "#E91E63",
  "#F9A825",
  "#EC407A",
  "#FFEB3B",
  "#F8BBD0",
  "#FFFFFF",
  "#EF9A9A",
  "#CE93D8",
  "#FFCC80",
  "#81D4FA",
];

const BRUSH_TYPES = {
  NORMAL: "normal",
  GLOW: "glow",
  SPRAY: "spray",
  FLOWER: "flower",
};

const THICKNESS_OPTIONS = [2, 4, 8, 12];

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
  // --- mode: "quick" | "draw" ---
  const [mode, setMode] = useState("quick");

  // --- identity ---
  const [gardenerName, setGardenerName] = useState("");
  const [nameEditing, setNameEditing] = useState(false);
  const [userId, setUserId] = useState(null);

  // --- quick plant ---
  const [selectedType, setSelectedType] = useState(FLOWER_TYPES[0]);
  const [selectedColor, setSelectedColor] = useState(FLOWER_TYPES[0].color);

  // --- draw mode ---
  const [isDrawing, setIsDrawing] = useState(false);
  const [customColor, setCustomColor] = useState("#FF69B4");
  const [brushType, setBrushType] = useState(BRUSH_TYPES.NORMAL);
  const [thickness, setThickness] = useState(4);
  const canvasRef = useRef(null);
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // --- shared state ---
  const [flowers, setFlowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showGallery, setShowGallery] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [gardenPositions, setGardenPositions] = useState({}); // id -> {x%, y%}

  // persist name
  useEffect(() => {
    const saved = localStorage.getItem("flowerGardenName");
    if (saved) setGardenerName(saved);
    else setNameEditing(true);
  }, []);

  const saveName = (name) => {
    const cleaned = name.trim().slice(0, 20) || "Anonymous";
    setGardenerName(cleaned);
    localStorage.setItem("flowerGardenName", cleaned);
    setNameEditing(false);
  };

  // --- canvas helpers (draw mode) ---
  const getCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const drawGlow = useCallback(
    (ctx, x, y) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, thickness * 2);
      g.addColorStop(0, selectedColor);
      g.addColorStop(0.5, selectedColor + "80");
      g.addColorStop(1, selectedColor + "00");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, thickness * 2, 0, Math.PI * 2);
      ctx.fill();
    },
    [selectedColor, thickness]
  );

  const drawSpray = useCallback(
    (ctx, x, y) => {
      for (let i = 0; i < 15; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * thickness * 2;
        ctx.fillStyle = selectedColor;
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(a) * d,
          y + Math.sin(a) * d,
          Math.random() * 2 + 1,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    },
    [selectedColor, thickness]
  );

  const drawFlowerBrush = useCallback(
    (ctx, x, y) => {
      const petalSize = thickness * 1.5;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.fillStyle = selectedColor;
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(a) * petalSize,
          y + Math.sin(a) * petalSize,
          petalSize * 0.6,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.fillStyle = "#FFEB3B";
      ctx.beginPath();
      ctx.arc(x, y, petalSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
    },
    [selectedColor, thickness]
  );

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

  const startDrawing = useCallback(
    (e) => {
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
      else {
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    },
    [getCoords, selectedColor, thickness, brushType, drawGlow, drawSpray, drawFlowerBrush, pushHistory]
  );

  const draw = useCallback(
    (e) => {
      if (!isDrawing) return;
      const { x, y } = getCoords(e);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (brushType === BRUSH_TYPES.GLOW) drawGlow(ctx, x, y);
      else if (brushType === BRUSH_TYPES.SPRAY) drawSpray(ctx, x, y);
      else if (brushType === BRUSH_TYPES.FLOWER) drawFlowerBrush(ctx, x, y);
      else {
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.moveTo(x, y);
      }
    },
    [getCoords, isDrawing, brushType, drawGlow, drawSpray, drawFlowerBrush]
  );

  const stopDrawing = useCallback(() => setIsDrawing(false), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "draw") return;
    const ts = (e) => {
      e.preventDefault();
      startDrawing(e);
    };
    const tm = (e) => {
      e.preventDefault();
      draw(e);
    };
    const te = (e) => {
      e.preventDefault();
      stopDrawing();
    };
    canvas.addEventListener("touchstart", ts, { passive: false });
    canvas.addEventListener("touchmove", tm, { passive: false });
    canvas.addEventListener("touchend", te, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", ts);
      canvas.removeEventListener("touchmove", tm);
      canvas.removeEventListener("touchend", te);
    };
  }, [mode, startDrawing, draw, stopDrawing]);

  // --- auth ---
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          setUserId(session.user.id);
          return;
        }
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        setUserId(data.user?.id ?? null);
      } catch (err) {
        console.error("Auth error:", err);
      }
    })();
  }, []);

  // --- load + realtime ---
  const loadFlowers = async () => {
    try {
      const { data, error } = await supabase
        .from("flowers")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(200);
      if (error) throw error;
      setFlowers(data || []);
      // assign stable random positions for garden scatter
      const positions = {};
      (data || []).forEach((f) => {
        positions[f.id] = {
          x: 8 + ((f.id.charCodeAt(0) * 17) % 80),
          y: 10 + ((f.id.charCodeAt(1) * 23) % 75),
        };
      });
      setGardenPositions(positions);
    } catch (err) {
      console.error(err);
      setMessage("Failed to load garden 😢");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlowers();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("flowers-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "flowers" },
        (payload) => {
          setFlowers((prev) =>
            prev.some((f) => f.id === payload.new.id)
              ? prev
              : [payload.new, ...prev]
          );
          setGardenPositions((p) => ({
            ...p,
            [payload.new.id]: {
              x: 8 + Math.random() * 80,
              y: 10 + Math.random() * 75,
            },
          }));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "flowers" },
        (payload) => {
          setFlowers((prev) =>
            prev.map((f) => (f.id === payload.new.id ? payload.new : f))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "flowers" },
        (payload) => {
          setFlowers((prev) => prev.filter((f) => f.id !== payload.old.id));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // presence
  useEffect(() => {
    const ch = supabase.channel("garden-presence", {
      config: { presence: { key: crypto.randomUUID() } },
    });
    ch.on("presence", { event: "sync" }, () => {
      setOnlineCount(Math.max(1, Object.keys(ch.presenceState()).length));
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ online_at: new Date().toISOString() });
      }
    });
    return () => supabase.removeChannel(ch);
  }, []);

  // cooldown
  useEffect(() => {
    const last = Number(localStorage.getItem("flowerGardenLastPlantedAt") || 0);
    const rem = PLANT_COOLDOWN_MS - (Date.now() - last);
    if (rem > 0) setCooldownRemaining(rem);
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const t = setInterval(
      () => setCooldownRemaining((p) => Math.max(0, p - 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [cooldownRemaining > 0]);

  // --- plant actions ---
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
      setMessage("Connecting… one sec 🌱");
      setTimeout(() => setMessage(""), 2000);
      return;
    }
    if (!gardenerName.trim()) {
      setNameEditing(true);
      setMessage("Add your name first!");
      setTimeout(() => setMessage(""), 2000);
      return;
    }

    // generate a simple SVG flower as data URL
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="140" viewBox="0 0 120 140">
        <line x1="60" y1="70" x2="60" y2="130" stroke="#2E7D32" stroke-width="6" stroke-linecap="round"/>
        <ellipse cx="48" cy="100" rx="14" ry="8" fill="#66BB6A" transform="rotate(-30 48 100)"/>
        <ellipse cx="72" cy="105" rx="12" ry="7" fill="#66BB6A" transform="rotate(25 72 105)"/>
        ${[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          const px = 60 + Math.cos(a) * 28;
          const py = 48 + Math.sin(a) * 28;
          return `<circle cx="${px}" cy="${py}" r="18" fill="${selectedColor}"/>`;
        }).join("")}
        <circle cx="60" cy="48" r="14" fill="#FFEB3B"/>
        <circle cx="60" cy="48" r="7" fill="#F9A825"/>
      </svg>
    `;
    const imageData =
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(svg)));

    try {
      const { data, error } = await supabase
        .from("flowers")
        .insert([
          {
            image: imageData,
            timestamp: new Date().toISOString(),
            waters: 0,
            user_id: userId,
            planter_name: gardenerName.trim(),
            flower_type: selectedType.id,
            color: selectedColor,
          },
        ])
        .select();
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
      const { data, error } = await supabase
        .from("flowers")
        .insert([
          {
            image: canvas.toDataURL("image/png"),
            timestamp: new Date().toISOString(),
            waters: 0,
            user_id: userId,
            planter_name: gardenerName.trim() || "Anonymous",
            flower_type: "custom",
            color: selectedColor,
          },
        ])
        .select();
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
    setFlowers((prev) =>
      prev.map((f) => (f.id === flower.id ? { ...f, waters: next } : f))
    );
    const { error } = await supabase.rpc("increment_waters", {
      flower_id: flower.id,
    });
    if (error) console.error(error);
  };

  const deleteFlower = async (flower) => {
    if (!window.confirm("Delete this flower?")) return;
    setFlowers((prev) => prev.filter((f) => f.id !== flower.id));
    const { error } = await supabase
      .from("flowers")
      .delete()
      .eq("id", flower.id);
    if (error) {
      setMessage("Failed to delete");
      loadFlowers();
    }
  };

  const exportGarden = async () => {
    if (!flowers.length) return;
    setExporting(true);
    try {
      const cols = 6;
      const cell = 160;
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
      await Promise.all(
        flowers.map(
          (f, i) =>
            new Promise((res) => {
              const img = new window.Image();
              img.onload = () => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const scale =
                  Math.min(cell / img.width, cell / img.height) * 0.85;
                const w = img.width * scale;
                const h = img.height * scale;
                ctx.drawImage(
                  img,
                  col * cell + (cell - w) / 2,
                  row * cell + 60 + (cell - h) / 2,
                  w,
                  h
                );
                res();
              };
              img.onerror = res;
              img.src = f.image;
            })
        )
      );
      const a = document.createElement("a");
      a.download = `garden-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = c.toDataURL("image/png");
      a.click();
    } finally {
      setExporting(false);
    }
  };

  // --- stats ---
  const typeCounts = FLOWER_TYPES.reduce((acc, t) => {
    acc[t.id] = flowers.filter((f) => f.flower_type === t.id).length;
    return acc;
  }, {});
  const maxTypeCount = Math.max(1, ...Object.values(typeCounts));
  const recent = flowers.slice(0, 6);

  // ===================== GALLERY VIEW =====================
  if (showGallery) {
    return (
      <div className="min-h-screen bg-[#F7F4ED] p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-[#2E7D32]">Flower Gallery</h2>
            <button
              onClick={() => setShowGallery(false)}
              className="px-5 py-2.5 rounded-full bg-[#66BB6A] text-white font-semibold hover:bg-[#43A047] transition"
            >
              ← Back to Garden
            </button>
          </div>
          <div className="flex flex-wrap gap-3 mb-6 items-center">
            <span className="text-[#558B2F] font-medium">
              {flowers.length} flowers
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border text-sm text-[#2E7D32]">
              <Users size={14} /> {onlineCount} online
            </span>
            <button
              onClick={exportGarden}
              disabled={exporting || !flowers.length}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Download size={14} /> {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {flowers.map((f) => (
              <div
                key={f.id}
                className="bg-white rounded-2xl p-3 shadow-sm border border-[#C8E6C9] hover:shadow-md transition"
              >
                <img
                  src={f.image}
                  alt=""
                  className="w-full h-28 object-contain"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-[#689F38]">
                  <span className="truncate max-w-[70%]">
                    {f.planter_name || "Anon"}
                  </span>
                  <button
                    onClick={() => waterFlower(f)}
                    className="inline-flex items-center gap-1 text-[#E91E63] font-semibold"
                  >
                    <Heart
                      size={12}
                      fill={f.waters ? "#E91E63" : "none"}
                    />
                    {f.waters || 0}
                  </button>
                </div>
                {f.user_id === userId && (
                  <button
                    onClick={() => deleteFlower(f)}
                    className="mt-1 text-[10px] text-red-500"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
          {!flowers.length && (
            <p className="text-center text-[#7CB342] text-xl py-16">
              No flowers yet — be the first!
            </p>
          )}
        </div>
      </div>
    );
  }

  // ===================== MAIN VIEW =====================
  return (
    <div className="min-h-screen bg-[#F7F4ED] text-[#2E3A2E] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#E0D9C8] bg-[#FBF9F4] px-4 md:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#1B3A1B]">
              Community Flower Garden
            </h1>
            <p className="text-sm text-[#6B7C6B]">
              A shared digital garden that grows together
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRefreshing(true);
                loadFlowers().finally(() => setRefreshing(false));
              }}
              className="p-2 rounded-full border border-[#D4CBB8] hover:bg-white transition"
              title="Refresh"
            >
              <RefreshCw
                size={18}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
            <button
              onClick={() => setShowGallery(true)}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#D4CBB8] text-sm font-medium hover:bg-[#F0EBE0] transition"
            >
              <ImageIcon size={16} /> Gallery
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-0 lg:gap-0">
        {/* ========== LEFT SIDEBAR ========== */}
        <aside className="border-r border-[#E0D9C8] bg-[#FBF9F4] p-5 space-y-6">
          {/* Name */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8A9A8A] mb-2">
              Gardening as
            </p>
            {nameEditing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveName(gardenerName);
                }}
                className="flex gap-2"
              >
                <input
                  autoFocus
                  value={gardenerName}
                  onChange={(e) => setGardenerName(e.target.value)}
                  placeholder="Your name"
                  maxLength={20}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#D4CBB8] text-sm outline-none focus:ring-2 focus:ring-[#81C784]"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-[#66BB6A] text-white text-sm font-semibold"
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                onClick={() => setNameEditing(true)}
                className="flex items-center gap-2 text-lg font-semibold text-[#1B3A1B] hover:opacity-70"
              >
                {gardenerName || "Anonymous"}
                <Pencil size={14} className="text-[#8A9A8A]" />
              </button>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl border border-[#D4CBB8] overflow-hidden text-sm font-medium">
            <button
              onClick={() => setMode("quick")}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition ${
                mode === "quick"
                  ? "bg-[#E8F5E9] text-[#2E7D32]"
                  : "bg-white text-[#6B7C6B]"
              }`}
            >
              <Flower2 size={15} /> Quick plant
            </button>
            <button
              onClick={() => setMode("draw")}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition ${
                mode === "draw"
                  ? "bg-[#E8F5E9] text-[#2E7D32]"
                  : "bg-white text-[#6B7C6B]"
              }`}
            >
              <Pencil size={15} /> Draw
            </button>
          </div>

          {mode === "quick" ? (
            <>
              {/* Flower type */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8A9A8A] mb-3">
                  Flower Type
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {FLOWER_TYPES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedType(t);
                        setSelectedColor(t.color);
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition ${
                        selectedType.id === t.id
                          ? "border-[#66BB6A] bg-[#E8F5E9]"
                          : "border-transparent bg-white hover:bg-[#F5F1E8]"
                      }`}
                    >
                      <span className="text-2xl">{t.emoji}</span>
                      <span className="text-xs font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8A9A8A] mb-3">
                  Color
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition ${
                        selectedColor === c
                          ? "border-[#1B3A1B] scale-110"
                          : "border-white shadow"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div
                  className="mt-3 h-2 rounded-full"
                  style={{ backgroundColor: selectedColor }}
                />
              </div>

              <button
                onClick={plantQuick}
                disabled={cooldownRemaining > 0}
                className="w-full py-3.5 rounded-xl bg-[#66BB6A] hover:bg-[#43A047] text-white font-bold text-base shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Leaf size={20} />
                {cooldownRemaining > 0
                  ? `Wait ${Math.ceil(cooldownRemaining / 1000)}s`
                  : "Plant flower"}
              </button>
            </>
          ) : (
            <>
              {/* Draw controls */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8A9A8A] mb-2">
                  Colors
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedColor(c)}
                      className={`w-8 h-8 rounded-full border-2 ${
                        selectedColor === c
                          ? "border-[#1B3A1B] scale-110"
                          : "border-white shadow"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value);
                      setSelectedColor(e.target.value);
                    }}
                    className="w-8 h-8 rounded-full cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8A9A8A] mb-2">
                  Brush
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    [BRUSH_TYPES.NORMAL, Circle, "Normal"],
                    [BRUSH_TYPES.GLOW, Sparkles, "Glow"],
                    [BRUSH_TYPES.SPRAY, Droplet, "Spray"],
                    [BRUSH_TYPES.FLOWER, Flower2, "Flower"],
                  ].map(([type, Icon, label]) => (
                    <button
                      key={type}
                      onClick={() => setBrushType(type)}
                      className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border ${
                        brushType === type
                          ? "bg-[#E8F5E9] border-[#66BB6A] text-[#2E7D32]"
                          : "bg-white border-[#E0D9C8]"
                      }`}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8A9A8A] mb-2">
                  Thickness
                </p>
                <div className="flex gap-2">
                  {THICKNESS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setThickness(s)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                        thickness === s
                          ? "border-[#1B3A1B] bg-[#E8F5E9]"
                          : "border-white bg-white shadow"
                      }`}
                    >
                      <div
                        className="rounded-full bg-[#2E7D32]"
                        style={{ width: s * 1.5, height: s * 1.5 }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className="flex-1 py-2 rounded-lg border text-sm disabled:opacity-40"
                >
                  <Undo2 size={14} className="inline mr-1" /> Undo
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className="flex-1 py-2 rounded-lg border text-sm disabled:opacity-40"
                >
                  <Redo2 size={14} className="inline mr-1" /> Redo
                </button>
              </div>

              <div
                className="rounded-xl overflow-hidden border-2 border-dashed border-[#C8E6C9] bg-white"
              >
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={400}
                  className="w-full cursor-crosshair"
                  style={{ touchAction: "none" }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={clearCanvas}
                  className="flex-1 py-2.5 rounded-xl border border-[#D4CBB8] text-sm font-medium"
                >
                  <RotateCcw size={14} className="inline mr-1" /> Clear
                </button>
                <button
                  onClick={plantDrawn}
                  disabled={cooldownRemaining > 0}
                  className="flex-[2] py-2.5 rounded-xl bg-[#66BB6A] text-white font-bold text-sm disabled:opacity-50"
                >
                  <Leaf size={14} className="inline mr-1" />
                  {cooldownRemaining > 0
                    ? `Wait ${Math.ceil(cooldownRemaining / 1000)}s`
                    : "Plant drawing"}
                </button>
              </div>
            </>
          )}

          {message && (
            <div className="text-center text-sm font-medium text-[#2E7D32] bg-[#E8F5E9] rounded-lg py-2 px-3">
              {message}
            </div>
          )}
        </aside>

        {/* ========== CENTER GARDEN ========== */}
        <main className="relative min-h-[60vh] lg:min-h-0 bg-[#E8F5E0] overflow-hidden">
          {/* soft petals background */}
          <div className="absolute inset-0 pointer-events-none opacity-40">
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-pink-200"
                style={{
                  width: 12 + (i % 5) * 6,
                  height: 8 + (i % 4) * 4,
                  left: `${(i * 17) % 100}%`,
                  top: `${(i * 13) % 40}%`,
                  transform: `rotate(${i * 40}deg)`,
                }}
              />
            ))}
          </div>

          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-[#558B2F] text-lg">
              Loading garden… 🌱
            </div>
          ) : flowers.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-center text-[#558B2F]">
              <div>
                <p className="text-3xl mb-2">🌱</p>
                <p className="text-xl font-semibold">The garden is waiting</p>
                <p className="text-sm mt-1">Plant the first flower!</p>
              </div>
            </div>
          ) : (
            flowers.map((f) => {
              const pos = gardenPositions[f.id] || { x: 50, y: 50 };
              return (
                <div
                  key={f.id}
                  className="absolute transition-transform hover:scale-125 cursor-default"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: "translate(-50%, -50%)",
                    width: 64,
                    height: 72,
                  }}
                  title={`${f.planter_name || "Anon"} · ${relativeTime(f.timestamp)}`}
                >
                  <img
                    src={f.image}
                    alt=""
                    className="w-full h-full object-contain drop-shadow-md"
                  />
                </div>
              );
            })
          )}
        </main>

        {/* ========== RIGHT SIDEBAR ========== */}
        <aside className="border-l border-[#E0D9C8] bg-[#FBF9F4] p-5 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[#1B3A1B]">Garden Stats</h3>
            <p className="text-xs text-[#8A9A8A]">Live community activity</p>
          </div>

          <div className="rounded-2xl bg-[#E8F5E9] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#66BB6A]">
              <Flower2 size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1B3A1B]">
                {flowers.length}
              </p>
              <p className="text-xs text-[#558B2F]">Flowers planted</p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#FFF3E0] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#FB8C00]">
              <Users size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1B3A1B]">{onlineCount}</p>
              <p className="text-xs text-[#E65100]">Gardeners online</p>
            </div>
          </div>

          {/* Species distribution */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8A9A8A] mb-3">
              Species Distribution
            </p>
            <div className="space-y-2.5">
              {FLOWER_TYPES.map((t) => (
                <div key={t.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{t.label}</span>
                    <span className="text-[#8A9A8A]">{typeCounts[t.id]}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#EDE8DC] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(typeCounts[t.id] / maxTypeCount) * 100}%`,
                        backgroundColor: t.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent activity */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8A9A8A] mb-3">
              Recent Activity
            </p>
            <div className="space-y-3">
              {recent.map((f) => {
                const type =
                  FLOWER_TYPES.find((t) => t.id === f.flower_type) || {
                    emoji: "🌸",
                    label: "Custom",
                  };
                return (
                  <div key={f.id} className="flex items-start gap-2.5 text-sm">
                    <span className="text-lg leading-none mt-0.5">
                      {type.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-[#1B3A1B] truncate">
                        {f.planter_name || "Anonymous"}
                      </p>
                      <p className="text-xs text-[#8A9A8A]">
                        planted a {type.label} · {relativeTime(f.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
              {!recent.length && (
                <p className="text-xs text-[#8A9A8A]">No activity yet</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
