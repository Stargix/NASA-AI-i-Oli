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
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const lastViewerStateRef = useRef<string>('');
  const lastTilesLoadedRef = useRef<boolean>(false);
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

    const resp = await fetch('http://localhost:8000/star_analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

    const data = await resp.json();
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

      // Verificar si los tiles están cargados
      const tilesAreLoaded = currentState.tilesLoaded === true;
      setTilesLoaded(tilesAreLoaded);

      // Detectar si el estado cambió O si los tiles acaban de terminar de cargar
      const stateChanged = stateKey !== lastViewerStateRef.current;
      const tilesJustLoaded = !lastTilesLoadedRef.current && tilesAreLoaded;

      // Si el estado es diferente O los tiles acaban de cargar, reiniciar el timer
      if (stateChanged || tilesJustLoaded) {
        lastViewerStateRef.current = stateKey;
        lastTilesLoadedRef.current = tilesAreLoaded;
        
        // Limpiar timer anterior
        if (autoDetectionTimerRef.current) {
          clearTimeout(autoDetectionTimerRef.current);
        }

        // Solo iniciar timer si los tiles están completamente cargados
        if (tilesAreLoaded) {
          // Iniciar nuevo timer de 3 segundos
          autoDetectionTimerRef.current = setTimeout(() => {
            // Ejecutar detección automática en background
            runAutoDetection();
          }, 3000);
          
          if (tilesJustLoaded) {
            console.log('✅ Tiles loaded! Starting auto-detection timer...');
          }
        } else {
          console.log('⏳ Waiting for tiles to load before auto-detection...');
        }
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

  return (
    <div className="absolute top-28 left-4 z-[1100] w-80 bg-black/90 border border-cyan-500/30 rounded-lg p-4 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-cyan-400 font-mono font-bold">DETECTION TOOLBOX</div>
        <div className="text-xs text-cyan-400/60">Mode</div>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          className={`flex-1 py-2 rounded text-sm font-mono ${mode === 'auto' ? 'bg-cyan-500/20 border border-cyan-500/50' : 'bg-black/20 border border-cyan-500/20'}`}
          onClick={() => setMode('auto')}
        >
          AUTO
        </button>
        <button
          className={`flex-1 py-2 rounded text-sm font-mono ${mode === 'manual' ? 'bg-cyan-500/20 border border-cyan-500/50' : 'bg-black/20 border border-cyan-500/20'}`}
          onClick={() => setMode('manual')}
        >
          MANUAL
        </button>
      </div>

      <div className="text-cyan-400/70 text-xs mb-2">Gaussian blur: {gaussianBlur}</div>
      <input disabled={mode === 'auto'} type="range" min={1} max={101} step={2} value={gaussianBlur} onChange={(e) => setGaussianBlur(Number(e.target.value))} className="w-full mb-3" />

      <div className="text-cyan-400/70 text-xs mb-2">Noise threshold: {noiseThreshold}</div>
      <input disabled={mode === 'auto'} type="range" min={10} max={255} step={1} value={noiseThreshold} onChange={(e) => setNoiseThreshold(Number(e.target.value))} className="w-full mb-3" />

      <div className="flex items-center justify-between mb-3 text-cyan-400/70 text-xs">
        <label className="flex items-center gap-2">Adaptive</label>
        <input disabled={mode === 'auto'} type="checkbox" checked={adaptativeFiltering} onChange={(e) => setAdaptativeFiltering(e.target.checked)} />
      </div>

      <div className="text-cyan-400/70 text-xs mb-2">Separation: {separationThreshold}</div>
      <input disabled={mode === 'auto'} type="range" min={1} max={15} step={1} value={separationThreshold} onChange={(e) => setSeparationThreshold(Number(e.target.value))} className="w-full mb-3" />

      <div className="text-cyan-400/70 text-xs mb-2">Min size: {minSize}</div>
      <input disabled={mode === 'auto'} type="range" min={1} max={2000} step={1} value={minSize} onChange={(e) => setMinSize(Number(e.target.value))} className="w-full mb-3" />

      <div className="text-cyan-400/70 text-xs mb-2">Max components: {maxComponents}</div>
      <input disabled={mode === 'auto'} type="range" min={10} max={5000} step={10} value={maxComponents} onChange={(e) => setMaxComponents(Number(e.target.value))} className="w-full mb-3" />

      {/* Indicador de estado de auto-detección */}
      {!tilesLoaded && (
        <div className="mb-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-400/80 font-mono flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
          Loading tiles...
        </div>
      )}

      {isAutoDetecting && (
        <div className="mb-3 p-2 bg-cyan-500/10 border border-cyan-500/30 rounded text-xs text-cyan-400/80 font-mono flex items-center gap-2">
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
          Auto-detecting in background...
        </div>
      )}

      {cachedResult && !isAutoDetecting && !result && (
        <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 rounded text-xs text-green-400/80 font-mono flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          Detection ready - Press RUN to view
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={runDetection} disabled={running} className="flex-1 py-2 bg-cyan-500/20 border border-cyan-500/50 rounded text-cyan-400 font-mono hover:bg-cyan-500/30 transition">
          {running ? 'RUNNING...' : 'RUN'}
        </button>
        <button onClick={() => { setResult(null); setCachedResult(null); }} className="py-2 px-2 border border-cyan-500/20 rounded text-cyan-400 text-sm">CLR</button>
      </div>

      {result && (
        <div className="mt-3 text-cyan-400/80 text-xs font-mono">
          {result.error ? (
            <div className="text-red-400">Error: {String(result.error)}</div>
          ) : (
            <div>{Array.isArray(result.bounding_box_list) ? `${result.bounding_box_list.length} objects detected` : JSON.stringify(result)}</div>
          )}
        </div>
      )}
    </div>
  );
}
