import fastapi
from fastapi import Request
from typing import Dict
import schema
from tools import extract_boxes_from_image

app = fastapi.FastAPI()

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
