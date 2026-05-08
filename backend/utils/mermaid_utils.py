import re
from typing import List

MERMAID_STARTS = (
    "graph ", "flowchart ", "sequenceDiagram", "classDiagram",
    "erDiagram", "mindmap", "gantt", "pie", "gitGraph",
    "stateDiagram", "stateDiagram-v2", "journey",
)


def _fix_mermaid_line_breaks(code: str) -> str:
    """
    修复 Mermaid 代码缺失换行符的问题。
    策略：
    1. 在 })] + 空格 + 大写字母 + (后面跟箭头) 处插入换行
    2. 处理裸节点引用：--> C D -->  (C是引用，D是新语句)
    3. 清理箭头周围的空格
    """
    trimmed = code.strip()
    
    header_match = re.match(r'^(graph|flowchart)\s+(TD|TB|BT|LR|RL)\s*(.*)', trimmed, re.DOTALL)
    
    if not header_match:
        return trimmed
    
    header_type = header_match.group(1)
    direction = header_match.group(2)
    body = header_match.group(3).strip()
    
    if not body:
        return f"{header_type} {direction}"

    # 策略0: 体育场形状 ((text)) → 矩形 [text]（@excalidraw/mermaid-to-excalidraw 不支持该语法）
    body = re.sub(r'\(\((.+?)\)\)', r'[\1]', body)

    # 策略1: 在 })] + 空格 + 大写字母 + (箭头) 处拆分
    result = re.sub(
        r'([\]})])\s+([A-Z]\w*)\s*(?=\s*(?:-->|==>|-\.->|\.\.->|~~~>|<-->|<--|--))',
        r'\1\n\2',
        body
    )
    
    # 策略2: 处理裸节点引用：--> C D -->  (在D之前插入换行)
    result = re.sub(
        r'(-->|==>|-\.->|\.\.->|~~~>|<-->|<--|--)\s+([A-Z])\s+(?=[A-Z])',
        r'\1 \2\n',
        result
    )
    
    lines = [line.strip() for line in result.split('\n') if line.strip()]
    
    # 清理箭头周围的空格
    cleaned = []
    for line in lines:
        line = re.sub(r'(\S)(-->)', r'\1 -->', line)
        line = re.sub(r'(-->)(\S)', r'\1 \2', line)
        cleaned.append(line.strip())
    
    return f"{header_type} {direction}\n" + "\n".join(cleaned)


def _is_valid_mermaid(code: str) -> bool:
    return any(code.strip().startswith(kw) for kw in MERMAID_STARTS)


def _extract_mermaid(content: str) -> str:
    mermaid_code = content.strip()
    if "```mermaid" in mermaid_code:
        match = re.search(r'```mermaid\s*\n?(.*?)```', mermaid_code, re.DOTALL)
        if match:
            mermaid_code = match.group(1).strip()
    elif "```" in mermaid_code:
        match = re.search(r'```\s*\n?(.*?)```', mermaid_code, re.DOTALL)
        if match:
            mermaid_code = match.group(1).strip()
    mermaid_code = mermaid_code.strip()
    if not _is_valid_mermaid(mermaid_code):
        for kw in MERMAID_STARTS:
            pattern = re.escape(kw) + r'[\s\S]*'
            m = re.search(pattern, mermaid_code)
            if m:
                mermaid_code = m.group(0).strip()
                break

    # classDiagram 语法容错：把 flowchart 风格的 A -->|label| B 改写为 classDiagram 语法 A --> B : label
    if mermaid_code.strip().startswith("classDiagram"):
        pattern = re.compile(
            r'([A-Za-z_][A-Za-z0-9_]*)\s*(-->|\s*<--|\s*\.\.>|\s*<\.\.|\s*--\*|\s*\*--|--o|o--|\s*--\||\s*<\|--|--)\s*\|([^|]+)\|\s*([A-Za-z_][A-Za-z0-9_]*)',
            re.MULTILINE,
        )
        fixed = pattern.sub(lambda m: f"{m.group(1)} {m.group(2).strip()} {m.group(4)} : {m.group(3).strip()}", mermaid_code)
        if fixed != mermaid_code:
            import logging
            logging.getLogger(__name__).info("classDiagram syntax auto-fixed: flowchart-style |label| removed")
            mermaid_code = fixed

    mermaid_code = _fix_mermaid_line_breaks(mermaid_code)
    return mermaid_code
