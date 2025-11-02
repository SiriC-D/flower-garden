"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Leaf, Image, RotateCcw } from 'lucide-react';

const COLORS = ['#E91E63','#FFCDD2','#FFEB3B','#81D4FA','#2E7D32'];

export default function FlowerGarden() {
  const [flowers, setFlowers] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [showGallery, setShowGallery] = useState(false);
  const [message, setMessage] = useState('');
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);

  // Load flowers from localStorage
  useEffect(() => {
    const value = localStorage.getItem('garden_flowers');
    if (value) setFlowers(JSON.parse(value));
    setLoading(false);
  }, []);

  const saveFlowers = async (newFlowers) => {
    localStorage.setItem('garden_flowers', JSON.stringify(newFlowers));
  };

  // Resize canvas to match display size
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas.parentElement;
    if (!canvas || !parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.width; // make it square
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Convert client coords to canvas coords
  const getCoords = (clientX, clientY) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const startDrawing = ({ clientX, clientY }) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoords(clientX, clientY);

    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = ({ clientX, clientY }) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoords(clientX, clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMessage('');
  };

  const plantFlower = async () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const isEmpty = !pixelData.data.some(channel => channel !== 0);
    if (isEmpty) {
      setMessage('Draw something first! 🎨');
      setTimeout(() => setMessage(''), 2000);
      return;
    }

    const imageData = canvas.toDataURL('image/png');
    const newFlower = { id: Date.now(), image: imageData, timestamp: new Date().toISOString() };
    const updated = [newFlower, ...flowers];
    setFlowers(updated);
    await saveFlowers(updated);
    setMessage('🌸 Planted! 🌸');
    setTimeout(() => setMessage(''), 2000);
    clearCanvas();
  };

  // Render gallery or garden
  if (showGallery) {
    return (
      <div className="min-h-screen p-4" style={{ fontFamily: '"Comic Sans MS", cursive', background: 'linear-gradient(to bottom, #F0F4C3, #C5E1A5)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-8" style={{ border: '4px solid #81C784' }}>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-5xl font-bold" style={{ color: '#2E7D32', textShadow: '3px 3px 0px #A5D6A7' }}>Flower Gallery</h2>
              <button onClick={() => setShowGallery(false)} className="px-6 py-3 text-white rounded-full font-bold shadow-lg transform hover:scale-105 transition" style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: '3px solid #2E7D32' }}>← Back to Garden</button>
            </div>
            {flowers.length === 0 ? <div className="text-center py-16 text-3xl" style={{ color: '#7CB342' }}>No flowers yet! 🌱</div> :
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {flowers.map(f => <div key={f.id} className="bg-white rounded-2xl p-3 shadow-lg"><img src={f.image} className="w-full h-32 object-contain"/><p className="text-sm text-center mt-2">{new Date(f.timestamp).toLocaleDateString()}</p></div>)}
              </div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4" style={{ fontFamily: '"Comic Sans MS", cursive', background: 'linear-gradient(to bottom, #F0F4C3, #C5E1A5)' }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-6xl font-bold text-center mb-8" style={{ color: '#2E7D32', textShadow: '4px 4px 0px #A5D6A7' }}>Flower Garden</h1>

        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-8" style={{ border: '4px solid #81C784' }}>
          <div className="flex gap-4 mb-6 justify-center flex-wrap">
            {COLORS.map(c => <button key={c} onClick={() => setSelectedColor(c)} className={`w-16 h-16 rounded-full border-4 ${selectedColor===c?'scale-125 border-gray-800':'border-white'}`} style={{ backgroundColor:c }} />)}
          </div>

          <div className="rounded-2xl mb-6 bg-white mx-auto shadow-inner" style={{ border: '5px dashed #81C784' }}>
            <canvas
              ref={canvasRef}
              className="w-full h-64 rounded-2xl touch-none"
              onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
              onTouchStart={e => { e.preventDefault(); startDrawing({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }}
              onTouchMove={e => { e.preventDefault(); draw({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }}
              onTouchEnd={e => { e.preventDefault(); stopDrawing(); }}
            />
          </div>

          {message && <div className="mb-6 p-4 rounded-2xl text-center text-2xl font-bold" style={{ background: '#C5E1A5', color: '#33691E', border: '3px solid #7CB342' }}>{message}</div>}

          <div className="flex gap-4 justify-center flex-wrap">
            <button onClick={clearCanvas} className="px-6 py-3 rounded-full font-bold shadow-lg">Clear</button>
            <button onClick={plantFlower} className="px-8 py-3 rounded-full text-white font-bold shadow-lg" style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)' }}>Plant <Leaf size={20}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}
