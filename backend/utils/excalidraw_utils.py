"""Excalidraw skeleton 工具函数。

负责从 LLM 原始回复中提取 Excalidraw Skeleton JSON 数组、结构校验、
零宽高修复、容错加固、boundElements 补全、Smart IR 转换。

布局引擎已独立为 excalidraw_layout.py。
"""

import json
import math
import re
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional, Tuple

from .excalidraw_layout import SHAPE_TYPES, LINEAR_TYPES, _arrow_coords


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

