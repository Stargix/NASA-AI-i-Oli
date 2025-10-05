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
    PROMPT = """You are a specialized agent for detecting and analyzing spatial objects in astronomical images.

Database (table 'space_objects'):
- id, image_path, centroid_x, centroid_y, area, peak_brightness, total_brightness,
  compactness, background_contrast, obj_type, bbox_x, bbox_y, bbox_width, bbox_height,
  processing_timestamp

You have access to the following tools:
{tools}

Use ONLY these tools by name: {tool_names}

DETECTION MODE RULES:
1) If the input contains an 'IMAGE_PATH:' line, first call the `ingestar_imagen` tool.
2) For image analysis:
   - Use `ingestar_imagen` to process the image
   - Use `ejecutar_sql` to query results
3) Your job is to find objects in the database that match the user's description
4) Always use tools to query the database

SQL RULES:
1) Generate a SINGLE READ-ONLY query (SELECT/WITH) using EXCLUSIVELY the `space_objects` table.
2) For distances use squared distance (dist2), WITHOUT sqrt or POWER:
   ((o1.centroid_x - o2.centroid_x)*(o1.centroid_x - o2.centroid_x) +
    (o1.centroid_y - o2.centroid_y)*(o1.centroid_y - o2.centroid_y))
3) If "stars" are mentioned, assume obj_type='star' (otherwise, don't filter).
4) If the user doesn't request a limit, add LIMIT.
5) For object pairs:
   - Exclude pairs with dist2 = 0 (identical coordinates)
   - Don't repeat objects in different pairs
   - Use 'o1.id < o2.id' to avoid duplicates

RESPONSE FORMAT:
1) Always return EXACTLY the JSON result from the database query.
2) DO NOT execute additional queries after obtaining the result.

ReAct FORMAT:
Question: {input}
Thought: <Analyze what objects the user is looking for and construct the appropriate SQL query>
Action: <ingestar_imagen or ejecutar_sql>
Action Input: <tool arguments; if ejecutar_sql, pass the COMPLETE SQL>
Observation: <JSON result from the tool>
... (repeat if necessary)
Final Answer: <REPRODUCE EXACTLY the JSON from the last Observation>

{agent_scratchpad}
"""
    def __init__(self, connection: sqlite3.Connection, google_api_key: Optional[str] = None):
        """
        Initialize the Agent with a SQLite connection and an optional Google API key.
        
        Args:
            connection (sqlite3.Connection): Connection to the SQLite database
            google_api_key (Optional[str]): The Google API key for the ChatGoogleGenerativeAI model.
        """
        # Configurar API key explícitamente
        os.environ["GOOGLE_API_KEY"] = "AIzaSyCDpY_7pT52MOWxXTLsWDErwgp6u_3z19k"
        
        self.connection = connection
        # Configurar la función ejecutar_sql para usar la conexión
        def ejecutar_sql_with_connection(query: str) -> str:
            """Ejecuta una consulta SQL en la base de datos"""
            return ejecutar_sql(query)
        
        self.ejecutar_sql = ejecutar_sql_with_connection
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
        # Configurar la herramienta ejecutar_sql con el decorador tool
        from langchain_core.tools import Tool
        
        sql_tool = Tool(
            name="ejecutar_sql",
            func=self.ejecutar_sql,
            description="Ejecuta una consulta SQL en la base de datos de objetos espaciales"
        )

        tools = [sql_tool]

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
        Run a detection query through the agent and return results with bounding boxes.
        
        Args:
            user_query (str): The detection query to process.
            image_path (Optional[str]): Path to the image to process.
            
        Returns:
            Dict: Object details with bounding boxes from the database.
        """
        try:
            if image_path:
                user_query = f"IMAGE_PATH: {image_path}\n{user_query}"
            
            res = self.executor.invoke({"input": user_query})
            result = json.loads(res["output"])
            
            # Enrich with bounding boxes
            return self._enrich_objects(result)
                
        except Exception as e:
            return {
                "operation": "error",
                "query": user_query,
                "error": str(e)
            }

