import fastapi
import schema
from fastapi import Request
from typing import List, Dict
from typing import Any

app = fastapi.FastAPI()


@app.get("/")
async def read_root(request: Request) -> Dict[str, str]:
    return {"Hello": "World"}

@app.get("/getimage")
async def get_image(request: Request) -> Dict[str, str]:
    return {"image": "image_data"}

@app.post("/star_analysis")
async def star_analysis(data: schema.StarQuerySchema, request: Request) -> schema.StarResponseSchema:
    # Perform analysis on the received data

    return schema.StarResponseSchema(analysis="result")
