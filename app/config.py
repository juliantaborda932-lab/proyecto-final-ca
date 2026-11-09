"""
Configuración central de la aplicación.

Todas las credenciales se leen de variables de entorno:
  - En Codespaces: como *Codespaces secrets*.
  - En Docker: con `docker run -e ...` o `--env-file .env`. El token NUNCA
    se copia dentro de la imagen.
  - En local: en un archivo .env (que NUNCA se sube a GitHub).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Carga .env si existe (en la raíz del repositorio). No reemplaza
# variables que ya existan, así que los Codespaces secrets tienen prioridad.
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent   # raíz del repositorio


def _env(nombre: str, defecto: str = "") -> str:
    """Lee una variable de entorno y quita espacios y saltos de línea.

    Al copiar y pegar un secret es fácil que se cuele un salto de línea al
    final; sin este strip la URL o el token quedan inválidos.
    """
    return os.getenv(nombre, defecto).strip()

# --- InfluxDB 2.x -----------------------------------------------------------
INFLUX_URL = _env("INFLUX_URL")            # p.ej. https://us-east-1-1.aws.cloud2.influxdata.com
INFLUX_TOKEN = _env("INFLUX_TOKEN")
INFLUX_ORG = _env("INFLUX_ORG")
INFLUX_BUCKET = _env("INFLUX_BUCKET")

# Qué serie se consulta dentro del bucket
INFLUX_MEASUREMENT = _env("INFLUX_MEASUREMENT")   # p.ej. "sensores"
INFLUX_FIELD = _env("INFLUX_FIELD")               # p.ej. "temperatura"
# Filtro opcional por tag (p.ej. INFLUX_TAG_KEY=device, INFLUX_TAG_VALUE=esp32_01)
INFLUX_TAG_KEY = _env("INFLUX_TAG_KEY")
INFLUX_TAG_VALUE = _env("INFLUX_TAG_VALUE")

# --- Modelo -----------------------------------------------------------------
MODEL_PATH = Path(os.getenv("MODEL_PATH", BASE_DIR / "models" / "sarima_config.json"))

# Horas de historia que se le pasan al modelo para "ubicarlo" en el presente
# antes de pronosticar. Debe cubrir varias temporadas (s=24 -> mínimo ~3 días).
HORAS_CONTEXTO = int(os.getenv("HORAS_CONTEXTO", "336"))   # 14 días
MAX_HORAS_PREDICCION = int(os.getenv("MAX_HORAS_PREDICCION", "72"))

# --- Modo demo --------------------------------------------------------------
# Con DEMO_MODE=true la API genera datos sintéticos en lugar de consultar
# InfluxDB. Sirve para probar Codespaces + frontend antes de conectar la base.
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() in ("1", "true", "yes", "si", "sí")


def influx_configurado() -> bool:
    return all([INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET,
                INFLUX_MEASUREMENT, INFLUX_FIELD])
