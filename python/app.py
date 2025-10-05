from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Optional
import json
import sqlite3
import tempfile
import base64
import os
from pathlib import Path
from dotenv import load_dotenv
import schema

# Load environment variables from .env file
load_dotenv()
from tools import (
    extract_boxes_from_image,
    save_temp_image_from_url,
    save_temp_image_from_data_url,
    get_similarity_scores,
    process_and_save_image,
    DB_PATH_DEFAULT
)
from agent import Agent
from constellation_tools import ConstellationMatcher
import numpy as np

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database, agent, and constellation matcher
_db_connection: Optional[sqlite3.Connection] = None
_agent: Optional[Agent] = None
_constellation_matcher: Optional[ConstellationMatcher] = None

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

def get_constellation_matcher():
    global _constellation_matcher
    if _constellation_matcher is None:
        # Path to processed constellations directory
        processed_dir = Path(__file__).parent.parent / 'tests' / 'processed_constellations'
        _constellation_matcher = ConstellationMatcher(str(processed_dir))
    return _constellation_matcher

@app.on_event("shutdown")
async def shutdown_event():
    global _db_connection
    if _db_connection:
        _db_connection.close()
        _db_connection = None

@app.get("/")
async def root():
    """Root endpoint for health checks and API information"""
    return {
        "status": "online",
        "service": "NASA AI-i-Oli API",
        "version": "1.0.0",
        "endpoints": {
            "star_analysis": "/star_analysis",
            "chat": "/chat",
            "similarity": "/similarity",
            "constellation_search": "/constellation/search",
            "constellation_draw": "/constellation/draw"
        },
        "docs": "/docs",
        "health": "OK"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "online"}

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
        # CHAIN 1: Question Mode - Detect if it's a question (contains '?')
        if data.message and '?' in data.message:
            # Direct response without using agent or database
            from langchain_google_genai import ChatGoogleGenerativeAI
            
            # Get API key from environment variable
            google_api_key = os.getenv("GOOGLE_API_KEY")
            if not google_api_key:
                return schema.ChatResponseSchema(
                    response="Error: GOOGLE_API_KEY not found in environment variables. Please set it in your .env file."
                )
            
            llm = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash-exp",
                temperature=0.7,
                google_api_key=google_api_key
            )
            
            prompt = f"""You are an expert astronomy assistant. Answer this question concisely and informatively in English.   

Question: {data.message}

Provide a clear, educational answer about astronomy, space, stars, galaxies, constellations, or related topics."""
            
            response_text = llm.invoke(prompt).content
            
            return schema.ChatResponseSchema(
                response=response_text
            )
        
        # CHAIN 2: Detection Mode - Use agent for object detection
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

        # Format response for detection mode
        if isinstance(result, dict):
            if "error" in result:
                return schema.ChatResponseSchema(
                    response=f"Error: {result['error']}"
                )
            elif "bounding_box_list" in result:
                boxes = result["bounding_box_list"]
                response_text = f"Detected {len(boxes)} objects"
                return schema.ChatResponseSchema(
                    response=response_text,
                    bounding_box_list=boxes
                )

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
            image_path1=target_path,
            image_path2=pattern_path,
            grid_size=data.grid_size
        )

        return result

    finally:
        # Clean up temp files
        if tmp_pattern and os.path.exists(tmp_pattern):
            os.unlink(tmp_pattern)
        if tmp_target and os.path.exists(tmp_target):
            os.unlink(tmp_target)

@app.post("/constellation/search", response_model=schema.ConstellationResponseSchema)
async def constellation_search_endpoint(data: schema.ConstellationSearchRequestSchema):
    """
    Search for a specific constellation by name in the detected stars.
    """
    try:
        matcher = get_constellation_matcher()
        
        # TODO: Get detected centroids from current image analysis
        # For now, we'll return a message that this needs to be implemented
        detected_centroids = data.detected_centroids
        
        if not detected_centroids:
            return schema.ConstellationResponseSchema(
                success=False,
                message="No detected stars available. Please run star detection first."
            )
        
        # Search for the constellation
        match = matcher.find_specific_constellation(
            data.constellation_name,
            detected_centroids,
            ransac_threshold=100.0,
            min_inliers=3,
            max_iters=1000,
            rotation_step=15,
            scale_range=(0.3, 5.0),
            scale_steps=10
        )
        
        if match:
            # Calculate approximate position
            transform_matrix = np.array(match['transformation_matrix'], dtype=np.float32)
            canvas_size = 512  # Default canvas size
            center_point = np.array([[canvas_size/2, canvas_size/2]], dtype=np.float32)
            
            # Apply transformation
            transformed_center = matcher.apply_transformation(
                center_point,
                transform_matrix,
                match['rotation_angle']
            )[0]
            
            return schema.ConstellationResponseSchema(
                success=True,
                message="Constellation found!",
                constellation_name=match.get('constellation_name', data.constellation_name),
                constellation_index=match.get('constellation_index'),
                inliers_count=match['inliers_count'],
                total_points=len(match.get('pattern_centroids', [])),
                inliers_ratio=match['inliers_ratio'],
                rotation_angle=match['rotation_angle'],
                scale=match['final_scale'],
                position=(float(transformed_center[0]), float(transformed_center[1])),
                transformation_matrix=match['transformation_matrix'],
                matched_indices=match.get('matched_indices', [])
            )
        else:
            return schema.ConstellationResponseSchema(
                success=False,
                message=f"Constellation '{data.constellation_name}' not found in the detected stars."
            )
            
    except Exception as e:
        return schema.ConstellationResponseSchema(
            success=False,
            message=f"Error searching for constellation: {str(e)}"
        )

@app.post("/constellation/draw", response_model=schema.ConstellationResponseSchema)
async def constellation_draw_endpoint(data: schema.ConstellationDrawRequestSchema):
    """
    Launch interactive drawing interface to draw a custom constellation pattern
    and match it against detected stars.
    """
    try:
        matcher = get_constellation_matcher()
        
        # TODO: Get detected centroids from current image analysis
        # For now, generate fake data for testing
        detected_centroids = data.detected_centroids
        
        if not detected_centroids:
            # Generate fake detected stars for testing
            print("⚠️ No detected centroids provided, generating test data...")
            np.random.seed(42)
            num_stars = 100
            detected_centroids = [
                (float(np.random.uniform(100, 1900)), float(np.random.uniform(100, 1900)))
                for _ in range(num_stars)
            ]
            
            # Add a hidden triangle pattern for easier testing
            triangle = [(100, 100), (50, 200), (150, 200)]
            for point in triangle:
                # Scale and position
                x = point[0] * 5.0 + 1000
                y = point[1] * 5.0 + 1000
                detected_centroids.append((float(x), float(y)))
        
        # Launch drawing interface and match
        match = matcher.draw_and_match_constellation(
            detected_centroids=detected_centroids,
            canvas_size=512,
            point_width=25,
            line_width=2,
            ransac_threshold=100.0,
            min_inliers=3,
            max_iters=1000,
            rotation_step=15,
            scale_range=(0.5, 8.0),
            scale_steps=10,
            verbose=True
        )
        
        if match:
            # Calculate approximate position
            transform_matrix = np.array(match['transformation_matrix'], dtype=np.float32)
            canvas_size = 512
            center_point = np.array([[canvas_size/2, canvas_size/2]], dtype=np.float32)
            
            # Apply transformation
            transformed_center = matcher.apply_transformation(
                center_point,
                transform_matrix,
                match['rotation_angle']
            )[0]
            
            return schema.ConstellationResponseSchema(
                success=True,
                message="Custom constellation matched!",
                constellation_name=match.get('constellation_name', 'Custom Pattern'),
                constellation_index=match.get('constellation_index'),
                inliers_count=match['inliers_count'],
                total_points=len(match.get('pattern_centroids', [])),
                inliers_ratio=match['inliers_ratio'],
                rotation_angle=match['rotation_angle'],
                scale=match['final_scale'],
                position=(float(transformed_center[0]), float(transformed_center[1])),
                transformation_matrix=match['transformation_matrix'],
                matched_indices=match.get('matched_indices', []),
                drawn_image_data_url=match.get('drawn_image_data_url')
            )
        else:
            return schema.ConstellationResponseSchema(
                success=False,
                message="No match found for your drawn pattern."
            )
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return schema.ConstellationResponseSchema(
            success=False,
            message=f"Error processing drawn constellation: {str(e)}"
        )
