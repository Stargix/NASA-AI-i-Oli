from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import schema
from tools import extract_boxes_from_image

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
    boxes = extract_boxes_from_image(
        data.image,
        top_left=data.top_left,
        bottom_right=data.bottom_right,
        automated=True
    )
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
