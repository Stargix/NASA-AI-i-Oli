import cv2
from no_nonsense_function import process_image

def extract_boxes_from_image(image_path, top_left, bottom_right, **kwargs):
    """
    Procesa una imagen y devuelve una lista de cajas detectadas.
    Cada caja es un diccionario con: center_x, center_y, width, height.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"No se pudo cargar la imagen: {image_path}")

    x1, y1 = top_left
    x2, y2 = bottom_right
    cropped = img[y1:y2, x1:x2]

    large_mask, labels, stats = process_image(cropped, **kwargs)
    boxes = []
    x_offset, y_offset = top_left
    for i in range(1, stats.shape[0]):
        x, y, w, h, area = stats[i]
        center_x = x + w / 2 + x_offset
        center_y = y + h / 2 + y_offset
        boxes.append({
            "center_x": float(center_x),
            "center_y": float(center_y),
            "width": int(w),
            "height": int(h)
        })
    return boxes
