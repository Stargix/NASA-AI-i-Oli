'use client';

import { useState, useRef } from 'react';

interface ImageUploaderProps {
    onImageProcessed: (tilesData: TilesData) => void;
    onCancel: () => void;
}

export interface TilesData {
    width: number;
    height: number;
    tiles: Map<string, string>; // key: "z/x/y", value: base64 image
    maxZoom: number;
    tileSize: number;
}

export default function ImageUploader({ onImageProcessed, onCancel }: ImageUploaderProps) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const generateTiles = async (image: HTMLImageElement): Promise<TilesData> => {
        const tileSize = 256;
        const width = image.width;
        const height = image.height;

        // Calcular niveles de zoom basados en el tamaño de la imagen
        const maxDimension = Math.max(width, height);
        const maxZoom = Math.ceil(Math.log2(maxDimension / tileSize));
        const minZoom = Math.max(0, maxZoom - 3); // Solo generar 3-4 niveles de zoom

        const tiles = new Map<string, string>();
        let totalTiles = 0;
        let processedTiles = 0;

        // Calcular total de tiles
        for (let z = minZoom; z <= maxZoom; z++) {
            const scale = Math.pow(2, z);
            const scaledWidth = width / Math.pow(2, maxZoom - z);
            const scaledHeight = height / Math.pow(2, maxZoom - z);
            const cols = Math.ceil(scaledWidth / tileSize);
            const rows = Math.ceil(scaledHeight / tileSize);
            totalTiles += cols * rows;
        }

        setStatus(`Generating ${totalTiles} tiles...`);

        // Generar tiles por nivel de zoom
        for (let z = minZoom; z <= maxZoom; z++) {
            const scale = Math.pow(2, maxZoom - z);
            const scaledWidth = width / scale;
            const scaledHeight = height / scale;
            const cols = Math.ceil(scaledWidth / tileSize);
            const rows = Math.ceil(scaledHeight / tileSize);

            setStatus(`Processing zoom level ${z}/${maxZoom}...`);

            // Crear canvas temporal para el nivel escalado
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = scaledWidth;
            tempCanvas.height = scaledHeight;
            const tempCtx = tempCanvas.getContext('2d', { alpha: false });

            if (!tempCtx) continue;

            // Dibujar imagen escalada
            tempCtx.drawImage(image, 0, 0, scaledWidth, scaledHeight);

            // Generar tiles para este nivel
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const tileCanvas = document.createElement('canvas');
                    tileCanvas.width = tileSize;
                    tileCanvas.height = tileSize;
                    const tileCtx = tileCanvas.getContext('2d', { alpha: false });

                    if (!tileCtx) continue;

                    // Fondo negro para tiles parciales
                    tileCtx.fillStyle = '#000000';
                    tileCtx.fillRect(0, 0, tileSize, tileSize);

                    // Copiar región de la imagen escalada
                    const sx = x * tileSize;
                    const sy = y * tileSize;
                    const sw = Math.min(tileSize, scaledWidth - sx);
                    const sh = Math.min(tileSize, scaledHeight - sy);

                    tileCtx.drawImage(
                        tempCanvas,
                        sx, sy, sw, sh,
                        0, 0, sw, sh
                    );

                    // Convertir a base64 con calidad optimizada
                    const tileData = tileCanvas.toDataURL('image/jpeg', 0.85);
                    const key = `${z}/${x}/${y}`;
                    tiles.set(key, tileData);

                    processedTiles++;
                    setProgress(Math.round((processedTiles / totalTiles) * 100));

                    // Pequeña pausa para no bloquear la UI
                    if (processedTiles % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
            }
        }

        return {
            width,
            height,
            tiles,
            maxZoom,
            tileSize,
        };
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validar que sea una imagen
        if (!file.type.startsWith('image/')) {
            alert('Please select a valid image file');
            return;
        }

        setUploading(true);
        setProgress(0);
        setStatus('Loading image...');

        try {
            // Cargar imagen
            const image = new Image();
            const imageUrl = URL.createObjectURL(file);

            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error('Failed to load image'));
                image.src = imageUrl;
            });

            setStatus('Image loaded. Generating tiles...');

            // Generar tiles
            const tilesData = await generateTiles(image);

            setStatus('Complete!');
            setProgress(100);

            // Limpiar
            URL.revokeObjectURL(imageUrl);

            // Notificar que está listo
            setTimeout(() => {
                onImageProcessed(tilesData);
            }, 500);

        } catch (error) {
            console.error('Error processing image:', error);
            alert('Error processing image. Please try again.');
            setUploading(false);
            setProgress(0);
            setStatus('');
        }
    };

    return (
        <div className="absolute inset-0 z-[2000] bg-black/95 backdrop-blur-sm flex items-center justify-center">
            <div className="max-w-2xl w-full mx-4">
                <div className="bg-black/90 border-2 border-cyan-500/50 rounded-lg p-8 shadow-[0_0_30px_rgba(6,182,212,0.3)]">
                    <h2 className="text-cyan-400 text-3xl font-mono font-bold mb-6 text-center">
                        IMAGE UPLOADER
                    </h2>

                    {!uploading ? (
                        <>
                            <p className="text-cyan-400/80 text-sm font-mono mb-6 text-center">
                                Upload your own high-resolution image to explore
                            </p>

                            <div className="mb-6">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full py-4 bg-cyan-500/20 border-2 border-cyan-500/50 rounded-lg text-cyan-400 font-mono text-lg hover:bg-cyan-500/30 hover:border-cyan-400 transition-all duration-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]"
                                >
                                    SELECT IMAGE FILE
                                </button>
                            </div>

                            <div className="border-t border-cyan-500/30 pt-6 mb-6">
                                <p className="text-cyan-400/60 text-xs font-mono mb-2">SUPPORTED FORMATS:</p>
                                <p className="text-cyan-400/80 text-sm font-mono">JPG, PNG, WEBP, GIF</p>
                            </div>

                            <div className="border-t border-cyan-500/30 pt-6 mb-6">
                                <p className="text-cyan-400/60 text-xs font-mono mb-2">RECOMMENDATIONS:</p>
                                <ul className="text-cyan-400/80 text-sm font-mono space-y-1 list-disc list-inside">
                                    <li>High resolution images work best (4K+)</li>
                                    <li>Landscape orientation recommended</li>
                                    <li>Processing may take a few minutes for large images</li>
                                </ul>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={onCancel}
                                    className="flex-1 py-3 bg-red-500/20 border-2 border-red-500/50 rounded-lg text-red-400 font-mono hover:bg-red-500/30 hover:border-red-400 transition-all duration-300"
                                >
                                    CANCEL
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="text-cyan-400 text-xl font-mono mb-4">
                                    {status}
                                </div>

                                {/* Barra de progreso */}
                                <div className="w-full h-4 bg-cyan-500/10 border border-cyan-500/30 rounded-full overflow-hidden mb-4">
                                    <div
                                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 rounded-full"
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>

                                <div className="text-cyan-400 text-4xl font-mono font-bold">
                                    {progress}%
                                </div>
                            </div>

                            {/* Spinner animado */}
                            <div className="flex justify-center">
                                <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
                            </div>

                            <p className="text-cyan-400/60 text-sm font-mono text-center">
                                Processing your image... Please wait
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
