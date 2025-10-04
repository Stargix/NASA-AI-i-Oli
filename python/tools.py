import cv2
from no_nonsense_function import process_image

def extract_boxes_from_image(image_path, **kwargs):
    """
    Procesa una imagen y devuelve una lista de cajas detectadas.
    Cada caja es un diccionario con: center_x, center_y, width, height.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"No se pudo cargar la imagen: {image_path}")
    large_mask, labels, stats = process_image(img, **kwargs)
    boxes = []
    for i in range(1, stats.shape[0]):  # saltar fondo
        x, y, w, h, area = stats[i]
        center_x = x + w / 2
        center_y = y + h / 2
        boxes.append({
            "center_x": float(center_x),
            "center_y": float(center_y),
            "width": int(w),
            "height": int(h)
        })
    return boxes