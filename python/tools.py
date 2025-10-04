import cv2
from no_nonsense_function import process_image
from schema import BoundingBoxSchema
import sqlite3, json, cv2
from typing import List, Dict, Optional
from no_nonsense_function import process_image, extract_properties_fast  

def extract_boxes_from_image(image_path, top_left=(0,0), bottom_right=None, **kwargs):
    """
    Procesa una imagen y devuelve una lista de cajas detectadas.
    Cada caja es un diccionario con: center_x, center_y, width, height.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"No se pudo cargar la imagen: {image_path}")

    if bottom_right is None:
        bottom_right = (img.shape[1], img.shape[0])

    x1, y1 = top_left
    x2, y2 = bottom_right
    cropped = img[y1:y2, x1:x2]

    large_mask, labels, stats = process_image(cropped, **kwargs)
    boxes = []
    x_offset, y_offset = top_left
    for i in range(1, stats.shape[0]):
        x, y, w, h, area = stats[i]
        center_x = x + w / 2 + x_offset
        center_y = y + h / 2 + y_offset
        boxes.append(
            BoundingBoxSchema(
                center=(float(center_x), float(center_y)),
                width=int(w),
                height=int(h)
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
    q = sql.strip().lower()
    if not (q.startswith("select") or q.startswith("with")):
        return {"error": "Solo se permiten SELECT/WITH.", "sql": sql}
    if " limit " not in q:
        sql = sql.rstrip().rstrip(";") + f" LIMIT {limit}"
    con = sqlite3.connect(db_path); cur = con.cursor()
    cur.execute(sql); cols = [c[0] for c in cur.description] if cur.description else []
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    con.close()
    return {"columns": cols, "rows": rows, "sql": sql}

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
