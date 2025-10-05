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

def extract_boxes_from_image(image_path, top_left=(0, 0), bottom_right=None, **kwargs):
    """
    Processes an image and returns a list of detected BoundingBoxSchema objects.
    Supports both local file paths and HTTP URLs.
    """
    # Check if it's a URL
    if isinstance(image_path, str) and (image_path.startswith('http://') or image_path.startswith('https://')):
        try:
            print(f"Downloading image from URL: {image_path}")
            import requests
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
    save_objects_to_db(objects, image_path, DB_PATH_DEFAULT)
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
            image_path = txt  

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
