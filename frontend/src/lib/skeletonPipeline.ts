/**
 * AutoFlow+ Skeleton 处理管线（前端版本）。
 *
 * 核心原则：
 * 1. normalize 在 validate 之前 — 先修复，再校验，修复不了才报错
 * 2. 不覆盖 AI 的颜色和布局决策 — 只强制 roughness/strokeStyle/fillStyle
 * 3. 失败直接报错，不自动重试、不偷偷兜底到 Mermaid
 */
import { fixZeroDimensionElements, centerElements, mermaidToExcalidraw } from "./excalidrawConverter";
import { isCompactGraph, compactGraphToExcalidraw } from "./graphLayout";

// ── 类型 ──────────────────────────────────────────────

export interface PipelineResult {
  success: boolean;
  elements?: any[];
  error?: string;
  format?: "mermaid" | "compact" | "skeleton" | "raw";
  /** FORMAT:mermaid 时的原始代码，用于方向切换时重新渲染 */
  mermaidCode?: string;
}

// ── Step 1: 检测 FORMAT 标记（在 extractCode 之前，防止被吃掉） ──

function detectFormat(raw: string): { format: "mermaid" | "compact" | "raw"; body: string } {
  const text = raw.trim();
  if (!text) return { format: "raw", body: "" };

  // 显式 FORMAT 声明（skeleton 也走 raw 管线）
  const formatMatch = text.match(/^format\s*:\s*(mermaid|compact|skeleton)/i);
  if (formatMatch) {
    const fmt = formatMatch[1].toLowerCase();
    // skeleton 格式走 raw 管线（原始 Excalidraw JSON 数组）
    const mapped = fmt === "skeleton" ? "raw" : fmt as "mermaid" | "compact";
    const afterFirstLine = text.replace(/^.*\n?/, "").trim();
    return { format: mapped, body: afterFirstLine };
  }

  // 自动检测：Mermaid 代码特征
  if (/(?:^|\n)\s*(?:graph |flowchart |sequenceDiagram)/i.test(text)) {
    return { format: "mermaid", body: text };
  }
  // 自动检测：紧凑格式 JSON 对象（含 "nodes" 和 "edges"）
  if (/^\s*\{/.test(text) && /"nodes"\s*:/.test(text) && /"edges"\s*:/.test(text)) {
    return { format: "compact", body: text };
  }
  // 自动检测：JSON 数组（raw / skeleton 格式，含 "type" 字段）
  if (/^\s*\[/.test(text) && /"type"\s*:/.test(text)) {
    return { format: "raw", body: text };
  }
  // 兜底：在文本中寻找紧凑JSON
  const jsonMatch = text.match(/\{[\s\S]*"nodes"\s*:[\s\S]*"edges"\s*:[\s\S]*\}/);
  if (jsonMatch) {
    return { format: "compact", body: jsonMatch[0] };
  }
  // 兜底：在文本中寻找JSON数组
  const arrMatch = text.match(/\[[\s\S]*"type"\s*:[\s\S]*\]/);
  if (arrMatch) {
    return { format: "raw", body: arrMatch[0] };
  }
  // 兜底：寻找 Mermaid 代码
  const mmMatch = text.match(/(?:graph |flowchart |sequenceDiagram)[\s\S]+/i);
  if (mmMatch) {
    return { format: "mermaid", body: mmMatch[0] };
  }
  return { format: "raw", body: text };
}

// ── Step 2: 提取代码（去掉 markdown 包装） ──────────

function extractCode(raw: string): string {
  let text = raw.trim();
  const blockMatch = text.match(/```(?:json|mermaid)?\s*\n?([\s\S]*?)```/i);
  if (blockMatch) text = blockMatch[1].trim();
  return text;
}

// ── Step 2: JSON 修复 ─────────────────────────────────

function repairJson(text: string): string {
  let fixed = text;
  // 尾逗号
  fixed = fixed.replace(/,(\s*[}\]])/g, "$1");
  // 单引号 key
  fixed = fixed.replace(/(?<!\\)'([^'\\]*)'(?=\s*:)/g, '"$1"');
  return fixed;
}

// ── Step 4: 容错修复 ─────────────────────────────────

function normalizeSkeleton(elements: any[]): any[] {
  const work = elements.map((el) => ({ ...el }));
  const shapeIds = new Set<string>();

  // 收集所有 shape/text 的 id
  for (const el of work) {
    if (el.id && el.type !== "arrow" && el.type !== "line") {
      shapeIds.add(el.id);
    }
  }

  // 补缺失 id
  let autoIdx = 0;
  for (const el of work) {
    if (!el.id && el.type !== "arrow" && el.type !== "line") {
      el.id = `auto_${autoIdx++}`;
      shapeIds.add(el.id);
    }
  }

  // 修复箭头端点：Levenshtein 模糊匹配（dist <= 2）
  const brokenArrows = new Set<string>();
  for (const el of work) {
    if (el.type !== "arrow" && el.type !== "line") continue;
    const startId = el.start?.id;
    const endId = el.end?.id;

    let startOk = startId && shapeIds.has(startId);
    let endOk = (el.end?.id) && shapeIds.has(el.end.id);

    if (!startOk && startId) {
      const match = fuzzyMatch(startId, Array.from(shapeIds));
      if (match) { el.start.id = match; startOk = true; }
    }
    if (!endOk && el.end?.id) {
      const match = fuzzyMatch(el.end.id, Array.from(shapeIds));
      if (match) { el.end.id = match; endOk = true; }
    }

    // 两端都修不了 → 标记为断链
    if (!startOk && !endOk) brokenArrows.add(el.id || "");
  }

  return work.filter((el) => !brokenArrows.has(el.id || ""));
}

function fuzzyMatch(target: string, candidates: string[]): string | null {
  if (!target || candidates.length === 0) return null;
  let best: string | null = null;
  let bestDist = 3;
  for (const c of candidates) {
    const d = levenshtein(target, c, 2);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function levenshtein(a: string, b: string, limit: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    let minRow = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const cur = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = dp[j]; dp[j] = cur;
      if (cur < minRow) minRow = cur;
    }
    if (minRow > limit) return limit + 1;
  }
  return dp[b.length];
}

// ── Step 5: 校验 ─────────────────────────────────────

function validateSkeleton(elements: any[]): string | null {
  if (!Array.isArray(elements)) return "顶层必须是 JSON 数组";
  if (elements.length === 0) return "元素数组为空";
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el || typeof el !== "object") return `索引 ${i} 不是对象`;
    if (!el.type) return `索引 ${i} 缺少 type 字段`;
    if (typeof el.x !== "number" || typeof el.y !== "number") {
      return `索引 ${i} 的 x/y 坐标无效`;
    }
  }
  return null;
}

// ── Step 6: 样式 + 后处理 ─────────────────────────────

function applyDefaultStyles(elements: any[]): any[] {
  // 只强制手绘风格一致性参数，不覆盖 AI 的配色（backgroundColor/strokeColor）和布局（x/y/w/h）
  return elements.map((el) => {
    if (!el || typeof el !== "object") return el;
    const t = el.type;
    if (t === "rectangle" || t === "ellipse" || t === "diamond") {
      return { ...el, roughness: 1, strokeStyle: "solid", fillStyle: "solid", strokeWidth: 2, fontFamily: 5 };
    }
    if (t === "arrow" || t === "line") {
      return { ...el, roughness: 1, strokeStyle: "solid", strokeWidth: 2, fontFamily: 5 };
    }
    if (t === "text") {
      return { ...el, roughness: 0, fontFamily: 5 };
    }
    return el;
  });
}

function ensureBounds(elements: any[]): any[] {
  const boundMap = new Map<string, { type: string; id: string }[]>();
  for (const el of elements) {
    if (el.type === "arrow" || el.type === "line") {
      const sid = el.start?.id;
      const eid = el.end?.id;
      const aid = el.id;
      if (sid && aid) {
        if (!boundMap.has(sid)) boundMap.set(sid, []);
        boundMap.get(sid)!.push({ type: el.type, id: aid });
      }
      if (eid && aid) {
        if (!boundMap.has(eid)) boundMap.set(eid, []);
        boundMap.get(eid)!.push({ type: el.type, id: aid });
      }
    }
  }
  return elements.map((el) => {
    if (!el.id || !boundMap.has(el.id)) return el;
    const existing = Array.isArray(el.boundElements) ? el.boundElements : [];
    const boundIds = new Set(existing.map((b: any) => b?.id).filter(Boolean));
    const additions = boundMap.get(el.id)!.filter((b) => !boundIds.has(b.id));
    return { ...el, boundElements: [...existing, ...additions] };
  });
}

// ── 主入口 ────────────────────────────────────────────

export async function processSkeletonOutput(rawContent: string): Promise<PipelineResult> {
  // 1. 检测 FORMAT（必须在 extractCode 之前，防止 FORMAT 行被吃掉）
  const { format, body: formatBody } = detectFormat(rawContent);

  // 2. 提取代码（去掉可能的 markdown 包装）
  const code = extractCode(formatBody);

  if (!code) {
    return { success: false, error: "AI 返回内容为空" };
  }

  // 3. FORMAT:mermaid → 官方 mermaidToExcalidraw 转换器（流程图/时序图首选）
  if (format === "mermaid") {
    try {
      const result = await mermaidToExcalidraw(code);
      if (result.elements && result.elements.length > 0) {
        const elements = applyDefaultStyles(result.elements);
        return { success: true, elements, format: "mermaid", mermaidCode: code };
      }
      return { success: false, error: "Mermaid 转换后元素为空" };
    } catch (e: any) {
      return { success: false, error: `Mermaid 转换失败: ${e.message}` };
    }
  }

  // 4. FORMAT:compact / raw → JSON 解析 + 处理
  const repairedCode = repairJson(code);

  let parsed: any;
  try {
    parsed = JSON.parse(repairedCode);
  } catch {
    return { success: false, error: `AI 返回的不是有效 JSON: ${repairedCode.substring(0, 120)}` };
  }

  let elements: any[];

  if (isCompactGraph(parsed)) {
    try {
      elements = compactGraphToExcalidraw(parsed);
    } catch (e: any) {
      return { success: false, error: `图形布局失败: ${e.message}` };
    }
  } else if (Array.isArray(parsed)) {
    elements = parsed;
    elements = normalizeSkeleton(elements);
    elements = fixZeroDimensionElements(elements);

    const validationError = validateSkeleton(elements);
    if (validationError) {
      return { success: false, error: validationError };
    }
  } else {
    return { success: false, error: "AI 返回的不是 JSON 数组或图结构对象" };
  }

  // 5. 通用后处理
  elements = applyDefaultStyles(elements);
  elements = ensureBounds(elements);
  elements = centerElements(elements);

  return { success: true, elements, format: isCompactGraph(parsed) ? "compact" : "raw" };
}
