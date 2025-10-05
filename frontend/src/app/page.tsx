'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ImageUploader, { TilesData } from '@/components/ImageUploader';
import QueryBox from '@/components/QueryBox';
import Toolbox from '@/components/Toolbox';
import BoundingBoxOverlay from '@/components/BoundingBoxOverlay';
import Similarity from '@/components/Similarity';
import { AndromedaViewerRef } from '@/components/AndromedaViewerTiled';
import { DynamicViewerRef } from '@/components/DynamicImageViewer';


// Importar los componentes de forma dinámica para evitar SSR issues
const AndromedaViewer = dynamic(() => import('@/components/AndromedaViewerTiled'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <div className="text-cyan-400 text-xl font-mono animate-pulse">
        Initializing Andromeda Explorer...
      </div>
    </div>
  ),
});

const DynamicImageViewer = dynamic(() => import('@/components/DynamicImageViewer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <div className="text-cyan-400 text-xl font-mono animate-pulse">
        Loading viewer...
      </div>
    </div>
  ),
});

export default function Home() {
  const [showUploader, setShowUploader] = useState(false);
  const [customImage, setCustomImage] = useState<TilesData | null>(null);
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [detectionResult, setDetectionResult] = useState<any>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(false);
  const [showSimilarity, setShowSimilarity] = useState(false);

  // Referencias para capturar screenshots
  const andromedaViewerRef = useRef<AndromedaViewerRef>(null);
  const dynamicViewerRef = useRef<DynamicViewerRef>(null);

  // Función para limpiar bounding boxes
  const clearBoundingBoxes = () => {
    setDetectionResult(null);
    setShowBoundingBoxes(false);
    console.log('🧹 Bounding boxes cleared from page.tsx');

    // Emitir evento para que Toolbox también limpie su estado
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('clearDetections');
      window.dispatchEvent(event);
    }
  };

  // Exponer la función globalmente para que Toolbox pueda llamarla
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).clearBoundingBoxes = clearBoundingBoxes;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).clearBoundingBoxes;
      }
    };
  }, []);

  const handleImageProcessed = (tilesData: TilesData) => {
    setCustomImage(tilesData);
    setShowUploader(false);
  };

  const handleReset = () => {
    setCustomImage(null);
    setShowUploader(false);
  };

  const handleLoadNewImage = () => {
    setShowUploader(true);
  };

  const handleDetectionResult = (result: any) => {
    setDetectionResult(result);
    setShowBoundingBoxes(true);
    console.log('Detection result received:', result);
  };

  const handleQuery = async (query: string, attachedImages?: File[]) => {
    setIsQueryLoading(true);

    let images: string[] = [];
    if (attachedImages && attachedImages.length > 0) {
      // Convert all attached images to base64 and add to the array
      images = await Promise.all(
        attachedImages.map(
          file =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            })
        )
      );
    }

    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, images }),
      });
      const data = await response.json();
      alert('Respuesta de la API: ' + data.response);
    } catch (error) {
      console.error('Error sending query:', error);
      alert('Error al enviar la consulta');
    } finally {
      setIsQueryLoading(false);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* Header cyber NASA - Responsive */}
      <header className="absolute top-0 left-0 right-0 z-[1000] bg-gradient-to-b from-black/90 via-black/70 to-transparent backdrop-blur-sm border-b border-cyan-500/30">
        <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-cyan-400 font-bold text-lg sm:text-xl tracking-wider font-mono">
              NASA
            </div>
            <div className="h-5 sm:h-6 w-px bg-cyan-500/50"></div>
            <h1 className="text-white font-mono text-sm sm:text-base tracking-wide">
              {customImage ? 'CUSTOM EXPLORER' : 'ANDROMEDA'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadNewImage}
              className="px-3 py-1.5 sm:px-4 sm:py-2 border border-cyan-500/50 rounded text-cyan-400 text-xs sm:text-sm font-mono bg-cyan-500/10 hover:bg-cyan-500/20 transition-all duration-300 hover:shadow-[0_0_10px_rgba(6,182,212,0.3)]"
            >
              UPLOAD
            </button>
            {customImage && (
              <button
                onClick={handleReset}
                className="px-3 py-1.5 sm:px-4 sm:py-2 border border-cyan-500/50 rounded text-cyan-400 text-xs sm:text-sm font-mono bg-cyan-500/10 hover:bg-cyan-500/20 transition-all duration-300 hover:shadow-[0_0_10px_rgba(6,182,212,0.3)]"
              >
                ANDROMEDA
              </button>
            )}
            {!customImage && (
              <button
                onClick={() => setShowSimilarity(!showSimilarity)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 border border-purple-500/50 rounded text-purple-400 text-xs sm:text-sm font-mono bg-purple-500/10 hover:bg-purple-500/20 transition-all duration-300 hover:shadow-[0_0_10px_rgba(168,85,247,0.3)]"
              >
                SIMILARITY
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Visualizador principal */}
      {customImage ? (
        <DynamicImageViewer ref={dynamicViewerRef} tilesData={customImage} onReset={handleReset} />
      ) : (
        <AndromedaViewer ref={andromedaViewerRef} />
      )}

      {/* Toolbox para detección de estrellas */}
      {!customImage && (
        <Toolbox
          onResult={handleDetectionResult}
          onCaptureView={async () => {
            if (andromedaViewerRef.current) {
              return await andromedaViewerRef.current.captureCurrentView();
            }
            return '';
          }}
        />
      )}

      {/* Uploader modal */}
      {showUploader && (
        <ImageUploader
          onImageProcessed={handleImageProcessed}
          onCancel={() => setShowUploader(false)}
        />
      )}

      {/* Bounding Box Overlay */}
      {!customImage && detectionResult && detectionResult.bounding_box_list && (
        <BoundingBoxOverlay
          boxes={detectionResult.bounding_box_list}
          visible={showBoundingBoxes}
          onClose={() => setShowBoundingBoxes(false)}
          isScreenshotBased={true}
        />
      )}

      {/* Similarity Panel */}
      {!customImage && showSimilarity && (
        <Similarity onClose={() => setShowSimilarity(false)} />
      )}

      {/* Query Box - Compacto */}
      <div className="absolute bottom-10 left-4 right-4 z-[1000]">
        <QueryBox onQuery={handleQuery} isLoading={isQueryLoading} />
      </div>

      {/* Footer cyber - Compacto */}
      <div className="absolute bottom-2 left-4 right-4 z-[1000] flex items-center justify-between">
        <div className="text-cyan-400/60 text-[9px] font-mono">
          © NASA IMAGING
        </div>
        <div className="flex gap-2 text-cyan-400/60 text-[9px] font-mono">
          <span>ZOOM: DYN</span>
          <span>|</span>
          <span>RES: ADAPT</span>
          <span>|</span>
          <span>{customImage ? 'CUSTOM' : 'M31'}</span>
        </div>
      </div>
    </div>
  );
}
