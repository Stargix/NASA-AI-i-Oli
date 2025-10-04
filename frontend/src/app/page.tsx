'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import ImageUploader, { TilesData } from '@/components/ImageUploader';
import QueryBox from '@/components/QueryBox';
import Toolbox from '@/components/Toolbox';

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
    console.log('Detection result received:', result);
  };

  const handleQuery = async (query: string, attachedImages?: File[]) => {
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

    const response = await fetch('http://localhost:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: query, images }),
    });
    const data = await response.json();
    alert('Respuesta de la API: ' + data.response);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* Header cyber NASA - Compacto */}
      <header className="absolute top-0 left-0 right-0 z-[1000] bg-gradient-to-b from-black/90 via-black/70 to-transparent backdrop-blur-sm border-b border-cyan-500/30">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="text-cyan-400 font-bold text-lg tracking-wider font-mono">
              NASA
            </div>
            <div className="h-5 w-px bg-cyan-500/50"></div>
            <h1 className="text-white font-mono text-sm tracking-wide">
              {customImage ? 'CUSTOM EXPLORER' : 'ANDROMEDA'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadNewImage}
              className="px-2 py-1 border border-cyan-500/50 rounded text-cyan-400 text-[10px] font-mono bg-cyan-500/10 hover:bg-cyan-500/20 transition-all duration-300"
            >
              UPLOAD
            </button>
            {customImage && (
              <button
                onClick={handleReset}
                className="px-2 py-1 border border-cyan-500/50 rounded text-cyan-400 text-[10px] font-mono bg-cyan-500/10 hover:bg-cyan-500/20 transition-all duration-300"
              >
                ANDROMEDA
              </button>
            )}
            <div className="px-2 py-0.5 border border-cyan-500/50 rounded text-cyan-400 text-[9px] font-mono bg-cyan-500/10">
              {customImage ? 'CUSTOM' : 'M31'}
            </div>
          </div>
        </div>
      </header>

      {/* Visualizador principal */}
      {customImage ? (
        <DynamicImageViewer tilesData={customImage} onReset={handleReset} />
      ) : (
        <AndromedaViewer />
      )}

      {/* Toolbox para detección de estrellas */}
      {!customImage && <Toolbox onResult={handleDetectionResult} />}

      {/* Uploader modal */}
      {showUploader && (
        <ImageUploader
          onImageProcessed={handleImageProcessed}
          onCancel={() => setShowUploader(false)}
        />
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
