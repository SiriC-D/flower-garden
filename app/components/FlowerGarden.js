import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Leaf, Image, RotateCcw } from 'lucide-react';

const COLORS = [
  '#E91E63', // Pink
  '#FFCDD2', // Light Pink
  '#FFEB3B', // Yellow
  '#81D4FA', // Light Blue
  '#2E7D32', // Green
];

// Styles for the floating animation
const floatKeyframes = `
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
  }
`;

export default function App() {
  const [flowers, setFlowers] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [showGallery, setShowGallery] = useState(false);
  const [message, setMessage] = useState('');
  // userId is now a simple random ID since we aren't authenticating
  const [userId] = useState(crypto.randomUUID());
  const canvasRef = useRef(null);
  
  // --- Local Storage Functions ---

  const saveFlowers = useCallback((newFlowers) => {
    try {
      localStorage.setItem('garden_flowers', JSON.stringify(newFlowers));
    } catch (error) {
      console.error('Failed to save flowers:', error);
    }
  }, []);

  useEffect(() => {
    // Load flowers from local storage on mount
    try {
      const value = localStorage.getItem('garden_flowers');
      if (value) {
        const loadedFlowers = JSON.parse(value).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setFlowers(loadedFlowers);
      }
    } catch (error) {
      console.log('No flowers yet, starting fresh garden or error reading local storage.');
      setFlowers([]);
    }
  }, []);

  // --- Drawing Logic ---

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');

    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setIsDrawing(true);

    // Calculate canvas local coordinates from screen coordinates
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');

    // Calculate canvas local coordinates from screen coordinates
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setMessage('');
  };

  const plantFlower = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setMessage('Canvas not ready.');
      return;
    }
    
    // Check if canvas is empty
    const ctx = canvas.getContext('2d');
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const isEmpty = !pixelData.data.some(channel => channel !== 0);

    if (isEmpty) {
      setMessage('Draw something first! 🎨');
      setTimeout(() => setMessage(''), 2000);
      return;
    }

    const imageData = canvas.toDataURL('image/png');

    const newFlower = {
      id: Date.now(), // Use local ID now
      image: imageData,
      timestamp: new Date().toISOString(),
      plantedBy: userId,
      color: selectedColor
    };

    const updatedFlowers = [newFlower, ...flowers];
    setFlowers(updatedFlowers);
    saveFlowers(updatedFlowers);

    setMessage('🌸 Planted! 🌸');
    setTimeout(() => setMessage(''), 2000);
    clearCanvas();
  };

  // ---- MOBILE TOUCH FIXES ----
  
  const handleTouchStart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    // Pass the raw screen coordinates (clientX/Y) to startDrawing
    startDrawing({ clientX: touch.clientX, clientY: touch.clientY });
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const touch = e.touches[0];
    // Pass the raw screen coordinates (clientX/Y) to draw.
    draw({ clientX: touch.clientX, clientY: touch.clientY });
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    stopDrawing();
  };
  // -----------------------------
  
  if (showGallery) {
    return (
      <div className="min-h-screen p-4" style={{ 
        background: 'linear-gradient(to bottom, #F0F4C3, #C5E1A5)',
        fontFamily: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive'
      }}>
        <style>{floatKeyframes}</style>
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-8" style={{ border: '4px solid #81C784' }}>
            <div className="flex items-center justify-between mb-8 flex-wrap">
              <h2 className="text-4xl sm:text-5xl font-bold" style={{ color: '#2E7D32', textShadow: '3px 3px 0px #A5D6A7' }}>Flower Gallery</h2>
              <button
                onClick={() => setShowGallery(false)}
                className="px-4 sm:px-6 py-2 sm:py-3 text-white rounded-full text-lg sm:text-xl font-bold shadow-lg transform hover:scale-105 transition mt-4 sm:mt-0"
                style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: '3px solid #2E7D32' }}
              >
                ← Back to Garden
              </button>
            </div>
            
            <p className="text-xl sm:text-2xl mb-6" style={{ color: '#558B2F' }}>{flowers.length} total flowers 🌺</p>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {flowers.map((flower) => (
                <div key={flower.id} className="bg-white rounded-2xl p-3 shadow-xl transform hover:scale-105 transition" style={{ border: '3px solid #AED581' }}>
                  <img src={flower.image} alt="Planted flower" className="w-full h-32 object-contain" style={{ filter: 'drop-shadow(1px 1px 3px rgba(0,0,0,0.1))' }}/>
                  <p className="text-xs sm:text-sm text-center mt-2" style={{ color: '#689F38' }}>
                    Planted on: {new Date(flower.timestamp).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-center mt-1 text-gray-500 truncate">
                    By: {flower.plantedBy ? `${flower.plantedBy.substring(0, 8)}...` : 'Unknown'}
                  </p>
                </div>
              ))}
            </div>
            
            {flowers.length === 0 && (
              <div className="text-center py-16 text-2xl sm:text-3xl" style={{ color: '#7CB342' }}>
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
      <style>{floatKeyframes}</style>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl sm:text-6xl font-bold mb-3" style={{ color: '#2E7D32', textShadow: '4px 4px 0px #A5D6A7', letterSpacing: '2px' }}>
            Local Flower Garden
          </h1>
          <p className="text-xl sm:text-2xl" style={{ color: '#558B2F' }}>Flowers saved to your browser</p>
        </div>

        {/* Garden Display */}
        <div className="bg-white rounded-3xl shadow-2xl p-4 sm:p-8 mb-8" style={{ border: '4px solid #81C784' }}>
          <div className="relative rounded-3xl p-4 sm:p-8 min-h-[250px] sm:min-h-80 overflow-hidden shadow-inner" style={{ background: 'linear-gradient(to bottom, #7CB342, #558B2F)', border: '5px solid #33691E' }}>
            {/* Textured background */}
            <div className="absolute inset-0 opacity-30">
              <div className="h-full w-full" style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(139, 195, 74, 0.3) 8px, rgba(139, 195, 74, 0.3) 10px)` }}></div>
            </div>
            
            <div className="relative grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-3 sm:gap-6 justify-items-center">
              {flowers.slice(0, 42).map((flower, idx) => (
                <div key={flower.id} className="transform hover:scale-110 transition w-full h-16 sm:h-24" style={{ animation: `float ${2 + (idx % 3)}s ease-in-out infinite`, animationDelay: `${idx * 0.1}s` }}>
                  <img src={flower.image} alt="Planted flower" className="w-full h-full object-contain" style={{ filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))' }} />
                </div>
              ))}
            </div>
            
            {flowers.length === 0 && <div className="text-center text-white text-2xl sm:text-3xl font-bold pt-10">The garden is waiting! 🌱<br/>Plant the first flower!</div>}
          </div>
          
          <div className="mt-6 text-center">
            <button onClick={() => setShowGallery(true)} className="inline-flex items-center gap-3 px-6 sm:px-8 py-3 sm:py-4 text-white rounded-full text-xl sm:text-2xl font-bold shadow-lg transform hover:scale-105 transition" style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: '3px solid #2E7D32' }}>
              <Image size={28} />
              See flower gallery
            </button>
          </div>
        </div>

        {/* Drawing Area */}
        <div className="bg-white rounded-3xl shadow-2xl p-4 sm:p-8" style={{ border: '4px solid #81C784' }}>
          <h3 className="text-3xl sm:text-4xl font-bold mb-6 text-center" style={{ color: '#2E7D32', textShadow: '2px 2px 0px #A5D6A7' }}>Draw your own flower!</h3>
          
          {/* Color Palette */}
          <div className="flex gap-3 sm:gap-4 mb-6 justify-center flex-wrap">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`w-10 h-10 sm:w-16 sm:h-16 rounded-full border-4 transition transform hover:scale-110 ${selectedColor === color ? 'scale-125 border-gray-800' : 'border-white'}`}
                style={{ backgroundColor: color, boxShadow: selectedColor === color ? '0 0 0 4px rgba(46, 125, 50, 0.3)' : '0 4px 6px rgba(0,0,0,0.2)' }}
              />
            ))}
          </div>

          {/* Canvas */}
          <div className="rounded-2xl mb-6 bg-white mx-auto shadow-inner" style={{ border: '5px dashed #81C784', maxWidth: '450px' }}>
            <canvas
              ref={canvasRef}
              width={450} // Fixed drawing dimensions
              height={450}
              // Set the canvas to fill the container on mobile/desktop
              className="w-full h-auto max-w-full cursor-crosshair rounded-2xl aspect-square" 
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              
              // Touch Events (FIXED for mobile drawing)
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          </div>

          {/* Message */}
          {message && <div className="mb-6 p-3 sm:p-4 rounded-2xl text-center text-xl sm:text-2xl font-bold" style={{ background: '#C5E1A5', color: '#33691E', border: '3px solid #7CB342' }}>{message}</div>}

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center flex-wrap">
            <button onClick={clearCanvas} className="inline-flex items-center gap-2 px-5 sm:px-6 py-2 sm:py-3 rounded-full text-lg sm:text-xl font-bold shadow-lg transform hover:scale-105 transition" style={{ background: '#FFF9C4', color: '#F57F17', border: '3px solid #FBC02D' }}>
              <RotateCcw size={24} />
              Clear
            </button>
            
            <button onClick={plantFlower} className="inline-flex items-center gap-3 px-6 sm:px-8 py-2 sm:py-3 text-white rounded-full text-xl sm:text-2xl font-bold shadow-lg transform transition hover:scale-105" style={{ background: 'linear-gradient(135deg, #66BB6A, #43A047)', border: '3px solid #2E7D32' }}>
              <Leaf size={28} />
              Plant Flower
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
