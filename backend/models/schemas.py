from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal

class FlowchartRequest(BaseModel):
    prompt: str
    mode: str = "text"
    output_format: str = "excalidraw"
    direction: Literal["TD", "LR"] = "TD"

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    flowchart_data: Optional[Dict[str, Any]] = None


class ChatEditRequest(BaseModel):
    graph_state: Optional[Dict[str, Any]] = None
    selection: Optional[List[Dict[str, Any]]] = None
    instruction: str
    mode: Literal["chat_incremental", "selection_edit"] = "chat_incremental"


class ProjectCreateRequest(BaseModel):
    name: Optional[str] = None
    last_mode: Optional[Literal["excalidraw", "mermaid"]] = "excalidraw"
    direction: Optional[Literal["TD", "LR"]] = "TD"


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    last_mode: Optional[Literal["excalidraw", "mermaid"]] = None
    direction: Optional[Literal["TD", "LR"]] = None
    excalidraw_data: Optional[Dict[str, Any]] = None
    mermaid_code: Optional[str] = None
    skeleton_elements: Optional[List[Dict[str, Any]]] = None
    prompt: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None