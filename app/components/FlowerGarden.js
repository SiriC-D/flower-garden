"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Leaf, Image, RotateCcw } from 'lucide-react';

const COLORS = [
  '#E91E63', // Pink
  '#FFCDD2', // Light Pink
  '#FFEB3B', // Yellow
  '#81D4FA', // Light Blue
  '#2E7D32', // Green
];

export default function FlowerGarden() {
  const [flowers, setFlowers] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [showGallery, setShowGallery] = useState(false);
  const [message, setMessage] = useState('');
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);

  // --- Core Utility Functions (Memoized for use in useEffect) ---

  // Helper to get coordinates, accounting for canvas scaling
  const getCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Determine if it's a TouchEvent or a MouseEvent
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Calculate the position relative to the *visual* canvas element
    const xVisual = clientX - rect.left;
    const yVisual = clientY - rect.top;

    // Calculate the scaling factor (Internal Drawing Width / Visual CSS Width)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Apply the scaling factor to get the correct coordinate for the 450x450 drawing buffer
    const x = xVisual * scaleX;
    const y = yVisual * scaleY;
    
    return { x, y };
  }, []);

  const startDrawing = useCallback((e) => {
    // Use the helper to get the correct coordinates
    const { x, y } = getCoords(e);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    setIsDrawing(true);
    
    // Start a new path and move to the initial point
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getCoords, selectedColor]);

  const stopDrawing = useCallback(() => setIsDrawing(false), []);

  const draw = useCallback((e) => {
    // Only draw if we are in a drawing state
    if (!isDrawing) return;
    
    // Use the helper to get the correct coordinates
    const { x, y } = getCoords(e);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Draw the line from the current position to the new coordinate
    ctx.lineTo(x, y);
    ctx.stroke();
    
    // CRUCIAL: Move the starting point of the path to the current position (x, y)
    ctx.moveTo(x, y);
  }, [getCoords, isDrawing]);


  // --- Event Handlers for Imperative Attachment ---

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
  

  // --- useEffect to Attach Non-Passive Touch Listeners ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Attach listeners with { passive: false } to reliably prevent default browser behavior
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Cleanup function to remove event listeners when the component unmounts
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // --- Other Component Logic ---
  
  useEffect(() => {
    loadFlowers();
  }, []);

  const loadFlowers = async () => {
    try {
      const value = localStorage.getItem('garden_flowers');
      if (value) setFlowers(JSON.parse(value));
    } catch (error) {
      console.log('No flowers yet, starting fresh garden');
      setFlowers([]);
    } finally {
      setLoading(false);
    }
  };

  const saveFlowers = async (newFlowers) => {
    try {
      localStorage.setItem('garden_flowers', JSON.stringify(newFlowers));
    } catch (error) {
      console.error('Failed to save flowers:', error);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMessage('');
  };

  const plantFlower = async () => {
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

    const newFlower = {
      id: Date.now(),
      image: imageData,
      timestamp: new Date().toISOString()
    };
    
    const updatedFlowers = [newFlower, ...flowers];
    setFlowers(updatedFlowers);
    await saveFlowers(updatedFlowers);
    
    setMessage('🌸 Planted! 🌸');
    setTimeout(() => setMessage(''), 2000);
    clearCanvas();
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
            
            <p className="text-2xl mb-6" style={{ color: '#558B2F' }}>{flowers.length} total flowers 🌺</p>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {flowers.map((flower) => (
                <div key={flower.id} className="bg-white rounded-2xl p-3 shadow-lg transform hover:scale-110 transition" style={{ border: '3px solid #AED581' }}>
                  <img src={flower.image} alt="Community flower" className="w-full h-32 object-contain" />
                  <p className="text-sm text-center mt-2" style={{ color: '#689F38' }}>
                    {new Date(flower.timestamp).toLocaleDateString()}
                  </p>
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
          <p className="text-2xl" style={{ color: '#558B2F' }}>{flowers.length} total flowers</p>
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
          
          <div className="mt-6 text-center">
            <button onClick={() => setShowGallery(true)} className="inline-flex items-center gap-3 px-8 py-4 text-white rounded-full text-2xl font-bold shadow-lg transform hover:scale-105 transition" style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: '3px solid #2E7D32' }}>
              <Image size={28} />
              See flower gallery
            </button>
          </div>
        </div>

        {/* Drawing Area */}
        <div className="bg-white rounded-3xl shadow-2xl p-8" style={{ border: '4px solid #81C784' }}>
          <h3 className="text-4xl font-bold mb-6 text-center" style={{ color: '#2E7D32', textShadow: '2px 2px 0px #A5D6A7' }}>Add flowers to our garden?</h3>
          
          {/* Color Palette */}
          <div className="flex gap-4 mb-6 justify-center flex-wrap">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`w-16 h-16 rounded-full border-4 transition transform hover:scale-110 ${selectedColor === color ? 'scale-125 border-gray-800' : 'border-white'}`}
                style={{ backgroundColor: color, boxShadow: selectedColor === color ? '0 0 0 4px rgba(46, 125, 50, 0.3)' : '0 4px 6px rgba(0,0,0,0.2)' }}
              />
            ))}
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
            
            <button onClick={plantFlower} className="inline-flex items-center gap-3 px-8 py-3 text-white rounded-full text-2xl font-bold shadow-lg transform hover:scale-105 transition" style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: '3px solid #2E7D32' }}>
              <Leaf size={28} />
              Plant
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