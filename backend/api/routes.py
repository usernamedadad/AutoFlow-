from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from models.schemas import (
    ChatEditRequest,
    ProjectCreateRequest,
    ProjectUpdateRequest,
)
from services.ai_service import AIService
from services.project_service import ProjectService
from utils.env_utils import update_env_config
from config import DATA_DIR, LLM_API_KEY, LLM_MODEL_ID, LLM_BASE_URL, LLM_MAX_TOKENS
import os
import re
import asyncio
import base64
import logging
import httpx
from datetime import datetime
from typing import Any, Dict

logger = logging.getLogger(__name__)

router = APIRouter()
ai_service = AIService()
project_service = ProjectService()


def _error(message: str, key: str = "data") -> Dict[str, Any]:
    return {"success": False, key: None, "message": message}


def _sanitize_filename(filename: str) -> str:
    """保留字母数字、中文、下划线、点、短横线，其余替换为下划线。"""
    name, ext = os.path.splitext(filename)
    name = re.sub(r"[^\w一-鿿.-]", "_", name)
    ext = re.sub(r"[^\w.]", "_", ext)
    return f"{name}{ext}"


@router.post("/api/chat/edit")
async def chat_edit(request: ChatEditRequest) -> Dict[str, Any]:
    try:
        if request.mode == "selection_edit" and request.selection:
            direction = request.graph_state.get("layout", {}).get("direction", "TD") if request.graph_state else "TD"
            graph_state = {"nodes": request.selection, "edges": [], "layout": {"direction": direction, "canvasWidth": 1200, "canvasHeight": 800}}
        elif request.graph_state:
            graph_state = request.graph_state
        else:
            raise HTTPException(status_code=400, detail="需要 graph_state 或 selection")

        result = await ai_service.chat_edit(
            graph_state=graph_state,
            instruction=request.instruction,
            mode=request.mode,
        )

        if result["success"]:
            return {
                "success": True,
                "data": result["data"],
                "message": result["message"],
            }
        else:
            return _error(result.get("message", "增量编辑失败"))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"增量编辑错误: {str(e)}")


@router.post("/api/recognize-image")
async def recognize_image(file: UploadFile = File(...)) -> Dict[str, Any]:
    try:
        content = await file.read()

        upload_dir = os.path.join(DATA_DIR, "uploads")
        os.makedirs(upload_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = _sanitize_filename(file.filename or "upload.png")
        filename = f"{timestamp}_{safe_name}"
        filepath = os.path.join(upload_dir, filename)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: _write_file_sync(filepath, content))

        image_base64 = base64.b64encode(content).decode("utf-8")
        result = await ai_service.recognize_image(image_base64)

        if result["success"]:
            return {
                "success": True,
                "data": result["data"],
                "message": result["message"],
            }
        else:
            return _error(result.get("message", "图片识别失败"))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"识别失败: {str(e)}")


def _write_file_sync(filepath: str, content: bytes) -> None:
    with open(filepath, "wb") as f:
        f.write(content)


@router.post("/api/generate-flowchart")
async def generate_flowchart(data: Dict[str, Any]) -> Dict[str, Any]:
    """Mermaid 模式图表生成（非流式）。"""
    prompt = data.get("prompt", "")
    direction_mode = data.get("direction_mode", "TD")
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="prompt 不能为空")

    result = await ai_service._generate_mermaid(prompt, direction_mode)
    if result["success"]:
        return {
            "success": True,
            "data": result["data"],
            "message": result["message"],
        }
    else:
        return _error(result.get("message", "生成失败"))


@router.get("/api/projects")
def list_projects() -> Dict[str, Any]:
    try:
        projects = project_service.list_projects()
        return {
            "success": True,
            "data": projects,
            "message": "项目列表获取成功",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取项目列表失败: {str(e)}")


@router.post("/api/projects")
def create_project(request: ProjectCreateRequest) -> Dict[str, Any]:
    try:
        project = project_service.create_project(request.name, request.last_mode, request.direction)
        return {
            "success": True,
            "data": project,
            "message": "项目创建成功",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建项目失败: {str(e)}")


@router.get("/api/projects/{project_id}")
def get_project(project_id: str) -> Dict[str, Any]:
    try:
        project = project_service.get_project(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="项目不存在")
        return {
            "success": True,
            "data": project,
            "message": "项目详情获取成功",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取项目失败: {str(e)}")


@router.patch("/api/projects/{project_id}")
def update_project(project_id: str, request: ProjectUpdateRequest) -> Dict[str, Any]:
    try:
        updates = request.model_dump(exclude_unset=True)
        project = project_service.update_project(project_id, updates)
        if project is None:
            raise HTTPException(status_code=404, detail="项目不存在")
        return {
            "success": True,
            "data": project,
            "message": "项目更新成功",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新项目失败: {str(e)}")


@router.delete("/api/projects")
def delete_all_projects() -> Dict[str, Any]:
    try:
        count = project_service.delete_all_projects()
        return {
            "success": True,
            "data": {"deleted_count": count},
            "message": f"已删除 {count} 个项目",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除项目失败: {str(e)}")


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: str) -> Dict[str, Any]:
    try:
        removed = project_service.delete_project(project_id)
        if removed is None:
            raise HTTPException(status_code=404, detail="项目不存在")
        return {
            "success": True,
            "data": {"id": removed.get("id")},
            "message": "项目删除成功",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除项目失败: {str(e)}")


@router.get("/api/health")
async def health_check() -> Dict[str, str]:
    return {"status": "healthy", "service": "AutoFlow+ API"}


@router.get("/api/config/llm")
async def get_llm_config() -> Dict[str, Any]:
    return {
        "model_id": LLM_MODEL_ID,
        "base_url": LLM_BASE_URL,
        "has_api_key": bool(LLM_API_KEY),
    }


@router.post("/api/config/llm")
async def save_llm_config(data: Dict[str, Any]) -> Dict[str, Any]:
    try:
        update_env_config(data)
        ai_service.reload_config()
        return {
            "success": True,
            "message": "配置已保存并立即生效",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


# ── v2.5 流式透传端点 ─────────────────────────────────

@router.post("/api/chat/stream")
async def chat_stream(data: Dict[str, Any]):
    """LLM 流式透传代理。

    唯一职责：接收 messages → 注入 API Key → fetch LLM stream → SSE 透传。
    不做任何校验、修复、重试、兜底。
    """
    messages = data.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="messages required")

    async def event_stream():
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            async with client.stream(
                "POST",
                f"{LLM_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL_ID,
                    "messages": messages,
                    "max_tokens": LLM_MAX_TOKENS,
                    "stream": True,
                },
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        yield f"{line}\n"
                yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
