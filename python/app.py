from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import schema
from tools import extract_boxes_from_image, save_temp_image_from_url, save_temp_image_from_data_url, get_similarity_scores

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # O especifica ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/getimage")
async def get_image(request: Request) -> Dict[str, str]:
    return {"image": "image_data"}

@app.post("/star_analysis", response_model=schema.StarResponseSchema)
async def star_analysis(data: schema.StarQuerySchema, request: Request):
    # Detect image type and save to temp file if needed
    image_path = data.image
    tmp_path = None
    if image_path.startswith("data:image"):
        tmp_path = save_temp_image_from_data_url(image_path)
        image_path = tmp_path
    elif image_path.startswith("http://") or image_path.startswith("https://"):
        tmp_path = save_temp_image_from_url(image_path)
        image_path = tmp_path

    boxes = extract_boxes_from_image(
        image_path,
        top_left=data.top_left,
        bottom_right=data.bottom_right,
        automated=data.automated,
        gaussian_blur=data.gaussian_blur,
        noise_threshold=data.noise_threshold,
        adaptative_filtering=data.adaptative_filtering,
        separation_threshold=data.separation_threshold,
        min_size=data.min_size,
        max_components=data.max_components,
        detect_clusters=data.detect_clusters
    )
    if tmp_path:
        import os
        os.unlink(tmp_path)
    return schema.StarResponseSchema(bounding_box_list=boxes)

@app.post("/chat", response_model=schema.ChatResponseSchema)
async def chat_endpoint(data: schema.ChatMessageSchema):
    if data.images:
        import base64, tempfile
        from pathlib import Path

        image_data = data.images[0]
        if image_data.startswith("data:image"):
            header, encoded = image_data.split(",", 1)
            ext = header.split("/")[1].split(";")[0]
        else:
            encoded = image_data
            ext = "png"

        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            tmp.write(base64.b64decode(encoded))
            tmp_path = tmp.name

        boxes = extract_boxes_from_image(tmp_path)
        Path(tmp_path).unlink()  # Delete temp file

        # Include the original message if present
        if data.message.strip():
            response_text = (
                f"Message: {data.message}\n"
                f"Detected {len(boxes)} boxes: "
                f"{[{'center': b.center, 'width': b.width, 'height': b.height} for b in boxes]}"
            )
        else:
            response_text = (
                f"Detected {len(boxes)} boxes: "
                f"{[{'center': b.center, 'width': b.width, 'height': b.height} for b in boxes]}"
            )

        return schema.ChatResponseSchema(response=response_text)
    else:
        return schema.ChatResponseSchema(response=f"Received only text: {data.message}")

@app.post("/similarity", response_model=schema.SimilarityResponseSchema)
async def similarity_endpoint(data: schema.SimilarityRequestSchema):
    # Handle pattern image (image_path1)
    pattern_path = data.image_path1
    tmp_pattern = None
    if pattern_path.startswith("data:image"):
        tmp_pattern = save_temp_image_from_data_url(pattern_path)
        pattern_path = tmp_pattern
    elif pattern_path.startswith("http://") or pattern_path.startswith("https://"):
        tmp_pattern = save_temp_image_from_url(pattern_path)
        pattern_path = tmp_pattern

    # Handle target image (image_path2)
    target_path = data.image_path2
    tmp_target = None
    if target_path.startswith("data:image"):
        tmp_target = save_temp_image_from_data_url(target_path)
        target_path = tmp_target
    elif target_path.startswith("http://") or target_path.startswith("https://"):
        tmp_target = save_temp_image_from_url(target_path)
        target_path = tmp_target

    # Calculate similarity
    result = get_similarity_scores(
        image_path1=pattern_path,
        image_path2=target_path,
        grid_size=data.grid_size
    )

    # Clean up temp files
    import os
    if tmp_pattern:
        os.unlink(tmp_pattern)
    if tmp_target:
        os.unlink(tmp_target)
    
    return result
