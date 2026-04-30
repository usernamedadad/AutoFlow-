"""normalize_skeleton 冒烟测试 —— 验证用户截图中的断裂场景能被容错修复。

v2 扩展：附加验证 center_elements_py 实现 bbox 平移居中。
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.excalidraw_utils import normalize_skeleton, center_elements_py

elements = [
    {"id": "start", "type": "ellipse", "x": 150, "y": 50, "width": 140, "height": 70, "label": {"text": "开始"}},
    # 缺 id 的 shape：应被自动赋 auto_1
    {"type": "rectangle", "x": 520, "y": 170, "width": 160, "height": 80, "label": {"text": "填写表单"}},
    {"id": "send_mail", "type": "rectangle", "x": 520, "y": 310, "width": 160, "height": 80, "label": {"text": "发送验证邮件"}},
    {"id": "verify", "type": "diamond", "x": 520, "y": 440, "width": 120, "height": 80, "label": {"text": "邮箱验证"}},
    {"id": "activate", "type": "rectangle", "x": 520, "y": 580, "width": 160, "height": 80, "label": {"text": "账户激活"}},
    {"id": "end", "type": "ellipse", "x": 520, "y": 680, "width": 140, "height": 70, "label": {"text": "结束"}},
    # 孤立 text "成功"，位置靠近 verify→activate 的 arrow a4 中点(640, 550)：应被吸收到 a4.label
    {"type": "text", "x": 560, "y": 525, "width": 40, "height": 20, "text": "成功"},
    {"id": "a1", "type": "arrow", "x": 150, "y": 120, "width": 370, "height": 130, "start": {"id": "start"}, "end": {"id": "auto_1"}},
    # arrow 端点拼写错误 "sendmail"（应匹配 "send_mail"，距离 1）
    {"id": "a2", "type": "arrow", "x": 600, "y": 250, "width": 0, "height": 60, "start": {"id": "auto_1"}, "end": {"id": "sendmail"}},
    {"id": "a3", "type": "arrow", "x": 600, "y": 390, "width": 0, "height": 50, "start": {"id": "send_mail"}, "end": {"id": "verify"}},
    {"id": "a4", "type": "arrow", "x": 580, "y": 520, "width": 120, "height": 60, "start": {"id": "verify"}, "end": {"id": "activate"}},
    {"id": "a5", "type": "arrow", "x": 600, "y": 660, "width": 0, "height": 20, "start": {"id": "activate"}, "end": {"id": "end"}},
    # 无法修复的断链 arrow：应被删除
    {"id": "a6", "type": "arrow", "x": 0, "y": 0, "width": 10, "height": 10, "start": {"id": "xxx_not_exist"}, "end": {"id": "yyy_not_exist"}},
]

print(f"BEFORE: total={len(elements)}")
no_id = sum(1 for e in elements if e.get("type") in ("rectangle", "ellipse", "diamond") and not e.get("id"))
texts = sum(1 for e in elements if e.get("type") == "text")
print(f"  shapes without id: {no_id}")
print(f"  standalone text:   {texts}")

normed = normalize_skeleton(elements)

print(f"\nAFTER: total={len(normed)}")
no_id_after = sum(1 for e in normed if e.get("type") in ("rectangle", "ellipse", "diamond") and not e.get("id"))
texts_after = sum(1 for e in normed if e.get("type") == "text")
print(f"  shapes without id: {no_id_after}")
print(f"  standalone text:   {texts_after}")

print("\nArrow details:")
for e in normed:
    if e.get("type") == "arrow":
        s = (e.get("start") or {}).get("id")
        en = (e.get("end") or {}).get("id")
        lbl = (e.get("label") or {}).get("text") if isinstance(e.get("label"), dict) else None
        aid = e.get("id")
        print(f"  {aid}: {s} -> {en}  label={lbl!r}")

# 断言
assert no_id_after == 0, "所有 shape 都应该补全了 id"
assert texts_after == 0, "孤立 text '成功' 应该被吸收"
arrow_ids = {e.get("id") for e in normed if e.get("type") == "arrow"}
assert "a6" not in arrow_ids, "无法修复的断链 arrow a6 应该被删除"
a2 = next(e for e in normed if e.get("id") == "a2")
assert (a2.get("end") or {}).get("id") == "send_mail", f"a2.end.id 应该被模糊匹配为 send_mail，实际: {(a2.get('end') or {}).get('id')}"
a4 = next(e for e in normed if e.get("id") == "a4")
assert (a4.get("label") or {}).get("text") == "成功", f"a4.label 应该吸收了 '成功'，实际: {a4.get('label')}"

print("\n[PASS] All assertions passed.")


# === v2 新增测试：center_elements_py ===
print("\n=== center_elements_py ===")

# 场景 A：AI 给的 bbox 偏左上 (x ∈ [100, 400], y ∈ [80, 300])
# 中心应从 (250, 190) 平移到 (600, 400)
ca_elements = [
    {"id": "a", "type": "rectangle", "x": 100, "y": 80, "width": 160, "height": 80},
    {"id": "b", "type": "rectangle", "x": 240, "y": 220, "width": 160, "height": 80},
]
centered = center_elements_py([dict(e) for e in ca_elements])

min_x = min(e["x"] for e in centered)
max_x = max(e["x"] + e["width"] for e in centered)
min_y = min(e["y"] for e in centered)
max_y = max(e["y"] + e["height"] for e in centered)
cx = (min_x + max_x) / 2
cy = (min_y + max_y) / 2
print(f"  center after shift: ({cx}, {cy})")
assert abs(cx - 600) < 0.5 and abs(cy - 400) < 0.5, f"中心应为 (600, 400)，实际 ({cx}, {cy})"

# 场景 B：与 normalize_skeleton 连接使用（前面的 normed 结果）
combined = center_elements_py([dict(e) for e in normed])
xs_min = float("inf"); xs_max = float("-inf"); ys_min = float("inf"); ys_max = float("-inf")
for e in combined:
    x = float(e.get("x", 0) or 0); y = float(e.get("y", 0) or 0)
    w = float(e.get("width", 0) or 0); h = float(e.get("height", 0) or 0)
    x1 = min(x, x + w); x2 = max(x, x + w)
    y1 = min(y, y + h); y2 = max(y, y + h)
    xs_min = min(xs_min, x1); xs_max = max(xs_max, x2)
    ys_min = min(ys_min, y1); ys_max = max(ys_max, y2)
cx2 = (xs_min + xs_max) / 2
cy2 = (ys_min + ys_max) / 2
print(f"  normalize+center bbox center: ({cx2}, {cy2})")
assert abs(cx2 - 600) < 1.0 and abs(cy2 - 400) < 1.0, f"组合链路中心应为 (600, 400)，实际 ({cx2}, {cy2})"

# 场景 C：空数组 / 单个已居中元素 边界条件
assert center_elements_py([]) == []
one = center_elements_py([{"id": "x", "type": "rectangle", "x": 500, "y": 300, "width": 200, "height": 200}])
assert one[0]["x"] == 500 and one[0]["y"] == 300, "单个元素已居中时不应偏移"

print("[PASS] center_elements_py all assertions passed.")
