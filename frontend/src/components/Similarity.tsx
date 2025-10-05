'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface SimilarityScores {
  color: number[][];
  brightness: number[][];
  hog: number[][];
  average: number[][];
}

interface SimilarityResult {
  grid_size: number;
  scores: SimilarityScores;
}

interface Props {
  onClose?: () => void;
}

export default function Similarity({ onClose }: Props) {
  const [patternImage, setPatternImage] = useState<string | null>(null);
  const [gridSize, setGridSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimilarityResult | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'average' | 'color' | 'brightness' | 'hog'>('average');
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Bloquear/desbloquear el viewer cuando se muestra/oculta la matriz
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleToggleMapInteraction = (disable: boolean) => {
      const mapContainer = document.querySelector('.leaflet-container');
      if (mapContainer) {
        if (disable) {
          (mapContainer as HTMLElement).style.pointerEvents = 'none';
          console.log('🔒 Map interaction disabled');
        } else {
          (mapContainer as HTMLElement).style.pointerEvents = 'auto';
          console.log('🔓 Map interaction enabled');
        }
      }
    };

    handleToggleMapInteraction(showOverlay);

    return () => {
      // Asegurar que se desbloquea al desmontar
      handleToggleMapInteraction(false);
    };
  }, [showOverlay]);

  // Dibujar la matriz de similitud en el canvas cuando cambie el resultado o la métrica
  useEffect(() => {
    if (!result || !showOverlay || !overlayCanvasRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Obtener las dimensiones del viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Configurar el canvas con las dimensiones del viewport
    canvas.width = viewportWidth;
    canvas.height = viewportHeight;

    // Limpiar el canvas
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    // Buscar el contenedor de Leaflet
    const mapContainer = document.querySelector('.leaflet-container') as HTMLElement;
    if (!mapContainer) {
      console.warn('⚠️ Map container not available');
      return;
    }

    // Obtener las dimensiones y posición del contenedor del mapa
    const mapRect = mapContainer.getBoundingClientRect();
    
    // Buscar la capa de imagen dentro del contenedor (leaflet-image-layer)
    const imageLayer = mapContainer.querySelector('.leaflet-image-layer') as HTMLImageElement;
    
    let imageLeft = 0;
    let imageTop = 0;
    let imageScreenWidth = viewportWidth;
    let imageScreenHeight = viewportHeight;

    if (imageLayer) {
      // Si encontramos la capa de imagen, usar sus dimensiones y posición
      const imageRect = imageLayer.getBoundingClientRect();
      imageLeft = imageRect.left;
      imageTop = imageRect.top;
      imageScreenWidth = imageRect.width;
      imageScreenHeight = imageRect.height;
      
      console.log('🎨 Using image layer bounds:', {
        imageLeft,
        imageTop,
        imageScreenWidth,
        imageScreenHeight
      });
    } else {
      // Si no encontramos la imagen específica, usar todo el contenedor del mapa
      imageLeft = mapRect.left;
      imageTop = mapRect.top;
      imageScreenWidth = mapRect.width;
      imageScreenHeight = mapRect.height;
      
      console.log('🎨 Using map container bounds:', {
        imageLeft,
        imageTop,
        imageScreenWidth,
        imageScreenHeight
      });
    }

    console.log('🎨 Drawing similarity matrix:', {
      viewportWidth,
      viewportHeight,
      imageLeft,
      imageTop,
      imageScreenWidth,
      imageScreenHeight,
      gridSize: result.grid_size
    });

    // Dibujar la matriz de similitud
    const scores = result.scores[selectedMetric];
    const cellWidth = imageScreenWidth / result.grid_size;
    const cellHeight = imageScreenHeight / result.grid_size;

    for (let row = 0; row < result.grid_size; row++) {
      for (let col = 0; col < result.grid_size; col++) {
        const score = scores[row][col];
        
        // Convertir el score (0-1) a un color del espectro azul -> verde -> rojo
        const color = scoreToColor(score);
        
        // Posición de la celda en la pantalla
        const x = imageLeft + col * cellWidth;
        const y = imageTop + row * cellHeight;

        // Dibujar la celda con transparencia
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellWidth, cellHeight);

        // Dibujar el borde de la celda
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellWidth, cellHeight);
      }
    }
  }, [result, selectedMetric, showOverlay]);

  // Función para convertir score a color (azul -> cian -> verde -> amarillo -> rojo)
  const scoreToColor = (score: number): string => {
    // Asegurar que el score está entre 0 y 1
    const clampedScore = Math.max(0, Math.min(1, score));
    
    // Transparencia base
    const alpha = 0.6;
    
    if (clampedScore < 0.25) {
      // Azul (0) -> Cian (0.25)
      const t = clampedScore / 0.25;
      const r = 0;
      const g = Math.round(255 * t);
      const b = 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else if (clampedScore < 0.5) {
      // Cian (0.25) -> Verde (0.5)
      const t = (clampedScore - 0.25) / 0.25;
      const r = 0;
      const g = 255;
      const b = Math.round(255 * (1 - t));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else if (clampedScore < 0.75) {
      // Verde (0.5) -> Amarillo (0.75)
      const t = (clampedScore - 0.5) / 0.25;
      const r = Math.round(255 * t);
      const g = 255;
      const b = 0;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else {
      // Amarillo (0.75) -> Rojo (1.0)
      const t = (clampedScore - 0.75) / 0.25;
      const r = 255;
      const g = Math.round(255 * (1 - t));
      const b = 0;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  };

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setPatternImage(event.target?.result as string);
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCalculate = async () => {
    if (!patternImage) {
      setError('Please upload a pattern image first');
      return;
    }

    setLoading(true);
    setError(null);
    setShowOverlay(false); // Ocultar overlay anterior si existe

    try {
      const targetImageUrl = `${window.location.origin}/andromeda.jpg`;

      const response = await fetch('http://localhost:8000/similarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_path1: patternImage,
          image_path2: targetImageUrl,
          grid_size: gridSize,
        }),
      });

      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      const data: SimilarityResult = await response.json();
      setResult(data);
      setShowOverlay(true); // Mostrar la matriz sobre la imagen
      console.log('Similarity result:', data);
    } catch (err) {
      console.error('Similarity calculation error:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCloseOverlay = () => {
    setShowOverlay(false);
  };

  const handleClose = () => {
    setShowOverlay(false);
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Canvas Overlay para la matriz de similitud */}
      {showOverlay && (
        <div className="fixed inset-0 z-[1000] pointer-events-none">
          <canvas 
            ref={overlayCanvasRef}
            className="w-full h-full"
          />
        </div>
      )}

      {/* Botón para cerrar la matriz cuando está visible */}
      {showOverlay && (
        <div className="fixed top-4 right-4 z-[1200]">
          <button
            onClick={handleCloseOverlay}
            className="px-4 py-2 bg-red-500/80 hover:bg-red-500 border border-red-400 rounded-lg text-white font-mono text-sm font-bold shadow-lg transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            HIDE MATRIX
          </button>
        </div>
      )}

      {/* Aviso cuando la matriz está visible */}
      {showOverlay && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[1200] bg-purple-500/90 border border-purple-400 rounded-lg px-4 py-2 shadow-lg">
          <div className="text-white font-mono text-xs font-bold flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            🔒 Map interaction disabled - Close matrix to re-enable
          </div>
        </div>
      )}

      {/* Control Panel */}
      <div className="absolute top-[520px] left-4 z-[1100] w-64 bg-black/90 border border-cyan-500/30 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.2)]">
        {/* Header */}
      <div className="p-2.5 border-b border-cyan-500/20 flex items-center justify-between">
        <div className="text-cyan-400 font-mono font-bold text-xs flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></div>
          SIMILARITY
        </div>
        {onClose && (
          <button
            onClick={handleClose}
            className="text-cyan-400/60 hover:text-cyan-400 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-2.5 space-y-2.5">
        {/* Pattern Upload */}
        <div>
          <label className="text-cyan-400/70 text-[10px] font-mono block mb-1.5">Pattern Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            id="pattern-upload"
          />
          <label
            htmlFor="pattern-upload"
            className="block w-full py-2 px-3 border border-cyan-500/30 rounded text-center text-cyan-400 text-[10px] font-mono cursor-pointer hover:bg-cyan-500/10 transition-all"
          >
            {patternImage ? '✓ Pattern Loaded' : '📁 Upload Pattern'}
          </label>
          
          {patternImage && (
            <div className="mt-2 border border-cyan-500/20 rounded overflow-hidden">
              <img src={patternImage} alt="Pattern" className="w-full h-20 object-contain bg-black/50" />
            </div>
          )}
        </div>

        {/* Grid Size */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-cyan-400/70 text-[10px] font-mono">Grid Size</label>
            <span className="text-cyan-300 text-[10px] font-mono font-bold">{gridSize}x{gridSize}</span>
          </div>
          <input
            type="range"
            min={5}
            max={20}
            step={1}
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value))}
            className="w-full h-1 bg-cyan-500/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:bg-cyan-300"
          />
        </div>

        {/* Calculate Button */}
        <button
          onClick={handleCalculate}
          disabled={loading || !patternImage}
          className="w-full py-2 bg-purple-500/20 border border-purple-500/50 rounded text-purple-400 text-[11px] font-mono hover:bg-purple-500/30 transition-all disabled:opacity-50 font-bold"
        >
          {loading ? '⟳ CALCULATING...' : '▶ CALCULATE'}
        </button>

        {/* Show/Hide Matrix Button (solo cuando hay resultado) */}
        {result && (
          <button
            onClick={() => setShowOverlay(!showOverlay)}
            className={`w-full py-2 border rounded text-[11px] font-mono transition-all font-bold ${
              showOverlay
                ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {showOverlay ? '👁️ HIDE MATRIX' : '👁️ SHOW MATRIX'}
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-[10px] text-red-400 font-mono">
            ⚠ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-2">
            {/* Metric Selector */}
            <div className="flex gap-1">
              {(['average', 'color', 'brightness', 'hog'] as const).map((metric) => (
                <button
                  key={metric}
                  onClick={() => setSelectedMetric(metric)}
                  className={`flex-1 py-1 rounded text-[9px] font-mono transition-all ${
                    selectedMetric === metric
                      ? 'bg-purple-500/30 border border-purple-500/60 text-purple-300'
                      : 'bg-black/40 border border-purple-500/20 text-purple-400/60 hover:border-purple-500/40'
                  }`}
                >
                  {metric.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Stats */}
            <div className="text-[9px] font-mono text-cyan-400/60 p-2 bg-black/50 border border-cyan-500/30 rounded">
              <div className="flex justify-between mb-1">
                <span>Max:</span>
                <span className="text-cyan-400 font-bold">
                  {(Math.max(...result.scores[selectedMetric].flat()) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Avg:</span>
                <span className="text-cyan-400 font-bold">
                  {(result.scores[selectedMetric].flat().reduce((a, b) => a + b, 0) / 
                    (result.grid_size * result.grid_size) * 100).toFixed(1)}%
                </span>
              </div>
              
              {/* Color Legend */}
              <div className="pt-2 border-t border-cyan-500/30">
                <div className="text-[8px] text-cyan-400/70 mb-1">Color Scale:</div>
                <div className="flex h-3 rounded overflow-hidden">
                  <div className="flex-1" style={{ backgroundColor: 'rgb(0, 0, 255)' }}></div>
                  <div className="flex-1" style={{ backgroundColor: 'rgb(0, 255, 255)' }}></div>
                  <div className="flex-1" style={{ backgroundColor: 'rgb(0, 255, 0)' }}></div>
                  <div className="flex-1" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></div>
                  <div className="flex-1" style={{ backgroundColor: 'rgb(255, 0, 0)' }}></div>
                </div>
                <div className="flex justify-between text-[7px] text-cyan-400/50 mt-0.5">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}
