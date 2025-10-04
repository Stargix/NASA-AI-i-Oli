from pydantic import BaseModel, Field
from typing import Tuple, List, Optional

class BoundingBoxSchema(BaseModel):
    center: Tuple[float, float] = Field(..., description="Center coordinates (RA, Dec)")
    height: float = Field(..., description="Height of the analysis area")
    width: float = Field(..., description="Width of the analysis area")
    color: Optional[str] = Field(None, description="Color of the bounding box")
    obj_type: Optional[str] = Field(None, description="Type of detected object")

class StarQuerySchema(BaseModel):
    top_left: Tuple[int, int] = Field(..., description="(x, y) coordinate of the top-left corner of the crop")
    bottom_right: Tuple[int, int] = Field(..., description="(x, y) coordinate of the bottom-right corner of the crop")
    image: str = Field(..., description="Path or base64 of the image")

class StarResponseSchema(BaseModel):
    bounding_box_list: list[BoundingBoxSchema] = Field(
        ..., 
        description="List of objects with center, height, and width of the detected stars"
    )

class ChatMessageSchema(BaseModel):
    message: str
    images: List[str] = Field(default_factory=list, description="List of image paths or base64 strings")

class ChatResponseSchema(BaseModel):
    response: str