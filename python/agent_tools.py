
import sqlite3
import cv2
import os
import base64
import json
from typing import List, Dict, Optional


DB_PATH_DEFAULT = "space_objects.db"

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
    
    # Limpiar código SQL de comentarios y marcadores
    q_clean = ""
    for line in q_lower.split('\n'):
        # Eliminar comentarios SQL y marcadores
        line = line.split('--')[0].strip()
        if line.startswith('```') or line.endswith('```'):
            continue
        if line:
            q_clean += " " + line
    q_clean = q_clean.strip()

    # Verificar que es SELECT o WITH
    if not (q_clean.startswith("select") or q_clean.startswith("with")):
        return {"error": "Solo se permiten SELECT/WITH.", "sql": sql}

    # Verificar que no hay operaciones peligrosas
    dangerous_ops = ["insert", "update", "delete", "drop", "truncate", "alter"]
    for op in dangerous_ops:
        if f" {op} " in q_clean:
            return {"error": f"Operación no permitida: {op}", "sql": sql}
    
    # Buscar LIMIT de forma más robusta
    has_limit = any(
        # Patrones comunes de LIMIT al final de la consulta
        q_clean.endswith(pattern) or
        f"{pattern} " in q_clean or
        f"{pattern};" in q_clean
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



@tool("ejecutar_sql")
def ejecutar_sql(action_input: str) -> str:
    """
    Action Input (string):
      - SQL plano: "SELECT ... FROM space_objects ..." o "WITH ... AS (...) SELECT ..."
      - o JSON: {"sql":"SELECT/WITH ...","db_path":"space_objects.db","limit":200}
    Devuelve JSON: {"columns":[...], "rows":[...], "sql":"..."} o {"error":"..."}.
    
    Reglas SQL:
    1. Solo consultas SELECT o WITH...SELECT
    2. Consultas complejas deben usar WITH para CTEs
    3. No operaciones de modificación (INSERT/UPDATE/DELETE)
    4. LIMIT automático si no se especifica
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

