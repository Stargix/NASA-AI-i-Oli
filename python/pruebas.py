import requests
import base64

# Cambia esto si tu API corre en otro puerto o dirección
API_URL = "http://localhost:8000/star_analysis"

# Ejemplo de datos de prueba
data = {
    "image": "C:/Natalia/Trabajo/Estudios/5_Inteligencia_Artificial/NASA_2025/image.png",  # Cambia por una ruta válida en tu sistema
    "top_left": [100, 100],
    "bottom_right": [500, 500]
}

response = requests.post(API_URL, json=data)
print("Status code:", response.status_code)
print("Respuesta JSON:")
print(response.json())

# def fake_base64_image(text):
#     # Simula una imatge codificada en base64 (només per a proves)
#     return f"data:image/png;base64,{base64.b64encode(text.encode()).decode()}"

# API_URL = "http://localhost:8000/chat"

# # 1. Prova amb text i diverses imatges
# data1 = {
#     "message": "Aquest és el meu text amb imatges",
#     "images": [
#         fake_base64_image("imatge1"),
#         fake_base64_image("imatge2"),
#         fake_base64_image("imatge3"),
#     ]
# }
# response1 = requests.post(API_URL, json=data1)
# print("Prova 1 - Text i diverses imatges")
# print("Status code:", response1.status_code)
# print("Resposta JSON:", response1.json())
# print()

# # 2. Prova només amb imatges (sense text)
# data2 = {
#     "message": "",
#     "images": [
#         fake_base64_image("imatgeA"),
#         fake_base64_image("imatgeB"),
#     ]
# }
# response2 = requests.post(API_URL, json=data2)
# print("Prova 2 - Només imatges")
# print("Status code:", response2.status_code)
# print("Resposta JSON:", response2.json())