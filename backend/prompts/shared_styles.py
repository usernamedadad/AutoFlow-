"""AutoFlow+ 共享配色与样式常量。

各提示词通过 import 引用，避免多处重复定义导致不一致。
"""

# ── 配色方案 ──────────────────────────────────────
# 格式: (background, stroke)

COLOR_FLOW = ("#e3f2fd", "#1565c0")       # 流程节点
COLOR_START = ("#fff8e1", "#f9a825")       # 开始
COLOR_END = ("#fce4ec", "#c62828")         # 结束
COLOR_DECISION = ("#fff3e0", "#e65100")    # 决策
COLOR_SUCCESS = ("#dcfce7", "#16a34a")     # 成功
COLOR_WARNING = ("#fee2e2", "#dc2626")     # 警告
COLOR_NEUTRAL = ("#f5f5f5", "#616161")     # 中性
COLOR_TEXT = "#1f2937"                      # 文本默认色

# SWOT 象限
COLOR_S = ("#dcfce7", "#16a34a")  # 优势 - 绿
COLOR_W = ("#fee2e2", "#dc2626")  # 劣势 - 红
COLOR_O = ("#dbeafe", "#2563eb")  # 机会 - 蓝
COLOR_T = ("#ffedd5", "#ea580c")  # 威胁 - 橙

# ── 提示词片段 ────────────────────────────────────

COLOR_PALETTE_PROMPT = (
    "流程节点:#e3f2fd/#1565c0 | 开始:#fff8e1/#f9a825 | 结束:#fce4ec/#c62828 | "
    "决策:#fff3e0/#e65100 | 成功:#dcfce7/#16a34a | 警告:#fee2e2/#dc2626 | "
    "中性:#f5f5f5/#616161 | 文本:#1f2937"
)

DEFAULT_STYLES_PROMPT = (
    'fillStyle:"solid", strokeStyle:"solid", strokeWidth:2, roughness:1, '
    'label.fontSize:16, label.fontFamily:5'
)
