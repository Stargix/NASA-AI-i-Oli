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
}

export default function BoundingBoxOverlay({ boxes, visible, onClose }: Props) {
  const [viewerState, setViewerState] = useState<any>(null);
  const [selectedBox, setSelectedBox] = useState<BoundingBox | null>(null);

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
    console.log('🎯 BoundingBoxOverlay render check:', {
      visible,
      hasViewerState: !!viewerState,
      boxesCount: boxes.length,
      boxes: boxes.slice(0, 3), // primeros 3 boxes
      viewerState
    });
  }, [visible, viewerState, boxes]);

  if (!visible || !viewerState || boxes.length === 0) {
    console.log('⚠️ BoundingBoxOverlay NOT rendering:', { visible, hasViewerState: !!viewerState, boxesCount: boxes.length });
    return null;
  }

  console.log('✅ BoundingBoxOverlay RENDERING with', boxes.length, 'boxes');

  // Función para convertir coordenadas de imagen a coordenadas de pantalla
  const imageToScreen = (imageX: number, imageY: number) => {
    // Las coordenadas de la imagen en Leaflet son [y, x] (lat, lng)
    // Necesitamos mapear las coordenadas del bounding box a la pantalla
    
    // Por ahora, usaremos una aproximación simple
    // Esto necesitará ajustarse según el zoom y la posición del mapa
    const zoom = viewerState.zoom;
    const centerPx = viewerState.centerPx;
    const imageSize = viewerState.imageSize;

    // Calcular el factor de escala basado en el zoom
    // zoom -4.8 = imagen completa visible
    // zoom 2 = máximo acercamiento
    const zoomRange = 2 - (-4.8); // 6.8
    const currentZoomNormalized = (zoom - (-4.8)) / zoomRange; // 0 a 1
    
    // Escala exponencial para el zoom
    const scale = Math.pow(2, zoom + 4.8);

    // Calcular offset desde el centro
    const offsetX = (imageX - centerPx.x) * scale;
    const offsetY = (imageY - centerPx.y) * scale;

    // Posición en la pantalla (centro de la pantalla es el centro del viewer)
    const screenX = window.innerWidth / 2 + offsetX;
    const screenY = window.innerHeight / 2 + offsetY;

    return { x: screenX, y: screenY, scale };
  };

  return (
    <>
      {/* Overlay de bounding boxes */}
      <div className="absolute inset-0 pointer-events-none z-[900]">
        {boxes.map((box, index) => {
          const [centerX, centerY] = box.center;
          const { x, y, scale } = imageToScreen(centerX, centerY);
          
          const boxWidth = box.width * scale;
          const boxHeight = box.height * scale;

          // Debug primer box
          if (index === 0) {
            console.log('📦 First box calculation:', {
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
              key={index}
              className="absolute pointer-events-auto cursor-pointer transition-all duration-200 hover:scale-110"
              style={{
                left: x - boxWidth / 2,
                top: y - boxHeight / 2,
                width: Math.max(boxWidth, 4), // Mínimo 4px para que sea visible
                height: Math.max(boxHeight, 4),
                border: `2px solid ${borderColor}`,
                backgroundColor: bgColor,
                boxShadow: `0 0 10px ${borderColor}`,
              }}
              onClick={() => setSelectedBox(box)}
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
        </div>
      </div>
    </>
  );
}
