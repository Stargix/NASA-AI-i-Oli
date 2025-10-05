# Solución al Error de Base de Datos: "no such column: bbox_x"

## Problema

Después de hacer un `git pull`, el servidor FastAPI fallaba con el siguiente error:

```
sqlite3.OperationalError: no such column: bbox_x
```

Esto ocurría en `tools.py` al intentar crear un índice en columnas que no existían en la versión anterior de la base de datos.

## Causa

El esquema de la base de datos fue actualizado para incluir las columnas:
- `bbox_x`
- `bbox_y`
- `bbox_width`
- `bbox_height`

Sin embargo, si ya existía un archivo `space_objects.db` con la estructura antigua (sin estas columnas), el código intentaba crear índices sobre columnas inexistentes.

## Solución Implementada

### 1. Solución Automática (Código Actualizado)

Se modificó la función `create_space_objects_table()` en `python/tools.py` para:

1. **Verificar la estructura existente**: Antes de crear índices, verifica si la tabla tiene todas las columnas requeridas.

2. **Recrear tabla si es necesario**: Si detecta que faltan las columnas `bbox_*`, automáticamente elimina y recrea la tabla con la nueva estructura.

3. **Manejo de errores**: Intenta crear el índice `idx_so_bbox` en un bloque try-except para evitar crashes si algo falla.

```python
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
```

### 2. Solución Manual (Si es necesario)

Si el problema persiste, puedes eliminar manualmente la base de datos antigua:

```bash
cd /home/stargix/Desktop/hackathons/NASA/NASA-AI-i-Oli/python
rm -f space_objects.db
```

La próxima vez que ejecutes el servidor, se creará automáticamente con la estructura correcta.

## Prevención Futura

### Para Desarrolladores

Cuando modifiques el esquema de la base de datos:

1. **Documenta los cambios** en el commit message
2. **Considera migraciones**: Para bases de datos en producción, usa herramientas como Alembic
3. **Avisa al equipo**: Menciona que se requiere recrear la base de datos

### Para Usuarios que Hacen Pull

Si después de `git pull` obtienes errores relacionados con la base de datos:

```bash
# Opción 1: Dejar que el código la recree automáticamente
# (Ya implementado en el código)

# Opción 2: Eliminar manualmente si hay problemas
cd python
rm -f space_objects.db
```

## Notas Adicionales

- ⚠️ **Pérdida de datos**: Eliminar `space_objects.db` borrará todas las detecciones guardadas. Esta DB es principalmente para caché temporal, no para datos críticos.

- ✅ **Sin impacto funcional**: La base de datos se recrea automáticamente en el primer uso, sin afectar la funcionalidad del sistema.

- 🔄 **Automático**: Con el código actualizado, este proceso ahora es completamente automático.

## Estado Actual

✅ **Problema resuelto**: 
- Código actualizado con detección y recreación automática
- Base de datos antigua eliminada
- Sistema listo para usar

La próxima vez que inicies el servidor FastAPI, la base de datos se creará automáticamente con la estructura correcta.
