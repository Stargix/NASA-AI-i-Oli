'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TilesData } from './ImageUploader';

interface DynamicViewerProps {
    tilesData: TilesData;
    onReset: () => void;
}

// Crear una URL de objeto para la imagen completa
function createImageUrl(tilesData: TilesData): string {
    // Usar el tile del máximo zoom y centro como imagen completa
    // O mejor aún, vamos a reconstruir la imagen completa desde los tiles
    const { width, height, tiles, maxZoom, tileSize } = tilesData;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) return '';

    // Fondo negro
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    return canvas.toDataURL('image/jpeg', 0.9);
}

export default function DynamicImageViewer({ tilesData, onReset }: DynamicViewerProps) {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(0);
    const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });
    const [loading, setLoading] = useState(true);
    const [isZoomLoading, setIsZoomLoading] = useState(false);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [reconstructProgress, setReconstructProgress] = useState(0);

    // Reconstruir la imagen completa desde los tiles del máximo zoom
    useEffect(() => {
        const { width, height, tiles, maxZoom, tileSize } = tilesData;

        console.log('Starting image reconstruction...', { width, height, maxZoom, tileSize, tilesCount: tiles.size });

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
            console.error('Failed to get canvas context');
            return;
        }

        // Fondo negro
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const cols = Math.ceil(width / tileSize);
        const rows = Math.ceil(height / tileSize);

        let loadedTiles = 0;
        const totalTiles = cols * rows;

        console.log(`Reconstructing image from ${totalTiles} tiles (${cols}x${rows})`);

        // Cargar todos los tiles del máximo zoom
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const tileKey = `${maxZoom}/${x}/${y}`;
                const tileData = tiles.get(tileKey);

                if (tileData) {
                    const img = new Image();
                    img.onload = () => {
                        ctx.drawImage(img, x * tileSize, y * tileSize);
                        loadedTiles++;
                        setReconstructProgress(Math.round((loadedTiles / totalTiles) * 100));

                        // Cuando todos los tiles estén cargados, crear la URL
                        if (loadedTiles === totalTiles) {
                            console.log('All tiles loaded, creating image URL...');
                            const url = canvas.toDataURL('image/jpeg', 0.92);
                            setImageUrl(url);
                            console.log('Image URL created successfully');
                        }
                    };
                    img.onerror = () => {
                        console.error(`Failed to load tile: ${tileKey}`);
                        loadedTiles++;
                        setReconstructProgress(Math.round((loadedTiles / totalTiles) * 100));
                        if (loadedTiles === totalTiles) {
                            const url = canvas.toDataURL('image/jpeg', 0.92);
                            setImageUrl(url);
                        }
                    };
                    img.src = tileData;
                } else {
                    console.warn(`Tile missing: ${tileKey}`);
                    loadedTiles++;
                    setReconstructProgress(Math.round((loadedTiles / totalTiles) * 100));
                    if (loadedTiles === totalTiles) {
                        const url = canvas.toDataURL('image/jpeg', 0.92);
                        setImageUrl(url);
                    }
                }
            }
        }
    }, [tilesData]);

    useEffect(() => {
        if (!containerRef.current || mapRef.current || !imageUrl) return;

        const { width, height } = tilesData;

        // Calcular límites para Leaflet CRS.Simple
        const bounds: L.LatLngBoundsExpression = [
            [0, 0],
            [height, width]
        ];

        // Crear mapa con configuración optimizada
        const map = L.map(containerRef.current, {
            crs: L.CRS.Simple,
            minZoom: -5,
            maxZoom: 2,
            center: [height / 2, width / 2],
            zoom: -2,
            maxBounds: bounds,
            maxBoundsViscosity: 1.0,
            zoomControl: false,
            attributionControl: false,
            preferCanvas: true,
            zoomAnimation: true,
            zoomAnimationThreshold: 4,
            fadeAnimation: false,
            markerZoomAnimation: false,
            inertia: true,
            inertiaDeceleration: 3000,
            inertiaMaxSpeed: 1500,
            worldCopyJump: false,
            wheelPxPerZoomLevel: 60,
            zoomSnap: 0.25,
            zoomDelta: 0.5,
        });

        // Agregar la imagen como overlay
        const imageLayer = L.imageOverlay(imageUrl, bounds, {
            opacity: 1,
            interactive: false,
        } as any);

        imageLayer.addTo(map);

        // Ajustar vista inicial para ver toda la imagen
        map.fitBounds(bounds, {
            padding: [80, 20],
            paddingTopLeft: [20, 100],
            paddingBottomRight: [20, 80],
            animate: false,
        });

        setTimeout(() => {
            setLoading(false);
            setZoom(map.getZoom());
        }, 500);

        // Event listeners
        let zoomLoadingTimeout: NodeJS.Timeout;

        map.on('zoomstart', () => {
            setIsZoomLoading(true);
            clearTimeout(zoomLoadingTimeout);
        });

        map.on('zoomend', () => {
            setZoom(Math.round(map.getZoom() * 10) / 10);
            zoomLoadingTimeout = setTimeout(() => {
                setIsZoomLoading(false);
            }, 400);
        });

        map.on('zoom', () => {
            setZoom(Math.round(map.getZoom() * 10) / 10);
        });

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
                }, 300);
            }
        });

        let lastUpdate = 0;
        map.on('mousemove', (e: L.LeafletMouseEvent) => {
            const now = Date.now();
            if (now - lastUpdate > 50) {
                lastUpdate = now;
                setCoordinates({
                    x: Math.round(e.latlng.lng),
                    y: Math.round(e.latlng.lat)
                });
            }
        });

        mapRef.current = map;

        return () => {
            clearTimeout(zoomLoadingTimeout);
            map.remove();
            mapRef.current = null;
        };
    }, [tilesData, imageUrl, loading]);

    return (
        <div className="relative w-full h-full bg-black">
            <div
                ref={containerRef}
                className="w-full h-full"
                style={{
                    background: '#000000',
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'transform',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                }}
            />

            {/* Panel de información */}
            <div className="absolute top-24 left-4 z-[1000] bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-lg p-4 font-mono text-sm shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                <div className="flex flex-col gap-2">
                    <div className="text-cyan-400 font-bold mb-2 border-b border-cyan-500/30 pb-2 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                        TELEMETRY DATA
                    </div>
                    <div className="flex justify-between gap-8">
                        <span className="text-cyan-400/60">ZOOM LEVEL:</span>
                        <span className="text-cyan-400 font-bold">{zoom.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                        <span className="text-cyan-400/60">COORD X:</span>
                        <span className="text-cyan-400 font-bold">{coordinates.x.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                        <span className="text-cyan-400/60">COORD Y:</span>
                        <span className="text-cyan-400 font-bold">{coordinates.y.toLocaleString()}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-cyan-500/30">
                        <div className="text-[10px] text-cyan-400/40">
                            Resolution: {tilesData.width.toLocaleString()} × {tilesData.height.toLocaleString()} px
                        </div>
                        <div className="text-[10px] text-cyan-400/40">
                            {loading
                                ? 'Loading tiles...'
                                : isZoomLoading
                                    ? 'Loading high-res tiles...'
                                    : `${tilesData.tiles.size} tiles loaded`}
                        </div>
                    </div>
                </div>
            </div>

            {/* Indicador de carga durante zoom */}
            {isZoomLoading && !loading && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1500]">
                    <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
                </div>
            )}

            {/* Controles */}
            <div className="absolute top-24 right-4 z-[1000] flex flex-col gap-2">
                <button
                    onClick={() => mapRef.current?.zoomIn()}
                    className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded p-3 text-cyan-400 hover:bg-cyan-500/20 transition-all duration-300 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                    title="Zoom In"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
                <button
                    onClick={() => mapRef.current?.zoomOut()}
                    className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded p-3 text-cyan-400 hover:bg-cyan-500/20 transition-all duration-300 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                    title="Zoom Out"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                </button>
                <button
                    onClick={() => {
                        if (mapRef.current) {
                            const bounds: L.LatLngBoundsExpression = [
                                [0, 0],
                                [tilesData.height, tilesData.width]
                            ];
                            mapRef.current.fitBounds(bounds, {
                                padding: [20, 20],
                                animate: true,
                                duration: 0.5,
                            });
                        }
                    }}
                    className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded p-3 text-cyan-400 hover:bg-cyan-500/20 transition-all duration-300 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                    title="Reset View"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                </button>

            </div>

            {/* Grid overlay */}
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

            {/* Indicador de carga inicial */}
            {loading && (
                <div className="absolute inset-0 z-[2000] bg-black flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-cyan-400 text-3xl font-mono mb-6 animate-pulse">
                            {!imageUrl ? 'RECONSTRUCTING IMAGE' : 'INITIALIZING IMAGE EXPLORER'}
                        </div>

                        {!imageUrl && (
                            <div className="mb-6">
                                <div className="text-cyan-400/80 text-sm font-mono mb-4">
                                    Assembling tiles: {reconstructProgress}%
                                </div>
                                <div className="w-64 h-3 bg-cyan-500/10 border border-cyan-500/30 rounded-full overflow-hidden mx-auto">
                                    <div
                                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 rounded-full"
                                        style={{ width: `${reconstructProgress}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 justify-center mb-8">
                            <div className="w-4 h-4 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-4 h-4 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-4 h-4 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
