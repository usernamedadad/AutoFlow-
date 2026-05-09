import os
from dotenv import load_dotenv

load_dotenv()

LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL_ID = os.getenv("LLM_MODEL_ID", "qwen-plus")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
try:
    LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "16000"))
except ValueError:
    LLM_MAX_TOKENS = 16000

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
