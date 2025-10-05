'use client';

import { useState, useCallback, useEffect } from 'react';

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
  const [showOverlay, setShowOverlay] = useState(true);
  const [viewerState, setViewerState] = useState<any>(null);

  // Sincronizar con el estado del viewer (igual que BoundingBoxOverlay)
  useEffect(() => {
    // Actualizar el estado del viewer cada 100ms
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).andromedaViewerState) {
        setViewerState((window as any).andromedaViewerState);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Debug logs
  useEffect(() => {
    console.log('🎯 Similarity Grid render check:', {
      hasResult: !!result,
      showOverlay,
      hasViewerState: !!viewerState,
      gridSize,
      viewerState
    });
  }, [result, showOverlay, viewerState, gridSize]);

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

    try {
      // Get current viewer center to use as target area
      const viewerState = (window as any).andromedaViewerState;
      const targetImageUrl = viewerState 
        ? `${window.location.origin}/andromeda.jpg`
        : `${window.location.origin}/andromeda.jpg`;

      const response = await fetch('http://localhost:8000/similarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_path1: patternImage, // Pattern (uploaded by user)
          image_path2: targetImageUrl, // Target (Andromeda image)
          grid_size: gridSize,
        }),
      });

      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      const data: SimilarityResult = await response.json();
      setResult(data);
      console.log('Similarity result:', data);
    } catch (err) {
      console.error('Similarity calculation error:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const getHeatmapColor = (value: number) => {
    // value from 0 to 1, convert to color gradient (blue -> cyan -> green -> yellow -> red)
    const clampedValue = Math.max(0, Math.min(1, value));
    
    if (clampedValue < 0.25) {
      // Blue to Cyan
      const t = clampedValue / 0.25;
      return `rgb(0, ${Math.round(t * 255)}, 255)`;
    } else if (clampedValue < 0.5) {
      // Cyan to Green
      const t = (clampedValue - 0.25) / 0.25;
      return `rgb(0, 255, ${Math.round(255 - t * 255)})`;
    } else if (clampedValue < 0.75) {
      // Green to Yellow
      const t = (clampedValue - 0.5) / 0.25;
      return `rgb(${Math.round(t * 255)}, 255, 0)`;
    } else {
      // Yellow to Red
      const t = (clampedValue - 0.75) / 0.25;
      return `rgb(255, ${Math.round(255 - t * 255)}, 0)`;
    }
  };

  return (
    <>
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
            onClick={onClose}
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

        {/* Error */}
        {error && (
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-[10px] text-red-400 font-mono">
            ⚠ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-2">
            {/* Overlay Toggle */}
            <div className="flex items-center justify-between p-1.5 bg-black/40 border border-purple-500/20 rounded">
              <span className="text-purple-400/70 text-[9px] font-mono">Show Grid Overlay</span>
              <button
                onClick={() => setShowOverlay(!showOverlay)}
                className={`px-2 py-0.5 rounded text-[8px] font-mono transition-all ${
                  showOverlay
                    ? 'bg-purple-500/30 border border-purple-500/60 text-purple-300'
                    : 'bg-black/40 border border-purple-500/20 text-purple-400/60'
                }`}
              >
                {showOverlay ? 'ON' : 'OFF'}
              </button>
            </div>

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

      {/* Grid Overlay - Usa coordenadas de imagen como BoundingBoxOverlay */}
      {result && showOverlay && viewerState && (
        <div className="absolute inset-0 pointer-events-none z-[850]">
          {result.scores[selectedMetric].map((row, rowIndex) =>
            row.map((value, colIndex) => {
              // Calcular las coordenadas de la celda en la imagen original (40000x10000)
              const imageWidth = 40000;
              const imageHeight = 10000;
              
              const cellWidth = imageWidth / result.grid_size;
              const cellHeight = imageHeight / result.grid_size;
              
              // Centro de la celda en coordenadas de imagen
              const imageCenterX = (colIndex + 0.5) * cellWidth;
              const imageCenterY = (rowIndex + 0.5) * cellHeight;
              
              // Convertir coordenadas de imagen a coordenadas de pantalla (igual que BoundingBoxOverlay)
              const zoom = viewerState.zoom;
              const centerPx = viewerState.centerPx;
              
              // Calcular el factor de escala basado en el zoom
              const scale = Math.pow(2, zoom + 4.8);
              
              // Calcular offset desde el centro
              const offsetX = (imageCenterX - centerPx.x) * scale;
              const offsetY = (imageCenterY - centerPx.y) * scale;
              
              // Posición en la pantalla (centro de la pantalla es el centro del viewer)
              const screenX = window.innerWidth / 2 + offsetX;
              const screenY = window.innerHeight / 2 + offsetY;
              
              // Dimensiones de la celda en pantalla
              const screenCellWidth = cellWidth * scale;
              const screenCellHeight = cellHeight * scale;
              
              // Solo renderizar si está visible en la pantalla
              const isVisible =
                screenX + screenCellWidth / 2 > 0 &&
                screenX - screenCellWidth / 2 < window.innerWidth &&
                screenY + screenCellHeight / 2 > 0 &&
                screenY - screenCellHeight / 2 < window.innerHeight;
              
              if (!isVisible) return null;
              
              const percentage = (value * 100).toFixed(0);
              const showText = screenCellWidth > 50 && screenCellHeight > 50;
              const fontSize = Math.max(8, Math.min(screenCellWidth / 6, screenCellHeight / 6, 16));
              
              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className="absolute pointer-events-none border border-cyan-400/20 flex items-center justify-center"
                  style={{
                    left: screenX - screenCellWidth / 2,
                    top: screenY - screenCellHeight / 2,
                    width: Math.max(screenCellWidth, 4),
                    height: Math.max(screenCellHeight, 4),
                    backgroundColor: `${getHeatmapColor(value)}30`,
                    boxShadow: `0 0 5px ${getHeatmapColor(value)}40`,
                  }}
                  title={`Grid [${rowIndex},${colIndex}]: ${(value * 100).toFixed(1)}%`}
                >
                  {showText && (
                    <span 
                      className="text-white font-mono font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                      style={{ fontSize: `${fontSize}px` }}
                    >
                      {percentage}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
