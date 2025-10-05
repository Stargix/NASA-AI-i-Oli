# Auto-Detección de Estrellas para Búsqueda de Constelaciones

## Descripción

Esta funcionalidad permite que cuando un usuario intente buscar o dibujar una constelación sin haber ejecutado previamente la detección de estrellas, el sistema automáticamente ejecute la detección antes de proceder con la búsqueda de constelación.

## Cambios Implementados

### Frontend

#### 1. `frontend/src/app/page.tsx`
- **Nueva función `runDetectionIfNeeded()`**: 
  - Verifica si ya existe una detección de estrellas
  - Si existe, devuelve los centroids existentes
  - Si no existe, ejecuta la detección automáticamente capturando el viewport actual
  - Devuelve los centroids detectados o `null` en caso de error
  
- **Prop `onRequestDetection`**: Se pasa al componente `Constellations` para permitir la detección bajo demanda

#### 2. `frontend/src/components/Constellations.tsx`
- **Nueva interfaz**: Agregada prop `onRequestDetection?: () => Promise<Array<[number, number]> | null>`

- **Funciones actualizadas**:
  - `handleSearch()`: Verifica si hay centroids detectados. Si no los hay, llama a `onRequestDetection()` para ejecutar la detección primero
  - `handleDrawOwn()`: Mismo comportamiento que `handleSearch()`

- **Indicadores visuales**:
  - Muestra mensaje amarillo "⚠️ No stars detected yet. Detection will run automatically." cuando no hay detección
  - Muestra mensaje verde "✓ X stars detected and ready" cuando hay estrellas detectadas

### Backend

No se requirieron cambios en el backend. La funcionalidad usa los endpoints existentes:
- `/star_analysis` - Para detección de estrellas
- `/constellation/search` - Para búsqueda de constelaciones
- `/constellation/draw` - Para dibujar constelaciones personalizadas

## Flujo de Usuario

### Escenario 1: Sin detección previa
1. Usuario abre el panel "CONSTELLATIONS"
2. Ve mensaje: "⚠️ No stars detected yet. Detection will run automatically."
3. Usuario ingresa nombre de constelación (ej: "Orion") y presiona "🔍 SEARCH"
4. Sistema ejecuta automáticamente la detección de estrellas
5. Una vez completada la detección, busca la constelación
6. Muestra solo las estrellas que forman parte de la constelación detectada

### Escenario 2: Con detección previa
1. Usuario ya ejecutó detección de estrellas (botón "RUN" en Toolbox)
2. Abre panel "CONSTELLATIONS"
3. Ve mensaje: "✓ X stars detected and ready"
4. Usuario ingresa nombre de constelación y presiona "🔍 SEARCH"
5. Sistema usa directamente las estrellas detectadas
6. Muestra solo las estrellas que forman parte de la constelación detectada

## Funcionalidad de Filtrado de Estrellas

Cuando se detecta una constelación:
- Solo se muestran las estrellas que forman parte de esa constelación (filtradas por `matched_indices`)
- Las estrellas de la constelación se resaltan en color dorado/amarillo
- El panel de estadísticas cambia de "DETECTIONS" a "CONSTELLATION"
- Muestra el conteo: "⭐ Constellation Stars: X" y "Total Detected: Y"

## Parámetros de Detección Automática

Cuando se ejecuta la detección automáticamente, usa estos parámetros:
```javascript
{
  automated: true,
  gaussian_blur: 25,
  noise_threshold: 120,
  adaptative_filtering: false,
  separation_threshold: 3,
  min_size: 20,
  max_components: 1000,
  detect_clusters: false
}
```

## Manejo de Errores

- Si la detección automática falla, se muestra un mensaje de error: "Failed to detect stars. Please try running detection manually."
- El usuario puede entonces usar el botón "RUN" del Toolbox para ejecutar la detección manualmente con parámetros personalizados

## Beneficios

1. **Mejor UX**: Usuario no necesita entender que debe ejecutar detección primero
2. **Flujo simplificado**: Búsqueda de constelaciones funciona de inmediato
3. **Transparencia**: Usuario es informado de lo que está sucediendo
4. **Flexibilidad**: Usuario aún puede ejecutar detección manual con parámetros personalizados
