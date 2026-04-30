from typing import Any, Dict, List, Optional
from utils.project_utils import (
    _load_projects,
    _save_projects,
    _find_project_index,
    _build_new_project,
    _now_iso,
)


class ProjectService:
    def list_projects(self) -> List[Dict[str, Any]]:
        projects = _load_projects()
        projects.sort(key=lambda item: item.get("updatedAt", ""), reverse=True)
        return projects

    def create_project(
        self,
        name: Optional[str] = None,
        last_mode: Optional[str] = "excalidraw",
        direction: Optional[str] = "TD",
    ) -> Dict[str, Any]:
        projects = _load_projects()
        project = _build_new_project(name, last_mode, direction)
        projects.append(project)
        _save_projects(projects)
        return project

    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        projects = _load_projects()
        project_index = _find_project_index(projects, project_id)
        if project_index is not None:
            return projects[project_index]
        return None

    def update_project(
        self,
        project_id: str,
        updates: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        projects = _load_projects()
        project_index = _find_project_index(projects, project_id)

        if project_index is None:
            return None

        project = projects[project_index]

        if "name" in updates:
            next_name = (updates.get("name") or "").strip()
            if next_name:
                project["name"] = next_name

        if "last_mode" in updates and updates.get("last_mode"):
            project["lastMode"] = updates.get("last_mode")

        if "direction" in updates and updates.get("direction"):
            project["direction"] = updates.get("direction")

        if "excalidraw_data" in updates:
            project["excalidrawData"] = updates.get("excalidraw_data") or {"elements": []}

        if "mermaid_code" in updates:
            project["mermaidCode"] = updates.get("mermaid_code") or ""

        if "skeleton_elements" in updates:
            project["skeletonElements"] = updates.get("skeleton_elements") or []

        if "prompt" in updates:
            project["prompt"] = updates.get("prompt") or ""

        if "messages" in updates:
            project["messages"] = updates.get("messages") or []

        project["updatedAt"] = _now_iso()
        projects[project_index] = project
        _save_projects(projects)
        return project

    def delete_all_projects(self) -> int:
        projects = _load_projects()
        count = len(projects)
        _save_projects([])
        return count

    def delete_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        projects = _load_projects()
        project_index = _find_project_index(projects, project_id)

        if project_index is None:
            return None

        removed = projects.pop(project_index)
        _save_projects(projects)
        return removed
