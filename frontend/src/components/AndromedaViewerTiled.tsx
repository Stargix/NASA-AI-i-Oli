'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function AndromedaViewerTiled() {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(-4.8);
    const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });
    const [loading, setLoading] = useState(true);
    const [tilesLoaded, setTilesLoaded] = useState(0);
    const [totalTiles, setTotalTiles] = useState(0);
    const [isZoomLoading, setIsZoomLoading] = useState(false);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        // Dimensiones de la imagen original
        const imageWidth = 40000;
        const imageHeight = 10000;

        // Configurar los límites de la imagen
        const bounds: L.LatLngBoundsExpression = [
            [0, 0],
            [imageHeight, imageWidth]
        ];

        // Crear el mapa con configuración optimizada para tiles
        const map = L.map(containerRef.current, {
            crs: L.CRS.Simple,
            minZoom: -4.8,  // Zoom mínimo para ver la imagen completa
            maxZoom: 2,     // Máximo zoom para tiles nivel 2
            center: [imageHeight / 2, imageWidth / 2],
            zoom: -4.8,     // Iniciar con zoom -4.8 para ver la imagen completa
            maxBounds: bounds,
            maxBoundsViscosity: 1.0,
            zoomControl: false,
            attributionControl: false,
            preferCanvas: true,       // Usar Canvas para mejor rendimiento
            zoomAnimation: true,
            zoomAnimationThreshold: 4,
            fadeAnimation: false,     // Desactivar fade para mejor performance
            markerZoomAnimation: false, // Desactivar para mejor performance
            inertia: true,            // Suavizar movimiento
            inertiaDeceleration: 3000, // Desaceleración suave
            inertiaMaxSpeed: 1500,    // Velocidad máxima controlada
            worldCopyJump: false,
            wheelPxPerZoomLevel: 60,  // Zoom más suave con rueda
            zoomSnap: 0.25,           // Permitir zoom granular pero no excesivo
            zoomDelta: 0.5,           // Menos salto entre niveles
        });

        // Crear una capa de imagen base para evitar artefactos
        // Usar una imagen de placeholder pequeña primero
        const placeholderBounds: L.LatLngBoundsExpression = bounds;

        // Crear un canvas para un placeholder sólido mientras carga
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, 1, 1);
        }
        const placeholderUrl = canvas.toDataURL();

        const imageLayer = L.imageOverlay(placeholderUrl, placeholderBounds, {
            opacity: 1,
            interactive: false,
            className: 'andromeda-placeholder',
        } as any);

        imageLayer.addTo(map);

        // Ahora cargar la imagen real progresivamente
        const realImage = new Image();
        realImage.crossOrigin = 'anonymous';

        // Usar requestAnimationFrame para cargar sin bloquear
        requestAnimationFrame(() => {
            realImage.src = '/andromeda.jpg';
        });

        let imageLoaded = false;
        let imageRendered = false;
        let minLoadingTimePassed = false;

        // Asegurar un tiempo mínimo de pantalla de carga (2 segundos)
        const minLoadingTimeout = setTimeout(() => {
            minLoadingTimePassed = true;
            if (imageLoaded && imageRendered) {
                // Delay adicional para asegurar que está visible
                setTimeout(() => setLoading(false), 300);
            }
        }, 2000);

        realImage.onload = () => {
            // Reemplazar placeholder con imagen real
            imageLayer.setUrl('/andromeda.jpg');
            imageLoaded = true;
            setTilesLoaded(1);
            setTotalTiles(1);

            // Esperar a que la imagen se renderice en el DOM
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    imageRendered = true;
                    // Solo quitar loading si ya pasó el tiempo mínimo
                    if (minLoadingTimePassed) {
                        setTimeout(() => setLoading(false), 300);
                    }
                });
            });
        };

        realImage.onerror = () => {
            console.error('Error loading Andromeda image');
            imageLoaded = true;
            imageRendered = true;
            if (minLoadingTimePassed) {
                setLoading(false);
            }
        };

        // Safety timeout para quitar pantalla de carga
        const safetyTimeout = setTimeout(() => {
            setLoading(false);
        }, 6000);

        // Ajustar la vista para que la imagen completa sea visible
        // Padding superior mayor para no quedar detrás del header
        map.fitBounds(bounds, {
            padding: [80, 20], // Padding top más grande (80px) para el header
            paddingTopLeft: [20, 100],  // Extra padding en la esquina superior izquierda
            paddingBottomRight: [20, 80], // Padding extra inferior para controles
            animate: false,     // Sin animación inicial para carga rápida
        });

        // Event listeners optimizados - actualización inmediata sin throttling excesivo
        let zoomLoadingTimeout: NodeJS.Timeout;

        map.on('zoomstart', () => {
            setIsZoomLoading(true);
            clearTimeout(zoomLoadingTimeout);
        });

        map.on('zoomend', () => {
            setZoom(Math.round(map.getZoom() * 10) / 10);
            // Dar un pequeño delay para que se carguen los tiles antes de quitar el indicador
            zoomLoadingTimeout = setTimeout(() => {
                setIsZoomLoading(false);
            }, 600);
        });

        map.on('zoom', () => {
            // Actualizar durante el zoom para feedback inmediato
            setZoom(Math.round(map.getZoom() * 10) / 10);
        });

        // Detectar cuando la imagen está cargando durante movimientos
        map.on('movestart', () => {
            if (!loading) {
                setIsZoomLoading(true);
                clearTimeout(zoomLoadingTimeout);
            }
        });

        map.on('moveend', () => {
            if (!loading) {
                zoomLoadingTimeout = setTimeout(() => {
                    setIsZoomLoading(false);
                }, 400);
            }
            // Actualizar estado global del viewer para el Toolbox
            updateViewerState();
        });

        // Throttle ligero de mousemove para mejor rendimiento
        let lastUpdate = 0;
        map.on('mousemove', (e: L.LeafletMouseEvent) => {
            const now = Date.now();
            // Solo actualizar cada 50ms (más responsive)
            if (now - lastUpdate > 50) {
                lastUpdate = now;
                setCoordinates({
                    x: Math.round(e.latlng.lng),
                    y: Math.round(e.latlng.lat)
                });
            }
        });

        // Función para actualizar el estado global del viewer
        const updateViewerState = () => {
            const center = map.getCenter();
            (window as any).andromedaViewerState = {
                zoom: map.getZoom(),
                centerPx: {
                    x: center.lng,
                    y: center.lat
                },
                imageSize: {
                    width: imageWidth,
                    height: imageHeight
                }
            };
        };

        // Actualizar estado inicial
        updateViewerState();

        // Actualizar estado en cada zoom
        map.on('zoomend', () => {
            updateViewerState();
        });

        mapRef.current = map;

        return () => {
            clearTimeout(safetyTimeout);
            clearTimeout(minLoadingTimeout);
            map.remove();
            mapRef.current = null;
        };
    }, []);

    return (
        <div className="relative w-full h-full bg-black">
            <div
                ref={containerRef}
                className="w-full h-full"
                style={{
                    background: '#000000', // Fondo negro sólido para evitar artefactos
                    transform: 'translate3d(0, 0, 0)', // Force hardware acceleration
                    willChange: 'transform',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                }}
            />

            {/* Panel de información cyber - Ancho fijo para evitar solapamiento */}
            <div className="absolute top-20 sm:top-24 left-4 z-[1000] w-40 sm:w-44 bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-lg p-2.5 sm:p-3 font-mono shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                <div className="flex flex-col gap-1.5">
                    <div className="text-cyan-400 font-bold text-[11px] sm:text-xs mb-1 border-b border-cyan-500/30 pb-1 flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></span>
                        TELEMETRY
                    </div>
                    <div className="flex justify-between gap-2 text-[11px] sm:text-xs">
                        <span className="text-cyan-400/60">ZOOM:</span>
                        <span className="text-cyan-400 font-bold">{zoom.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-[11px] sm:text-xs">
                        <span className="text-cyan-400/60">X:</span>
                        <span className="text-cyan-400 font-bold">{coordinates.x.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-[11px] sm:text-xs">
                        <span className="text-cyan-400/60">Y:</span>
                        <span className="text-cyan-400 font-bold">{coordinates.y.toLocaleString()}</span>
                    </div>
                    <div className="mt-1 pt-1 border-t border-cyan-500/30">
                        <div className="text-[9px] sm:text-[10px] text-cyan-400/40">
                            {loading
                                ? `Loading: ${tilesLoaded}/${totalTiles}`
                                : isZoomLoading
                                    ? 'Loading tiles...'
                                    : '40k×10k px'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Indicador de carga durante zoom - Spinner */}
            {isZoomLoading && !loading && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1500]">
                    <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
                </div>
            )}

            {/* Controles adicionales - Tamaño moderado */}
            <div className="absolute top-20 sm:top-24 right-4 z-[1000] flex flex-col gap-1.5">
                <button
                    onClick={() => mapRef.current?.zoomIn()}
                    className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded p-2 text-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all duration-300"
                    title="Zoom In"
                >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
                <button
                    onClick={() => mapRef.current?.zoomOut()}
                    className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded p-2 text-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all duration-300"
                    title="Zoom Out"
                >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                </button>
                <button
                    onClick={() => {
                        if (mapRef.current) {
                            // Volver a la vista completa de la imagen
                            const bounds: L.LatLngBoundsExpression = [[0, 0], [10000, 40000]];
                            mapRef.current.fitBounds(bounds, {
                                padding: [20, 20],
                                animate: true,
                                duration: 0.5,
                            });
                        }
                    }}
                    className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded p-2 text-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all duration-300"
                    title="Reset View"
                >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                </button>
            </div>

            {/* Grid overlay cyber */}
            <div className="absolute inset-0 pointer-events-none z-[999]">
                <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-cyan-500/5"></div>
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
              linear-gradient(to right, rgba(6, 182, 212, 0.03) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(6, 182, 212, 0.03) 1px, transparent 1px)
            `,
                        backgroundSize: '50px 50px'
                    }}
                ></div>

                {/* Esquinas decorativas */}
                <div className="absolute top-20 left-0 w-12 h-12 border-l-2 border-t-2 border-cyan-500/30"></div>
                <div className="absolute top-20 right-0 w-12 h-12 border-r-2 border-t-2 border-cyan-500/30"></div>
                <div className="absolute bottom-16 left-0 w-12 h-12 border-l-2 border-b-2 border-cyan-500/30"></div>
                <div className="absolute bottom-16 right-0 w-12 h-12 border-r-2 border-b-2 border-cyan-500/30"></div>
            </div>

            {/* Indicador de carga */}
            {loading && (
                <div className="absolute inset-0 z-[2000] bg-black flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-cyan-400 text-3xl font-mono mb-6 animate-pulse">
                            INITIALIZING ANDROMEDA EXPLORER
                        </div>
                        <div className="text-cyan-400/60 text-sm font-mono mb-6">
                            Loading high-resolution imagery...
                        </div>
                        <div className="flex gap-2 justify-center mb-8">
                            <div className="w-4 h-4 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-4 h-4 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-4 h-4 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <div className="text-cyan-400/40 text-xs font-mono">
                            {tilesLoaded > 0 ? `${tilesLoaded}/${totalTiles} tiles loaded` : 'Preparing image data...'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
