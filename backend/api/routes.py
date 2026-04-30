from fastapi import APIRouter, HTTPException, UploadFile, File
from models.schemas import (
    FlowchartRequest,
    ChatRequest,
    ProjectCreateRequest,
    ProjectUpdateRequest,
)
from services.ai_service import AIService
from services.project_service import ProjectService
from utils.env_utils import update_env_config
from config import DATA_DIR, LLM_API_KEY, LLM_MODEL_ID, LLM_BASE_URL
import os
import base64
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()
ai_service = AIService()
project_service = ProjectService()


@router.post("/api/generate-flowchart")
async def generate_flowchart(request: FlowchartRequest):
    logger.info(f"generate_flowchart request: prompt={request.prompt[:50]}..., format={request.output_format}, direction={request.direction}")
    try:
        result = await ai_service.generate_flowchart(
            request.prompt,
            request.output_format,
            request.direction,
        )

        if result["success"]:
            logger.info("generate_flowchart success")
            return {
                "success": True,
                "data": result["data"],
                "message": result["message"]
            }
        else:
            logger.warning(f"generate_flowchart failed: {result.get('message')}")
            raise HTTPException(status_code=500, detail=result.get("message", "生成流程图失败"))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in generate_flowchart route: {e}")
        raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")


@router.post("/api/chat")
async def chat(request: ChatRequest):
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    result = await ai_service.chat(messages, request.flowchart_data)

    if result["success"]:
        return {
            "success": True,
            "content": result["content"],
            "message": result["message"]
        }
    else:
        raise HTTPException(status_code=500, detail=result["message"])


@router.post("/api/recognize-image")
async def recognize_image(file: UploadFile = File(...)):
    try:
        content = await file.read()

        upload_dir = os.path.join(DATA_DIR, "uploads")
        os.makedirs(upload_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{file.filename}"
        filepath = os.path.join(upload_dir, filename)

        with open(filepath, "wb") as f:
            f.write(content)

        image_base64 = base64.b64encode(content).decode('utf-8')
        result = await ai_service.recognize_image(image_base64)

        if result["success"]:
            return {
                "success": True,
                "data": result["data"],
                "message": result["message"]
            }
        else:
            raise HTTPException(status_code=500, detail=result["message"])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"识别失败: {str(e)}")


@router.post("/api/save-flowchart")
async def save_flowchart(data: dict):
    try:
        save_dir = os.path.join(DATA_DIR, "flowcharts")
        os.makedirs(save_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"flowchart_{timestamp}.json"
        filepath = os.path.join(save_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            import json
            json.dump(data, f, ensure_ascii=False, indent=2)

        return {
            "success": True,
            "message": "保存成功",
            "filepath": filepath
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@router.get("/api/projects")
def list_projects():
    projects = project_service.list_projects()
    return {
        "success": True,
        "data": projects,
        "message": "项目列表获取成功",
    }


@router.post("/api/projects")
def create_project(request: ProjectCreateRequest):
    project = project_service.create_project(request.name, request.last_mode, request.direction)
    return {
        "success": True,
        "data": project,
        "message": "项目创建成功",
    }


@router.get("/api/projects/{project_id}")
def get_project(project_id: str):
    project = project_service.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return {
        "success": True,
        "data": project,
        "message": "项目详情获取成功",
    }


@router.patch("/api/projects/{project_id}")
def update_project(project_id: str, request: ProjectUpdateRequest):
    updates = request.model_dump(exclude_unset=True)
    project = project_service.update_project(project_id, updates)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return {
        "success": True,
        "data": project,
        "message": "项目更新成功",
    }


@router.delete("/api/projects")
def delete_all_projects():
    count = project_service.delete_all_projects()
    return {
        "success": True,
        "data": {"deleted_count": count},
        "message": f"已删除 {count} 个项目",
    }


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    removed = project_service.delete_project(project_id)
    if removed is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return {
        "success": True,
        "data": {"id": removed.get("id")},
        "message": "项目删除成功",
    }


@router.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "AutoFlow+ API"}


@router.get("/api/config/llm")
async def get_llm_config():
    return {
        "api_key": LLM_API_KEY[:8] + "..." if len(LLM_API_KEY) > 8 else "",
        "model_id": LLM_MODEL_ID,
        "base_url": LLM_BASE_URL,
        "has_api_key": bool(LLM_API_KEY),
    }


@router.post("/api/config/llm")
async def save_llm_config(data: dict):
    try:
        update_env_config(data)
        ai_service.reload_config()

        return {
            "success": True,
            "message": "配置已保存并立即生效"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")
