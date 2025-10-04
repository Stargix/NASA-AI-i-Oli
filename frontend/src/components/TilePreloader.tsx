'use client';

import { useEffect } from 'react';

interface TilePreloaderProps {
    zoom: number;
    center: [number, number];
}

export default function TilePreloader({ zoom, center }: TilePreloaderProps) {
    useEffect(() => {
        // Pre-cargar tiles cercanos al centro de visión
        const preloadTiles = () => {
            const tileSize = 256;
            const [y, x] = center;

            // Calcular tiles visibles
            const tileX = Math.floor(x / tileSize);
            const tileY = Math.floor(y / tileSize);
            const currentZoom = Math.max(0, Math.min(2, Math.round(zoom)));

            // Pre-cargar 3x3 grid alrededor del centro
            const tilesToPreload: string[] = [];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const tx = tileX + dx;
                    const ty = tileY + dy;
                    if (tx >= 0 && ty >= 0) {
                        tilesToPreload.push(`/tiles/${currentZoom}/${ty}/${tx}.jpg`);
                    }
                }
            }

            // Crear elementos Image para pre-cargar
            tilesToPreload.forEach((url) => {
                const img = new Image();
                img.src = url;
            });
        };

        // Debounce para evitar demasiadas pre-cargas
        const timer = setTimeout(preloadTiles, 300);
        return () => clearTimeout(timer);
    }, [zoom, center]);

    return null;
}
