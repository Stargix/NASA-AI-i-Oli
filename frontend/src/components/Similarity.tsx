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
  const [selectedMetric, setSelectedMetric] = useState<'color' | 'brightness' | 'hog' | 'average'>('color');
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

        // Convertir el score (0-1) a un color del espectro naranja -> amarillo -> verde
        const fillColor = scoreToColor(score);
        const borderColor = scoreToBorderColor(score);

        // Posición de la celda en la pantalla
        const x = imageLeft + col * cellWidth;
        const y = imageTop + row * cellHeight;

        // Dibujar la celda con transparencia baja
        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, cellWidth, cellHeight);

        // Dibujar el borde con el mismo color pero más opaco
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellWidth, cellHeight);

        // Dibujar el número de similitud en el centro de la celda
        const percentage = (score * 100).toFixed(0);
        const fontSize = Math.max(8, Math.min(cellWidth / 4, cellHeight / 4, 16));

        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Sombra para el texto para mejor legibilidad
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        // Color del texto basado en el score (mismo color que la celda pero muy opaco)
        const textColor = scoreToTextColor(score);
        ctx.fillStyle = textColor;

        // Dibujar el texto en el centro de la celda
        ctx.fillText(`${percentage}%`, x + cellWidth / 2, y + cellHeight / 2);

        // Resetear la sombra
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }
  }, [result, selectedMetric, showOverlay]);

  // Función para obtener RGB del score (Rojo -> Amarillo -> Verde) - Tonos saturados pero no brillantes
  const getScoreRGB = (score: number): { r: number; g: number; b: number } => {
    const clampedScore = Math.max(0, Math.min(1, score));

    // Función de interpolación suave (smoothstep)
    const smoothLerp = (a: number, b: number, t: number): number => {
      const smoothT = t * t * (3 - 2 * t);
      return Math.round(a + (b - a) * smoothT);
    };

    if (clampedScore < 0.5) {
      // Rojo saturado (220, 40, 40) -> Amarillo saturado (220, 200, 0)
      const t = clampedScore / 0.5;
      return {
        r: 220,
        g: smoothLerp(40, 200, t),
        b: smoothLerp(40, 0, t)
      };
    } else {
      // Amarillo saturado (220, 200, 0) -> Verde bosque (40, 180, 40)
      const t = (clampedScore - 0.5) / 0.5;
      return {
        r: smoothLerp(220, 40, t),
        g: smoothLerp(200, 180, t),
        b: smoothLerp(0, 40, t)
      };
    }
  };

  // Función para convertir score a color con transparencia para el relleno
  const scoreToColor = (score: number): string => {
    const { r, g, b } = getScoreRGB(score);
    const alpha = 0.075; // Muy transparente para el relleno
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Función para convertir score a color para el borde (más opaco)
  const scoreToBorderColor = (score: number): string => {
    const { r, g, b } = getScoreRGB(score);
    const alpha = 0.6; // Más opaco para el borde
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Función para convertir score a color para el texto (muy opaco)
  const scoreToTextColor = (score: number): string => {
    const { r, g, b } = getScoreRGB(score);
    const alpha = 0.95; // Muy opaco para el texto
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setPatternImage(event.target?.result as string);
      setResult(null);
      setError(null);
      setShowOverlay(false); // Ocultar la matriz cuando se sube una nueva imagen
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

      {/* Aviso cuando la matriz está visible */}
      {showOverlay && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[1200] bg-black/80 backdrop-blur-sm border border-cyan-500/40 rounded-lg px-4 py-2 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
          <div className="text-cyan-400 font-mono text-[10px] font-bold flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
            MAP INTERACTION DISABLED
          </div>
        </div>
      )}

      {/* Control Panel */}
      <div className="absolute top-102 left-4 z-[1100] w-64 bg-black/90 border border-cyan-500/30 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.2)]">
        {/* Header */}
        <div className="p-2.5 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="text-cyan-400 font-mono font-bold text-xs flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
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
              {patternImage ? '✓ Pattern Loaded' : 'Upload Pattern'}
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
            className="w-full py-2 bg-cyan-500/20 border border-cyan-500/50 rounded text-cyan-400 text-[11px] font-mono hover:bg-cyan-500/30 transition-all disabled:opacity-50 font-bold"
          >
            {loading ? '⟳ CALCULATING...' : '▶ CALCULATE'}
          </button>

          {/* Show/Hide Matrix Button (solo cuando hay resultado) */}
          {result && (
            <button
              onClick={() => setShowOverlay(!showOverlay)}
              className={`w-full py-2 border rounded text-[11px] font-mono transition-all font-bold ${showOverlay
                ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30'
                }`}
            >
              {showOverlay ? 'HIDE MATRIX' : 'SHOW MATRIX'}
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
                    className={`flex-1 py-1 rounded text-[9px] font-mono transition-all ${selectedMetric === metric
                      ? 'bg-cyan-500/30 border border-cyan-500/60 text-cyan-300'
                      : 'bg-black/40 border border-cyan-500/20 text-cyan-400/60 hover:border-cyan-500/40'
                      }`}
                  >
                    {metric.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Color Legend - Horizontal */}
              <div className="text-[9px] font-mono text-cyan-400/60 p-2 bg-black/50 border border-cyan-500/30 rounded">
                <div className="text-[8px] text-cyan-400/70 mb-1.5">Color Scale:</div>
                <div className="flex items-center gap-1">
                  <div className="flex-1">
                    <div className="h-4 rounded" style={{ backgroundColor: 'rgb(220, 40, 40)' }}></div>
                    <div className="text-[7px] text-center mt-0.5">Low</div>
                  </div>
                  <div className="flex-1">
                    <div className="h-4 rounded" style={{ backgroundColor: 'rgb(220, 200, 0)' }}></div>
                    <div className="text-[7px] text-center mt-0.5">Mid</div>
                  </div>
                  <div className="flex-1">
                    <div className="h-4 rounded" style={{ backgroundColor: 'rgb(40, 180, 40)' }}></div>
                    <div className="text-[7px] text-center mt-0.5">High</div>
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
