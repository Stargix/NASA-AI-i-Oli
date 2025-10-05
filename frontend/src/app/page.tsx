'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ImageUploader, { TilesData } from '@/components/ImageUploader';
import QueryBox from '@/components/QueryBox';
import Toolbox from '@/components/Toolbox';
import BoundingBoxOverlay from '@/components/BoundingBoxOverlay';
import ChatPanel, { ChatMessage } from '@/components/ChatPanel';
import FloatingImageViewer from '@/components/FloatingImageViewer';
import Similarity from '@/components/Similarity';
import Constellations from '@/components/Constellations';
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
  const [constellationMatchedIndices, setConstellationMatchedIndices] = useState<number[] | undefined>(undefined);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Floating image viewer state
  const [floatingImages, setFloatingImages] = useState<string[] | null>(null);
  const [showSimilarity, setShowSimilarity] = useState(false);
  const [showConstellations, setShowConstellations] = useState(false);

  // Referencias para capturar screenshots
  const andromedaViewerRef = useRef<AndromedaViewerRef>(null);
  const dynamicViewerRef = useRef<DynamicViewerRef>(null);  // Función para limpiar bounding boxes
  const clearBoundingBoxes = () => {
    setDetectionResult(null);
    setShowBoundingBoxes(false);
    setConstellationMatchedIndices(undefined);
    setFloatingImages(null); // Cerrar imagen flotante de constelación
    console.log('🧹 Bounding boxes cleared from page.tsx');

    // Emitir evento para que Toolbox también limpie su estado
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('clearDetections');
      window.dispatchEvent(event);
    }
  };

  // Función para manejar cuando se encuentra una constelación
  const handleConstellationMatch = (matchResult: any) => {
    console.log('🌟 Constellation match received:', matchResult);
    if (matchResult.success && matchResult.matched_indices) {
      setConstellationMatchedIndices(matchResult.matched_indices);
      setShowBoundingBoxes(true);

      // Array para almacenar las imágenes a mostrar
      const imagesToShow: string[] = [];

      // Si hay un dibujo custom, mostrarlo primero
      if (matchResult.drawn_image_data_url) {
        console.log('🎨 Adding custom drawn constellation image');
        imagesToShow.push(matchResult.drawn_image_data_url);
      }

      // Si hay un índice de constelación predefinida, agregar esa imagen también
      if (matchResult.constellation_index !== undefined && matchResult.constellation_index !== null) {
        const constellationImageUrl = `/constellations/image${matchResult.constellation_index}_filtered.png`;
        console.log('🖼️ Loading constellation image:', constellationImageUrl);
        imagesToShow.push(constellationImageUrl);
      }

      // Actualizar las imágenes flotantes
      if (imagesToShow.length > 0) {
        setFloatingImages(imagesToShow);
      }
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
    setConstellationMatchedIndices(undefined); // Limpiar filtro de constelación cuando hay nueva detección
    console.log('Detection result received:', result);
  };

  // Función para ejecutar detección si no existe
  const runDetectionIfNeeded = async (): Promise<Array<[number, number]> | null> => {
    // Si ya hay detección, devolver los centroids existentes
    if (detectionResult && detectionResult.bounding_box_list) {
      console.log('✅ Detection already exists, returning centroids...');
      return detectionResult.bounding_box_list.map((box: any) => box.center as [number, number]);
    }

    console.log('🔍 No detection found, running star detection...');

    try {
      // Capturar screenshot actual
      let imageUrl = '';
      if (andromedaViewerRef.current) {
        imageUrl = await andromedaViewerRef.current.captureCurrentView();
      }

      if (!imageUrl) {
        // Fallback a la imagen completa si no se puede capturar
        imageUrl = `${window.location.origin}/andromeda.jpg`;
      }

      // Ejecutar detección automática
      const payload = {
        image: imageUrl,
        top_left: [0, 0],
        bottom_right: [40000, 10000],
        automated: true,
        gaussian_blur: 25,
        noise_threshold: 120,
        adaptative_filtering: false,
        separation_threshold: 3,
        min_size: 20,
        max_components: 1000,
        detect_clusters: false,
      };

      console.log('🔍 Running star detection with payload:', payload);
      const response = await fetch('http://localhost:8000/star_analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Detection failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Detection completed:', data);

      // Actualizar estado con los resultados
      setDetectionResult(data);
      setShowBoundingBoxes(true);

      // Devolver los centroids
      if (data.bounding_box_list) {
        return data.bounding_box_list.map((box: any) => box.center as [number, number]);
      }

      return null;
    } catch (err) {
      console.error('❌ Error running detection:', err);
      return null;
    }
  };

  const handleQuery = async (query: string, attachedImages?: File[]) => {
    if (!query.trim() && (!attachedImages || attachedImages.length === 0)) return;

    setIsQueryLoading(true);
    const startTime = Date.now();

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

    // Add user message to chat
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: query || '🖼️ Image query',
      timestamp: new Date(),
      images: images.length > 0 ? images : undefined,
    };
    setChatMessages(prev => [...prev, userMessage]);

    // Show floating images if there are images attached
    if (images.length > 0) {
      setFloatingImages(images); // Show all images
    }

    // Open chat panel if not already open
    if (!isChatOpen) {
      setIsChatOpen(true);
    } try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, images }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const processingTime = Date.now() - startTime;

      // Si el chat devuelve bounding boxes, mostrarlos
      if (data.bounding_box_list && data.bounding_box_list.length > 0) {
        console.log('🎯 Chat returned bounding boxes:', data.bounding_box_list);
        setDetectionResult({ bounding_box_list: data.bounding_box_list });
        setShowBoundingBoxes(true);
        setConstellationMatchedIndices(undefined);

        // Add assistant response to chat with bounding box info
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          type: 'assistant',
          content: data.response || 'No response received',
          timestamp: new Date(),
          metadata: {
            processingTime,
            detections: data.bounding_box_list.length,
          },
        };
        setChatMessages(prev => [...prev, assistantMessage]);
      } else {
        // Text response without bounding boxes
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          type: 'assistant',
          content: data.response || 'No response received',
          timestamp: new Date(),
          metadata: {
            processingTime,
          },
        };
        setChatMessages(prev => [...prev, assistantMessage]);
      }

    } catch (error) {
      console.error('Error sending query:', error);

      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'system',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to send query'}`,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsQueryLoading(false);
    }
  };

  const handleClearChat = () => {
    setChatMessages([]);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* Header cyber NASA - Responsive */}
      <header className="absolute top-0 left-0 right-0 z-[1000] h-[70px] bg-gradient-to-b from-black/90 via-black/70 to-transparent backdrop-blur-sm border-b border-cyan-500/30">
        <div className="flex items-center justify-between h-full px-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-cyan-400 font-bold text-lg sm:text-xl tracking-wider font-mono">
              NASA
            </div>
            <div className="h-5 sm:h-6 w-px bg-cyan-500/50"></div>
            <h1 className="text-cyan-400 font-mono text-sm sm:text-base tracking-wide">
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
            <button
              onClick={() => {
                setShowSimilarity(!showSimilarity);
                if (!showSimilarity) setShowConstellations(false); // Cierra Constellations al abrir Similarity
              }}
              className="px-3 py-1.5 sm:px-4 sm:py-2 border border-cyan-500/50 rounded text-cyan-400 text-xs sm:text-sm font-mono bg-cyan-500/10 hover:bg-cyan-500/20 transition-all duration-300 hover:shadow-[0_0_10px_rgba(6,182,212,0.3)]"
            >
              SIMILARITY
            </button>
            <button
              onClick={() => {
                setShowConstellations(!showConstellations);
                if (!showConstellations) setShowSimilarity(false); // Cierra Similarity al abrir Constellations
              }}
              className="px-3 py-1.5 sm:px-4 sm:py-2 border border-cyan-500/50 rounded text-cyan-400 text-xs sm:text-sm font-mono bg-cyan-500/10 hover:bg-cyan-500/20 transition-all duration-300 hover:shadow-[0_0_10px_rgba(6,182,212,0.3)]"
            >
              CONSTELLATIONS
            </button>
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
      <Toolbox
        onResult={handleDetectionResult}
        onCaptureView={async () => {
          if (customImage && dynamicViewerRef.current) {
            return await dynamicViewerRef.current.captureCurrentView();
          } else if (andromedaViewerRef.current) {
            return await andromedaViewerRef.current.captureCurrentView();
          }
          return '';
        }}
      />

      {/* Uploader modal */}
      {showUploader && (
        <ImageUploader
          onImageProcessed={handleImageProcessed}
          onCancel={() => setShowUploader(false)}
        />
      )}

      {/* Bounding Box Overlay */}
      {detectionResult && detectionResult.bounding_box_list && (
        <BoundingBoxOverlay
          boxes={detectionResult.bounding_box_list}
          visible={showBoundingBoxes}
          onClose={() => {
            setShowBoundingBoxes(false);
            setConstellationMatchedIndices(undefined);
          }}
          isScreenshotBased={true}
          matchedIndices={constellationMatchedIndices}
        />
      )}

      {/* Similarity Panel */}
      {showSimilarity && (
        <Similarity onClose={() => setShowSimilarity(false)} />
      )}

      {/* Constellations Panel */}
      {showConstellations && (
        <Constellations
          onClose={() => setShowConstellations(false)}
          detectedCentroids={
            detectionResult?.bounding_box_list?.map((box: any) => box.center as [number, number])
          }
          onConstellationMatch={handleConstellationMatch}
          onRequestDetection={runDetectionIfNeeded}
        />
      )}

      {/* Chat Panel */}
      <ChatPanel
        messages={chatMessages}
        isLoading={isQueryLoading}
        onClear={handleClearChat}
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
      />

      {/* Floating Image Viewer */}
      <FloatingImageViewer
        images={floatingImages}
        onClose={() => setFloatingImages(null)}
      />

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
