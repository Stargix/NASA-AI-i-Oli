# 🚀 Integración Captura con Botón RUN

## 📋 Resumen de Cambios

Se ha integrado la funcionalidad de captura de screenshot con el botón **RUN** del Toolbox. Ahora cuando presionas RUN:

1. ✅ **Captura** la vista actual del mapa (exactamente lo que ves en pantalla)
2. ✅ **Envía** la imagen capturada al backend `/star_analysis`
3. ✅ **Recibe** las bounding boxes detectadas
4. ✅ **Muestra** las bounding boxes en el overlay (como en el ejemplo)

## 🔄 Flujo Completo

```
Usuario navega el mapa
        ↓
Ajusta zoom a región de interés
        ↓
Presiona botón "RUN" en Toolbox
        ↓
📸 CAPTURA SCREENSHOT
   (html2canvas del mapa)
        ↓
🔄 ENVÍO AL BACKEND
   POST /star_analysis
   { image: "data:image/jpeg;base64,..." }
        ↓
🧠 PROCESAMIENTO EN BACKEND
   - Decodifica base64
   - Detecta estrellas/galaxias
   - Genera bounding boxes
        ↓
📦 RESPUESTA
   { bounding_box_list: [...] }
        ↓
🎨 RENDERIZADO
   BoundingBoxOverlay muestra las cajas
```

## 📝 Archivos Modificados

### 1. **Toolbox.tsx**

#### Cambios en Interface
```typescript
interface Props {
  onResult?: (data: any) => void;
  onCaptureView?: () => Promise<string>;  // ⭐ NUEVA PROP
}
```

#### Nueva Lógica en executeDetection
```typescript
const executeDetection = useCallback(async (useScreenshot: boolean = false) => {
  let imageUrl = '';
  
  // Si se solicita screenshot y la función está disponible, usarla
  if (useScreenshot && onCaptureView) {
    console.log('📸 Capturing current view...');
    imageUrl = await onCaptureView();
  }
  
  // Si no hay screenshot, usa el sistema de tiles existente
  if (!imageUrl) {
    // ... lógica original de tiles
  }
  
  // Envía al backend
  const payload = { image: imageUrl, /* ... */ };
  // ...
}, [/* ... */, onCaptureView]);
```

#### Botón RUN Actualizado
```typescript
const runDetection = async () => {
  setRunning(true);
  setResult(null);

  try {
    // ⭐ SIEMPRE USA SCREENSHOT cuando se presiona RUN
    const data = await executeDetection(true); // true = usar screenshot
    setResult(data);
    onResult?.(data);
  } catch (err) {
    console.error('Toolbox detection error:', err);
  } finally {
    setRunning(false);
  }
};
```

#### Auto-detección en Background
```typescript
const runAutoDetection = useCallback(async () => {
  // ...
  try {
    // ⭐ NO USA SCREENSHOT en auto-detección (sería muy pesado)
    const detectionResult = await executeDetection(false);
    setCachedResult(detectionResult);
  } catch (err) {
    // ...
  }
}, [isAutoDetecting, executeDetection]);
```

### 2. **page.tsx**

#### Pasar la Función de Captura
```typescript
{!customImage && (
  <Toolbox 
    onResult={handleDetectionResult}
    onCaptureView={async () => {
      if (andromedaViewerRef.current) {
        return await andromedaViewerRef.current.captureCurrentView();
      }
      return '';
    }}
  />
)}
```

#### Eliminado
- ❌ Botón "CAPTURE" del header (ya no necesario)
- ❌ Función `handleCaptureAndSend()` (lógica ahora en Toolbox)

## 🎯 Ventajas de esta Implementación

### 1. **UX Mejorada**
- Un solo botón (RUN) hace todo el flujo
- No hay pasos adicionales para el usuario
- Flujo más intuitivo: "ajusta vista → presiona RUN → ve resultados"

### 2. **Precisión**
- Analiza EXACTAMENTE lo que el usuario está viendo
- No hay confusión sobre qué región se está analizando
- Coordenadas perfectas entre vista y análisis

### 3. **Eficiencia**
- Auto-detección en background NO usa screenshots (ahorra recursos)
- Solo captura cuando es necesario (botón RUN)
- Cache inteligente aún funciona para tiles

### 4. **Mantenibilidad**
- Toda la lógica de detección en un solo lugar (Toolbox)
- Separación clara de responsabilidades
- Fácil de extender o modificar

## 🔧 Configuración Técnica

### Parámetros de Captura
```typescript
await html2canvas(containerRef.current, {
  backgroundColor: '#000000',  // Fondo negro (espacio)
  scale: 1,                    // Resolución 1:1
  logging: false,
  useCORS: true,
  allowTaint: true,
  ignoreElements: (element) => {
    // Filtra UI con z-index >= 900
    const zIndex = window.getComputedStyle(element).zIndex;
    return zIndex && parseInt(zIndex) >= 900;
  }
});
```

### Calidad de Imagen
```typescript
canvas.toDataURL('image/jpeg', 0.85)
//                              ^^^^
//                           85% calidad
// Balance entre tamaño y detalle
```

## 📊 Comparación: Antes vs Ahora

### ⚙️ ANTES
```
Usuario navega
  ↓
Click "CAPTURE" (header)
  ↓
Captura y envía a /chat
  ↓
Alert con respuesta genérica
  ⚠️ No muestra bounding boxes
  ⚠️ Dos botones diferentes
```

### ✅ AHORA
```
Usuario navega
  ↓
Click "RUN" (Toolbox)
  ↓
Captura automática
  ↓
Envía a /star_analysis
  ↓
Respuesta con bounding boxes
  ↓
Overlay visual en mapa
  ✅ Un solo botón
  ✅ Feedback visual directo
```

## 🧪 Testing

### Cómo Probar
1. Navega por el mapa de Andromeda
2. Ajusta el zoom a una región específica
3. Presiona el botón **"RUN"** en el Toolbox
4. Observa:
   - 🔵 Console log: "📸 Capturing current view..."
   - 🔵 Console log: "✅ Screenshot captured successfully"
   - 🔵 Request a `/star_analysis` con imagen base64
   - 🔵 Bounding boxes aparecen en pantalla

### Console Logs Esperados
```
📸 Capturing current view...
✅ Screenshot captured successfully. Size: 123456
🔍 Running detection with screenshot capture...
Toolbox: About to fetch /star_analysis
Toolbox: Fetch to /star_analysis completed
Toolbox: Response data from /star_analysis
Detection result received: {bounding_box_list: [...]}
```

## 🐛 Troubleshooting

### No aparecen bounding boxes
- ✅ Verifica que el backend esté corriendo (`uvicorn app:app`)
- ✅ Chequea la consola del navegador por errores
- ✅ Revisa que `BoundingBoxOverlay` esté visible

### La captura sale en negro
- ✅ Espera a que el mapa cargue completamente
- ✅ Verifica permisos CORS en las tiles
- ✅ Revisa configuración de `useCORS: true`

### El botón RUN usa tiles en vez de screenshot
- ✅ Verifica que `onCaptureView` esté pasado al Toolbox
- ✅ Chequea que `andromedaViewerRef.current` no sea null
- ✅ Revisa console logs: debe decir "Capturing current view"

## 🔮 Mejoras Futuras

- [ ] Mostrar preview del screenshot antes de analizar
- [ ] Permitir ajuste de región DESPUÉS de captura
- [ ] Caché inteligente basado en hash de screenshot
- [ ] Indicador visual durante la captura
- [ ] Opción para descargar la captura + bounding boxes
- [ ] Comparación lado a lado: original vs detectado

## 📚 Dependencias

```json
{
  "html2canvas": "^1.4.1",
  "leaflet": "^1.9.x",
  "react": "^18.x"
}
```

## 🎓 Conceptos Clave

### Captura con html2canvas
- Renderiza el DOM a un canvas
- Respeta estilos CSS y transformaciones
- Filtra elementos no deseados (UI)

### useCallback con Parámetros
- `executeDetection(useScreenshot: boolean)`
- Permite reutilizar lógica con diferentes comportamientos
- Background: usa tiles (ligero)
- RUN button: usa screenshot (preciso)

### Refs y useImperativeHandle
- Expone métodos de componentes hijos
- `captureCurrentView()` accesible desde padre
- Mantiene encapsulación

---

**Status**: ✅ Implementado y Funcionando  
**Fecha**: Octubre 2025  
**Autor**: NASA AI-i-Oli Hackathon Team
