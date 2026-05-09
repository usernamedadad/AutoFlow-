from pydantic import BaseModel, field_validator
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


# =============================================================================
# v3 Smart IR 模型 — AI 输出语义拓扑，后端负责布局和样式
# =============================================================================

class IRNode(BaseModel):
    """Smart IR 节点：AI 输出语义信息，可选提供布局提示。"""
    id: str
    type: Literal["rectangle", "ellipse", "diamond", "text"]
    label: str
    role: Optional[str] = None
    # 可选布局提示
    w: Optional[int] = None
    h: Optional[int] = None
    row: Optional[int] = None
    col: Optional[int] = None
    parent: Optional[str] = None
    emphasis: Optional[int] = None       # 1-3，视觉权重
    group: Optional[str] = None          # 视觉分组
    lane: Optional[str] = None           # 泳道分组
    children: Optional[List["IRNode"]] = None
    sub_edges: Optional[List[Dict[str, Any]]] = None

    @field_validator("emphasis")
    @classmethod
    def check_emphasis(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (1 <= v <= 3):
            raise ValueError("emphasis must be 1-3")
        return v


class IREdge(BaseModel):
    from_id: str
    to_id: str
    label: str = ""
    type: Literal["arrow", "line"] = "arrow"
    style: Optional[Literal["solid", "dashed", "dotted"]] = None


class SmartIR(BaseModel):
    """AI 输出的语义 IR，后端据此生成完整 Excalidraw 元素。"""
    chart_type: str
    nodes: List[IRNode]
    edges: List[IREdge] = []
    layout_hint: Optional[str] = None   # "horizontal"|"vertical"|"radial"|"grid"
    density: Optional[str] = None        # "compact"|"balanced"|"spacious"
    flow_style: Optional[str] = None     # "orthogonal"|"curved"|"straight"
    extra: Optional[Dict[str, Any]] = None  # 扩展字段