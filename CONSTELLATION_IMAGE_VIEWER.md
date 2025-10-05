# Visualización de Imágenes de Constelaciones

## Descripción

Cuando se detecta una constelación (mediante búsqueda por nombre o dibujándola), el sistema automáticamente muestra la imagen de las líneas de esa constelación en una ventana flotante en la esquina superior derecha.

## Funcionalidad Implementada

### Backend

#### 1. Esquema Actualizado (`python/schema.py`)
- **Nuevo campo**: `constellation_index` en `ConstellationResponseSchema`
  - Tipo: `Optional[int]`
  - Descripción: Índice de la constelación para recuperar sus imágenes
  - Se usa para mapear a los archivos `image{N}_lines.png`

#### 2. Endpoints Actualizados (`python/app.py`)
- **`/constellation/search`**: Incluye `constellation_index` en la respuesta cuando hay match
- **`/constellation/draw`**: Incluye `constellation_index` en la respuesta cuando hay match

### Frontend

#### 3. Imágenes Copiadas
Las imágenes de líneas de constelaciones (`*_lines.png`) fueron copiadas desde:
```
python/processed_constellations/
```
hacia:
```
frontend/public/constellations/
```

Esto permite acceder a ellas como recursos estáticos del servidor Next.js.

#### 4. Lógica de Visualización (`frontend/src/app/page.tsx`)

**Función `handleConstellationMatch` actualizada**:
```typescript
const handleConstellationMatch = (matchResult: any) => {
  if (matchResult.success && matchResult.matched_indices) {
    setConstellationMatchedIndices(matchResult.matched_indices);
    setShowBoundingBoxes(true);
    
    // Mostrar imagen de la constelación
    if (matchResult.constellation_index !== undefined) {
      const constellationImageUrl = `/constellations/image${matchResult.constellation_index}_lines.png`;
      setFloatingImages([constellationImageUrl]);
    }
  }
};
```

**Limpieza de imágenes**:
- Cuando se limpian las detecciones, también se cierra la ventana flotante
- Esto ocurre en `clearBoundingBoxes()`

#### 5. FloatingImageViewer Mejorado

**Detección automática de tipo de imagen**:
```typescript
const isConstellationImage = currentImage.includes('/constellations/');
```

**Interfaz adaptativa**:
- **Para imágenes de query**: 
  - Header: "QUERY IMAGE"
  - Color: Cyan
  
- **Para imágenes de constelación**:
  - Header: "⭐ CONSTELLATION"
  - Color: Amarillo/Dorado
  - Indica visualmente que es una constelación detectada

#### 6. Panel de Constellations

**Mensaje informativo**:
Cuando se encuentra una constelación, se muestra:
```
🖼️ Constellation image displayed in top-right corner
```

## Mapeo de Constelaciones a Imágenes

Las constelaciones están indexadas según su posición en el array `CONSTELLATION_NAMES`:

```python
CONSTELLATION_NAMES = [
    "Andromeda – Royal Sea Monster Bait",           # image0
    "Antlia – Air Pump",                            # image1
    "Apus – Bird of Paradise",                      # image2
    "Aquarius – Water-Bearer",                      # image3
    ...
    "Orion – Hunter",                               # image59
    ...
]
```

Cada constelación tiene dos imágenes:
- `image{N}_circles.png` - Puntos de las estrellas
- `image{N}_lines.png` - Líneas conectando las estrellas (**la que se muestra**)

## Flujo de Usuario

### Escenario: Búsqueda de Constelación

1. Usuario abre panel "CONSTELLATIONS"
2. Ingresa nombre (ej: "Orion")
3. Sistema detecta estrellas (si no hay detección previa)
4. Sistema busca la constelación y encuentra un match
5. **Ventana flotante aparece** en la esquina superior derecha con la imagen de las líneas de Orion
6. Estrellas de la constelación se resaltan en amarillo en el visor
7. Panel muestra "🖼️ Constellation image displayed in top-right corner"

### Escenario: Dibujar Constelación

1. Usuario abre panel "CONSTELLATIONS"
2. Presiona "✏️ DRAW YOUR OWN"
3. Dibuja patrón en ventana emergente
4. Sistema busca match contra constelaciones conocidas
5. Si hay match: **ventana flotante muestra la constelación detectada**

## Características de la Ventana Flotante

### Posición y Diseño
- **Ubicación**: Esquina superior derecha (no interfiere con el toolbox a la izquierda)
- **Tamaño**: 256px de ancho, altura automática
- **Estilo**: Tema cyber con borde cyan/amarillo según el tipo

### Comportamiento
- ✅ **Auto-cierre**: Se cierra al hacer zoom o pan en el visor
- ✅ **Cierre manual**: Botón X en la esquina
- ✅ **Animación**: Fade in/out suave
- ✅ **Multi-imagen**: Soporta navegación si hay múltiples imágenes

### Indicadores Visuales

**Para Constelaciones**:
```
┌─────────────────────────────┐
│ ⚫ ⭐ CONSTELLATION          │ ← Amarillo
├─────────────────────────────┤
│                             │
│   [Imagen de líneas]        │
│                             │
├─────────────────────────────┤
│ Auto-closes on zoom/pan     │
└─────────────────────────────┘
```

**Para Imágenes de Query**:
```
┌─────────────────────────────┐
│ ⚫ QUERY IMAGE 1/2          │ ← Cyan
├─────────────────────────────┤
│                             │
│   [Imagen adjunta]          │
│                             │
├─────────────────────────────┤
│ ← → to navigate             │
└─────────────────────────────┘
```

## Archivos Modificados

### Backend
1. `python/schema.py`: Agregado campo `constellation_index`
2. `python/app.py`: Incluye `constellation_index` en respuestas

### Frontend
3. `frontend/public/constellations/`: 88 imágenes `*_lines.png` copiadas
4. `frontend/src/app/page.tsx`: Lógica de visualización de constelaciones
5. `frontend/src/components/FloatingImageViewer.tsx`: Detección y estilo para constelaciones
6. `frontend/src/components/Constellations.tsx`: Mensaje informativo

## Beneficios

- 🎨 **Visual**: Usuario puede ver inmediatamente qué constelación fue detectada
- 📖 **Educativo**: Muestra las líneas tradicionales de la constelación
- 🔄 **Comparación**: Usuario puede comparar su vista con el patrón estándar
- ✨ **No invasivo**: Ventana flotante no interfiere con la visualización principal
- 🎯 **Contextual**: Solo aparece cuando hay un match exitoso

## Ejemplos de Uso

### Buscar Orion
```
1. Toolbox → RUN (detectar estrellas)
2. CONSTELLATIONS → "Orion" → SEARCH
3. ✅ Match encontrado
4. 🖼️ Imagen de Orion aparece (image59_lines.png)
5. ⭐ Estrellas de Orion resaltadas en amarillo
```

### Dibujar y Detectar
```
1. Toolbox → RUN (detectar estrellas)
2. CONSTELLATIONS → DRAW YOUR OWN
3. Dibujar patrón de Cassiopeia
4. ✅ Match con Cassiopeia (image17_lines.png)
5. 🖼️ Imagen de Cassiopeia aparece
```

## Notas Técnicas

- Las imágenes son PNG de alta calidad con fondo transparente
- El sistema funciona offline una vez que las imágenes están en `public/`
- No hay llamadas adicionales al backend para las imágenes
- Las imágenes se cargan bajo demanda (lazy loading del navegador)

---

¡La funcionalidad está completamente implementada y lista para usar! 🌟
