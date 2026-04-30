import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4
from config import DATA_DIR

PROJECTS_FILE = os.path.join(DATA_DIR, "projects.json")


def _now_iso() -> str:
    return datetime.now().isoformat()


def _default_project_name() -> str:
    return datetime.now().strftime("Untitled-%Y%m%d-%H%M%S")


def _load_projects() -> List[Dict[str, Any]]:
    if not os.path.exists(PROJECTS_FILE):
        return []

    try:
        with open(PROJECTS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception:
        return []

    return []


def _save_projects(projects: List[Dict[str, Any]]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(PROJECTS_FILE, "w", encoding="utf-8") as f:
        json.dump(projects, f, ensure_ascii=False, indent=2)


def _find_project_index(projects: List[Dict[str, Any]], project_id: str) -> Optional[int]:
    for idx, project in enumerate(projects):
        if project.get("id") == project_id:
            return idx
    return None


def _build_new_project(
    name: Optional[str],
    last_mode: Optional[str] = "excalidraw",
    direction: Optional[str] = "TD",
) -> Dict[str, Any]:
    now = _now_iso()
    project_name = (name or "").strip() or _default_project_name()

    return {
        "id": f"proj_{uuid4().hex[:12]}",
        "name": project_name,
        "createdAt": now,
        "updatedAt": now,
        "direction": direction or "TD",
        "lastMode": last_mode or "excalidraw",
        "prompt": "",
        "excalidrawData": {"elements": []},
        "mermaidCode": "",
        "messages": [],
        "skeletonElements": [],
    }
