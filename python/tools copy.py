import cv2
from star_detection_tools import detect_bounding_boxes
from star_detection_tools import process_image, detect_bounding_boxes
from schema import BoundingBoxSchema
import sqlite3, json, cv2
from typing import List, Dict, Optional
from no_nonsense_function import process_image, extract_properties_fast
import requests
import numpy as np

def extract_boxes_from_image(image_path, top_left=(0, 0), bottom_right=None, **kwargs):
    """
    Processes an image and returns a list of detected BoundingBoxSchema objects.
    Supports both local file paths and HTTP URLs.
    """
    # Check if it's a URL
    if isinstance(image_path, str) and (image_path.startswith('http://') or image_path.startswith('https://')):
        try:
            print(f"Downloading image from URL: {image_path}")
            response = requests.get(image_path, timeout=10)
            response.raise_for_status()
            image_array = np.frombuffer(response.content, dtype=np.uint8)
            img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError(f"Failed to decode image from URL")
            print(f"Successfully loaded image from URL. Shape: {img.shape}")
        except Exception as e:
            raise ValueError(f"Could not download/load image from URL {image_path}: {str(e)}")
    else:
        img = cv2.imread(image_path)
    
    if img is None:
        raise ValueError(f"Could not load image: {image_path}")

    if bottom_right is None:
        bottom_right = (img.shape[1], img.shape[0])

    x1, y1 = top_left
    x2, y2 = bottom_right
    cropped = img[y1:y2, x1:x2]

    # Use the general detect_bounding_boxes function
    objects = detect_bounding_boxes(cropped, **kwargs)
    # Use the general detect_bounding_boxes function
    objects = detect_bounding_boxes(cropped, **kwargs)
    x_offset, y_offset = top_left

    boxes = []
    for obj in objects:
        center_x = obj["centroid_x"] + x_offset
        center_y = obj["centroid_y"] + y_offset

    boxes = []
    for obj in objects:
        center_x = obj["centroid_x"] + x_offset
        center_y = obj["centroid_y"] + y_offset
        boxes.append(
            BoundingBoxSchema(
                center=(float(center_x), float(center_y)),
                width=float(obj["bbox_width"]),
                height=float(obj["bbox_height"]),
                color=obj.get("color"),
                obj_type=obj.get("obj_type")
            )
        )
    return boxes

DB_PATH_DEFAULT = "space_objects.db"

def create_space_objects_table(db_path: str = DB_PATH_DEFAULT):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS space_objects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_path TEXT,
            centroid_x REAL,
            centroid_y REAL,
            area REAL,
            compactness REAL,
            total_brightness REAL,
            peak_brightness REAL,
            color TEXT,
            background_contrast REAL,
            obj_type TEXT,
            processing_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Índices para búsquedas por imagen y timestamp
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_img ON space_objects(image_path);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_timestamp ON space_objects(processing_timestamp);")
    
    # Índices para coordenadas y medidas espaciales
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_xy ON space_objects(centroid_x, centroid_y);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_area ON space_objects(area);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_compactness ON space_objects(compactness);")
    
    # Índices para propiedades de brillo
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_peak_bright ON space_objects(peak_brightness DESC);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_total_bright ON space_objects(total_brightness DESC);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_bg_contrast ON space_objects(background_contrast);")
    
    # Índices para clasificación y color
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_type ON space_objects(obj_type);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_color ON space_objects(color);")
    
    # Índices compuestos para búsquedas comunes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_type_bright ON space_objects(obj_type, peak_brightness DESC);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_color_bright ON space_objects(color, peak_brightness DESC);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_img_type ON space_objects(image_path, obj_type);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_img_color ON space_objects(image_path, color);")
    conn.commit(); conn.close()

def save_objects_to_db(objects: List[Dict], image_path: str, db_path: str = DB_PATH_DEFAULT):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    rows = [(
        image_path,
        o.get("centroid_x"), o.get("centroid_y"),
        o.get("area"), o.get("compactness"),
        o.get("total_brightness"), o.get("peak_brightness"),
        o.get("color"), o.get("background_contrast", 0.0),
        o.get("obj_type", "cluster")
    ) for o in objects]
    cur.executemany("""
        INSERT INTO space_objects(
            image_path, centroid_x, centroid_y, area, compactness,
            total_brightness, peak_brightness, color, background_contrast, obj_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows)
    conn.commit(); conn.close()

def process_and_save_image(image_path: str, db_path: str = DB_PATH_DEFAULT) -> int:
    create_space_objects_table(db_path)
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"No se pudo cargar la imagen: {image_path}")
    large_mask, labels, stats = process_image(img, automated=True)
    objects = extract_properties_fast(img, labels, stats, large_mask)
    save_objects_to_db(objects, image_path, db_path)
    return len(objects)

from langchain_core.tools import tool

def _select_safe(sql: str, db_path: str = DB_PATH_DEFAULT, limit: int = 200):
    """
    Ejecuta una consulta SELECT de forma segura, añadiendo LIMIT si es necesario.
    """
    # Normalizar la consulta
    q = sql.strip()
    if q.endswith(';'):
        q = q[:-1].strip()
    
    # Convertir a minúsculas para verificaciones
    q_lower = q.lower()
    
    # Verificar que es SELECT o WITH
    if not (q_lower.startswith("select") or q_lower.startswith("with")):
        return {"error": "Solo se permiten SELECT/WITH.", "sql": sql}
    
    # Buscar LIMIT de forma más robusta
    has_limit = any(
        # Patrones comunes de LIMIT al final de la consulta
        q_lower.endswith(pattern) or
        f"{pattern} " in q_lower or
        f"{pattern};" in q_lower
        for pattern in [
            f"limit {limit}",
            "limit all",
            *[f"limit {i}" for i in range(1, limit + 1)]
        ]
    )
    
    # Añadir LIMIT si no está presente
    final_sql = f"{q} LIMIT {limit}" if not has_limit else q
    
    try:
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        cur.execute(final_sql)
        cols = [c[0] for c in cur.description] if cur.description else []
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        con.close()
        return {"columns": cols, "rows": rows, "sql": final_sql}
    except sqlite3.Error as e:
        return {"error": f"Error SQL: {str(e)}", "sql": final_sql}
    except Exception as e:
        return {"error": f"Error inesperado: {str(e)}", "sql": final_sql}

@tool("ingestar_imagen")
def ingestar_imagen(action_input: str) -> str:
    """
    Action Input (string) esperado por ReAct:
      - Ruta directa: "C:\\Users\\Paess\\Documents\\Nasa Space app\\prova.png"
      - o JSON: {"image_path":"C:\\\\...\\\\prova.png","db_path":"space_objects.db"}
    Devuelve JSON: {"insertados": N, "image_path": "...", "db_path": "..."} o {"error": "..."}.
    """
    try:
        image_path = None
        db_path = DB_PATH_DEFAULT

        txt = (action_input or "").strip()
        if txt.startswith("{"):
            payload = json.loads(txt)
            image_path = payload.get("image_path")
            db_path = payload.get("db_path", DB_PATH_DEFAULT)
        else:
            image_path = txt  # interpretar como ruta

        if not image_path:
            return json.dumps({"error": "Falta 'image_path'."})

        n = process_and_save_image(image_path, db_path)
        return json.dumps({"insertados": n, "image_path": image_path, "db_path": db_path})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool("ejecutar_sql")
def ejecutar_sql(action_input: str) -> str:
    """
    Action Input (string):
      - SQL plano: "SELECT ... FROM space_objects ..."
      - o JSON: {"sql":"SELECT ...","db_path":"space_objects.db","limit":200}
    Devuelve JSON: {"columns":[...], "rows":[...], "sql":"..."} o {"error":"..."}.
    """
    try:
        sql = None
        db_path: Optional[str] = DB_PATH_DEFAULT
        limit = 200

        txt = (action_input or "").strip()
        if txt.startswith("{"):
            payload = json.loads(txt)
            sql = payload.get("sql")
            db_path = payload.get("db_path", DB_PATH_DEFAULT)
            if "limit" in payload:
                limit = int(payload["limit"])
        else:
            sql = txt

        if not sql:
            return json.dumps({"error": "Falta 'sql'."})

        res = _select_safe(sql, db_path, limit)
        return json.dumps(res)
    except Exception as e:
        return json.dumps({"error": str(e), "sql": action_input})
