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
    kernel = np.ones((7, 7), np.uint8)
    
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
    
    return image_with_circles_small, output_image_without_circles



def visualize_results(image_with_circles: np.ndarray, 
                      reconstructed_lines: np.ndarray,
                      save_prefix: str = None):
    """
    Visualiza los resultados del procesamiento
    
    Args:
        image_with_circles (np.ndarray): Imagen con círculos blancos
        reconstructed_lines (np.ndarray): Imagen con líneas reconstruidas
        save_prefix (str, optional): Prefijo para guardar las imágenes. Si es None, no se guardan.
    """
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    
    axes[0].imshow(image_with_circles, cmap='gray')
    axes[0].set_title('Después de apertura + cierre con círculos blancos')
    axes[0].axis('off')
    
    axes[1].imshow(reconstructed_lines)
    axes[1].set_title('Líneas detectadas')
    axes[1].axis('off')
    
    plt.tight_layout()
    plt.show()
    
    # Guardar imágenes si se proporciona un prefijo
    if save_prefix:
        cv2.imwrite(f'{save_prefix}_circles.png', image_with_circles)
        if reconstructed_lines.ndim == 3:
            cv2.imwrite(f'{save_prefix}_lines.png', cv2.cvtColor(reconstructed_lines, cv2.COLOR_RGB2BGR))
        else:
            cv2.imwrite(f'{save_prefix}_lines.png', reconstructed_lines)
        print(f"Imágenes guardadas con prefijo: {save_prefix}")


# Ejemplo de uso
if __name__ == "__main__":
    # Procesar imagen
    image_path = 'image0.jpg'
    image_circles, image_lines = process_constellation_image(image_path)
    
    # Visualizar resultados
    visualize_results(image_circles, image_lines, save_prefix='constellation_output')
