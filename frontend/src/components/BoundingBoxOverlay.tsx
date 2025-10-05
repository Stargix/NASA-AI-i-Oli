'use client';

import { useEffect, useState } from 'react';

interface BoundingBox {
  center: [number, number];
  width: number;
  height: number;
  color: string;
  obj_type: string;
}

interface Props {
  boxes: BoundingBox[];
  visible: boolean;
  onClose?: () => void;
  isScreenshotBased?: boolean; // Nueva prop para indicar si las coords son del screenshot
  matchedIndices?: number[]; // Índices de las boxes que forman parte de una constelación detectada
}

export default function BoundingBoxOverlay({ boxes, visible, onClose, isScreenshotBased = false, matchedIndices }: Props) {
  const [viewerState, setViewerState] = useState<any>(null);
  const [screenshotDimensions, setScreenshotDimensions] = useState<{ width: number, height: number } | null>(null);

  useEffect(() => {
    // Actualizar el estado del viewer cada 100ms
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).andromedaViewerState) {
        setViewerState((window as any).andromedaViewerState);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Si es basado en screenshot, guardar las dimensiones actuales del viewport
  useEffect(() => {
    if (isScreenshotBased && visible) {
      setScreenshotDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
      console.log('📸 Screenshot-based overlay detected. Viewport:', window.innerWidth, 'x', window.innerHeight);
    }
  }, [isScreenshotBased, visible]);

  // Debug logs
  useEffect(() => {
    console.log('🎯 BoundingBoxOverlay render check:', {
      visible,
      isScreenshotBased,
      hasViewerState: !!viewerState,
      boxesCount: boxes.length,
      boxes: boxes.slice(0, 3), // primeros 3 boxes
      viewerState,
      screenshotDimensions
    });
  }, [visible, viewerState, boxes, isScreenshotBased, screenshotDimensions]);

  // Para modo screenshot, no necesitamos viewerState
  if (!visible || boxes.length === 0) {
    console.log('⚠️ BoundingBoxOverlay NOT rendering:', { visible, boxesCount: boxes.length });
    return null;
  }

  // Para modo imagen (no screenshot), necesitamos viewerState
  if (!isScreenshotBased && !viewerState) {
    console.log('⚠️ BoundingBoxOverlay waiting for viewerState (image mode)');
    return null;
  }

  console.log('✅ BoundingBoxOverlay RENDERING with', boxes.length, 'boxes', isScreenshotBased ? '(screenshot-based)' : '(image-based)');

  // Función para convertir coordenadas de imagen a coordenadas de pantalla
  const imageToScreen = (imageX: number, imageY: number, boxWidth: number, boxHeight: number) => {
    // Si es basado en screenshot, las coordenadas ya son relativas al viewport
    if (isScreenshotBased && screenshotDimensions) {
      console.log('📸 Screenshot coords:', { imageX, imageY, boxWidth, boxHeight });
      // Las coordenadas del backend son píxeles del screenshot
      // Necesitamos mapearlas directamente al viewport actual
      return {
        x: imageX,
        y: imageY,
        scale: 1,
        width: boxWidth,
        height: boxHeight
      };
    }

    // Modo original: coordenadas absolutas de imagen de Andromeda
    // Verificar que viewerState existe
    if (!viewerState) {
      console.warn('⚠️ viewerState is null in image mode');
      return { x: 0, y: 0, scale: 1, width: boxWidth, height: boxHeight };
    }

    const zoom = viewerState.zoom;
    const centerPx = viewerState.centerPx;
    const imageSize = viewerState.imageSize;

    // Calcular el factor de escala basado en el zoom
    const scale = Math.pow(2, zoom + 4.8);

    // Calcular offset desde el centro
    const offsetX = (imageX - centerPx.x) * scale;
    const offsetY = (imageY - centerPx.y) * scale;

    // Posición en la pantalla (centro de la pantalla es el centro del viewer)
    const screenX = window.innerWidth / 2 + offsetX;
    const screenY = window.innerHeight / 2 + offsetY;

    return {
      x: screenX,
      y: screenY,
      scale,
      width: boxWidth * scale,
      height: boxHeight * scale
    };
  };

  // Log filtrado si hay matchedIndices
  console.log('🎯 BoundingBoxOverlay filtering:', {
    totalBoxes: boxes.length,
    matchedIndices,
    filteredCount: matchedIndices ? matchedIndices.length : boxes.length
  });

  return (
    <>
      {/* Overlay de bounding boxes */}
      <div className="absolute inset-0 pointer-events-none z-[900]">
        {boxes.map((box, boxIndex) => {
          // Si hay matchedIndices, solo renderizar si este índice está incluido
          if (matchedIndices && matchedIndices.length > 0 && !matchedIndices.includes(boxIndex)) {
            return null;
          }

          const [centerX, centerY] = box.center;
          const { x, y, scale, width: boxWidth, height: boxHeight } = imageToScreen(centerX, centerY, box.width, box.height);

          // Debug primer box que se va a renderizar
          if (boxIndex === 0 || (matchedIndices && matchedIndices[0] === boxIndex)) {
            console.log('📦 First rendered box calculation:', {
              boxIndex,
              box,
              imageCoords: { centerX, centerY },
              screenCoords: { x, y },
              scale,
              boxWidth,
              boxHeight,
              viewerState
            });
          }

          // Solo renderizar si está visible en la pantalla
          const isVisible =
            x + boxWidth / 2 > 0 &&
            x - boxWidth / 2 < window.innerWidth &&
            y + boxHeight / 2 > 0 &&
            y - boxHeight / 2 < window.innerHeight;

          if (!isVisible) {
            return null;
          }

          // Si hay matched_indices, resaltar con color especial para constelación
          const isConstellationStar = matchedIndices && matchedIndices.length > 0;

          // Color del borde según si es parte de una constelación o no
          const borderColor = isConstellationStar
            ? 'rgba(251, 191, 36, 0.9)' // Amarillo/dorado para constelación
            : box.color === 'red'
              ? 'rgba(239, 68, 68, 0.9)'
              : box.color === 'blue'
                ? 'rgba(34, 197, 94, 0.9)' // Verde en lugar de azul
                : 'rgba(168, 85, 247, 0.8)';

          // Color de fondo según si es parte de una constelación
          const bgColor = isConstellationStar
            ? 'rgba(251, 191, 36, 0.25)' // Amarillo/dorado más visible para constelación
            : box.obj_type === 'star'
              ? 'rgba(251, 191, 36, 0.15)'
              : box.obj_type === 'galaxy'
                ? 'rgba(139, 92, 246, 0.15)'
                : 'rgba(236, 72, 153, 0.15)';

          // Tamaño mínimo para bounding boxes (20px para que no parezcan puntos)
          const minBoxSize = 20;
          const displayWidth = Math.max(boxWidth, minBoxSize);
          const displayHeight = Math.max(boxHeight, minBoxSize);

          return (
            <div
              key={`box-${boxIndex}-${centerX}-${centerY}`}
              className="absolute pointer-events-none"
              style={{
                left: x - displayWidth / 2,
                top: y - displayHeight / 2,
                width: displayWidth,
                height: displayHeight,
                border: `2px solid ${borderColor}`,
                backgroundColor: bgColor,
                boxShadow: `0 0 10px ${borderColor}`,
              }}
              title={`${box.obj_type} - ${box.color}`}
            />
          );
        })}
      </div>

      {/* Panel de estadísticas compacto */}
      <div className="absolute bottom-14 right-4 z-[950] bg-black/90 border border-cyan-500/30 rounded-lg p-2 shadow-[0_0_20px_rgba(6,182,212,0.2)] pointer-events-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="text-cyan-400 font-mono font-bold text-xs">
            {matchedIndices && matchedIndices.length > 0 ? 'CONSTELLATION' : 'DETECTIONS'}
          </div>
          <button
            onClick={() => {
              // Llamar a la función global de limpieza
              if (typeof window !== 'undefined' && (window as any).clearBoundingBoxes) {
                (window as any).clearBoundingBoxes();
              } else if (onClose) {
                onClose();
              }
            }}
            className="text-cyan-400/60 hover:text-red-400 transition-colors"
            title="Clear detections"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-1 text-[9px] font-mono">
          {matchedIndices && matchedIndices.length > 0 ? (
            // Mostrar info de constelación
            <>
              <div className="flex justify-between gap-3">
                <span className="text-yellow-400/80">⭐ Constellation Stars:</span>
                <span className="text-yellow-400 font-bold">{matchedIndices.length}</span>
              </div>
              <div className="border-t border-cyan-500/30 mt-1 pt-1 flex justify-between gap-3">
                <span className="text-cyan-400/60">Total Detected:</span>
                <span className="text-cyan-400 font-bold">{boxes.length}</span>
              </div>
            </>
          ) : (
            // Mostrar contadores normales
            <>
              <div className="flex justify-between gap-3">
                <span className="text-yellow-400/80">⭐ Stars:</span>
                <span className="text-yellow-400 font-bold">{boxes.filter(b => b.obj_type === 'star').length}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-purple-400/80">🌌 Galaxies:</span>
                <span className="text-purple-400 font-bold">{boxes.filter(b => b.obj_type === 'galaxy').length}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-pink-400/80">✨ Clusters:</span>
                <span className="text-pink-400 font-bold">{boxes.filter(b => b.obj_type === 'cluster').length}</span>
              </div>
              <div className="border-t border-cyan-500/30 mt-1 pt-1 flex justify-between gap-3">
                <span className="text-cyan-400/60">Total:</span>
                <span className="text-cyan-400 font-bold">{boxes.length}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
