import cv2
from star_detection_tools import detect_bounding_boxes
from schema import BoundingBoxSchema

def extract_boxes_from_image(image_path, top_left=(0, 0), bottom_right=None, **kwargs):
    """
    Processes an image and returns a list of detected BoundingBoxSchema objects.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not load image: {image_path}")

    if bottom_right is None:
        bottom_right = (img.shape[1], img.shape[0])

    x1, y1 = top_left
    x2, y2 = bottom_right
    cropped = img[y1:y2, x1:x2]

    # Use the general detect_bounding_boxes function
    objects = detect_bounding_boxes(cropped, **kwargs)
    x_offset, y_offset = top_left

    boxes = []
    for obj in objects:
        center_x = obj["centroid_x"] + x_offset
        center_y = obj["centroid_y"] + y_offset
        boxes.append(
            BoundingBoxSchema(
                center=(float(center_x), float(center_y)),
                width=float(obj["bbox_width"]),
                height=float(obj["bbox_height"]),
                color=obj.get("color"),
                obj_type=obj.get("obj_type")
            )
        )
    return boxes

