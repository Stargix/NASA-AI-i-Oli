const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Configuración
const INPUT_IMAGE = path.join(__dirname, '../public/andromeda.jpg');
const OUTPUT_DIR = path.join(__dirname, '../public/tiles');
const TILE_SIZE = 256; // Tamaño de cada tile en píxeles (256 para mejor rendimiento)
const MAX_ZOOM = 4; // Niveles de zoom (reducido para procesar más rápido)

async function generateTiles() {
    console.log('🚀 NASA Andromeda Tile Generator');
    console.log('================================\n');

    // Verificar que la imagen existe
    if (!fs.existsSync(INPUT_IMAGE)) {
        console.error('❌ Error: andromeda.jpg no encontrada en /public');
        console.log('Por favor, asegúrate de que la imagen está en /public/andromeda.jpg');
        return;
    }

    // Crear directorio de tiles
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    try {
        // Configurar límite de píxeles para imágenes grandes
        sharp.cache(false);
        sharp.concurrency(1);

        // Obtener metadata de la imagen
        const metadata = await sharp(INPUT_IMAGE, {
            limitInputPixels: false, // Permitir imágenes grandes
            sequentialRead: true
        }).metadata();
        console.log(`📸 Imagen original: ${metadata.width}x${metadata.height}px`);
        console.log(`📏 Formato: ${metadata.format}`);
        console.log(`💾 Tamaño del tile: ${TILE_SIZE}px\n`);

        // Generar tiles para cada nivel de zoom
        for (let zoom = 0; zoom <= MAX_ZOOM; zoom++) {
            const scale = Math.pow(2, zoom - MAX_ZOOM);
            const scaledWidth = Math.round(metadata.width * scale);
            const scaledHeight = Math.round(metadata.height * scale);

            console.log(`🔍 Generando nivel de zoom ${zoom} (${scaledWidth}x${scaledHeight}px)...`);

            // Crear directorio para este nivel de zoom
            const zoomDir = path.join(OUTPUT_DIR, zoom.toString());
            if (!fs.existsSync(zoomDir)) {
                fs.mkdirSync(zoomDir, { recursive: true });
            }

            // Redimensionar la imagen para este nivel de zoom
            const resizedImage = sharp(INPUT_IMAGE, {
                limitInputPixels: false,
                sequentialRead: true
            })
                .resize(scaledWidth, scaledHeight, {
                    kernel: sharp.kernel.lanczos3,
                    fit: 'fill'
                });

            // Calcular número de tiles
            const tilesX = Math.ceil(scaledWidth / TILE_SIZE);
            const tilesY = Math.ceil(scaledHeight / TILE_SIZE);

            console.log(`   → Generando ${tilesX}x${tilesY} tiles (${tilesX * tilesY} total)`);

            // Generar cada tile
            for (let y = 0; y < tilesY; y++) {
                const yDir = path.join(zoomDir, y.toString());
                if (!fs.existsSync(yDir)) {
                    fs.mkdirSync(yDir, { recursive: true });
                }

                for (let x = 0; x < tilesX; x++) {
                    const left = x * TILE_SIZE;
                    const top = y * TILE_SIZE;
                    const width = Math.min(TILE_SIZE, scaledWidth - left);
                    const height = Math.min(TILE_SIZE, scaledHeight - top);

                    const tilePath = path.join(yDir, `${x}.jpg`);

                    await resizedImage
                        .clone()
                        .extract({ left, top, width, height })
                        .jpeg({ quality: 85, progressive: true })
                        .toFile(tilePath);
                }
            }

            console.log(`   ✅ Nivel ${zoom} completado\n`);
        }

        console.log('🎉 ¡Generación de tiles completada exitosamente!');
        console.log(`📁 Tiles guardados en: ${OUTPUT_DIR}`);

    } catch (error) {
        console.error('❌ Error generando tiles:', error.message);
        console.error(error);
    }
}

// Ejecutar
generateTiles();
