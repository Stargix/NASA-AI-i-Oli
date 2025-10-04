'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function AndromedaViewer() {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(0);
    const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });

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

        // Crear el mapa sin tiles por defecto
        const map = L.map(containerRef.current, {
            crs: L.CRS.Simple,
            minZoom: -5,
            maxZoom: 4,
            center: [imageHeight / 2, imageWidth / 2],
            zoom: -3,
            maxBounds: bounds,
            maxBoundsViscosity: 1.0,
            zoomControl: false,
            attributionControl: false,
        });

        // Agregar capa de imagen
        L.imageOverlay('/andromeda.jpg', bounds).addTo(map);

        // Ajustar la vista a los límites
        map.fitBounds(bounds);

        // Controles de zoom personalizados
        const zoomControl = L.control.zoom({
            position: 'topright'
        });
        zoomControl.addTo(map);

        // Event listeners para actualizar UI
        map.on('zoomend', () => {
            setZoom(Math.round(map.getZoom() * 10) / 10);
        });

        map.on('mousemove', (e: L.LeafletMouseEvent) => {
            setCoordinates({
                x: Math.round(e.latlng.lng),
                y: Math.round(e.latlng.lat)
            });
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    return (
        <div className="relative w-full h-full">
            <div
                ref={containerRef}
                className="w-full h-full"
                style={{
                    background: 'radial-gradient(circle at center, #0a0a1a 0%, #000000 100%)',
                }}
            />

            {/* Panel de información cyber */}
            <div className="absolute top-24 left-4 z-[1000] bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-lg p-4 font-mono text-sm">
                <div className="flex flex-col gap-2">
                    <div className="text-cyan-400 font-bold mb-2 border-b border-cyan-500/30 pb-2">
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
                            Resolution: 40,000 × 10,000 px
                        </div>
                    </div>
                </div>
            </div>

            {/* Controles adicionales */}
            <div className="absolute top-24 right-4 z-[1000] flex flex-col gap-2">
                <button
                    onClick={() => mapRef.current?.zoomIn()}
                    className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded p-3 text-cyan-400 hover:bg-cyan-500/20 transition-all duration-300 hover:border-cyan-400"
                    title="Zoom In"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
                <button
                    onClick={() => mapRef.current?.zoomOut()}
                    className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded p-3 text-cyan-400 hover:bg-cyan-500/20 transition-all duration-300 hover:border-cyan-400"
                    title="Zoom Out"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                </button>
                <button
                    onClick={() => {
                        if (mapRef.current) {
                            mapRef.current.setView([5000, 20000], -3);
                        }
                    }}
                    className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded p-3 text-cyan-400 hover:bg-cyan-500/20 transition-all duration-300 hover:border-cyan-400"
                    title="Reset View"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            </div>

            {/* Instrucciones */}
            <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-[1000] bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-lg px-6 py-3 font-mono text-xs text-cyan-400/80">
                <span className="animate-pulse">◆</span> Drag to pan • Scroll to zoom • Click controls for precision
            </div>
        </div>
    );
}
