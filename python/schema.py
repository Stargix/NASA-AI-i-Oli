from pydantic import BaseModel, Field
from typing import Tuple

class BoundingBoxSchema(BaseModel):
    center: Tuple[float, float] = Field(..., description="Coordenadas del centro (RA, Dec)")
    height: float = Field(..., description="Altura del área de análisis")
    width: float = Field(..., description="Ancho del área de análisis")

class StarQuerySchema(BaseModel):
    center : Tuple[float, float] = Field(..., description="Coordenadas del centro (RA, Dec)")
    height: float = Field(..., description="Altura del área de análisis")
    width: float = Field(..., description="Ancho del área de análisis")
    image: str = Field(..., description="Ruta o base64 de la imagen")

class StarResponseSchema(BaseModel):
    bounding_box_list: list[BoundingBoxSchema] = Field(
        ..., 
        description="Lista de objetos con center, height y width de las estrellas detectadas"
    )