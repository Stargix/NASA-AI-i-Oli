'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import ImageUploader, { TilesData } from '@/components/ImageUploader';
import QueryBox from '@/components/QueryBox';

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
      {/* Header cyber NASA */}
      <header className="absolute top-0 left-0 right-0 z-[1000] bg-gradient-to-b from-black/90 via-black/70 to-transparent backdrop-blur-sm border-b border-cyan-500/30">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="text-cyan-400 font-bold text-2xl tracking-wider font-mono">
              NASA
            </div>
            <div className="h-8 w-px bg-cyan-500/50"></div>
            <h1 className="text-white font-mono text-xl tracking-wide">
              {customImage ? 'CUSTOM IMAGE EXPLORER' : 'ANDROMEDA EXPLORER'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleLoadNewImage}
              className="px-4 py-2 border border-cyan-500/50 rounded text-cyan-400 text-xs font-mono bg-cyan-500/10 hover:bg-cyan-500/20 transition-all duration-300 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.5)]"
            >
              UPLOAD IMAGE
            </button>
            {customImage && (
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-cyan-500/50 rounded text-cyan-400 text-xs font-mono bg-cyan-500/10 hover:bg-cyan-500/20 transition-all duration-300 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.5)]"
              >
                VIEW ANDROMEDA
              </button>
            )}
            <div className="text-cyan-400/80 text-sm font-mono">
              {customImage ? 'CUSTOM' : 'M31 GALAXY'}
            </div>
            <div className="px-3 py-1 border border-cyan-500/50 rounded text-cyan-400 text-xs font-mono bg-cyan-500/10">
              ACTIVE
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

      {/* Uploader modal */}
      {showUploader && (
        <ImageUploader
          onImageProcessed={handleImageProcessed}
          onCancel={() => setShowUploader(false)}
        />
      )}

      {/* Query Box */}
      <div className="absolute bottom-20 left-4 right-4 z-[1000]">
        <QueryBox onQuery={handleQuery} isLoading={isQueryLoading} />
      </div>

      {/* Footer cyber */}
      <div className="absolute bottom-4 left-4 right-4 z-[1000] flex items-center justify-between">
        <div className="text-cyan-400/60 text-xs font-mono">
          © NASA DEEP SPACE IMAGING
        </div>
        <div className="flex gap-4 text-cyan-400/60 text-xs font-mono">
          <span>ZOOM: DYNAMIC</span>
          <span>|</span>
          <span>RES: ADAPTIVE</span>
          <span>|</span>
          <span>{customImage ? 'CUSTOM MODE' : 'ANDROMEDA MODE'}</span>
        </div>
      </div>
    </div>
  );
}
