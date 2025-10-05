# 📸 Screenshot Feature - Captura de Vista Actual

## 🎯 Descripción

Esta funcionalidad permite capturar **exactamente lo que estás viendo en pantalla** en el visor de imágenes (ya sea Andromeda o una imagen custom) y enviarlo automáticamente al servidor FastAPI para análisis.

## ✨ Características

- ✅ **Captura precisa**: Obtiene exactamente lo que ves en el mapa, con el zoom y posición actual
- ✅ **Funciona con ambos visores**: Andromeda (tiled) y Custom Image Viewer
- ✅ **Optimizado**: Captura en JPEG con 85% de calidad para balance entre tamaño y detalle
- ✅ **Filtrado inteligente**: Excluye elementos de UI (botones, overlays) de la captura
- ✅ **Envío automático**: Captura y envía al backend en un solo clic

## 🚀 Cómo Usar

### 1. Desde la Interfaz

1. Navega por la imagen y ajusta el zoom a la región que quieres analizar
2. Haz clic en el botón **"CAPTURE"** (verde con icono de cámara) en el header
3. La aplicación capturará la vista actual y la enviará al servidor
4. Recibirás una alerta con la respuesta del análisis

### 2. Desde el Código (Programático)

```typescript
// En cualquier componente que tenga acceso al ref
const screenshot = await andromedaViewerRef.current?.captureCurrentView();
// o
const screenshot = await dynamicViewerRef.current?.captureCurrentView();

// screenshot es un string base64 en formato "data:image/jpeg;base64,..."
```

## 🔧 Implementación Técnica

### Componentes Modificados

#### 1. **DynamicImageViewer.tsx**
- Convertido a `forwardRef` para exponer métodos
- Añadido `useImperativeHandle` con método `captureCurrentView()`
- Usa `html2canvas` para capturar el DOM del mapa

#### 2. **AndromedaViewerTiled.tsx**
- Misma implementación que DynamicImageViewer
- Captura específica para el visor de Andromeda

#### 3. **page.tsx**
- Añadidas refs para ambos visores
- Nuevo handler `handleCaptureAndSend()` que:
  1. Determina qué visor está activo
  2. Captura la vista actual
  3. Envía al endpoint `/chat` del backend
  4. Muestra la respuesta

### API de Captura

```typescript
export interface DynamicViewerRef {
  captureCurrentView: () => Promise<string>;
}

export interface AndromedaViewerRef {
  captureCurrentView: () => Promise<string>;
}
```

### Configuración de html2canvas

```typescript
await html2canvas(containerRef.current, {
  backgroundColor: '#000000',  // Fondo negro para el espacio
  scale: 1,                    // Resolución 1:1 (ajustable)
  logging: false,              // Sin logs en consola
  useCORS: true,               // Permitir imágenes cross-origin
  allowTaint: true,            // Permitir canvas "tainted"
  removeContainer: false,      // No remover el elemento original
  imageTimeout: 0,             // Sin timeout
  ignoreElements: (element) => {
    // Filtrar elementos con z-index >= 900 (UI)
    const zIndex = window.getComputedStyle(element).zIndex;
    return zIndex && parseInt(zIndex) >= 900;
  }
});
```

## 📊 Flujo de Datos

```
┌─────────────────┐
│  User navega    │
│  ajusta zoom    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Click CAPTURE  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  captureCurrentView()   │
│  - html2canvas captura  │
│  - Filtra UI elements   │
│  - Convierte a JPEG     │
└────────┬────────────────┘
         │
         ▼ base64 string
┌─────────────────────────┐
│  POST /chat             │
│  {                      │
│    message: "...",      │
│    images: [base64]     │
│  }                      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Backend FastAPI        │
│  - Decodifica base64    │
│  - Procesa imagen       │
│  - Análisis/Detección   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Respuesta al Frontend  │
│  alert() con resultado  │
└─────────────────────────┘
```

## 🎛️ Ajustes y Optimización

### Cambiar Resolución de Captura

En ambos componentes (DynamicImageViewer y AndromedaViewerTiled):

```typescript
const canvas = await html2canvas(containerRef.current, {
  scale: 2,  // 2x resolución (más detalle, más pesado)
  // scale: 0.5,  // 0.5x resolución (menos detalle, más ligero)
});
```

### Cambiar Calidad JPEG

```typescript
const screenshot = canvas.toDataURL('image/jpeg', 0.85);
//                                              ^^^^
//                                           0.0 - 1.0
// 0.85 = buen balance
// 0.95 = alta calidad, más KB
// 0.70 = menor calidad, menos KB
```

### Cambiar Formato

```typescript
// PNG (sin pérdida, pero MÁS PESADO)
const screenshot = canvas.toDataURL('image/png');

// WebP (mejor compresión, pero menos compatible)
const screenshot = canvas.toDataURL('image/webp', 0.85);
```

## 📦 Dependencias Instaladas

```bash
npm install html2canvas
```

## 🐛 Troubleshooting

### La captura sale en blanco
- Verifica que el mapa esté completamente cargado
- Revisa la consola para errores de CORS
- Asegúrate de que `useCORS: true` esté configurado

### La captura incluye botones/UI
- Ajusta el `ignoreElements` en la configuración de html2canvas
- Aumenta el threshold de z-index (actualmente 900)

### La imagen es muy pesada
- Reduce `scale` a 0.5 o 0.75
- Reduce la calidad JPEG a 0.7 o 0.6
- Considera usar WebP si el navegador lo soporta

### No se captura la imagen del mapa
- Verifica que Leaflet use tiles permitidos por CORS
- Asegúrate de que las tiles sean del mismo origen o tengan headers CORS

## 🔮 Mejoras Futuras

- [ ] Agregar selector de región (crop antes de enviar)
- [ ] Permitir múltiples capturas en una consulta
- [ ] Preview de la captura antes de enviar
- [ ] Guardar historial de capturas
- [ ] Exportar capturas como archivo local
- [ ] Agregar anotaciones antes de enviar
- [ ] Soporte para captura en diferentes formatos
- [ ] Compresión adicional en el cliente

## 📝 Notas

- La captura se hace en el **cliente** (navegador)
- Se envía como **base64** al servidor
- El backend debe manejar la decodificación (ya implementado en `tools.py`)
- El tamaño típico de captura es 50-200 KB dependiendo de la complejidad

---

**Autor**: Implementado en Hackathon NASA AI-i-Oli  
**Fecha**: Octubre 2025  
**Tecnologías**: React, Next.js, TypeScript, html2canvas, Leaflet
