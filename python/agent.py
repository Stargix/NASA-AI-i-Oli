# agent.py
import os
import json
import sqlite3
from typing import Optional, Dict
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain.prompts import PromptTemplate
from agent_tools import ejecutar_sql

class Agent:
    PROMPT = """Eres un agente especializado en analizar objetos espaciales en imágenes astronómicas.

Base de datos (tabla 'space_objects'):
- id, image_path, centroid_x, centroid_y, area, peak_brightness, total_brightness,
  compactness, background_contrast, obj_type, bbox_x, bbox_y, bbox_width, bbox_height,
  processing_timestamp

Tienes acceso a las siguientes herramientas:
{tools}

Usa SOLO estas herramientas por nombre: {tool_names}

REGLAS GENERALES:
1) Si el input contiene una línea 'IMAGE_PATH:', llama primero a la herramienta `ingestar_imagen`.
2) Para análisis de imagen:
   - Usa `ingestar_imagen` para procesar la imagen
   - Usa `ejecutar_sql` para consultar resultados

REGLAS SQL:
1) Genera UNA SOLA consulta SOLO-LECTURA (SELECT/WITH) usando EXCLUSIVAMENTE la tabla `space_objects`.
2) Para distancias usa la distancia al cuadrado (dist2), SIN sqrt ni POWER:
   ((o1.centroid_x - o2.centroid_x)*(o1.centroid_x - o2.centroid_x) +
    (o1.centroid_y - o2.centroid_y)*(o1.centroid_y - o2.centroid_y))
3) Si mencionan "estrellas", asume obj_type='star' (si no, no filtres).
4) Si el usuario no pide límite, añade LIMIT.
5) Para pares de objetos:
   - Excluye parejas con dist2 = 0 (coordenadas idénticas)
   - No repitas objetos en distintas parejas
   - Usa 'o1.id < o2.id' para evitar duplicados

FORMATO DE RESPUESTA:
1) Para análisis SQL: devuelve EXACTAMENTE el JSON resultante.
2) NO ejecutes consultas adicionales después de obtener el resultado.

FORMATO ReAct:
Question: {input}
Thought: <razona si debes ingestar y qué SQL necesitas construir>
Action: <ingestar_imagen o ejecutar_sql>
Action Input: <argumentos de la tool; si es ejecutar_sql, pasa el SQL COMPLETO>
Observation: <resultado JSON de la tool>
... (repite si es necesario)
Final Answer: <REPRODUCE EXACTAMENTE el JSON del último Observation>

{agent_scratchpad}
"""
    def __init__(self, connection: sqlite3.Connection, google_api_key: Optional[str] = None):
        """
        Initialize the Agent with a SQLite connection and an optional Google API key.
        
        Args:
            connection (sqlite3.Connection): Connection to the SQLite database
            google_api_key (Optional[str]): The Google API key for the ChatGoogleGenerativeAI model.
        """
        if google_api_key:
            os.environ["GOOGLE_API_KEY"] = google_api_key
        elif not os.getenv("GOOGLE_API_KEY"):
            raise ValueError("Falta GOOGLE_API_KEY en el entorno.")
        
        self.connection = connection
        self.ejecutar_sql = lambda x: ejecutar_sql(x, connection)
        self.executor = self._build_agent()

    def _build_agent(self) -> AgentExecutor:
        """
        Build the agent with the configured LLM and tools.
        
        Returns:
            AgentExecutor: The configured agent executor.
        """
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0
        )
        prompt = PromptTemplate(
            template=self.PROMPT,
            input_variables=["input", "agent_scratchpad", "tools", "tool_names"],
            validate_template=False 
        )

        # Creamos una lista de herramientas donde ejecutar_sql está enlazado a nuestra conexión
        tools = [self.ejecutar_sql]

        agent = create_react_agent(
            llm=llm,
            tools=tools,
            prompt=prompt,
        )

        return AgentExecutor.from_agent_and_tools(
            agent=agent,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=10,
            early_stopping_method="force",  
        )

    def _enrich_objects(self, result: Dict) -> Dict:
        """
        Obtiene los detalles de los objetos y los formatea según StarResponseSchema.
        
        Args:
            result (Dict): El resultado de la consulta original que contiene IDs de objetos
            
        Returns:
            Dict: Un diccionario con una lista de BoundingBoxSchema compatible
        """
        if not result or "rows" not in result:
            return {"bounding_box_list": []}
            
        ids = set()
        for row in result["rows"]:
            for key, value in row.items():
                if isinstance(value, (int, str)) and "id" in key.lower():
                    ids.add(str(value))
        
        if not ids:
            return {"bounding_box_list": []}
          
        # Obtener detalles completos de los objetos
        details_query = f"""
        SELECT id, centroid_x, centroid_y, color, obj_type,
               bbox_x, bbox_y, bbox_width, bbox_height
        FROM space_objects
        WHERE id IN ({','.join(ids)})
        """
        
        details_res = json.loads(self.ejecutar_sql(details_query))
        if "error" in details_res or "rows" not in details_res:
            return {"bounding_box_list": []}
            
        # Convertir cada objeto al formato BoundingBoxSchema
        bounding_boxes = []
        for row in details_res["rows"]:
            # El centro según el schema debe ser (RA, Dec), pero usaremos centroid por ahora
            center = (
                row["centroid_x"] if row["centroid_x"] is not None else row["bbox_x"] + row["bbox_width"]/2,
                row["centroid_y"] if row["centroid_y"] is not None else row["bbox_y"] + row["bbox_height"]/2
            )
            
            bounding_boxes.append({
                "center": center,
                "height": row["bbox_height"],
                "width": row["bbox_width"],
                "color": row["color"],
                "obj_type": row["obj_type"]
            })
            
        return {"bounding_box_list": bounding_boxes}
    def run_query(self, user_query: str, image_path: Optional[str] = None) -> Dict:
        """
        Run a query through the agent and return results.
        
        Args:
            user_query (str): The query to process.
            image_path (Optional[str]): Path to the image to process.
            
        Returns:
            Dict: Object details from the database.
        """
        try:
            if image_path:
                user_query = f"IMAGE_PATH: {image_path}\n{user_query}"
            
            res = self.executor.invoke({"input": user_query})
            result = json.loads(res["output"])
            
            return self._enrich_objects(result)
                
        except Exception as e:
            return {
                "operation": "error",
                "query": user_query,
                "error": str(e)
            }

