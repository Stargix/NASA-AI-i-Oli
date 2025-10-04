import numpy as np
import cv2
from PIL import Image
import matplotlib.pyplot as plt
from typing import Tuple


def process_constellation_image(image_path: str) -> Tuple[np.ndarray, np.ndarray]:
    """
    Procesa una imagen de constelación y devuelve dos imágenes:
    1. Imagen después de apertura y cierre con centroides marcados con círculos blancos
    2. Imagen final con líneas detectadas
    
    Args:
        image_path (str): Ruta a la imagen de entrada
        
    Returns:
        Tuple[np.ndarray, np.ndarray]: 
            - Primera imagen: Imagen binaria con círculos blancos en los centroides
            - Segunda imagen: Imagen reconstruida con líneas rectas detectadas
    """
    
    # Cargar imagen
    image = Image.open(image_path)
    image_np = np.array(image)
    
    # Convertir a escala de grises si es necesario
    if image_np.ndim == 3:
        image_gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
    else:
        image_gray = image_np
    
    # Binarizar la imagen con umbral fijo
    _, binary = cv2.threshold(image_gray, 50, 255, cv2.THRESH_BINARY)
    
    # Definir kernel
    kernel = np.ones((6, 6), np.uint8)
    
    # Aplicar apertura (elimina ruido pequeño)
    opening = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    
    # Aplicar cierre (rellena huecos pequeños)
    closing = cv2.morphologyEx(opening, cv2.MORPH_CLOSE, kernel, iterations=1)
    
    # Detectar componentes conectados
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(closing)
    
    print(f"Número de componentes conectados detectados: {num_labels - 1}")
    
    # PRIMERA IMAGEN: Imagen con círculos blancos en los centroides
    image_with_circles = closing.copy()
    image_with_circles_small = closing.copy()
    
    # Dibujar círculos blancos en los centroides
    for centroid in centroids[1:]:
        cv2.circle(image_with_circles, (int(centroid[0]), int(centroid[1])), 40, 255, -1)
        cv2.circle(image_with_circles_small, (int(centroid[0]), int(centroid[1])), 20, 255, -1)

    # SEGUNDA IMAGEN: Procesamiento para detectar líneas
    # Crear imagen sin los círculos de centroides
    output_image = image_np.copy()
    
    # Crear una máscara para los centroides
    mask = np.zeros(output_image.shape[:2], dtype=np.uint8)
    
    # Dibujar círculos blancos en la máscara
    for centroid in centroids[1:]:
        cv2.circle(mask, (int(centroid[0]), int(centroid[1])), 40, 255, -1)
    
    # Invertir la máscara
    mask_inv = cv2.bitwise_not(mask)
    
    # Aplicar la máscara a la imagen original
    output_image_without_circles = cv2.bitwise_and(output_image, output_image, mask=mask_inv)


    # Engrosar las líneas usando dilatación
    kernel_dilate = np.ones((8, 8), np.uint8)  # Puedes ajustar el tamaño para más grosor
    output_image_without_circles = cv2.dilate(output_image_without_circles, kernel_dilate, iterations=1)

    image_lines = output_image_without_circles
    image_circles = image_with_circles_small
    if image_lines.ndim == 3:
        image_lines_gray = cv2.cvtColor(image_lines, cv2.COLOR_RGB2GRAY)
    else:
        image_lines_gray = image_lines

    if image_circles.ndim == 3:
        image_circles_gray = cv2.cvtColor(image_circles, cv2.COLOR_RGB2GRAY)
    else:
        image_circles_gray = image_circles

    output = image_circles_gray + image_lines_gray
    threshold_value = 200  # Ajusta este valor según necesites (0-255)
    _, output_filtered = cv2.threshold(output, threshold_value, 255, cv2.THRESH_BINARY)

    return image_circles_gray, image_lines_gray, output_filtered

def calculate_circle_overlap(circle1: Tuple[int, int, int], circle2: Tuple[int, int, int]) -> float:
    """
    Calcula el porcentaje de overlap entre dos círculos.
    
    Args:
        circle1: Tupla (x, y, r) del primer círculo
        circle2: Tupla (x, y, r) del segundo círculo
        
    Returns:
        float: Porcentaje de overlap (0.0 a 1.0)
    """
    x1, y1, r1 = circle1
    x2, y2, r2 = circle2
    
    # Calcular distancia entre centros
    distance = np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    
    # Si no hay overlap
    if distance >= r1 + r2:
        return 0.0
    
    # Si un círculo está completamente dentro del otro
    if distance <= abs(r1 - r2):
        smaller_area = np.pi * min(r1, r2)**2
        larger_area = np.pi * max(r1, r2)**2
        return smaller_area / larger_area
    
    # Calcular área de intersección usando fórmula geométrica
    # https://mathworld.wolfram.com/Circle-CircleIntersection.html
    r1_sq = r1 * r1
    r2_sq = r2 * r2
    d_sq = distance * distance
    
    part1 = r1_sq * np.arccos((d_sq + r1_sq - r2_sq) / (2 * distance * r1))
    part2 = r2_sq * np.arccos((d_sq + r2_sq - r1_sq) / (2 * distance * r2))
    part3 = 0.5 * np.sqrt((-distance + r1 + r2) * (distance + r1 - r2) * 
                          (distance - r1 + r2) * (distance + r1 + r2))
    
    intersection_area = part1 + part2 - part3
    
    # Calcular porcentaje respecto al círculo más pequeño
    smaller_area = np.pi * min(r1, r2)**2
    return intersection_area / smaller_area


def remove_overlapping_circles(circles: list, overlap_threshold: float = 0.3) -> list:
    """
    Elimina círculos que se solapan más del umbral especificado.
    Mantiene el círculo con mayor área de píxeles blancos.
    
    Args:
        circles: Lista de tuplas (x, y, r, white_pixel_ratio)
        overlap_threshold: Umbral de overlap (0.0 a 1.0)
        
    Returns:
        list: Lista filtrada de círculos sin overlaps significativos
    """
    if len(circles) <= 1:
        return circles
    
    # Ordenar por ratio de píxeles blancos (descendente)
    sorted_circles = sorted(circles, key=lambda c: c[3], reverse=True)
    
    filtered_circles = []
    
    for current_circle in sorted_circles:
        x1, y1, r1, ratio1 = current_circle
        is_valid = True
        
        # Verificar overlap con círculos ya aceptados
        for accepted_circle in filtered_circles:
            x2, y2, r2, ratio2 = accepted_circle
            
            overlap = calculate_circle_overlap((x1, y1, r1), (x2, y2, r2))
            
            if overlap > overlap_threshold:
                is_valid = False
                break
        
        if is_valid:
            filtered_circles.append(current_circle)
    
    return filtered_circles


def process_constellation_image_new(image_path: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Procesa una imagen de constelación usando detección de círculos de Hough.
    
    Args:
        image_path (str): Ruta a la imagen de entrada
        
    Returns:
        Tuple[np.ndarray, np.ndarray, np.ndarray]: 
            - Imagen con círculos detectados marcados
            - Imagen con líneas (sin círculos)
            - Imagen final combinada
    """
    import cv2
    from scipy import stats
    
    # Cargar imagen
    image = Image.open(image_path)
    image_np = np.array(image)
    
    # Convertir a escala de grises si es necesario
    if image_np.ndim == 3:
        image_gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
    else:
        image_gray = image_np

    # Binarizar la imagen para contar píxeles blancos
    _, binary_image = cv2.threshold(image_gray, 50, 255, cv2.THRESH_BINARY)

    # Detect circles using HoughCircles
    circles = cv2.HoughCircles(
        image_gray, 
        cv2.HOUGH_GRADIENT, 
        dp=1.2, 
        minDist=30, 
        param1=50, 
        param2=30, 
        minRadius=10, 
        maxRadius=100
    )

    centroids = []
    filtered_circles = []

    if circles is not None:
        circles = np.uint16(np.around(circles[0]))
        
        # Calcular la moda del radio (el radio más frecuente)
        radii = [r for (x, y, r) in circles]
        mode_result = stats.mode(radii, keepdims=True)
        mode_radius = mode_result.mode[0]
        mode_count = mode_result.count[0]
        
        # Calcular promedio también para comparación
        mean_radius = np.mean(radii)
        
        # Definir rango aceptable basado en la moda (±20% de la moda)
        threshold = 0.2
        min_radius = mode_radius * (1 - threshold)
        max_radius = mode_radius * (1 + threshold)
        
        print(f"Radio moda (más frecuente): {mode_radius} (aparece {mode_count} veces)")
        print(f"Radio promedio: {mean_radius:.2f}")
        print(f"Rango aceptable (basado en moda): [{min_radius:.2f}, {max_radius:.2f}]")
        print(f"Círculos detectados inicialmente: {len(circles)}")
        
        # Umbral de píxeles blancos
        white_pixel_threshold = 0.15  # 15% del área debe tener píxeles blancos
        
        circles_rejected_by_size = 0
        circles_rejected_by_white_pixels = 0
        
        # Lista temporal para almacenar círculos con su ratio de píxeles blancos
        temp_circles = []
        
        # Filtrar círculos por tamaño y contenido de píxeles blancos
        for (x, y, r) in circles:
            if min_radius <= r <= max_radius:
                # Crear máscara circular
                mask = np.zeros(binary_image.shape, dtype=np.uint8)
                cv2.circle(mask, (x, y), r, 255, -1)
                
                # Contar píxeles blancos dentro del círculo
                white_pixels = cv2.countNonZero(cv2.bitwise_and(binary_image, mask))
                
                # Calcular área del círculo
                circle_area = np.pi * (r ** 2)
                
                # Calcular porcentaje de píxeles blancos
                white_pixel_ratio = white_pixels / circle_area
                
                # Filtrar por píxeles blancos
                if white_pixel_ratio >= white_pixel_threshold:
                    temp_circles.append((x, y, r, white_pixel_ratio))
                else:
                    circles_rejected_by_white_pixels += 1
            else:
                circles_rejected_by_size += 1

        print(f"Círculos rechazados por tamaño: {circles_rejected_by_size}")
        print(f"Círculos rechazados por pocos píxeles blancos: {circles_rejected_by_white_pixels}")
        print(f"Círculos antes de filtrar overlaps: {len(temp_circles)}")
        
        # Extraer centroides y círculos para procesamiento
        for (x, y, r, _) in temp_circles:
            centroids.append((x, y))
            filtered_circles.append((x, y, r))
    
    # PRIMERA IMAGEN: Círculos blancos en los centroides
    image_circles_small = np.zeros(image_gray.shape, dtype=np.uint8)
    
    # Dibujar círculos blancos en los centroides
    for (x, y) in centroids:
        cv2.circle(image_circles_small, (x, y), 20, 255, -1)
    
    # SEGUNDA IMAGEN: Procesamiento para obtener líneas sin círculos
    output_image = image_np.copy()
    
    # Crear una máscara para los centroides
    mask = np.zeros(output_image.shape[:2], dtype=np.uint8)
    
    # Dibujar círculos más grandes en la máscara para eliminarlos
    for (x, y) in centroids:
        cv2.circle(mask, (x, y), 35, 255, -1)
    
    # Invertir la máscara
    mask_inv = cv2.bitwise_not(mask)
    
    # Aplicar la máscara a la imagen original
    output_image_without_circles = cv2.bitwise_and(output_image, output_image, mask=mask_inv)
    
    # Engrosar las líneas usando dilatación
    kernel_dilate = np.ones((8, 8), np.uint8)
    output_image_without_circles = cv2.dilate(output_image_without_circles, kernel_dilate, iterations=1)
    
    image_lines = output_image_without_circles
    
    # Convertir a escala de grises si es necesario
    if image_lines.ndim == 3:
        image_lines_gray = cv2.cvtColor(image_lines, cv2.COLOR_RGB2GRAY)
    else:
        image_lines_gray = image_lines
    
    # TERCERA IMAGEN: Combinar círculos y líneas
    output = image_circles_small + image_lines_gray
    threshold_value = 200
    _, output_filtered = cv2.threshold(output, threshold_value, 255, cv2.THRESH_BINARY)
    
    # ÚLTIMO FILTRO: Eliminar círculos con overlap > 30%
    # Detectar componentes conectados en la imagen final
    num_labels, labels, stats, centroids_final = cv2.connectedComponentsWithStats(output_filtered)
    
    # Crear lista de círculos desde los componentes detectados
    final_circles = []
    for i in range(1, num_labels):  # Saltar el fondo (label 0)
        x = int(centroids_final[i][0])
        y = int(centroids_final[i][1])
        # Calcular radio aproximado del área
        area = stats[i, cv2.CC_STAT_AREA]
        r = int(np.sqrt(area / np.pi))
        
        # Calcular ratio de píxeles blancos en el componente
        component_mask = (labels == i).astype(np.uint8) * 255
        white_pixels = cv2.countNonZero(component_mask)
        bounding_area = stats[i, cv2.CC_STAT_WIDTH] * stats[i, cv2.CC_STAT_HEIGHT]
        white_pixel_ratio = white_pixels / bounding_area if bounding_area > 0 else 0
        
        final_circles.append((x, y, r, white_pixel_ratio))
    
    print(f"Componentes detectados en imagen final: {len(final_circles)}")
    
    # Aplicar filtro de overlap
    filtered_circles_no_overlap = remove_overlapping_circles(final_circles, overlap_threshold=0.3)
    
    print(f"Círculos eliminados por overlap: {len(final_circles) - len(filtered_circles_no_overlap)}")
    print(f"Círculos finales después de filtrar overlap: {len(filtered_circles_no_overlap)}")
    
    # Crear imagen final sin overlaps
    output_no_overlap = np.zeros_like(output_filtered)
    
    # Dibujar solo los círculos que pasaron el filtro de overlap
    for (x, y, r, _) in filtered_circles_no_overlap:
        cv2.circle(output_no_overlap, (x, y), 20, 255, -1)
    
    # Añadir las líneas de nuevo
    output_no_overlap = output_no_overlap + image_lines_gray
    _, output_no_overlap = cv2.threshold(output_no_overlap, threshold_value, 255, cv2.THRESH_BINARY)
    
    return image_circles_small, image_lines_gray, output_no_overlap


def visualize_results(image_with_circles: np.ndarray, 
                      reconstructed_lines: np.ndarray,
                      output_filtered: np.ndarray = None,
                      save_prefix: str = None):
    """
    Visualiza los resultados del procesamiento
    
    Args:
        image_with_circles (np.ndarray): Imagen con círculos blancos
        reconstructed_lines (np.ndarray): Imagen con líneas reconstruidas
        output_filtered (np.ndarray, optional): Imagen final combinada
        save_prefix (str, optional): Prefijo para guardar las imágenes. Si es None, no se guardan.
    """
    if output_filtered is not None:
        fig, axes = plt.subplots(1, 3, figsize=(18, 6))
        
        axes[0].imshow(image_with_circles, cmap='gray')
        axes[0].set_title('Círculos detectados')
        axes[0].axis('off')

        axes[1].imshow(reconstructed_lines, cmap='gray')
        axes[1].set_title('Líneas sin círculos')
        axes[1].axis('off')
        
        axes[2].imshow(output_filtered, cmap='gray')
        axes[2].set_title('Resultado final sin overlaps')
        axes[2].axis('off')
    else:
        fig, axes = plt.subplots(1, 2, figsize=(14, 6))
        
        axes[0].imshow(image_with_circles, cmap='gray')
        axes[0].set_title('Después de apertura + cierre con círculos blancos')
        axes[0].axis('off')

        axes[1].imshow(reconstructed_lines, cmap='gray')
        axes[1].set_title('Líneas detectadas')
        axes[1].axis('off')
    
    plt.tight_layout()
    plt.show()
    
    # Guardar imágenes si se proporciona un prefijo
    if save_prefix is not None:
        cv2.imwrite(f'{save_prefix}_circles.png', image_with_circles)
        if reconstructed_lines.ndim == 3:
            cv2.imwrite(f'{save_prefix}_lines.png', cv2.cvtColor(reconstructed_lines, cv2.COLOR_RGB2BGR))
        else:
            cv2.imwrite(f'{save_prefix}_lines.png', reconstructed_lines)
        
        if output_filtered is not None:
            cv2.imwrite(f'{save_prefix}_output.png', output_filtered)
        
        print(f"Imágenes guardadas con prefijo: {save_prefix}")


# Ejemplo de uso
if __name__ == "__main__":
    # Procesar imagen
    image_path = 'image0.jpg'
    image_circles, image_lines = process_constellation_image(image_path)
    
    # Visualizar resultados
    visualize_results(image_circles, image_lines, save_prefix='constellation_output')
