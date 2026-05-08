"use client";

import { FlowDirection } from "@/lib/projectApi";

const FLOWCHART_TYPES = ["graph ", "flowchart "];

export function isFlowchartType(code: string): boolean {
  const trimmed = code.trim();
  return FLOWCHART_TYPES.some(t => trimmed.startsWith(t));
}

let _parseMermaid: any = null;
let _convertToExcalidrawElements: any = null;
let _restoreElements: any = null;
let _mermaidLib: any = null;

async function getConverters() {
  if (!_parseMermaid || !_convertToExcalidrawElements) {
    const mermaidModule = await import("@excalidraw/mermaid-to-excalidraw");
    const excalidrawModule = await import("@excalidraw/excalidraw");
    _parseMermaid = mermaidModule.parseMermaidToExcalidraw;
    _convertToExcalidrawElements = excalidrawModule.convertToExcalidrawElements;
  }
  return { parseMermaid: _parseMermaid, convert: _convertToExcalidrawElements };
}

async function getSkeletonConverters() {
  if (!_convertToExcalidrawElements || !_restoreElements) {
    const excalidrawModule = await import("@excalidraw/excalidraw");
    _convertToExcalidrawElements = excalidrawModule.convertToExcalidrawElements;
    _restoreElements = excalidrawModule.restoreElements;
  }
  return { convert: _convertToExcalidrawElements, restore: _restoreElements };
}

async function getMermaidLib() {
  if (!_mermaidLib) {
    _mermaidLib = await import("mermaid");
  }
  return _mermaidLib.default || _mermaidLib;
}

const EXCALIFONT_FAMILY = 5;

function getChartTypeLabel(code: string): string {
  const t = code.trim().toLowerCase();
  if (t.startsWith("gantt")) return "甘特图";
  if (t.startsWith("pie")) return "饼图";
  if (t.startsWith("mindmap")) return "思维导图";
  if (t.startsWith("gitgraph")) return "Git 图";
  if (t.startsWith("journey")) return "用户旅程图";
  if (t.startsWith("sequencediagram")) return "时序图";
  if (t.startsWith("classdiagram")) return "类图";
  if (t.startsWith("erdiagram")) return "ER 图";
  if (t.startsWith("statediagram")) return "状态图";
  if (FLOWCHART_TYPES.some(ft => t.startsWith(ft))) return "流程图";
  return "图表";
}

function detectNodeType(el: any, index: number, totalNodes: number) {
  if (!el) return null;
  const text = (el.label?.text || el.text || "").trim();

  if (/^(开始|start|開始)$/i.test(text)) return { type: "start", colors: { bg: "#fff8e1", stroke: "#f9a825", text: "#e65100" } };
  if (/^(结束|end|結束|stop|finish|done)$/i.test(text)) return { type: "end", colors: { bg: "#fce4ec", stroke: "#c62828", text: "#b71c1c" } };
  if (el.type === "diamond") return { type: "decision", colors: { bg: "#e3f2fd", stroke: "#1565c0", text: "#0d47a1" } };

  if (el.type === "rectangle") {
    if (/class|entity|table|用户|订单|商品|产品|账户|User|Order|Product/i.test(text)) {
      return { type: "entity", colors: { bg: "#e3f2fd", stroke: "#1976d2", text: "#0d47a1" } };
    }
    if (totalNodes <= 3 && index === 0) return { type: "start", colors: { bg: "#fff8e1", stroke: "#f9a825", text: "#e65100" } };
    if (totalNodes <= 3 && index === totalNodes - 1) return { type: "end", colors: { bg: "#fce4ec", stroke: "#c62828", text: "#b71c1c" } };
    return null;
  }

  if (el.type === "ellipse" || el.shape === "stadium") {
    if (/^(开始|start)/i.test(text)) return { type: "start", colors: { bg: "#fff8e1", stroke: "#f9a825", text: "#e65100" } };
    if (/^(结束|end)/i.test(text)) return { type: "end", colors: { bg: "#fce4ec", stroke: "#c62828", text: "#b71c1c" } };
  }

  return null;
}

export async function renderSvgFallback(mermaidCode: string): Promise<{ elements: any[]; files: any; isImageFallback: boolean }> {
  console.log("[AutoFlow-Converter] Attempting SVG fallback render (look:handDrawn)...");

  if (typeof document !== "undefined" && document.fonts) {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load("400 20px Excalifont", mermaidCode),
          document.fonts.load("400 20px Xiaolai", mermaidCode),
        ]),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch (e) {
      console.warn("[AutoFlow-Converter] Font pre-loading timed out, continuing with fallback");
    }
  }

  const mermaid = await getMermaidLib();

  mermaid.initialize(({
    startOnLoad: false,
    // Mermaid v11+ 内置的手绘风 look，切换后所有类型都会输出 rough.js 风格的 SVG
    look: "handDrawn",
    handDrawnSeed: 1,
    theme: "default",
    securityLevel: "loose",
    fontFamily: "Excalifont, Xiaolai, sans-serif",
    fontSize: 16,
    themeVariables: {
      fontSize: "16px",
      fontFamily: "\"Excalifont\", \"Xiaolai\", sans-serif",
      primaryColor: "#dbeafe",
      primaryTextColor: "#1e40af",
      primaryBorderColor: "#3b82f6",
      secondaryColor: "#fef3c7",
      secondaryTextColor: "#92400e",
      secondaryBorderColor: "#f59e0b",
      tertiaryColor: "#d1fae5",
      tertiaryTextColor: "#065f46",
      tertiaryBorderColor: "#10b981",
      lineColor: "#6b7280",
      textColor: "#1f2937",
      mainBkg: "#dbeafe",
      secondBkg: "#fef3c7",
      nodeBorder: "#3b82f6",
      clusterBkg: "#f0fdf4",
      clusterBorder: "#10b981",
      titleColor: "#1f2937",
      edgeLabelBackground: "#ffffff",
      nodeTextColor: "#1f2937",
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: "basis",
      padding: 15,
      nodeSpacing: 50,
      rankSpacing: 50,
      diagramPadding: 8,
    },
    sequence: {
      useMaxWidth: true,
      wrap: true,
      width: 150,
      height: 65,
      actorMargin: 50,
      boxMargin: 10,
      boxTextMargin: 5,
      noteMargin: 10,
      messageMargin: 35,
    },
    class: {
      useMaxWidth: true,
    },
    er: {
      useMaxWidth: true,
    },
    gantt: {
      useMaxWidth: true,
      fontSize: 12,
      sectionFontSize: 14,
      numberSectionStyles: 4,
      useWidth: 1200,
    },
    mindmap: {
      useMaxWidth: true,
      padding: 20,
      maxNodeWidth: 200,
      maxNodeHeight: 100,
    },
    pie: {
      useMaxWidth: true,
    },
    state: {
      useMaxWidth: true,
    },
  }) as any);

  const renderId = `autoflow-fallback-${Date.now()}`;
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-99999px;top:-99999px;opacity:0;z-index:-1;";
  document.body.appendChild(container);

  // AI 常在 classDiagram / erDiagram 里误用 flowchart 的 `-->|label|` 语法，导致 mermaid 词法分析失败。
  // 这里做一层容错清洗：
  //   classDiagram:  `User -->|places| Order`  →  `User --> Order : places`
  //   erDiagram 同理，但 erDiagram 的关系符不同（||--o{ 等），已少见，暂不动。
  // 策略：只在 classDiagram 场景触发，避免误伤 flowchart 合法语法。
  let sanitizedCode = mermaidCode;
  if (/^\s*classDiagram/m.test(mermaidCode)) {
    const arrowUnion = "-->|<--|\\.\\.>|<\\.\\.|--\\*|\\*--|--o|o--|--\\|>|<\\|--|--";
    const pattern = new RegExp(
      `([A-Za-z_][A-Za-z0-9_]*)\\s*(${arrowUnion})\\s*\\|([^|]+)\\|\\s*([A-Za-z_][A-Za-z0-9_]*)`,
      "g",
    );
    sanitizedCode = mermaidCode.replace(pattern, (_m, a, arrow, label, b) => `${a} ${arrow} ${b} : ${String(label).trim()}`);
    if (sanitizedCode !== mermaidCode) {
      console.log("[AutoFlow-Converter] classDiagram syntax auto-fixed: flowchart-style |label| removed");
    }
  }

  try {
    const { svg } = await mermaid.render(renderId, sanitizedCode, container);
    container.innerHTML = svg;

    const svgEl = container.querySelector("svg");
    if (!svgEl) throw new Error("SVG element not found in fallback render");

    const rect = svgEl.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;

    svgEl.setAttribute("width", `${width}`);
    svgEl.setAttribute("height", `${height}`);

    const svgContent = svgEl.outerHTML;
    const decoded = unescape(encodeURIComponent(svgContent));
    const svgBase64 = btoa(decoded);
    const svgDataURL = `data:image/svg+xml;base64,${svgBase64}`;

    const chartType = getChartTypeLabel(mermaidCode);
    const fileId = `autoflow-svg-${Date.now()}`;
    const rng = () => Math.floor(Math.random() * 2147483647);

    // 手动给齐 Excalidraw image 元素所有运行时必需字段
    // 不依赖 convertToExcalidrawElements / restoreElements，彻底避免 isTransparent 崩溃
    const imageElement = {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "image",
      x: 100,
      y: 100,
      width,
      height,
      angle: 0,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 0,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [] as string[],
      frameId: null,
      index: "a0",
      roundness: null,
      seed: rng(),
      version: 1,
      versionNonce: rng(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      fileId,
      scale: [1, 1] as [number, number],
      status: "saved",
      customData: undefined,
    };

    const files = {
      [fileId]: {
        id: fileId,
        mimeType: "image/svg+xml",
        dataURL: svgDataURL,
        created: Date.now(),
        lastRetrieved: Date.now(),
      },
    };

    console.log(`[AutoFlow-Converter] SVG fallback successful: ${chartType}, ${width}x${height}`);

    return {
      elements: [imageElement],
      files,
      isImageFallback: true,
    };
  } finally {
    container.remove();
    // 重置 mermaid 全局配置，避免 handDrawn 等配置污染后续 parseMermaidToExcalidraw 调用
    try {
      const mermaid = await getMermaidLib();
      mermaid.initialize({ startOnLoad: false });
    } catch {}
  }
}

/**
 * (已废弃) mermaidToHandDrawnImage 之前基于 svg2roughjs 做手绘化降级，
 * v2 重构时调研发现竞品 Mermaid 模式并未做手绘化，且 Mermaid v11+ 原生支持
 * look:"handDrawn" 配置，因此 svg2roughjs 属于过度工程，整个函数已删除。
 * mermaid 解析失败时一律降级到 renderSvgFallback（Mermaid 自带主题的 SVG → PNG）。
 */

function applyExcalidrawStyle(elements: any[], isImageFallback: boolean, mermaidCode?: string): any[] {
  if (!elements || elements.length === 0) return elements;

  let nodeIndex = 0;
  const shapeCount = elements.filter((e: any) =>
    e?.type === "rectangle" || e?.type === "ellipse"
  ).length;

  const result: any[] = [];

  for (const el of elements) {
    if (!el) continue;

    const styled = { ...el };
    styled.fontFamily = EXCALIFONT_FAMILY;

    if (styled.type === "text") {
      styled.roughness = 0;
      if (!styled.strokeColor) styled.strokeColor = "#212121";
      result.push(styled);
      continue;
    }

    if (styled.type === "image") {
      styled.status = "saved";
      result.push(styled);
      continue;
    }

    if (styled.type === "rectangle" || styled.type === "ellipse" || styled.type === "diamond") {
      styled.roughness = 1;

      if (!styled.strokeStyle) styled.strokeStyle = "solid";
      if (!styled.strokeWidth) styled.strokeWidth = 2;
      if (!styled.opacity) styled.opacity = 100;
      if (!styled.roundness) styled.roundness = { type: 3 };

      const nodeInfo = detectNodeType(styled, nodeIndex, shapeCount);

      if (nodeInfo) {
        const c = nodeInfo.colors;
        styled.backgroundColor = c.bg;
        styled.fillStyle = "solid";
        styled.strokeColor = c.stroke;

        if (styled.label) {
          styled.label = {
            ...styled.label,
            fontFamily: EXCALIFONT_FAMILY,
            strokeColor: c.text,
          };
        }
      } else {
        const bgColors = ["#f8fafc", "#fefce8", "#f0fdf4", "#eff6ff", "#fdf4ff", "#fff7ed"];
        const strokeColors = ["#94a3b8", "#ca8a04", "#22c55e", "#3b82f6", "#a855f7", "#f97316"];
        const colorIdx = nodeIndex % bgColors.length;
        styled.backgroundColor = bgColors[colorIdx];
        styled.fillStyle = "solid";
        if (!styled.strokeColor) styled.strokeColor = strokeColors[colorIdx];

        if (styled.label) {
          styled.label = {
            ...styled.label,
            fontFamily: EXCALIFONT_FAMILY,
            strokeColor: "#1f2937",
          };
        }
      }

      if (styled.type === "rectangle" || styled.type === "ellipse") {
        nodeIndex++;
      }

      result.push(styled);
      continue;
    }

    if (styled.type === "arrow" || styled.type === "line") {
      styled.roughness = 1;
      if (!styled.strokeStyle) styled.strokeStyle = "solid";
      if (!styled.strokeWidth) styled.strokeWidth = 2;
      if (!styled.strokeColor) styled.strokeColor = "#424242";
      if (styled.type === "arrow" && !styled.roundness) {
        styled.roundness = { type: 2 };
      }
      if (styled.label) {
        styled.label = {
          ...styled.label,
          fontFamily: EXCALIFONT_FAMILY,
        };
      }
      result.push(styled);
      continue;
    }

    result.push(styled);
  }

  return result;
}

/**
 * 预处理 mermaid 代码：去掉 @excalidraw/mermaid-to-excalidraw 不支持的语法
 * - subgraph...end 块（官方包对 subgraph 支持有限，会导致解析失败或降级）
 * - style... 行（官方包不支持自定义样式语句）
 */
function sanitizeMermaidForExcalidraw(code: string): string {
  const lines = code.split("\n");
  const out: string[] = [];
  let inSubgraph = false;
  let depth = 0;

  for (const raw of lines) {
    let line = raw.trim();

    // 体育场形状 ((text)) → 矩形 [text]（@excalidraw/mermaid-to-excalidraw 不支持）
    line = line.replace(/\(\((.+?)\)\)/g, '[$1]');

    // 去掉 style 行
    if (line.startsWith("style ")) {
      continue;
    }

    // 处理 subgraph 块：跳过整个 subgraph...end
    if (/^subgraph\s+/.test(line)) {
      inSubgraph = true;
      depth = 1;
      continue;
    }
    if (inSubgraph) {
      if (/^subgraph\s+/.test(line)) depth++;
      if (line === "end") {
        depth--;
        if (depth === 0) {
          inSubgraph = false;
        }
      }
      continue;
    }

    out.push(line);
  }

  let cleaned = out.join("\n").trim();
  if (cleaned !== code.trim()) {
    console.log("[AutoFlow-Converter] Sanitized mermaid code (removed subgraph/style)");
  }

  // 确保 header 后换行：flowchart TDNode → flowchart TD\nNode
  cleaned = cleaned.replace(/^(graph|flowchart)\s+(TD|TB|BT|LR|RL)([A-Za-z一-鿿])/m,
    '$1 $2\n$3');

  return cleaned;
}

function isOfficialEditableType(code: string): boolean {
  const t = code.trim().toLowerCase();
  return t.startsWith("graph ") || t.startsWith("flowchart ") || t.startsWith("sequencediagram");
}

export async function mermaidToExcalidraw(mermaidCode: string): Promise<{
  elements: any[];
  files?: any;
  isImageFallback?: boolean;
}> {
  try {
    const originalCode = mermaidCode;
    // 预处理：去掉不兼容语法
    mermaidCode = sanitizeMermaidForExcalidraw(mermaidCode);

    console.log("[AutoFlow-Converter] Starting conversion for:", mermaidCode.substring(0, 100));

    // 重置 mermaid 全局配置，避免之前 renderSvgFallback 设置的 handDrawn 等配置污染解析
    const mermaid = await getMermaidLib();
    mermaid.initialize({ startOnLoad: false });

    const { parseMermaid, convert } = await getConverters();

    const isEditableType = isOfficialEditableType(mermaidCode);

    let result: any;
    try {
      // 极简配置：只传字体相关，不传 flowchart/sequence 等子配置（避免 mermaid v11 解析异常）
      result = await parseMermaid(mermaidCode, {
        themeVariables: {
          fontSize: "20px",
          fontFamily: "Excalifont, Xiaolai",
        },
      });
    } catch (parseError: any) {
      console.error("[AutoFlow-Converter] Official library parse error:", parseError?.message);
      // 流程图/时序图是官方明确支持的，绝不允许降级为图片！
      if (isEditableType) {
        throw new Error(
          `官方转换器解析失败: ${parseError?.message || "未知错误"}. ` +
          `请检查浏览器控制台获取详细错误信息。`
        );
      }
      // 其他类型才允许降级
      console.log("[AutoFlow-Converter] Falling back to plain SVG render (renderSvgFallback)...");
      return await renderSvgFallback(originalCode);
    }

    console.log("[AutoFlow-Converter] Parse result type:", result?.type, "elements:", result?.elements?.length);

    if (!result) throw new Error("解析结果为空");

    const isImageFallback = result.type === "graphImage";

    if (isImageFallback) {
      const chartType = getChartTypeLabel(mermaidCode);
      console.warn(`[AutoFlow-Converter] ${chartType} returned graphImage from official library`);
      // 流程图/时序图不应该返回 graphImage，如果返回了说明代码有兼容性问题
      if (isEditableType) {
        throw new Error(
          `${chartType} 被官方转换器判定为不支持（graphImage）。` +
          `可能代码中包含 subgraph/style 等不兼容语法，或存在语法错误。`
        );
      }
      // 非核心类型允许降级
      if (!result.elements || result.elements.length === 0) {
        return await renderSvgFallback(originalCode);
      }
      const styledElements = applyExcalidrawStyle(result.elements, true, mermaidCode);
      return {
        elements: styledElements,
        files: result.files || null,
        isImageFallback: true,
      };
    }

    if (!result.elements || result.elements.length === 0) {
      throw new Error("转换结果中没有元素");
    }

    const excalidrawElements = convert(result.elements, { regenerateIds: true });

    if (!excalidrawElements || excalidrawElements.length === 0) {
      throw new Error("元素转换失败");
    }

    const styledElements = applyExcalidrawStyle(excalidrawElements, false);

    return {
      elements: styledElements,
      files: result.files || null,
      isImageFallback: false,
    };
  } catch (error: any) {
    console.error("[AutoFlow-Converter] All conversion attempts failed:", error);
    throw error;
  }
}

export function centerElements(elements: any[]): any[] {
  if (!elements || elements.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (!el) continue;

    if (el.type === "arrow" || el.type === "line") {
      if (el.points && el.points.length > 0) {
        for (const pt of el.points) {
          const absX = el.x + (Array.isArray(pt) ? pt[0] : pt.x || 0);
          const absY = el.y + (Array.isArray(pt) ? pt[1] : pt.y || 0);
          minX = Math.min(minX, absX);
          minY = Math.min(minY, absY);
          maxX = Math.max(maxX, absX);
          maxY = Math.max(maxY, absY);
        }
      }
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 0));
      maxY = Math.max(maxY, el.y + (el.height || 0));
    } else if (el.type === "image") {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 0));
      maxY = Math.max(maxY, el.y + (el.height || 0));
    } else {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 0));
      maxY = Math.max(maxY, el.y + (el.height || 0));
    }
  }

  if (!isFinite(minX)) return elements;

  const offsetX = -minX + 100;
  const offsetY = -minY + 100;

  return elements.map((el) => ({
    ...el,
    x: el.x + offsetX,
    y: el.y + offsetY,
  }));
}

export function convertMermaidDirection(code: string, direction: FlowDirection): string {
  const trimmed = code.trim();

  if (trimmed.startsWith("graph ")) {
    return trimmed.replace(/^graph\s+\w+/, `graph ${direction}`);
  } else if (trimmed.startsWith("flowchart ")) {
    return trimmed.replace(/^flowchart\s+\w+/, `flowchart ${direction}`);
  }
  return code;
}

/**
 * 修复 arrow/line 的 width/height 为 0 导致 Excalidraw 渲染异常的问题。
 * 前端侧兜底（与后端 fix_zero_dimensions 对齐），防止项目加载旧数据时命中该 bug。
 */
export function fixZeroDimensionElements(elements: any[]): any[] {
  if (!Array.isArray(elements)) return [];
  return elements.map((el) => {
    if (!el || typeof el !== "object") return el;
    if (el.type !== "arrow" && el.type !== "line") return el;
    const needsFix = el.width === 0 || el.height === 0;
    if (!needsFix) return el;
    return {
      ...el,
      width: el.width === 0 ? 1 : el.width,
      height: el.height === 0 ? 1 : el.height,
    };
  });
}

/**
 * Skeleton 防御性 sanitize（v3）。
 *
 * 背景：convertToExcalidrawElements 内部会对 label.text / text / type 等字段
 * 调用 .replace()、.trim()，一旦 AI 返回的 skeleton 中某个字段为 undefined 或
 * 非字符串，就会抛出 `Cannot read properties of undefined (reading 'replace')`。
 * 这里作一层兵开：
 *   - label.text 必为字符串
 *   - 独立 text 元素的 text 必为字符串
 *   - type 必存在且为有效值（无法识别则删除该元素）
 *   - arrow 的 start/end 必为对象且包含 id
 */
const VALID_SKELETON_TYPES = new Set([
  "rectangle", "ellipse", "diamond", "text", "arrow", "line", "image", "frame",
]);

export function sanitizeSkeletonForConvert(elements: any[]): any[] {
  if (!Array.isArray(elements)) return [];
  return elements.reduce<any[]>((acc, el) => {
    if (!el || typeof el !== "object") return acc;

    // 无效 type 直接跟除
    if (!el.type || !VALID_SKELETON_TYPES.has(el.type)) {
      console.warn("[AutoFlow-Converter] sanitize: drop element with invalid type", el?.type);
      return acc;
    }

    const clone: any = { ...el };

    // label.text 保护
    if (clone.label !== undefined && clone.label !== null) {
      if (typeof clone.label === "string") {
        clone.label = { text: clone.label };
      } else if (typeof clone.label === "object") {
        clone.label = {
          ...clone.label,
          text: typeof clone.label.text === "string" ? clone.label.text : String(clone.label.text ?? ""),
        };
      } else {
        delete clone.label;
      }
    }

    // 独立 text 元素的 text 字段保护
    if (clone.type === "text") {
      clone.text = typeof clone.text === "string" ? clone.text : String(clone.text ?? "");
    }

    // arrow 的 start/end 保护
    if (clone.type === "arrow") {
      if (clone.start && (typeof clone.start !== "object" || !clone.start.id)) {
        delete clone.start;
      }
      if (clone.end && (typeof clone.end !== "object" || !clone.end.id)) {
        delete clone.end;
      }
    }

    // 数字字段底底为 NaN 时托底
    for (const k of ["x", "y", "width", "height"]) {
      if (typeof clone[k] !== "number" || Number.isNaN(clone[k])) {
        clone[k] = 0;
      }
    }

    acc.push(clone);
    return acc;
  }, []);
}

/**
 * 检查数组是否已是完整的 Excalidraw 元素（带 versionNonce 等内部字段），
 * 若是则无需再走 convertToExcalidrawElements。与竞品 isFullExcalidrawElements 对齐。
 */
function isFullExcalidrawElements(elements: any[]): boolean {
  if (!Array.isArray(elements) || elements.length === 0) return false;
  return elements.every((el) => el && typeof el === "object" && typeof el.versionNonce === "number");
}

/**
 * 为 Skeleton 元素填充缺失的默认样式属性。
 *
 * 与 applyExcalidrawStyle 不同，此函数**不覆盖** AI 已设置的颜色、尺寸等属性，
 * 只填补 fontFamily、roughness、strokeStyle 等通用属性。
 *
 * 核心原则：AI 生成的语义色（蓝色=流程节点、黄色=决策等）必须被保留。
 */
function applySkeletonDefaults(elements: any[]): any[] {
  if (!elements || elements.length === 0) return elements;
  return elements.map((el) => {
    if (!el) return el;
    const styled = { ...el };
    // 统一字体（仅填补缺省）
    if (styled.fontFamily === undefined || styled.fontFamily === null) {
      styled.fontFamily = EXCALIFONT_FAMILY;
    }

    if (styled.type === "text") {
      if (styled.roughness === undefined) styled.roughness = 0;
      if (!styled.strokeColor) styled.strokeColor = "#212121";
      return styled;
    }

    if (
      styled.type === "rectangle" ||
      styled.type === "ellipse" ||
      styled.type === "diamond"
    ) {
      if (styled.roughness === undefined) styled.roughness = 1;
      if (!styled.strokeStyle) styled.strokeStyle = "solid";
      if (!styled.strokeWidth) styled.strokeWidth = 2;
      if (!styled.opacity) styled.opacity = 100;
      if (!styled.fillStyle) styled.fillStyle = "solid";
      if (!styled.roundness) styled.roundness = { type: 3 };
      // 仅在 AI 未设置时填充默认颜色（保留 AI 语义色）
      if (!styled.backgroundColor) styled.backgroundColor = "#e3f2fd";
      if (!styled.strokeColor) styled.strokeColor = "#1565c0";
      if (styled.label) {
        styled.label = {
          ...styled.label,
          fontFamily: styled.label.fontFamily ?? EXCALIFONT_FAMILY,
          strokeColor: styled.label.strokeColor ?? "#1f2937",
        };
      }
      return styled;
    }

    if (styled.type === "arrow" || styled.type === "line") {
      if (styled.roughness === undefined) styled.roughness = 1;
      if (!styled.strokeStyle) styled.strokeStyle = "solid";
      if (!styled.strokeWidth) styled.strokeWidth = 2;
      if (!styled.strokeColor) styled.strokeColor = "#424242";
      if (styled.type === "arrow" && !styled.roundness) {
        styled.roundness = { type: 2 };
      }
      if (styled.label) {
        styled.label = {
          ...styled.label,
          fontFamily: styled.label.fontFamily ?? EXCALIFONT_FAMILY,
        };
      }
      return styled;
    }

    return styled;
  });
}

/**
 * 将 AI 生成的 Excalidraw Skeleton JSON 数组转换为可编辑的 Excalidraw 元素。
 *
 * 流程：fixZero → convertToExcalidrawElements → restoreElements({ repairBindings: true })
 * → applySkeletonDefaults（保留 AI 语义色，仅填补缺省样式）。
 */
export async function applySkeletonToExcalidraw(skeletonElements: any[]): Promise<{
  elements: any[];
}> {
  if (!Array.isArray(skeletonElements) || skeletonElements.length === 0) {
    throw new Error("Skeleton 元素数组为空");
  }

  const { convert, restore } = await getSkeletonConverters();

  // v3 防御：先 sanitize 再修正尺寸
  const sanitized = sanitizeSkeletonForConvert(skeletonElements);
  const fixed = fixZeroDimensionElements(sanitized);
  console.log("[AutoFlow-Converter] Skeleton input types:", fixed.map((e: any) => e?.type));

  let restored: any[];
  try {
    if (isFullExcalidrawElements(fixed)) {
      restored = restore(fixed, null, { repairBindings: true });
    } else {
      const converted = convert(fixed);
      console.log("[AutoFlow-Converter] convertToExcalidrawElements output types:", converted.map((e: any) => e?.type));
      restored = restore(converted, null, { repairBindings: true });
    }
  } catch (err: any) {
    console.error("[AutoFlow-Converter] applySkeletonToExcalidraw failed:", err);
    throw new Error(`Skeleton \u8f6c\u6362\u5931\u8d25: ${err?.message || "unknown"}`);
  }

  if (!restored || restored.length === 0) {
    throw new Error("Skeleton \u8f6c\u6362\u540e\u5143\u7d20\u4e3a\u7a7a");
  }

  console.log("[AutoFlow-Converter] restoreElements output:", restored.length, "elements");

  // 使用 applySkeletonDefaults 而非 applyExcalidrawStyle，确保 AI 语义色被保留
  const styled = applySkeletonDefaults(restored);

  return { elements: styled };
}
