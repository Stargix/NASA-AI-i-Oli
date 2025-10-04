import openai
import base64
import cv2
import time
import json
import sys
import dotenv

dotenv.load_dotenv()
openai.api_key = dotenv.get_key(dotenv.find_dotenv(), "OPENAI_KEY")


def resize_image(img, max_size):
    if max(img.shape[0], img.shape[1]) > max_size:
        scale = max_size / max(img.shape[0], img.shape[1])
        img = cv2.resize(img, (int(img.shape[1]*scale), int(img.shape[0]*scale)), interpolation=cv2.INTER_AREA)
    return img

def image_to_base64(img_path):
    with open(img_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")

def analyze_image(image_path):
    image_base64 = image_to_base64(image_path)
    response = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an assistant that identifies objects in images and returns bounding boxes as JSON. Return coordinates in tenths of the image size, from 0 (top/left) to 10 (bottom/right). The format should be: [{\"label\": \"label\", \"bbox\": [x_start, y_start, x_end, y_end]}]."
            "Don't include 'json' or quotes, just the array."},
            {"role": "user", "content": f"Identify clusters of stars and nebula in this image and return bounding boxes: {image_base64}"}
        ],
        max_tokens=1500
    )
    try:
        return response['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError) as e:
        print(f"Error accessing response content: {e}")
        return ""

def parse_bounding_boxes(response):
    bounding_boxes = []
    try:
        data = json.loads(response)
        for item in data:
            label = item.get("label", "Unknown")
            bbox = item.get("bbox", [])
            if len(bbox) == 4:
                bounding_boxes.append({"label": label, "bbox": bbox})
    except Exception as e:
        print(f"Error parsing response: {e}")
    return bounding_boxes

def scale_bounding_boxes(bboxes, original_shape):
    """Convert tenths coordinates to actual pixels based on original image size"""
    h, w = original_shape[:2]
    scaled_boxes = []
    for box in bboxes:
        x_start, y_start, x_end, y_end = box["bbox"]
        scaled_box = {
            "label": box["label"],
            "bbox": [
                int(x_start / 10 * w),
                int(y_start / 10 * h),
                int(x_end / 10 * w) - int(x_start / 10 * w),
                int(y_end / 10 * h) - int(y_start / 10 * h)
            ]
        }
        scaled_boxes.append(scaled_box)
    return scaled_boxes

def draw_bounding_boxes(image, bounding_boxes):
    for box in bounding_boxes:
        label = box["label"]
        x, y, w, h = box["bbox"]
        cv2.rectangle(image, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.putText(image, label, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    return image

if __name__ == "__main__":

    small_path = "G:\\La meva unitat\\Universitat\\Projectes\\NASA\\space.jpg"
    resize_size = 256

    start_time = time.time()

    OG_img = cv2.imread(small_path)
    original_shape = OG_img.shape

    resized_img = resize_image(OG_img.copy(), resize_size)

    resized_path = "resized_image.jpg"
    cv2.imwrite(resized_path, resized_img)

    response = analyze_image(resized_path)
    print("Model response:", response)

    bounding_boxes = parse_bounding_boxes(response)
    scaled_boxes = scale_bounding_boxes(bounding_boxes, original_shape)

    print("Scaled Bounding Boxes:", scaled_boxes)

    annotated_image = draw_bounding_boxes(OG_img.copy(), scaled_boxes)

    processing_time = time.time() - start_time
    print(f"Processing time: {processing_time:.2f} seconds")

    # Resize annotated image for display
    display_image = resize_image(annotated_image.copy(), 800)

    cv2.imshow("Annotated Image", display_image)
    cv2.waitKey(0)
    cv2.destroyAllWindows()
