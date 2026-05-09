import asyncio
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from services.ai_service import AIService
import uvicorn

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    from config import DATA_DIR
    os.makedirs(DATA_DIR, exist_ok=True)
    logger.info("[AutoFlow] 后端启动预热开始...")

    async def warmup():
        ai_service = AIService()
        try:
            result = await ai_service._call_api(
                payload={
                    "messages": [
                        {"role": "user", "content": "ping"}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 10
                },
                timeout=30.0
            )
            if result.get("success"):
                logger.info("[AutoFlow] AI 服务预热成功")
            else:
                logger.warning(f"[AutoFlow] AI 服务预热返回非成功状态: {result.get('message', 'unknown')}")
        except Exception as e:
            logger.warning(f"[AutoFlow] AI 服务预热失败（不影响正常使用）: {e}")

    warmup_task = asyncio.create_task(warmup())

    yield

    warmup_task.cancel()
    logger.info("[AutoFlow] 后端服务关闭")

app = FastAPI(
    title="AutoFlow+ API",
    description="AI 驱动的流程图生成工具后端服务",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8000)