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
}

export default function BoundingBoxOverlay({ boxes, visible, onClose, isScreenshotBased = false }: Props) {
  const [viewerState, setViewerState] = useState<any>(null);
  const [selectedBox, setSelectedBox] = useState<BoundingBox | null>(null);
  const [screenshotDimensions, setScreenshotDimensions] = useState<{ width: number, height: number } | null>(null);
  const [captureViewerState, setCaptureViewerState] = useState<any>(null); // Estado del viewer en el momento de captura
  const [convertedBoxes, setConvertedBoxes] = useState<BoundingBox[]>([]); // Boxes convertidas a coords absolutas
  const [, setForceUpdate] = useState(0); // Para forzar re-renders

  useEffect(() => {
    // Actualizar el estado del viewer en cada frame de animación
    let animationFrameId: number;
    
    const updateViewerState = () => {
      if (typeof window !== 'undefined' && (window as any).andromedaViewerState) {
        const newState = (window as any).andromedaViewerState;
        setViewerState(newState);
        setForceUpdate(prev => prev + 1); // Forzar re-render
      }
      animationFrameId = requestAnimationFrame(updateViewerState);
    };

    animationFrameId = requestAnimationFrame(updateViewerState);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // Si es basado en screenshot, capturar el estado actual del viewer y convertir coordenadas
  useEffect(() => {
    if (isScreenshotBased && visible && boxes.length > 0) {
      const currentViewerState = (window as any).andromedaViewerState;
      if (currentViewerState) {
        setCaptureViewerState(currentViewerState);
        
        // Convertir coordenadas de screenshot a coordenadas absolutas de imagen
        const converted = boxes.map(box => {
          const [screenX, screenY] = box.center;
          
          // Convertir coordenadas de pantalla a coordenadas de imagen
          const scale = Math.pow(2, currentViewerState.zoom + 4.8);
          const offsetX = (screenX - window.innerWidth / 2) / scale;
          const offsetY = (screenY - window.innerHeight / 2) / scale;
          
          const imageX = currentViewerState.centerPx.x + offsetX;
          const imageY = currentViewerState.centerPx.y + offsetY;
          
          return {
            ...box,
            center: [imageX, imageY] as [number, number]
          };
        });
        
        setConvertedBoxes(converted);
        console.log('📸 Converted screenshot boxes to image coordinates:', {
          original: boxes.slice(0, 2),
          converted: converted.slice(0, 2),
          viewerState: currentViewerState
        });
      }
      
      setScreenshotDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    }
  }, [isScreenshotBased, visible, boxes]);

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

  // Necesitamos visible y boxes
  if (!visible || boxes.length === 0) {
    console.log('⚠️ BoundingBoxOverlay NOT rendering:', { visible, boxesCount: boxes.length });
    return null;
  }

  // SIEMPRE necesitamos viewerState para calcular posiciones en pantalla
  if (!viewerState) {
    console.log('⚠️ BoundingBoxOverlay waiting for viewerState');
    return null;
  }

  // En modo screenshot, si no hay boxes convertidas aún, no renderizar
  if (isScreenshotBased && convertedBoxes.length === 0) {
    console.log('⚠️ BoundingBoxOverlay waiting for converted boxes');
    return null;
  }

  // Usar boxes convertidas si es modo screenshot, sino usar las originales
  const boxesToRender = isScreenshotBased && convertedBoxes.length > 0 ? convertedBoxes : boxes;
  
  console.log('✅ BoundingBoxOverlay RENDERING with', boxesToRender.length, 'boxes', isScreenshotBased ? '(screenshot-based, converted to image coords)' : '(image-based)');

  // Función para convertir coordenadas de imagen a coordenadas de pantalla
  const imageToScreen = (imageX: number, imageY: number, boxWidth: number, boxHeight: number) => {    // Modo original: coordenadas absolutas de imagen de Andromeda
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

  return (
    <>
      {/* Overlay de bounding boxes */}
      <div className="absolute inset-0 pointer-events-none z-[900]" key={`${viewerState?.zoom}-${viewerState?.centerPx?.x}-${viewerState?.centerPx?.y}`}>
        {boxesToRender.map((box, index) => {
          const [centerX, centerY] = box.center;
          const { x, y, scale, width: boxWidth, height: boxHeight } = imageToScreen(centerX, centerY, box.width, box.height);

          // Debug primer box cada vez que se calcula
          if (index === 0 && Math.random() < 0.1) { // Solo 10% de las veces para no saturar
            console.log('📦 First box recalculation:', {
              box,
              imageCoords: { centerX, centerY },
              screenCoords: { x, y },
              scale,
              boxWidth,
              boxHeight,
              viewerState: { zoom: viewerState?.zoom, centerPx: viewerState?.centerPx }
            });
          }

          // Solo renderizar si está visible en la pantalla
          const isVisible =
            x + boxWidth / 2 > 0 &&
            x - boxWidth / 2 < window.innerWidth &&
            y + boxHeight / 2 > 0 &&
            y - boxHeight / 2 < window.innerHeight;

          if (!isVisible) {
            if (index === 0) console.log('⚠️ First box NOT visible');
            return null;
          }

          if (index === 0) console.log('✅ First box IS visible, rendering...');

          // Color del borde según el color del objeto
          const borderColor = box.color === 'red'
            ? 'rgba(239, 68, 68, 0.8)'
            : box.color === 'blue'
              ? 'rgba(59, 130, 246, 0.8)'
              : 'rgba(168, 85, 247, 0.8)';

          // Color de fondo según el tipo
          const bgColor = box.obj_type === 'star'
            ? 'rgba(251, 191, 36, 0.1)'
            : box.obj_type === 'galaxy'
              ? 'rgba(139, 92, 246, 0.1)'
              : 'rgba(236, 72, 153, 0.1)';

          return (
            <div
              key={`box-${index}`}
              className="absolute pointer-events-none"
              style={{
                left: x - boxWidth / 2,
                top: y - boxHeight / 2,
                width: Math.max(boxWidth, 4), // Mínimo 4px para que sea visible
                height: Math.max(boxHeight, 4),
                border: `2px solid ${borderColor}`,
                backgroundColor: bgColor,
                boxShadow: `0 0 10px ${borderColor}`,
                transition: 'none', // Sin transición para movimiento fluido
              }}
              title={`${box.obj_type} - ${box.color}`}
            />
          );
        })}
      </div>

      {/* Panel de información del box seleccionado */}
      {selectedBox && (
        <div className="absolute top-20 right-4 z-[950] bg-black/90 border border-cyan-500/30 rounded-lg p-3 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-cyan-400 font-mono font-bold text-xs">OBJECT INFO</div>
            <button
              onClick={() => setSelectedBox(null)}
              className="text-cyan-400/60 hover:text-cyan-400 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-1 text-[10px] font-mono">
            <div className="flex justify-between gap-4">
              <span className="text-cyan-400/60">Type:</span>
              <span className="text-cyan-400 font-bold uppercase">{selectedBox.obj_type}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-cyan-400/60">Color:</span>
              <span
                className="font-bold uppercase"
                style={{ color: selectedBox.color === 'red' ? '#ef4444' : selectedBox.color === 'blue' ? '#3b82f6' : '#a855f7' }}
              >
                {selectedBox.color}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-cyan-400/60">Center:</span>
              <span className="text-cyan-400">({selectedBox.center[0].toFixed(1)}, {selectedBox.center[1].toFixed(1)})</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-cyan-400/60">Size:</span>
              <span className="text-cyan-400">{selectedBox.width.toFixed(1)} × {selectedBox.height.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Panel de estadísticas compacto */}
      <div className="absolute bottom-14 right-4 z-[950] bg-black/90 border border-cyan-500/30 rounded-lg p-2 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
        <div className="flex items-center justify-between mb-1">
          <div className="text-cyan-400 font-mono font-bold text-xs">DETECTIONS</div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-cyan-400/60 hover:text-red-400 transition-colors"
              title="Hide boxes"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </button>
          )}
        </div>
        <div className="space-y-1 text-[9px] font-mono">
          <div className="flex justify-between gap-3">
            <span className="text-yellow-400/80">⭐ Stars:</span>
            <span className="text-yellow-400 font-bold">{boxesToRender.filter(b => b.obj_type === 'star').length}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-purple-400/80">🌌 Galaxies:</span>
            <span className="text-purple-400 font-bold">{boxesToRender.filter(b => b.obj_type === 'galaxy').length}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-pink-400/80">✨ Clusters:</span>
            <span className="text-pink-400 font-bold">{boxesToRender.filter(b => b.obj_type === 'cluster').length}</span>
          </div>
          <div className="border-t border-cyan-500/30 mt-1 pt-1 flex justify-between gap-3">
            <span className="text-cyan-400/60">Total:</span>
            <span className="text-cyan-400 font-bold">{boxesToRender.length}</span>
          </div>
        </div>
      </div>
    </>
  );
}
