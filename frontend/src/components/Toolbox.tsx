"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
// Hola, buenas
interface Props {
  onResult?: (data: any) => void;
}

export default function Toolbox({ onResult }: Props) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [gaussianBlur, setGaussianBlur] = useState(25);
  const [noiseThreshold, setNoiseThreshold] = useState(120);
  const [adaptativeFiltering, setAdaptativeFiltering] = useState(false);
  const [separationThreshold, setSeparationThreshold] = useState(3);
  const [minSize, setMinSize] = useState(20);
  const [maxComponents, setMaxComponents] = useState(1000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Estado para la detección automática en background
  const [cachedResult, setCachedResult] = useState<any>(null);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const lastViewerStateRef = useRef<string>('');
  const autoDetectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Función compartida para ejecutar la detección
  const executeDetection = useCallback(async () => {
    // Determine image URL: if viewer state is available, compute tile URL from zoom/center
    const TILE_SIZE = 256;
    const MAX_ZOOM = 4; // must match scripts/generate-tiles.js

    let imageUrl = (typeof window !== 'undefined') ? `${window.location.origin}/andromeda.jpg` : '/andromeda.jpg';
    if (typeof window !== 'undefined' && (window as any).andromedaViewerState) {
      try {
        const st = (window as any).andromedaViewerState;
        const viewerZoom = st.zoom; // Leaflet zoom (range approx -4.8 .. 2)
        const imageW = st.imageSize?.width || 40000;
        const imageH = st.imageSize?.height || 10000;

        const minZoom = -4.8;
        const maxZoom = 2;
        // Map viewer zoom (-4.8 .. 2) to tile zoom index 0..4
        let zIndex = Math.round(((viewerZoom - minZoom) / (maxZoom - minZoom)) * MAX_ZOOM);
        zIndex = Math.max(0, Math.min(MAX_ZOOM, zIndex));

        // scale factor to convert original pixel coords to scaled image at zIndex
        const scaleFactor = Math.pow(2, zIndex - MAX_ZOOM);

        const cx = st.centerPx.x; // x in image pixels
        const cy = st.centerPx.y; // y in image pixels

        // Calculate tile coordinates
        let tileX = Math.floor((cx * scaleFactor) / TILE_SIZE);
        let tileY = Math.floor((cy * scaleFactor) / TILE_SIZE);

        // Define actual tile grid limits for each zoom level based on existing files
        // tiles/z/y/x.jpg structure
        const tileGridLimits: Record<number, { maxY: number; maxX: number }> = {
          0: { maxY: 0, maxX: 0 },  // 1x1: tiles/0/0/0.jpg
          1: { maxY: 0, maxX: 0 },  // 1x1: tiles/1/0/0.jpg
          2: { maxY: 1, maxX: 1 },  // 2x2: tiles/2/0-1/0-1.jpg
          3: { maxY: 2, maxX: 3 },  // 3x4: tiles/3/0-2/0-3.jpg
          4: { maxY: 5, maxX: 7 },  // 6x8: tiles/4/0-5/0-7.jpg
        };

        const limits = tileGridLimits[zIndex] || { maxY: 0, maxX: 0 };

        // Clamp tile coordinates to valid range (tiles are 0-indexed)
        const clampedTileX = Math.max(0, Math.min(limits.maxX, tileX));
        const clampedTileY = Math.max(0, Math.min(limits.maxY, tileY));

        // Build tile URL - format: tiles/z/y/x.jpg
        imageUrl = `${window.location.origin}/tiles/${zIndex}/${clampedTileY}/${clampedTileX}.jpg`;

        console.log('Toolbox: viewerState=', st);
        console.log('Toolbox: computed tile', {
          zIndex,
          scaleFactor,
          centerPx: { x: cx, y: cy },
          tileX,
          tileY,
          clampedTileX,
          clampedTileY,
          limits: { maxX: limits.maxX, maxY: limits.maxY },
          imageUrl,
          tileExists: `Check: tiles/${zIndex}/${clampedTileY}/${clampedTileX}.jpg`
        });

      } catch (e) {
        console.warn('Could not compute tile URL from viewer state', e);
      }
    }
    const payload = {
      image: imageUrl,
      top_left: [0, 0],
      bottom_right: [40000, 10000],
      automated: mode === 'auto',
      gaussian_blur: gaussianBlur,
      noise_threshold: noiseThreshold,
      adaptative_filtering: adaptativeFiltering,
      separation_threshold: separationThreshold,
      min_size: minSize,
      max_components: maxComponents,
    };

    console.log('Toolbox: About to fetch /star_analysis', payload);
    const resp = await fetch('http://localhost:8000/star_analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log('Toolbox: Fetch to /star_analysis completed', resp);

    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

    const data = await resp.json();
    console.log('Toolbox: Response data from /star_analysis', data);
    return data;
  }, [mode, gaussianBlur, noiseThreshold, adaptativeFiltering, separationThreshold, minSize, maxComponents]);

  // Función para ejecutar detección automática en background (sin mostrar resultados)
  const runAutoDetection = useCallback(async () => {
    if (isAutoDetecting) return; // Evitar ejecuciones paralelas

    setIsAutoDetecting(true);
    console.log('🔍 Auto-detection triggered (background)...');

    try {
      const detectionResult = await executeDetection();
      setCachedResult(detectionResult);
      console.log('✅ Auto-detection completed and cached');
    } catch (err) {
      console.error('❌ Auto-detection error:', err);
      setCachedResult({ error: String(err) });
    } finally {
      setIsAutoDetecting(false);
    }
  }, [isAutoDetecting, executeDetection]);

  // Hook para detectar cuando el usuario permanece en una zona por 3 segundos
  useEffect(() => {
    const checkViewerState = () => {
      if (typeof window === 'undefined' || !(window as any).andromedaViewerState) {
        return;
      }

      const currentState = (window as any).andromedaViewerState;
      const stateKey = `${currentState.zoom}_${Math.round(currentState.centerPx.x)}_${Math.round(currentState.centerPx.y)}`;

      // Si el estado es diferente, reiniciar el timer
      if (stateKey !== lastViewerStateRef.current) {
        lastViewerStateRef.current = stateKey;

        // Limpiar timer anterior
        if (autoDetectionTimerRef.current) {
          clearTimeout(autoDetectionTimerRef.current);
        }

        // Iniciar nuevo timer de 3 segundos
        autoDetectionTimerRef.current = setTimeout(() => {
          // Ejecutar detección automática en background
          runAutoDetection();
        }, 3000);
      }
    };

    // Verificar cada 500ms si el estado del viewer ha cambiado
    const interval = setInterval(checkViewerState, 500);

    return () => {
      clearInterval(interval);
      if (autoDetectionTimerRef.current) {
        clearTimeout(autoDetectionTimerRef.current);
      }
    };
  }, [runAutoDetection]);

  // Función para cuando el usuario pulsa el botón Run (muestra resultados)
  const runDetection = async () => {
    setRunning(true);
    setResult(null);

    try {
      // Si hay resultado cacheado y los parámetros no han cambiado, usar el cache
      if (cachedResult && !cachedResult.error) {
        console.log('📦 Using cached detection result');
        setResult(cachedResult);
        onResult?.(cachedResult);
      } else {
        // Si no hay cache o hubo error, ejecutar nueva detección
        console.log('🔍 Running new detection...');
        const data = await executeDetection();
        setResult(data);
        setCachedResult(data);
        onResult?.(data);
      }
    } catch (err) {
      console.error('Toolbox detection error:', err);
      const errorResult = { error: String(err) };
      setResult(errorResult);
      setCachedResult(errorResult);
    } finally {
      setRunning(false);
    }
  };

  // Función para probar con datos de ejemplo (DEMO)
  const runDemoDetection = () => {
    // Obtener el centro actual del visor para colocar los objetos demo ahí
    const viewerState = (window as any).andromedaViewerState;
    const centerX = viewerState?.centerPx?.x || 20000; // Centro por defecto de la imagen
    const centerY = viewerState?.centerPx?.y || 5000;

    // Generar objetos demo alrededor del centro visible
    const demoData = {
      bounding_box_list: [
        // Estrellas cerca del centro
        { center: [centerX - 200, centerY - 100], height: 50, width: 50, color: 'blue', obj_type: 'star' },
        { center: [centerX + 150, centerY - 50], height: 80, width: 80, color: 'blue', obj_type: 'star' },
        { center: [centerX - 100, centerY + 150], height: 60, width: 60, color: 'red', obj_type: 'star' },
        { center: [centerX + 200, centerY + 100], height: 70, width: 70, color: 'blue', obj_type: 'star' },
        
        // Galaxias
        { center: [centerX - 300, centerY], height: 100, width: 80, color: 'red', obj_type: 'galaxy' },
        { center: [centerX + 250, centerY - 200], height: 120, width: 90, color: 'red', obj_type: 'galaxy' },
        { center: [centerX, centerY + 250], height: 110, width: 85, color: 'blue', obj_type: 'galaxy' },
        
        // Clusters más grandes
        { center: [centerX - 400, centerY - 300], height: 200, width: 180, color: 'red', obj_type: 'cluster' },
        { center: [centerX + 350, centerY + 200], height: 250, width: 220, color: 'blue', obj_type: 'cluster' },
        { center: [centerX, centerY - 350], height: 180, width: 160, color: 'red', obj_type: 'cluster' },
        
        // Más estrellas dispersas
        { center: [centerX + 100, centerY], height: 55, width: 55, color: 'blue', obj_type: 'star' },
        { center: [centerX - 150, centerY - 200], height: 65, width: 65, color: 'red', obj_type: 'star' },
        { center: [centerX + 300, centerY - 100], height: 45, width: 45, color: 'blue', obj_type: 'star' },
        { center: [centerX - 250, centerY + 200], height: 75, width: 75, color: 'red', obj_type: 'star' },
        
        // Objeto en el centro exacto para referencia
        { center: [centerX, centerY], height: 100, width: 100, color: 'blue', obj_type: 'cluster' },
      ]
    };
    
    console.log('🎭 DEMO mode: Using sample data at center', { centerX, centerY });
    setResult(demoData);
    setCachedResult(demoData);
    onResult?.(demoData);
  };

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div
        className="absolute top-[170px] left-4 z-[1100] w-64 bg-black/90 border border-cyan-500/30 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.2)] transition-all duration-300"
      >
        {/* Header compacto */}
        <div className="p-2.5 border-b border-cyan-500/20">
          <div className="flex items-center justify-between">
            <div className="text-cyan-400 font-mono font-bold text-xs flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
              DETECTION
            </div>
            <div className="flex gap-1">
              <button
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${mode === 'auto'
                  ? 'bg-cyan-500/30 border border-cyan-500/60 text-cyan-300'
                  : 'bg-black/40 border border-cyan-500/20 text-cyan-400/60 hover:border-cyan-500/40'
                  }`}
                onClick={() => setMode('auto')}
              >
                AUTO
              </button>
              <button
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${mode === 'manual'
                  ? 'bg-cyan-500/30 border border-cyan-500/60 text-cyan-300'
                  : 'bg-black/40 border border-cyan-500/20 text-cyan-400/60 hover:border-cyan-500/40'
                  }`}
                onClick={() => setMode('manual')}
              >
                MAN
              </button>
            </div>
          </div>
        </div>

        {/* Contenido principal */}
        <div className="relative overflow-hidden" style={{ transition: 'all 0.3s ease-in-out' }}>
          {/* Modo AUTO - Vista compacta */}
          {mode === 'auto' && (
            <div
              className="space-y-2 p-2.5"
              style={{
                animation: 'fadeIn 0.3s ease-in-out',
              }}
            >
              {/* Área de estado - siempre en DOM para permitir transiciones */}
              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                  maxHeight: (isAutoDetecting || cachedResult || result) ? '100px' : '0px',
                  opacity: (isAutoDetecting || cachedResult || result) ? 1 : 0,
                  marginBottom: (isAutoDetecting || cachedResult || result) ? '0.5rem' : '0',
                }}
              >
                {isAutoDetecting && (
                  <div className="p-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-[10px] text-cyan-400/80 font-mono flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
                    Detecting...
                  </div>
                )}

                {cachedResult && !isAutoDetecting && !result && (
                  <div className="p-1.5 bg-green-500/10 border border-green-500/30 rounded text-[10px] text-green-400/80 font-mono flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                    Ready
                  </div>
                )}

                {result && (
                  <div className="p-1.5 bg-black/40 border border-cyan-500/20 rounded text-[10px] font-mono">
                    {result.error ? (
                      <div className="text-red-400">⚠ {String(result.error)}</div>
                    ) : (
                      <div className="text-cyan-400/90">
                        ✓ {Array.isArray(result.bounding_box_list) ? `${result.bounding_box_list.length} objects` : 'Done'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex gap-1.5">
                <button
                  onClick={runDetection}
                  disabled={running}
                  className="flex-1 py-1.5 bg-cyan-500/20 border border-cyan-500/50 rounded text-cyan-400 text-[11px] font-mono hover:bg-cyan-500/30 transition-all disabled:opacity-50"
                >
                  {running ? '⟳ RUN...' : '▶ RUN'}
                </button>
                <button
                  onClick={runDemoDetection}
                  className="py-1.5 px-2.5 bg-purple-500/20 border border-purple-500/50 rounded text-purple-400 text-[11px] font-mono hover:bg-purple-500/30 transition-all"
                  title="Load demo data"
                >
                  🎭
                </button>
                <button
                  onClick={() => { setResult(null); setCachedResult(null); }}
                  className="py-1.5 px-2.5 border border-cyan-500/20 rounded text-cyan-400 text-[11px] hover:bg-cyan-500/10 transition-all"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Modo MANUAL - Vista expandida con parámetros */}
          {mode === 'manual' && (
            <div
              className="space-y-2.5 p-2.5"
              style={{
                animation: 'fadeIn 0.3s ease-in-out',
              }}
            >
              {/* Gaussian Blur */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-cyan-400/70 text-[10px] font-mono">Gaussian Blur</label>
                  <span className="text-cyan-300 text-[10px] font-mono font-bold">{gaussianBlur}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={101}
                  step={2}
                  value={gaussianBlur}
                  onChange={(e) => setGaussianBlur(Number(e.target.value))}
                  className="w-full h-1 bg-cyan-500/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:bg-cyan-300"
                />
              </div>

              {/* Noise Threshold */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-cyan-400/70 text-[10px] font-mono">Noise Threshold</label>
                  <span className="text-cyan-300 text-[10px] font-mono font-bold">{noiseThreshold}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={255}
                  step={1}
                  value={noiseThreshold}
                  onChange={(e) => setNoiseThreshold(Number(e.target.value))}
                  className="w-full h-1 bg-cyan-500/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:bg-cyan-300"
                />
              </div>

              {/* Separation Threshold */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-cyan-400/70 text-[10px] font-mono">Separation</label>
                  <span className="text-cyan-300 text-[10px] font-mono font-bold">{separationThreshold}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={1}
                  value={separationThreshold}
                  onChange={(e) => setSeparationThreshold(Number(e.target.value))}
                  className="w-full h-1 bg-cyan-500/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:bg-cyan-300"
                />
              </div>

              {/* Min Size */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-cyan-400/70 text-[10px] font-mono">Min Size</label>
                  <span className="text-cyan-300 text-[10px] font-mono font-bold">{minSize}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={2000}
                  step={1}
                  value={minSize}
                  onChange={(e) => setMinSize(Number(e.target.value))}
                  className="w-full h-1 bg-cyan-500/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:bg-cyan-300"
                />
              </div>

              {/* Max Components */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-cyan-400/70 text-[10px] font-mono">Max Components</label>
                  <span className="text-cyan-300 text-[10px] font-mono font-bold">{maxComponents}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={5000}
                  step={10}
                  value={maxComponents}
                  onChange={(e) => setMaxComponents(Number(e.target.value))}
                  className="w-full h-1 bg-cyan-500/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:bg-cyan-300"
                />
              </div>

              {/* Adaptive Filtering - Toggle Button */}
              <div className="pt-1">
                <label className="text-cyan-400/70 text-[10px] font-mono block mb-1.5">Adaptive Filter</label>
                <button
                  onClick={() => setAdaptativeFiltering(!adaptativeFiltering)}
                  className={`w-full py-2 rounded font-mono text-[10px] font-bold transition-all ${adaptativeFiltering
                    ? 'bg-cyan-500/30 border border-cyan-400/60 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                    : 'bg-black/40 border border-cyan-500/20 text-cyan-400/50 hover:border-cyan-500/40 hover:text-cyan-400/70'
                    }`}
                >
                  {adaptativeFiltering ? '✓ ENABLED' : 'DISABLED'}
                </button>
              </div>

              {/* Estado de detección */}
              {isAutoDetecting && (
                <div className="p-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-[10px] text-cyan-400/80 font-mono flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
                  Processing...
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={runDetection}
                  disabled={running}
                  className="flex-1 py-2 bg-cyan-500/20 border border-cyan-500/50 rounded text-cyan-400 text-[11px] font-mono hover:bg-cyan-500/30 transition-all disabled:opacity-50 font-bold"
                >
                  {running ? '⟳ PROCESSING...' : '▶ RUN DETECTION'}
                </button>
                <button
                  onClick={runDemoDetection}
                  className="px-3 py-2 bg-purple-500/20 border border-purple-500/50 rounded text-purple-400 text-[11px] font-mono hover:bg-purple-500/30 transition-all font-bold"
                  title="Load demo data for testing"
                >
                  🎭 DEMO
                </button>
                <button
                  onClick={() => { setResult(null); setCachedResult(null); }}
                  className="py-2 px-3 border border-cyan-500/20 rounded text-cyan-400 text-[11px] hover:bg-cyan-500/10 transition-all"
                >
                  CLEAR
                </button>
              </div>

              {/* Resultado */}
              {result && (
                <div className="p-2 bg-black/40 border border-cyan-500/30 rounded text-[10px] font-mono">
                  {result.error ? (
                    <div className="text-red-400">⚠ Error: {String(result.error)}</div>
                  ) : (
                    <div className="text-cyan-400/90">
                      ✓ Detected: {Array.isArray(result.bounding_box_list) ? `${result.bounding_box_list.length} objects` : 'Complete'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
