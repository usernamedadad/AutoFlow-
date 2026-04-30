"""Excalidraw skeleton 相关工具函数。

负责从 LLM 原始回复中提取 Excalidraw Skeleton JSON 数组、结构校验、
零宽高修复，以及最重要的——**自动布局（Auto-Layout）**。

自动布局是效果保障的核心：LLM 不擅长空间推理，生成的坐标往往重叠、
错位。本模块通过拓扑分析+网格布局算法，在 AI 输出后重新计算所有元素的
合理坐标，确保图表美观、箭头正确、无重叠。
"""

import json
import math
import re
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional, Tuple


def extract_json_array(content: str) -> Optional[List[Dict[str, Any]]]:
    """从 LLM 回复中提取 JSON 数组。

    支持三种输入形式：
      1. 带 markdown 代码块包裹：```json\n[...]\n``` 或 ```\n[...]\n```
      2. 纯 JSON 数组：[...]
      3. 混入说明文字，但包含完整的 [ ... ] 片段

    解析失败返回 None。
    """
    if not content:
        return None

    text = content.strip()

    # 1) markdown code block
    block_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", text)
    if block_match:
        text = block_match.group(1).strip()

    # 2) 直接尝试解析
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("elements"), list):
            return data["elements"]
    except json.JSONDecodeError:
        pass

    # 3) 回退：从原始内容中抓第一个 [ ... ] 片段
    array_match = re.search(r"\[[\s\S]*\]", text)
    if array_match:
        try:
            data = json.loads(array_match.group(0))
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            return None

    return None


def validate_skeleton(elements: Any) -> Tuple[bool, str]:
    """校验 skeleton 元素数组结构。

    规则（参考 @excalidraw/excalidraw 要求）：
      - 顶层必须是数组
      - 每个元素必须是对象且含 `type` 字段
      - 每个元素必须有数值型 `x` 和 `y`
      - 若有 `width`/`height` 必须是数值
      - arrow/line 的 start/end 若存在，必须是包含 id 的对象

    返回 (is_valid, error_message)。
    """
    if not isinstance(elements, list):
        return False, "顶层必须是 JSON 数组"
    if len(elements) == 0:
        return False, "元素数组为空"

    for idx, el in enumerate(elements):
        if not isinstance(el, dict):
            return False, f"索引 {idx} 不是对象"

        el_type = el.get("type")
        if not isinstance(el_type, str) or not el_type:
            return False, f"索引 {idx} 缺少 type 字段"

        x = el.get("x")
        y = el.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return False, f"索引 {idx} 的 x/y 坐标无效"

        for dim_key in ("width", "height"):
            if dim_key in el and not isinstance(el[dim_key], (int, float)):
                return False, f"索引 {idx} 的 {dim_key} 不是数值"

        if el_type in ("arrow", "line"):
            for endpoint_key in ("start", "end"):
                endpoint = el.get(endpoint_key)
                if endpoint is not None:
                    if not isinstance(endpoint, dict):
                        return False, f"索引 {idx} 的 {endpoint_key} 不是对象"
                    # id 允许缺省（自由箭头），有则必须是字符串
                    if "id" in endpoint and not isinstance(endpoint["id"], str):
                        return False, f"索引 {idx} 的 {endpoint_key}.id 不是字符串"

    return True, ""


def fix_zero_dimensions(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """修复 arrow/line 元素宽高为 0 导致的渲染异常。

    Excalidraw 官方在 width===0 或 height===0 时渲染会出现问题，
    统一将零值改为 1。
    """
    fixed: List[Dict[str, Any]] = []
    for el in elements:
        if not isinstance(el, dict):
            fixed.append(el)
            continue

        if el.get("type") in ("arrow", "line"):
            width = el.get("width")
            height = el.get("height")
            needs_fix = width == 0 or height == 0
            if needs_fix:
                patched = dict(el)
                if patched.get("width") == 0:
                    patched["width"] = 1
                if patched.get("height") == 0:
                    patched["height"] = 1
                fixed.append(patched)
                continue

        fixed.append(el)
    return fixed


# =============================================================================
# Skeleton 容错加固（normalize_skeleton）
# =============================================================================


def _levenshtein(a: str, b: str, limit: int = 3) -> int:
    """简洁的 Levenshtein 距离，限于小字符串模糊匹配。limit 内提前返回。"""
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if abs(la - lb) > limit:
        return limit + 1
    if la == 0:
        return lb
    if lb == 0:
        return la
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        curr = [i] + [0] * lb
        min_in_row = curr[0]
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[j] = min(
                curr[j - 1] + 1,
                prev[j] + 1,
                prev[j - 1] + cost,
            )
            if curr[j] < min_in_row:
                min_in_row = curr[j]
        if min_in_row > limit:
            return limit + 1
        prev = curr
    return prev[lb]


def _fuzzy_match_id(target: str, candidates: List[str], max_dist: int = 2) -> Optional[str]:
    """在候选 id 列表中找 Levenshtein 距离 ≤ max_dist 的最近者。"""
    if not target or not candidates:
        return None
    best = None
    best_dist = max_dist + 1
    for c in candidates:
        if not c:
            continue
        d = _levenshtein(target, c, limit=max_dist)
        if d < best_dist:
            best_dist = d
            best = c
            if best_dist == 0:
                break
    return best if best_dist <= max_dist else None


def _shape_bounds(el: Dict[str, Any]) -> Tuple[float, float, float, float]:
    """返回 shape 的 (x1, y1, x2, y2) 边界。"""
    x = float(el.get("x", 0) or 0)
    y = float(el.get("y", 0) or 0)
    w = float(el.get("width", 0) or 0)
    h = float(el.get("height", 0) or 0)
    return x, y, x + w, y + h


def _arrow_midpoint(arrow: Dict[str, Any]) -> Tuple[float, float]:
    """粗略估算箭头中点（用于孤立 text 吸附判定）。"""
    x = float(arrow.get("x", 0) or 0)
    y = float(arrow.get("y", 0) or 0)
    w = float(arrow.get("width", 0) or 0)
    h = float(arrow.get("height", 0) or 0)
    return x + w / 2, y + h / 2


def _point_in_rect(px: float, py: float, rect: Tuple[float, float, float, float]) -> bool:
    x1, y1, x2, y2 = rect
    return x1 <= px <= x2 and y1 <= py <= y2


def _rect_distance(px: float, py: float, rect: Tuple[float, float, float, float]) -> float:
    x1, y1, x2, y2 = rect
    dx = max(x1 - px, 0, px - x2)
    dy = max(y1 - py, 0, py - y2)
    return math.hypot(dx, dy)


def normalize_skeleton(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """对 AI 生成的 skeleton 做容错修复，保证 auto_layout 能有效处理。

    解决的典型问题：
      1. shape 缺失 id → 自动赋值为 "auto_{idx}"
      2. arrow.start.id / arrow.end.id 与 shape.id 拼写不一致
         → Levenshtein 距离 ≤ 2 模糊匹配修正
      3. 孤立 text 元素（如「成功」「是」）
         → 落在某 shape 内：合并到 shape.label
         → 靠近某 arrow 中点（距离 < 80px）：合并到 arrow.label
         → 其他：保留（可能是独立注释）
      4. arrow 的 start/end id 仍无法修复 → 删除该 arrow（断链箭头无意义）
    """
    if not isinstance(elements, list) or not elements:
        return elements

    # 工作副本
    work = [dict(el) if isinstance(el, dict) else el for el in elements]

    # === 步骤 1: 补齐缺失的 shape id ===
    for idx, el in enumerate(work):
        if not isinstance(el, dict):
            continue
        if el.get("type") in SHAPE_TYPES and not el.get("id"):
            el["id"] = f"auto_{idx}"

    # 收集 shape id 集合
    shape_ids = [el.get("id") for el in work if isinstance(el, dict) and el.get("type") in SHAPE_TYPES and el.get("id")]
    shape_id_set = set(shape_ids)

    # === 步骤 2: 修复 arrow 端点 id，收集无法修复的箭头 ===
    broken_arrow_indices: List[int] = []
    for idx, el in enumerate(work):
        if not isinstance(el, dict) or el.get("type") not in LINEAR_TYPES:
            continue

        endpoint_ok = True
        for key in ("start", "end"):
            ep = el.get(key)
            if not isinstance(ep, dict):
                continue
            eid = ep.get("id")
            if not eid:
                continue
            if eid in shape_id_set:
                continue
            # 模糊匹配
            matched = _fuzzy_match_id(eid, shape_ids, max_dist=2)
            if matched:
                ep["id"] = matched
            else:
                endpoint_ok = False

        # arrow 至少一侧有效（其他侧可能是自由箭头） — 两端全断才判定为无效
        if not endpoint_ok:
            s_id = (el.get("start") or {}).get("id") if isinstance(el.get("start"), dict) else None
            e_id = (el.get("end") or {}).get("id") if isinstance(el.get("end"), dict) else None
            s_valid = s_id is None or s_id in shape_id_set
            e_valid = e_id is None or e_id in shape_id_set
            if not s_valid and not e_valid:
                broken_arrow_indices.append(idx)

    # === 步骤 3: 孤立 text 吸附 ===
    # v4 修复：先统计每个 shape 内部落入的 text 数量。若同一 shape 内有多个 text（典型如 SWOT
    # 象限：1 标题 + 3 条目），说明这是 AI 刻意放入的独立 text，不应被折叠成 label。
    # 只有 shape 内 **唯一** 的落入 text 才折入 label（保留原有对 AI 误写节点文字的修复能力）。
    shape_text_hits: Dict[str, int] = {}
    for el in work:
        if not isinstance(el, dict) or el.get("type") != "text":
            continue
        tx = float(el.get("x", 0) or 0)
        ty = float(el.get("y", 0) or 0)
        tw = float(el.get("width", 0) or 0) or 60.0
        th = float(el.get("height", 0) or 0) or 24.0
        cx_, cy_ = tx + tw / 2, ty + th / 2
        for shp in work:
            if not isinstance(shp, dict) or shp.get("type") not in SHAPE_TYPES:
                continue
            if _point_in_rect(cx_, cy_, _shape_bounds(shp)):
                sid = shp.get("id") or ""
                if sid:
                    shape_text_hits[sid] = shape_text_hits.get(sid, 0) + 1
                break

    text_indices_to_remove: set = set()
    for idx, el in enumerate(work):
        if not isinstance(el, dict) or el.get("type") != "text":
            continue
        raw_text = el.get("text") or (el.get("label") or {}).get("text") if isinstance(el.get("label"), dict) else el.get("text")
        if not raw_text:
            raw_text = el.get("text", "")
        if not raw_text:
            continue

        tx = float(el.get("x", 0) or 0)
        ty = float(el.get("y", 0) or 0)
        tw = float(el.get("width", 0) or 0) or 60.0
        th = float(el.get("height", 0) or 0) or 24.0
        cx, cy = tx + tw / 2, ty + th / 2

        # 3a) 落在某 shape 内 → **仅当该 shape 内本 text 是唯一落入 text 时** 才合并到 shape.label
        merged = False
        for shp in work:
            if not isinstance(shp, dict) or shp.get("type") not in SHAPE_TYPES:
                continue
            if _point_in_rect(cx, cy, _shape_bounds(shp)):
                sid = shp.get("id") or ""
                if shape_text_hits.get(sid, 0) > 1:
                    # 多个 text 落入（如 SWOT 象限内 1 标题 + N 条目）→ 保留独立 text
                    break
                existing_label = shp.get("label")
                if not existing_label or (isinstance(existing_label, dict) and not existing_label.get("text")):
                    shp["label"] = {"text": str(raw_text).strip()}
                    text_indices_to_remove.add(idx)
                    merged = True
                    break
        if merged:
            continue

        # 3b) 靠近某 arrow 中点（距离 < 80px） → 合并到 arrow.label
        best_arrow_idx = None
        best_dist = 80.0
        for aidx, arr in enumerate(work):
            if not isinstance(arr, dict) or arr.get("type") not in LINEAR_TYPES:
                continue
            if aidx in broken_arrow_indices:
                continue
            if arr.get("label") and isinstance(arr["label"], dict) and arr["label"].get("text"):
                continue  # 已有标签，不覆盖
            amx, amy = _arrow_midpoint(arr)
            d = math.hypot(amx - cx, amy - cy)
            if d < best_dist:
                best_dist = d
                best_arrow_idx = aidx

        if best_arrow_idx is not None:
            work[best_arrow_idx]["label"] = {"text": str(raw_text).strip()}
            text_indices_to_remove.add(idx)
            continue

        # 3c) 其他 → 保留（可能是独立注释 / 标题）

    # === 步骤 4: 组装过滤结果 ===
    discard: set = text_indices_to_remove | set(broken_arrow_indices)
    result = [el for i, el in enumerate(work) if i not in discard]
    return result


# =============================================================================
# Auto-Layout 引擎
# =============================================================================

SHAPE_TYPES = {"rectangle", "ellipse", "diamond"}
LINEAR_TYPES = {"arrow", "line"}


def _arrow_coords(
    sx: float, sy: float, ex: float, ey: float
) -> Tuple[float, float, float, float, List[List[float]]]:
    """计算箭头的 bounding box 及正确的 bounding-box-relative points。

    Excalidraw 的 points 是相对于 element.x/element.y（左上角）的偏移量，
    start/end 必须相对 bounding box 左上角计算，而非都从 [0,0] 出发。

    错误写法（当箭头不是纯左上→右下时会出错）：
        points = [[0, 0], [ex-sx, ey-sy]]

    正确写法：
        x = min(sx, ex)
        y = min(sy, ey)
        points = [[sx-x, sy-y], [ex-x, ey-y]]

    Returns: (x, y, width, height, points)
    """
    x = min(sx, ex)
    y = min(sy, ey)
    width = max(abs(ex - sx), 1.0)
    height = max(abs(ey - sy), 1.0)
    points: List[List[float]] = [[sx - x, sy - y], [ex - x, ey - y]]
    return x, y, width, height, points


def _detect_chart_type(elements: List[Dict[str, Any]]) -> str:
    """根据元素构成推断图表类型。"""
    types: set = set()
    has_lifeline = False
    for el in elements:
        t = el.get("type")
        if t:
            types.add(t)
        # 时序图特征：有虚线 lifeline
        if t == "line" and el.get("strokeStyle") == "dashed":
            has_lifeline = True

    # 时序图：有虚线 + arrows
    if has_lifeline and "arrow" in types:
        return "sequence"

    # 计算各节点出度
    out_degree: Dict[str, int] = defaultdict(int)
    for el in elements:
        if el.get("type") in LINEAR_TYPES:
            sid = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
            if sid:
                out_degree[sid] += 1

    # 思维导图：某节点出度 >= 4（明显的放射状结构）
    max_out = max(out_degree.values()) if out_degree else 0
    if max_out >= 4:
        return "mindmap"

    # 默认：流程图
    return "flowchart"


def _build_graph(elements: List[Dict[str, Any]]) -> Tuple[
    Dict[str, Dict[str, Any]], Dict[str, List[str]], Dict[str, List[str]]
]:
    """从元素数组构建节点图和邻接表。

    返回 (id_to_element, outgoing, incoming)
    """
    id_to_element: Dict[str, Dict[str, Any]] = {}
    outgoing: Dict[str, List[str]] = defaultdict(list)
    incoming: Dict[str, List[str]] = defaultdict(list)

    for el in elements:
        eid = el.get("id")
        if eid:
            id_to_element[eid] = el

    for el in elements:
        if el.get("type") in LINEAR_TYPES:
            start_id = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
            end_id = el.get("end", {}).get("id") if isinstance(el.get("end"), dict) else None
            arrow_id = el.get("id", "")
            if start_id and end_id:
                outgoing[start_id].append(end_id)
                incoming[end_id].append(start_id)

    return id_to_element, dict(outgoing), dict(incoming)


def _layout_flowchart(
    elements: List[Dict[str, Any]],
    direction_mode: str = "TD"
) -> List[Dict[str, Any]]:
    """流程图/状态图自动布局。

    算法：拓扑 BFS 分层 → 居中网格定位 → 用 _arrow_coords 正确计算 points。
    """
    id_to_el, outgoing, incoming = _build_graph(elements)

    # 1) 拓扑分层
    sources = [eid for eid in id_to_el if not incoming.get(eid)]
    if not sources:
        in_degrees = {eid: len(incoming.get(eid, [])) for eid in id_to_el}
        min_in = min(in_degrees.values()) if in_degrees else 0
        sources = [eid for eid, deg in in_degrees.items() if deg == min_in]

    levels: Dict[str, int] = {}
    queue = deque()
    for sid in sources:
        levels[sid] = 0
        queue.append(sid)

    while queue:
        nid = queue.popleft()
        for oid in outgoing.get(nid, []):
            if oid not in id_to_el:
                continue
            new_level = levels[nid] + 1
            if oid in levels:
                if new_level > levels[oid]:
                    levels[oid] = new_level
                    queue.append(oid)
            else:
                levels[oid] = new_level
                queue.append(oid)

    # 孤立节点放 layer 0
    for eid in id_to_el:
        if eid not in levels:
            levels[eid] = 0

    # 2) 按层级分组，同层按原始 x 排序（保留 AI 顺序意图）
    level_to_nodes: Dict[int, List[str]] = defaultdict(list)
    for eid, lvl in levels.items():
        level_to_nodes[lvl].append(eid)
    for lvl in level_to_nodes:
        level_to_nodes[lvl].sort(key=lambda eid: id_to_el[eid].get("x", 0))

    # 3) 布局参数
    NODE_W = 180
    NODE_H = 90
    H_GAP = 100
    V_GAP = 100
    MARGIN = 80
    is_lr = direction_mode == "LR"

    # 4) 居中对齐：基于最宽层计算整体 offset
    max_per_level = max(len(nids) for nids in level_to_nodes.values()) if level_to_nodes else 1
    if is_lr:
        max_span = max_per_level * NODE_H + (max_per_level - 1) * V_GAP
    else:
        max_span = max_per_level * NODE_W + (max_per_level - 1) * H_GAP

    for lvl, nids in sorted(level_to_nodes.items()):
        count = len(nids)
        if is_lr:
            layer_span = count * NODE_H + (count - 1) * V_GAP
            start_offset = MARGIN + (max_span - layer_span) / 2
        else:
            layer_span = count * NODE_W + (count - 1) * H_GAP
            start_offset = MARGIN + (max_span - layer_span) / 2

        for i, eid in enumerate(nids):
            el = id_to_el[eid]
            if is_lr:
                el["x"] = MARGIN + lvl * (NODE_W + H_GAP)
                el["y"] = start_offset + i * (NODE_H + V_GAP)
            else:
                el["x"] = start_offset + i * (NODE_W + H_GAP)
                el["y"] = MARGIN + lvl * (NODE_H + V_GAP)

            # 统一尺寸（保留 diamond 的特殊比例）
            if el.get("type") == "diamond":
                el["width"] = 140
                el["height"] = 100
            elif el.get("type") in ("rectangle", "ellipse"):
                el["width"] = NODE_W
                el["height"] = NODE_H

    # 5) 更新箭头坐标（使用 _arrow_coords 确保 points 正确）
    for el in elements:
        if el.get("type") not in LINEAR_TYPES:
            continue
        start_id = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
        end_id = el.get("end", {}).get("id") if isinstance(el.get("end"), dict) else None
        start_el = id_to_el.get(start_id)
        end_el = id_to_el.get(end_id)
        if not start_el or not end_el:
            continue
        sx = start_el["x"] + start_el.get("width", NODE_W) / 2
        sy = start_el["y"] + start_el.get("height", NODE_H) / 2
        ex = end_el["x"] + end_el.get("width", NODE_W) / 2
        ey = end_el["y"] + end_el.get("height", NODE_H) / 2
        ax, ay, aw, ah, pts = _arrow_coords(sx, sy, ex, ey)
        el["x"], el["y"], el["width"], el["height"], el["points"] = ax, ay, aw, ah, pts

    return elements


def _layout_sequence(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """时序图自动布局。

    1. Actor（顶部 shape）水平均匀排列
    2. Lifeline（虚线）从 actor 底部垂直延伸
    3. 消息 arrow 按时序垂直排列，使用 _arrow_coords 正确计算 points
    """
    id_to_el = {el.get("id"): el for el in elements if el.get("id")}

    # 识别 actors：按 x 排序的 shape
    shapes = [el for el in elements if el.get("type") in SHAPE_TYPES]
    shapes.sort(key=lambda e: e.get("x", 0))
    actors = shapes[:8]

    # 识别 lifelines（虚线）
    lifelines = [el for el in elements if el.get("type") == "line" and el.get("strokeStyle") == "dashed"]

    # 识别消息 arrows（按 y 排序，保持时间顺序）
    messages = [el for el in elements if el.get("type") == "arrow"]
    messages.sort(key=lambda e: e.get("y", 0))

    MARGIN = 80
    ACTOR_W = 120
    ACTOR_H = 60
    ACTOR_GAP = 220
    MSG_Y_START = 200
    MSG_Y_STEP = 80

    # 定位 actors
    for i, actor in enumerate(actors):
        actor["x"] = MARGIN + i * (ACTOR_W + ACTOR_GAP)
        actor["y"] = MARGIN
        actor["width"] = ACTOR_W
        actor["height"] = ACTOR_H

    # 定位 lifelines（与 actor 对齐的垂直虚线）
    for i, ll in enumerate(lifelines):
        if i < len(actors):
            ax = actors[i]["x"] + ACTOR_W / 2
            ll["x"] = ax - 1
            ll["y"] = MARGIN + ACTOR_H
            ll["width"] = 2
            ll["height"] = max(len(messages) * MSG_Y_STEP + 100, 300)
            ll["points"] = [[0, 0], [0, ll["height"]]]

    # 定位消息 arrows
    for i, msg in enumerate(messages):
        start_id = msg.get("start", {}).get("id") if isinstance(msg.get("start"), dict) else None
        end_id = msg.get("end", {}).get("id") if isinstance(msg.get("end"), dict) else None
        start_el = id_to_el.get(start_id)
        end_el = id_to_el.get(end_id)
        y = MSG_Y_START + i * MSG_Y_STEP
        if start_el and end_el:
            sx = start_el["x"] + start_el.get("width", ACTOR_W) / 2
            ex = end_el["x"] + end_el.get("width", ACTOR_W) / 2
            # 时序图消息水平流动，两点 y 相同
            ax, _, aw, _, pts = _arrow_coords(sx, y, ex, y)
            msg["x"] = ax
            msg["y"] = y
            msg["width"] = aw
            msg["height"] = 1
            msg["points"] = pts
        else:
            # 无法绑定的消息，按顺序垂直排列
            msg["x"] = MARGIN
            msg["y"] = y
            msg["width"] = 200
            msg["height"] = 1
            msg["points"] = [[0, 0], [200, 0]]

    return elements


def _layout_mindmap(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """思维导图自动布局（径向布局）。"""
    id_to_el = {el.get("id"): el for el in elements if el.get("id")}

    # 找中心节点：度数最大的节点
    degree = defaultdict(int)
    for el in elements:
        if el.get("type") in LINEAR_TYPES:
            sid = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
            eid = el.get("end", {}).get("id") if isinstance(el.get("end"), dict) else None
            if sid:
                degree[sid] += 1
            if eid:
                degree[eid] += 1

    center_id = max(degree, key=lambda k: degree[k]) if degree else None
    if not center_id:
        for el in elements:
            if el.get("type") in SHAPE_TYPES:
                center_id = el.get("id")
                break

    center = id_to_el.get(center_id)
    if not center:
        return elements

    CENTER_X, CENTER_Y = 600, 450
    CENTER_W, CENTER_H = 160, 80
    R1 = 280   # 第一层半径
    R2 = 520   # 第二层半径（从画布中心出发）

    center["x"] = CENTER_X - CENTER_W / 2
    center["y"] = CENTER_Y - CENTER_H / 2
    center["width"] = CENTER_W
    center["height"] = CENTER_H

    # 第一层（直接从中心出发的 arrow 的 end）
    level1_ids: set = set()
    for el in elements:
        if el.get("type") in LINEAR_TYPES:
            sid = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
            eid = el.get("end", {}).get("id") if isinstance(el.get("end"), dict) else None
            if sid == center_id and eid:
                level1_ids.add(eid)

    level1 = [id_to_el[eid] for eid in level1_ids if eid in id_to_el]
    n1 = len(level1)
    for i, node in enumerate(level1):
        angle = 2 * math.pi * i / max(n1, 1)
        node["x"] = CENTER_X + R1 * math.cos(angle) - 80
        node["y"] = CENTER_Y + R1 * math.sin(angle) - 40
        node["width"] = 160
        node["height"] = 60

    # 第二层（按父节点角度展开）
    parent_to_children: Dict[str, List[str]] = defaultdict(list)
    level2_ids: set = set()
    for el in elements:
        if el.get("type") in LINEAR_TYPES:
            sid = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
            eid = el.get("end", {}).get("id") if isinstance(el.get("end"), dict) else None
            if sid in level1_ids and eid and eid != center_id:
                level2_ids.add(eid)
                parent_to_children[sid].append(eid)

    for pid, cids in parent_to_children.items():
        parent = id_to_el.get(pid)
        if not parent:
            continue
        px = parent["x"] + parent.get("width", 160) / 2
        py = parent["y"] + parent.get("height", 60) / 2
        # 以父节点相对中心的角度为基准向两侧展开
        angle_base = math.atan2(py - CENTER_Y, px - CENTER_X)
        n = len(cids)
        spread = math.pi / 3
        for i, cid in enumerate(cids):
            angle = angle_base - spread / 2 + spread * i / max(n - 1, 1)
            node = id_to_el.get(cid)
            if not node:
                continue
            # 注意：R2 是从画布中心出发的半径，不是从父节点
            node["x"] = CENTER_X + R2 * math.cos(angle) - 70
            node["y"] = CENTER_Y + R2 * math.sin(angle) - 25
            node["width"] = 140
            node["height"] = 50

    # 更新所有 arrow（使用 _arrow_coords 确保 points 正确）
    for el in elements:
        if el.get("type") not in LINEAR_TYPES:
            continue
        sid = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
        eid = el.get("end", {}).get("id") if isinstance(el.get("end"), dict) else None
        s = id_to_el.get(sid)
        e = id_to_el.get(eid)
        if s and e:
            sx = s["x"] + s.get("width", 160) / 2
            sy = s["y"] + s.get("height", 60) / 2
            ex = e["x"] + e.get("width", 160) / 2
            ey = e["y"] + e.get("height", 60) / 2
            ax, ay, aw, ah, pts = _arrow_coords(sx, sy, ex, ey)
            el["x"], el["y"], el["width"], el["height"], el["points"] = ax, ay, aw, ah, pts

    return elements


def _layout_class_diagram(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """类图自动布局（网格排列，继承关系自上而下）。"""
    id_to_el = {el.get("id"): el for el in elements if el.get("id")}
    shapes = [el for el in elements if el.get("type") in SHAPE_TYPES]

    COLS = 3
    NODE_W = 200
    NODE_H = 120
    H_GAP = 80
    V_GAP = 80
    MARGIN = 80

    for i, shape in enumerate(shapes):
        col = i % COLS
        row = i // COLS
        shape["x"] = MARGIN + col * (NODE_W + H_GAP)
        shape["y"] = MARGIN + row * (NODE_H + V_GAP)
        shape["width"] = NODE_W
        shape["height"] = NODE_H

    # 更新 arrows（使用 _arrow_coords 确保 points 正确）
    for el in elements:
        if el.get("type") not in LINEAR_TYPES:
            continue
        sid = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
        eid = el.get("end", {}).get("id") if isinstance(el.get("end"), dict) else None
        s = id_to_el.get(sid)
        e = id_to_el.get(eid)
        if s and e:
            sx = s["x"] + s.get("width", NODE_W) / 2
            sy = s["y"] + s.get("height", NODE_H) / 2
            ex = e["x"] + e.get("width", NODE_W) / 2
            ey = e["y"] + e.get("height", NODE_H) / 2
            ax, ay, aw, ah, pts = _arrow_coords(sx, sy, ex, ey)
            el["x"], el["y"], el["width"], el["height"], el["points"] = ax, ay, aw, ah, pts

    return elements


def _layout_er_diagram(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """ER 图自动布局（实体环形排列，属性围绕实体）。"""
    id_to_el = {el.get("id"): el for el in elements if el.get("id")}

    # 识别实体（rectangle）、属性（ellipse）、关系（diamond）
    entities = [el for el in elements if el.get("type") == "rectangle"]
    attributes = [el for el in elements if el.get("type") == "ellipse"]
    relationships = [el for el in elements if el.get("type") == "diamond"]

    CX, CY = 500, 400
    R_ENTITY = 300
    R_ATTR = 120

    # 实体环形排列
    n_ent = len(entities)
    for i, ent in enumerate(entities):
        angle = 2 * math.pi * i / n_ent if n_ent > 0 else 0
        ent["x"] = CX + R_ENTITY * math.cos(angle) - 100
        ent["y"] = CY + R_ENTITY * math.sin(angle) - 50
        ent["width"] = 200
        ent["height"] = 80

    # 属性围绕对应实体（简单做法：均分到各实体周围）
    for i, attr in enumerate(attributes):
        target = entities[i % n_ent] if entities else None
        if target:
            angle = 2 * math.pi * i / max(len(attributes), 1)
            attr["x"] = target["x"] + target["width"] / 2 + R_ATTR * math.cos(angle) - 60
            attr["y"] = target["y"] + target["height"] / 2 + R_ATTR * math.sin(angle) - 30
            attr["width"] = 120
            attr["height"] = 50

    # 关系菱形放在中心附近
    for i, rel in enumerate(relationships):
        rel["x"] = CX - 60 + i * 40
        rel["y"] = CY - 40 + i * 30
        rel["width"] = 120
        rel["height"] = 80

    # 更新所有 arrow（使用 _arrow_coords 确保 points 正确）
    for el in elements:
        if el.get("type") not in LINEAR_TYPES:
            continue
        sid = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
        eid = el.get("end", {}).get("id") if isinstance(el.get("end"), dict) else None
        s = id_to_el.get(sid)
        e = id_to_el.get(eid)
        if s and e:
            sx = s["x"] + s.get("width", 200) / 2
            sy = s["y"] + s.get("height", 80) / 2
            ex = e["x"] + e.get("width", 200) / 2
            ey = e["y"] + e.get("height", 80) / 2
            ax, ay, aw, ah, pts = _arrow_coords(sx, sy, ex, ey)
            el["x"], el["y"], el["width"], el["height"], el["points"] = ax, ay, aw, ah, pts

    return elements


def _layout_generic_grid(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """通用网格布局（回退用于无法识别类型的图表）。"""
    id_to_el = {el.get("id"): el for el in elements if el.get("id")}
    shapes = [el for el in elements if el.get("type") in SHAPE_TYPES]

    COLS = 4
    NODE_W = 160
    NODE_H = 80
    H_GAP = 80
    V_GAP = 80
    MARGIN = 80

    for i, shape in enumerate(shapes):
        col = i % COLS
        row = i // COLS
        shape["x"] = MARGIN + col * (NODE_W + H_GAP)
        shape["y"] = MARGIN + row * (NODE_H + V_GAP)
        shape["width"] = NODE_W
        shape["height"] = NODE_H

    for el in elements:
        if el.get("type") not in LINEAR_TYPES:
            continue
        sid = el.get("start", {}).get("id") if isinstance(el.get("start"), dict) else None
        eid = el.get("end", {}).get("id") if isinstance(el.get("end"), dict) else None
        s = id_to_el.get(sid)
        e = id_to_el.get(eid)
        if s and e:
            sx = s["x"] + s.get("width", NODE_W) / 2
            sy = s["y"] + s.get("height", NODE_H) / 2
            ex = e["x"] + e.get("width", NODE_W) / 2
            ey = e["y"] + e.get("height", NODE_H) / 2
            ax, ay, aw, ah, pts = _arrow_coords(sx, sy, ex, ey)
            el["x"], el["y"], el["width"], el["height"], el["points"] = ax, ay, aw, ah, pts

    return elements


def auto_layout(elements: List[Dict[str, Any]], direction_mode: str = "TD") -> List[Dict[str, Any]]:
    """自动布局入口函数。

    根据图表类型选择对应的布局算法，重新计算所有 shape 和 arrow 的坐标。
    这是效果保障的核心步骤：AI 只负责生成拓扑结构，坐标由算法统一优化。

    Args:
        elements: skeleton 元素数组（会被原地修改）
        direction_mode: "TD"（垂直）或 "LR"（水平）

    Returns:
        重新布局后的元素数组
    """
    if not elements:
        return elements

    chart_type = _detect_chart_type(elements)

    if chart_type == "sequence":
        return _layout_sequence(elements)
    elif chart_type == "mindmap":
        return _layout_mindmap(elements)
    elif chart_type == "flowchart":
        return _layout_flowchart(elements, direction_mode)
    else:
        # 类图、ER 图、甘特图等都走专用布局或通用网格
        has_class = any("class" in (el.get("label", {}).get("text", "") + el.get("text", "")).lower() for el in elements)
        has_er = any(el.get("type") == "ellipse" for el in elements) and any(el.get("type") == "rectangle" for el in elements)
        if has_er:
            return _layout_er_diagram(elements)
        if has_class:
            return _layout_class_diagram(elements)
        return _layout_flowchart(elements, direction_mode)


# =============================================================================
# 轻量居中后处理（取代 auto_layout）
#
# v2 重构：AI 直接输出最终坐标，后端只做 bbox 居中的平移，
# 不再修改拓扑布局，避免破坏 AI 的语义编排。
# =============================================================================

def center_elements_py(
    elements: List[Dict[str, Any]],
    canvas_center: Tuple[float, float] = (600.0, 400.0),
) -> List[Dict[str, Any]]:
    """将 skeleton 元素的整体 bbox 平移到画布中心。

    - 计算 shape/image 的 (min_x, min_y, max_x, max_y)
    - arrow/line 本身的 x/y 也参与 bbox 计算，points 是相对坐标不变
    - dx = canvas_center.x - (min_x + max_x) / 2
    - dy = canvas_center.y - (min_y + max_y) / 2
    - 所有元素 x += dx, y += dy
    """
    if not isinstance(elements, list) or not elements:
        return elements

    min_x = float("inf")
    min_y = float("inf")
    max_x = float("-inf")
    max_y = float("-inf")

    for el in elements:
        if not isinstance(el, dict):
            continue
        try:
            x = float(el.get("x", 0) or 0)
            y = float(el.get("y", 0) or 0)
            w = float(el.get("width", 0) or 0)
            h = float(el.get("height", 0) or 0)
        except (TypeError, ValueError):
            continue
        # arrow/line 的 width/height 可为负数，要规范成 bbox
        x1 = min(x, x + w)
        y1 = min(y, y + h)
        x2 = max(x, x + w)
        y2 = max(y, y + h)
        if x1 < min_x:
            min_x = x1
        if y1 < min_y:
            min_y = y1
        if x2 > max_x:
            max_x = x2
        if y2 > max_y:
            max_y = y2

    if min_x == float("inf") or max_x == float("-inf"):
        return elements

    cx, cy = canvas_center
    dx = cx - (min_x + max_x) / 2
    dy = cy - (min_y + max_y) / 2

    # 偏移量过小时不处理
    if abs(dx) < 0.5 and abs(dy) < 0.5:
        return elements

    for el in elements:
        if not isinstance(el, dict):
            continue
        try:
            el["x"] = float(el.get("x", 0) or 0) + dx
            el["y"] = float(el.get("y", 0) or 0) + dy
        except (TypeError, ValueError):
            continue

    return elements


# =============================================================================
# boundElements 补全（让 Excalidraw 绑定更稳定）
# =============================================================================

def ensure_bound_elements(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """为所有被 arrow 引用的 shape 添加 boundElements 字段。

    Excalidraw 的 convertToExcalidrawElements 内部会自动处理绑定，
    但显式添加 boundElements 可以让 restoreElements({ repairBindings: true })
    更稳定地重建绑定关系。
    """
    id_to_bound: Dict[str, List[Dict[str, str]]] = defaultdict(list)

    for el in elements:
        if el.get("type") in LINEAR_TYPES:
            arrow_id = el.get("id")
            if not arrow_id:
                continue
            for endpoint_key in ("start", "end"):
                endpoint = el.get(endpoint_key)
                if isinstance(endpoint, dict):
                    target_id = endpoint.get("id")
                    if target_id:
                        id_to_bound[target_id].append({"type": el.get("type", "arrow"), "id": arrow_id})

    for el in elements:
        eid = el.get("id")
        if eid and eid in id_to_bound:
            existing = el.get("boundElements", [])
            if not isinstance(existing, list):
                existing = []
            # 去重合并
            existing_ids = {b.get("id") for b in existing if isinstance(b, dict)}
            for bound in id_to_bound[eid]:
                if bound.get("id") not in existing_ids:
                    existing.append(bound)
                    existing_ids.add(bound["id"])
            el["boundElements"] = existing

    return elements

