import { FlowDirection } from "@/lib/projectApi";

const MERMAID_KEYWORDS = [
  "graph ", "flowchart ", "sequenceDiagram", "classDiagram",
  "erDiagram", "mindmap", "gantt", "pie", "gitGraph",
  "stateDiagram", "journey",
];

/**
 * 修复 Mermaid 代码中缺失换行符的问题（处理 LLM 输出在一行的情况）。
 * 与后端 backend/utils/mermaid_utils.py::_fix_mermaid_line_breaks 逻辑保持一致。
 */
export function fixMermaidLineBreaks(code: string): string {
  const trimmed = code.trim();

  const headerMatch = trimmed.match(/^(graph|flowchart)\s+(TD|TB|BT|LR|RL)\s*([\s\S]*?)$/);
  if (!headerMatch) return trimmed;

  const headerType = headerMatch[1];
  const direction = headerMatch[2];
  let body = headerMatch[3].trim();

  if (!body) return `${headerType} ${direction}`;

  // Strategy 1: Split at ]/}/) + SPACE + UPPERCASE + (arrow follows)
  body = body.replace(
    /([\]})])\s+([A-Z]\w*)\s*(?=\s*(?:-->|==>|-\.->|\.\.->|~~~>|<-->|<--|--))/g,
    '$1\n$2'
  );

  // Strategy 2: Handle bare node refs: --> C D -->
  body = body.replace(
    /(-->|==>|-\.->|\.\.->|~~~>|<-->|<--|--)\s+([A-Z])\s+(?=[A-Z])/g,
    '$1 $2\n'
  );

  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);

  // Fix spacing around arrows
  const cleaned = lines.map(line => {
    let l = line.replace(/(\S)(--&gt;)/g, '$1 -->');
    l = l.replace(/(--&gt;)(\S)/g, '$1 $2');
    return l.trim();
  });

  return `${headerType} ${direction}\n${cleaned.join('\n')}`;
}

/**
 * 从 LLM 返回内容中提取 Mermaid 代码。
 * 与后端 backend/utils/mermaid_utils.py::_extract_mermaid 逻辑保持一致。
 */
export function extractMermaidCode(content: string): string {
  let code = content.trim();

  // Try extracting from markdown code block
  const codeBlockMatch = code.match(/```(?:mermaid)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    code = codeBlockMatch[1].trim();
  }

  if (MERMAID_KEYWORDS.some(kw => code.startsWith(kw))) {
    return code;
  }

  // Fallback: find first mermaid keyword and extract from there
  for (const kw of MERMAID_KEYWORDS) {
    const m = code.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*'));
    if (m) return m[0].trim();
  }

  return code;
}

/**
 * 转换 Mermaid graph/flowchart 的方向声明。
 */
export function convertDirectionInMermaid(code: string, newDir: FlowDirection): string {
  if (newDir === "TD") {
    return code.replace(/^(flowchart|graph)\s+LR/, "$1 TD").replace(/^(flowchart|graph)\s+TB/, "$1 TD");
  }
  return code.replace(/^(flowchart|graph)\s+T[DB]/, "$1 LR");
}

/**
 * 通用的 Mermaid 代码语法容错函数。
 *
 * 背景：AI 生成的 Mermaid 代码常出现以下问题：
 *   1. classDiagram / erDiagram 中误用 flowchart 的 `-->|label|` 语法
 *   2. 其他图表类型的常见语法错误
 *
 * 此函数会在渲染前自动修复这些问题，与 excalidrawConverter.ts 中的容错逻辑保持一致。
 */
export function sanitizeMermaidCode(code: string): string {
  let sanitized = code;

  // Fix 1: classDiagram 中 flowchart 风格的 |label| 语法
  // 例：User -->|places| Order → User --> Order : places
  if (/^\s*classDiagram/m.test(sanitized)) {
    const arrowUnion = "-->|<--|\\.\\.>|<\\.\\.|--\\*|\\*--|--o|o--|--\\|>|<\\|--|--";
    const pattern = new RegExp(
      `([A-Za-z_][A-Za-z0-9_]*)\\s*(${arrowUnion})\\s*\\|([^|]+)\\|\\s*([A-Za-z_][A-Za-z0-9_]*)`,
      "g",
    );
    sanitized = sanitized.replace(pattern, (_m, a, arrow, label, b) => `${a} ${arrow} ${b} : ${String(label).trim()}`);
    if (sanitized !== code) {
      console.log("[AutoFlow-MermaidUtils] classDiagram syntax auto-fixed: flowchart-style |label| removed");
    }
  }

  // Fix 2: erDiagram 中类似的语法问题（虽然较少见，但做防御性处理）
  if (/^\s*erDiagram/m.test(sanitized)) {
    const erArrowUnion = "\\|\\|--o\\{|o\\o--\\|\\|\\}|\\}o--\\||\\|--\\{";
    const erPattern = new RegExp(
      `([A-Za-z_][A-Za-z0-9_]*)\\s*(${erArrowUnion})\\s*:\\s*([^:\n]+)`,
      "g",
    );
    // erDiagram 的关系语法通常正确，这里只做日志记录
    const matches = sanitized.match(erPattern);
    if (matches && matches.length > 0) {
      console.log("[AutoFlow-MermaidUtils] erDiagram detected with", matches.length, "relationships");
    }
  }

  return sanitized;
}


