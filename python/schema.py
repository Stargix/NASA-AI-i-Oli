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
    image: str = Field(..., description="Path, URL, or base64 of the image")
    automated: bool = Field(False, description="If true, use automatic values")
    gaussian_blur: int = Field(25, description="Gaussian kernel size (must be odd)")
    noise_threshold: int = Field(120, description="Fixed noise threshold for binarization")
    adaptative_filtering: bool = Field(False, description="Use adaptive filtering instead of fixed threshold")
    separation_threshold: int = Field(3, description="Erosion kernel size to separate objects")
    min_size: int = Field(20, description="Minimum size in pixels to consider a component")
    max_components: int = Field(1000, description="Maximum number of components to return")
    detect_clusters: bool = Field(False, description="If true, detect clusters of stars")

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

class SimilarityScoresSchema(BaseModel):
    color: List[List[float]]
    brightness: List[List[float]]
    hog: List[List[float]]
    average: List[List[float]]

class SimilarityResponseSchema(BaseModel):
    grid_size: int
    scores: SimilarityScoresSchema

class SimilarityRequestSchema(BaseModel):
    image_path1: str = Field(..., description="Path or URL of the first image")
    image_path2: str = Field(..., description="Path or URL of the second image")
    grid_size: int = Field(10, description="Grid size (default 10)")

class ConstellationSearchRequestSchema(BaseModel):
    constellation_name: str = Field(..., description="Name of the constellation to search for")
    detected_centroids: Optional[List[Tuple[float, float]]] = Field(None, description="Optional list of detected star positions")

class ConstellationDrawRequestSchema(BaseModel):
    detected_centroids: Optional[List[Tuple[float, float]]] = Field(None, description="Optional list of detected star positions")

class ConstellationResponseSchema(BaseModel):
    success: bool
    message: Optional[str] = None
    constellation_name: Optional[str] = None
    constellation_index: Optional[int] = Field(None, description="Index of the constellation for retrieving images")
    inliers_count: Optional[int] = None
    total_points: Optional[int] = None
    inliers_ratio: Optional[float] = None
    rotation_angle: Optional[float] = None
    scale: Optional[float] = None
    position: Optional[Tuple[float, float]] = None
    transformation_matrix: Optional[List[List[float]]] = None
    matched_indices: Optional[List[int]] = Field(None, description="Indices of the detected stars that match the constellation")