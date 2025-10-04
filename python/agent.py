import os
import json
from typing import Optional, Dict
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain.prompts import PromptTemplate
from tools import ingestar_imagen, ejecutar_sql  

class Agent:
    PROMPT = """Eres un agente NL a SQL especializado en analizar objetos espaciales en imágenes astronómicas.

Base de datos (tabla 'space_objects'):
- id, image_path, centroid_x, centroid_y, area, peak_brightness, total_brightness,
  compactness, background_contrast, obj_type, processing_timestamp

Tienes acceso a las siguientes herramientas:
{tools}

Usa SOLO estas herramientas por nombre: {tool_names}

REGLAS:
1) Si el input contiene una línea 'IMAGE_PATH:', llama primero a la herramienta `ingestar_imagen` y espera su respuesta antes de continuar.
2) Genera UNA SOLA consulta SOLO-LECTURA (SELECT/WITH) usando EXCLUSIVAMENTE la tabla `space_objects`.
3) Para distancias usa la distancia al cuadrado (dist2), SIN sqrt ni POWER:
   ((o1.centroid_x - o2.centroid_x)*(o1.centroid_x - o2.centroid_x) +
    (o1.centroid_y - o2.centroid_y)*(o1.centroid_y - o2.centroid_y))
4) Si mencionan "estrellas", asume obj_type='star' (si no, no filtres).
5) Si el usuario no pide límite, añade LIMIT.
6) Para pares de objetos:
   - Excluye parejas con dist2 = 0 (coordenadas idénticas)
   - No repitas objetos en distintas parejas
   - Usa 'o1.id < o2.id' para evitar duplicados
7) Después de ejecutar la consulta SQL, devuelve EXACTAMENTE el JSON resultante como respuesta final.
8) NO ejecutes consultas adicionales después de obtener el resultado solicitado.

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
    def __init__(self, google_api_key: Optional[str] = None):
        """
        Initialize the Agent with an optional Google API key.
        
        Args:
            google_api_key (Optional[str]): The Google API key for the ChatGoogleGenerativeAI model.
        """
        if google_api_key:
            os.environ["GOOGLE_API_KEY"] = google_api_key
        elif not os.getenv("GOOGLE_API_KEY"):
            raise ValueError("Falta GOOGLE_API_KEY en el entorno.")
        
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

        agent = create_react_agent(
            llm=llm,
            tools=[ingestar_imagen, ejecutar_sql],
            prompt=prompt,
        )

        return AgentExecutor.from_agent_and_tools(
            agent=agent,
            tools=[ingestar_imagen, ejecutar_sql],
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=10,
            early_stopping_method="force",  
        )

    def run_query(self, user_query: str, image_path: Optional[str] = None) -> Dict:
        """
        Run a query through the agent.
        
        Args:
            user_query (str): The query to process.
            image_path (Optional[str]): Optional path to an image to process.
            
        Returns:
            Dict: The query results as a dictionary.
        """
        if image_path:
            user_query = f"IMAGE_PATH: {image_path}\n{user_query}"
        res = self.executor.invoke({"input": user_query})
        try:
            return json.loads(res["output"])
        except Exception:
            return {"raw_output": res.get("output", "")}
