# 1. Imagen base oficial de Python 3.12, versión liviana
FROM python:3.12-slim

# 2. Carpeta de trabajo dentro del contenedor
WORKDIR /app

# 3. Primero solo los requisitos: si no cambian, Docker reutiliza esta capa (CACHED)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Solo las carpetas que necesita la app (nunca el .env ni credenciales)
COPY app/ ./app/
COPY frontend/ ./frontend/
COPY models/ ./models/

# 5. Puerto en el que escucha la API
EXPOSE 8000

# 6. Comando de arranque: 0.0.0.0 para aceptar conexiones desde fuera del contenedor
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
