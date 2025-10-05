import cv2
from miquel.star_detection_tools import process_image, extract_properties_fast, find_clusters
from miquel.similarity_function import compare_images_grid, average_scores
from schema import BoundingBoxSchema, SimilarityResponseSchema, SimilarityScoresSchema
import sqlite3, json, cv2
from typing import List, Dict, Optional
# from no_nonsense_function import process_image, extract_properties_fast
import tempfile, os, base64, re
try:
    import requests
except ImportError:
    requests = None

import numpy as np

def extract_boxes_from_image(image_input, top_left=(0, 0), bottom_right=None, **kwargs):
    """
    Processes an image and returns a list of detected BoundingBoxSchema objects.
    Supports image paths, HTTP URLs, and numpy arrays.
    """
    # Handle different input types
    if isinstance(image_input, np.ndarray):
        img = image_input
    elif isinstance(image_input, str) and (image_input.startswith('http://') or image_input.startswith('https://')):
        try:
            print(f"Downloading image from URL")
            import requests
            response = requests.get(image_input, timeout=10)
            response.raise_for_status()
            image_array = np.frombuffer(response.content, dtype=np.uint8)
            img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError(f"Failed to decode image from URL")
            print(f"Successfully loaded image from URL. Shape: {img.shape}")
        except Exception as e:
            raise ValueError(f"Could not download/load image from URL: {str(e)}")
    elif isinstance(image_input, str):
        img = cv2.imread(image_input)
    else:
        raise ValueError("Invalid image input type. Must be numpy array, file path, or URL.")

    if img is None:
        raise ValueError("Could not load image")

    if bottom_right is None:
        bottom_right = (img.shape[1], img.shape[0])

    x1, y1 = top_left
    x2, y2 = bottom_right
    cropped = img[y1:y2, x1:x2]

    objects = detect_bounding_boxes(cropped, **kwargs)

    x_offset, y_offset = top_left

    boxes = []
    for obj in objects:
        obj["centroid_x"] += x_offset
        obj["centroid_y"] += y_offset
        boxes.append(
            BoundingBoxSchema(
                center=(float(obj["centroid_x"]), float(obj["centroid_y"])),
                width=float(obj["bbox_width"]),
                height=float(obj["bbox_height"]),
                color=obj.get("color"),
                obj_type=obj.get("obj_type")
            )
        )
    
    # Ensure database table exists and save objects
    create_space_objects_table(DB_PATH_DEFAULT)
    save_objects_to_db(objects, DB_PATH_DEFAULT)
    return boxes



def detect_bounding_boxes(
    image,
    gaussian_blur=25,
    noise_threshold=120,
    adaptative_filtering=False,
    separation_threshold=3,
    min_size=20,
    automated=False,
    max_components=1000,
    cluster_gaussian_blur=101,
    min_cluster_size=5000,
    detect_clusters=False
):
    """
    Procesa la imagen y devuelve una lista de diccionarios con las bounding boxes detectadas,
    compatibles con BoundingBoxSchema.
    """
    # Detecta estrellas y galaxias
    large_mask, labels, stats = process_image(
        image,
        gaussian_blur=gaussian_blur,
        noise_threshold=noise_threshold,
        adaptative_filtering=adaptative_filtering,
        separation_threshold=separation_threshold,
        min_size=min_size,
        automated=automated,
        max_components=max_components,
        show_steps=False
    )
    objects = extract_properties_fast(image, labels, stats, large_mask)
    
    # Opcionalmente, detecta clusters
    if detect_clusters:
        cluster_mask, cluster_labels, cluster_stats = find_clusters(
            image, large_mask, labels, stats,
            gaussian_blur=cluster_gaussian_blur,
            min_cluster_size=min_cluster_size
        )
        clusters = extract_properties_fast(image, cluster_labels, cluster_stats, cluster_mask, cluster=True)
        objects.extend(clusters)
        
    return objects

DB_PATH_DEFAULT = "space_objects.db"

def create_space_objects_table(db_path: str = DB_PATH_DEFAULT):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Verificar si la tabla existe y tiene la estructura correcta
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='space_objects';")
    table_exists = cur.fetchone() is not None
    
    if table_exists:
        # Verificar si tiene las columnas bbox_x, bbox_y, bbox_width, bbox_height
        cur.execute("PRAGMA table_info(space_objects);")
        columns = [row[1] for row in cur.fetchall()]
        required_bbox_columns = ['bbox_x', 'bbox_y', 'bbox_width', 'bbox_height']
        
        # Si faltan columnas bbox, recrear la tabla
        if not all(col in columns for col in required_bbox_columns):
            print(f"⚠️ Old database schema detected. Recreating table with new schema...")
            cur.execute("DROP TABLE IF EXISTS space_objects;")
            table_exists = False
    
    if not table_exists:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS space_objects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                centroid_x REAL,
                centroid_y REAL,
                area REAL,
                compactness REAL,
                total_brightness REAL,
                peak_brightness REAL,
                color TEXT,
                background_contrast REAL,
                obj_type TEXT,
                bbox_x REAL,
                bbox_y REAL,
                bbox_width REAL,
                bbox_height REAL,
                processing_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✅ Created space_objects table with new schema")
    
    # Índices para búsquedas por timestamp
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_timestamp ON space_objects(processing_timestamp);")
    
    # Índices para coordenadas y medidas espaciales
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_xy ON space_objects(centroid_x, centroid_y);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_so_area ON space_objects(area);")
    
    # Solo crear índice bbox si las columnas existen
    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_so_bbox ON space_objects(bbox_x, bbox_y, bbox_width, bbox_height);")
    except sqlite3.OperationalError as e:
        print(f"⚠️ Could not create bbox index: {e}")
    
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
    conn.commit(); conn.close()

def save_objects_to_db(objects: List[Dict], db_path: str = DB_PATH_DEFAULT):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    rows = [(
        o.get("centroid_x"), o.get("centroid_y"),
        o.get("area"), o.get("compactness"),
        o.get("total_brightness"), o.get("peak_brightness"),
        o.get("color"), o.get("background_contrast", 0.0),
        o.get("obj_type", "cluster"),
        o.get("bbox_x", o.get("centroid_x")),
        o.get("bbox_y", o.get("centroid_y")),
        o.get("bbox_width", o.get("area")**0.5),
        o.get("bbox_height", o.get("area")**0.5)
    ) for o in objects]
    cur.executemany("""
        INSERT INTO space_objects(
            centroid_x, centroid_y, area, compactness,
            total_brightness, peak_brightness, color, background_contrast, obj_type,
            bbox_x, bbox_y, bbox_width, bbox_height
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows)
    conn.commit(); conn.close()

def process_and_save_image(image_input, db_path: str = DB_PATH_DEFAULT) -> int:
    """
    Process an image and save detected objects to database.
    Args:
        image_input: Can be a file path (str), URL (str), or numpy array
        db_path: Path to SQLite database
    Returns:
        Number of objects detected
    """
    create_space_objects_table(db_path)
    
    # Handle different input types
    if isinstance(image_input, np.ndarray):
        img = image_input
    elif isinstance(image_input, str) and (image_input.startswith('http://') or image_input.startswith('https://')):
        try:
            response = requests.get(image_input, timeout=10)
            response.raise_for_status()
            image_array = np.frombuffer(response.content, dtype=np.uint8)
            img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        except Exception as e:
            raise ValueError(f"Could not download/decode image: {str(e)}")
    else:
        img = cv2.imread(image_input)
        
    if img is None:
        raise ValueError("Could not load image")
        
    large_mask, labels, stats = process_image(img, automated=True)
    objects = extract_properties_fast(img, labels, stats, large_mask)
    save_objects_to_db(objects, db_path)
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

def save_temp_image_from_url(url: str) -> str:
    if requests is None:
        raise RuntimeError('requests library is required to download images from URLs')
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404 and '/tiles/' in url:
            fallback_url = url.split('/tiles/')[0] + '/andromeda.jpg'
            resp = requests.get(fallback_url, timeout=10)
            resp.raise_for_status()
        else:
            raise
    ext = os.path.splitext(url)[1] or '.jpg'
    fd, tmp_path = tempfile.mkstemp(suffix=ext)
    with os.fdopen(fd, 'wb') as f:
        f.write(resp.content)
    return tmp_path

def save_temp_image_from_data_url(data_url: str) -> str:
    m = re.match(r'data:(image/\w+);base64,(.*)', data_url, re.DOTALL)
    if not m:
        raise ValueError('Invalid data URL')
    mime = m.group(1)
    b64 = m.group(2)
    ext = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp'
    }.get(mime, '.jpg')
    fd, tmp_path = tempfile.mkstemp(suffix=ext)
    with os.fdopen(fd, 'wb') as f:
        f.write(base64.b64decode(b64))
    return tmp_path

def get_similarity_scores(image_path1, image_path2, grid_size=10):
    """
    Devuelve un diccionario con los scores de similitud entre dos imágenes usando color, brightness y HOG.
    Soporta rutas locales, URLs HTTP/HTTPS, y data URLs.
    """
    def load_image(path):
        """Helper para cargar imágenes de diferentes fuentes"""
        if isinstance(path, str) and (path.startswith('http://') or path.startswith('https://')):
            print(f"Downloading image from URL: {path}")
            response = requests.get(path, timeout=10)
            response.raise_for_status()
            image_array = np.frombuffer(response.content, dtype=np.uint8)
            img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError(f"Failed to decode image from URL")
            return img
        elif isinstance(path, str) and path.startswith('data:image'):
            # Data URL
            m = re.match(r'data:(image/\w+);base64,(.*)', path, re.DOTALL)
            if not m:
                raise ValueError('Invalid data URL')
            b64 = m.group(2)
            img_bytes = base64.b64decode(b64)
            image_array = np.frombuffer(img_bytes, dtype=np.uint8)
            img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError('Failed to decode image from data URL')
            return img
        else:
            # Local file path
            img = cv2.imread(path)
            if img is None:
                raise ValueError(f"Could not load image: {path}")
            return img

    img1 = load_image(image_path1)
    img2 = load_image(image_path2)

    scores_color = compare_images_grid(img1, img2, grid_size=grid_size, method_type="color")
    scores_brightness = compare_images_grid(img1, img2, grid_size=grid_size, method_type="brightness")
    scores_hog = compare_images_grid(img1, img2, grid_size=grid_size, method_type="hog")
    scores_average = average_scores(scores_color, scores_brightness, scores_hog)

    return SimilarityResponseSchema(
        grid_size=grid_size,
        scores=SimilarityScoresSchema(
            color=scores_color,
            brightness=scores_brightness,
            hog=scores_hog,
            average=scores_average
        )
    )
