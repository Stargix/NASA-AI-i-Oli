from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Optional
import json
import sqlite3
import tempfile
import base64
import os
from pathlib import Path
import schema
from tools import (
    extract_boxes_from_image,
    save_temp_image_from_url,
    save_temp_image_from_data_url,
    get_similarity_scores,
    process_and_save_image,
    DB_PATH_DEFAULT
)
from agent import Agent

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database and agent
_db_connection: Optional[sqlite3.Connection] = None
_agent: Optional[Agent] = None

def get_db():
    global _db_connection
    if _db_connection is None:
        _db_connection = sqlite3.connect(DB_PATH_DEFAULT)
    return _db_connection

def get_agent():
    global _agent
    if _agent is None:
        _agent = Agent(get_db())
    return _agent

@app.on_event("shutdown")
async def shutdown_event():
    global _db_connection
    if _db_connection:
        _db_connection.close()
        _db_connection = None

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
    tmp_path = None
    try:
        # Process image if provided
        if data.images:
            image_data = data.images[0]
            if image_data.startswith("data:image"):
                header, encoded = image_data.split(",", 1)
                ext = header.split("/")[1].split(";")[0]
            else:
                encoded = image_data
                ext = "png"

            # Save temporary image
            tmp_path = tempfile.mktemp(suffix=f".{ext}")
            with open(tmp_path, 'wb') as f:
                f.write(base64.b64decode(encoded))

            # Process image and save to database
            try:
                num_objects = process_and_save_image(tmp_path)
            except Exception as e:
                return schema.ChatResponseSchema(
                    response=f"Error processing image: {str(e)}"
                )

        # Process query with agent
        agent = get_agent()
        result = agent.run_query(
            user_query=data.message or "",
            image_path=tmp_path if data.images else None
        )

        # Clean up temp file
        if tmp_path:
            os.unlink(tmp_path)

        # Format response
        if isinstance(result, dict):
            if "error" in result:
                return schema.ChatResponseSchema(
                    response=f"Error: {result['error']}"
                )
            elif "bounding_box_list" in result:
                boxes = result["bounding_box_list"]
                response_text = (
                    f"Message: {data.message}\n" if data.message else ""
                ) + f"Detected {len(boxes)} objects"
                return schema.ChatResponseSchema(response=response_text)

        return schema.ChatResponseSchema(
            response=json.dumps(result, indent=2)
        )

    except Exception as e:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return schema.ChatResponseSchema(
            response=f"Error processing request: {str(e)}"
        )

@app.post("/similarity", response_model=schema.SimilarityResponseSchema)
async def similarity_endpoint(data: schema.SimilarityRequestSchema):
    tmp_pattern = None
    tmp_target = None
    try:
        # Handle pattern image (image_path1)
        pattern_path = data.image_path1
        if pattern_path.startswith("data:image"):
            tmp_pattern = save_temp_image_from_data_url(pattern_path)
            pattern_path = tmp_pattern
        elif pattern_path.startswith("http://") or pattern_path.startswith("https://"):
            tmp_pattern = save_temp_image_from_url(pattern_path)
            pattern_path = tmp_pattern

        # Handle target image (image_path2)
        target_path = data.image_path2
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

        return result

    finally:
        # Clean up temp files
        if tmp_pattern and os.path.exists(tmp_pattern):
            os.unlink(tmp_pattern)
        if tmp_target and os.path.exists(tmp_target):
            os.unlink(tmp_target)
