'use client';

import { useEffect, useState } from 'react';

interface FloatingImageViewerProps {
    images: string[] | null;
    onClose: () => void;
}

export default function FloatingImageViewer({ images, onClose }: FloatingImageViewerProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (images && images.length > 0) {
            setIsVisible(true);
            setCurrentIndex(0); // Reset to first image when new images arrive
        } else {
            setIsVisible(false);
        }
    }, [images]);

    useEffect(() => {
        if (!isVisible) return;

        // Detectar zoom (rueda del mouse)
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                // Zoom detectado
                onClose();
            }
        };

        // Detectar arrastre del mouse
        const handleMouseMove = (e: MouseEvent) => {
            if (e.buttons === 1) {
                // Botón izquierdo presionado (arrastrando)
                onClose();
            }
        };

        // Detectar touch (para móviles)
        let touchStarted = false;
        const handleTouchStart = () => {
            touchStarted = true;
        };

        const handleTouchMove = () => {
            if (touchStarted) {
                onClose();
            }
        };

        // Detectar zoom con pinch en móviles
        let lastTouchDistance = 0;
        const handleTouchMovePinch = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const distance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) +
                    Math.pow(touch2.clientY - touch1.clientY, 2)
                );

                if (lastTouchDistance > 0 && Math.abs(distance - lastTouchDistance) > 10) {
                    // Pinch zoom detectado
                    onClose();
                }
                lastTouchDistance = distance;
            }
        };

        const handleTouchEnd = () => {
            touchStarted = false;
            lastTouchDistance = 0;
        };

        window.addEventListener('wheel', handleWheel);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('touchstart', handleTouchStart);
        window.addEventListener('touchmove', handleTouchMove);
        window.addEventListener('touchmove', handleTouchMovePinch);
        window.addEventListener('touchend', handleTouchEnd);

        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchmove', handleTouchMovePinch);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isVisible, onClose]);

    const handlePrevious = () => {
        if (images && images.length > 1) {
            setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
        }
    };

    const handleNext = () => {
        if (images && images.length > 1) {
            setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
        }
    };

    // Keyboard navigation
    useEffect(() => {
        if (!isVisible || !images || images.length <= 1) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                handlePrevious();
            } else if (e.key === 'ArrowRight') {
                handleNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible, images]);

    if (!images || images.length === 0 || !isVisible) return null;

    const currentImage = images[currentIndex];
    const hasMultipleImages = images.length > 1;

    // Detectar tipo de imagen
    const isDrawnImage = currentImage.startsWith('data:image/png;base64');
    const isConstellationImage = currentImage.includes('/constellations/');
    
    // Determinar el título y color según el tipo de imagen
    let imageTitle = 'QUERY IMAGE';
    let imageColor = 'cyan';
    
    if (isDrawnImage) {
        imageTitle = '🎨 YOUR DRAWING';
        imageColor = 'purple';
    } else if (isConstellationImage) {
        imageTitle = '⭐ CONSTELLATION';
        imageColor = 'yellow';
    }

    return (
        <div
            className={`
        fixed top-20 right-4 z-[1100]
        w-64 bg-black/90 backdrop-blur-md
        border border-cyan-500/30 rounded-lg
        shadow-[0_0_30px_rgba(6,182,212,0.3)]
        transition-all duration-300 ease-in-out
        ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}
      `}
        >
            {/* Header */}
            <div className={`flex items-center justify-between px-3 py-2 border-b ${
                imageColor === 'purple' ? 'border-purple-500/30' : 
                imageColor === 'yellow' ? 'border-yellow-500/30' : 
                'border-cyan-500/30'
            }`}>
                <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        imageColor === 'purple' ? 'bg-purple-400' : 
                        imageColor === 'yellow' ? 'bg-yellow-400' : 
                        'bg-cyan-400'
                    }`}></div>
                    <h3 className={`font-mono text-[11px] font-bold tracking-wider ${
                        imageColor === 'purple' ? 'text-purple-400' : 
                        imageColor === 'yellow' ? 'text-yellow-400' : 
                        'text-cyan-400'
                    }`}>
                        {imageTitle} {hasMultipleImages ? `${currentIndex + 1}/${images.length}` : ''}
                    </h3>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-200"
                    title="Close"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Image with navigation */}
            <div className="relative p-2">
                <img
                    src={currentImage}
                    alt={`Query image ${currentIndex + 1}`}
                    className="w-full h-auto rounded border border-cyan-500/30"
                />

                {/* Navigation arrows */}
                {hasMultipleImages && (
                    <>
                        <button
                            onClick={handlePrevious}
                            className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/80 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-400 transition-all duration-200"
                            title="Previous image"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <button
                            onClick={handleNext}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/80 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-400 transition-all duration-200"
                            title="Next image"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </>
                )}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-1.5 border-t border-cyan-500/30 text-[8px] font-mono text-cyan-400/40 text-center">
                {hasMultipleImages && (
                    <span className="mr-2">← → to navigate</span>
                )}
                Auto-closes on zoom/pan
            </div>
        </div>
    );
}
