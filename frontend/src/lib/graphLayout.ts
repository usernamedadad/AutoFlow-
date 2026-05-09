/**
 * Dagre 布局引擎封装。
 *
 * 将 LLM 输出的紧凑图结构描述 → 自动计算坐标 → 输出 Excalidraw 元素。
 * LLM 不再需要生成任何 x/y/width/height/backgroundColor 等像素级参数。
 */
import dagre from "@dagrejs/dagre";
import type { ExcalidrawElement } from "./graphModel";

// ── 紧凑格式类型 ──────────────────────────────────────

export interface CompactNode {
  id: string;
  label: string;
  type: "rectangle" | "ellipse" | "diamond";
  /** 语义角色，驱动配色，可选 */
  role?: "start" | "end" | "decision" | "process" | "root" | "branch" | "entity" | "attribute";
}

export interface CompactEdge {
  from: string;
  to: string;
  label?: string;
}

export interface CompactGraph {
  nodes: CompactNode[];
  edges: CompactEdge[];
  layout?: "TD" | "LR";
  /** 图表类型（驱动默认配色方案） */
  chartType?: "flowchart" | "hierarchy" | "er" | "network" | "mindmap";
}

// ── 配色方案 ──────────────────────────────────────────

type ColorScheme = Record<string, { bg: string; stroke: string }>;

const COLOR_FLOWCHART: ColorScheme = {
  start:    { bg: "#fff8e1", stroke: "#f9a825" },
  end:      { bg: "#fce4ec", stroke: "#c62828" },
  decision: { bg: "#fff3e0", stroke: "#e65100" },
  process:  { bg: "#e3f2fd", stroke: "#1565c0" },
};

const COLOR_HIERARCHY: ColorScheme = {
  root:    { bg: "#f3e5f5", stroke: "#7b1fa2" },
  branch:  { bg: "#e8f5e9", stroke: "#388e3c" },
  process: { bg: "#e3f2fd", stroke: "#1565c0" },
};

const COLOR_ER: ColorScheme = {
  entity:    { bg: "#e3f2fd", stroke: "#1976d2" },
  attribute: { bg: "#fff8e1", stroke: "#f9a825" },
  process:   { bg: "#fce4ec", stroke: "#c62828" },
};

const COLOR_NETWORK: ColorScheme = {
  root:     { bg: "#e8f5e9", stroke: "#2e7d32" },
  process:  { bg: "#e3f2fd", stroke: "#1565c0" },
  branch:   { bg: "#fff3e0", stroke: "#e65100" },
};

// ── 节点尺寸 ──────────────────────────────────────────

type SizeMap = Record<string, { w: number; h: number }>;

const SIZE_FLOWCHART: SizeMap = {
  start:    { w: 160, h: 70 },
  end:      { w: 160, h: 70 },
  decision: { w: 160, h: 90 },
  process:  { w: 180, h: 80 },
};

const SIZE_HIERARCHY: SizeMap = {
  root:    { w: 180, h: 80 },
  branch:  { w: 160, h: 60 },
  process: { w: 140, h: 50 },
};

const SIZE_DEFAULT: SizeMap = {
  start:    { w: 160, h: 70 },
  end:      { w: 160, h: 70 },
  decision: { w: 160, h: 90 },
  process:  { w: 180, h: 80 },
};

// ── 主函数 ────────────────────────────────────────────

/**
 * 检测 JSON 数据是否为紧凑图格式
 */
export function isCompactGraph(data: any): data is CompactGraph {
  return (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Array.isArray(data.nodes) &&
    Array.isArray(data.edges) &&
    data.nodes.length > 0 &&
    typeof data.nodes[0] === "object" &&
    "label" in data.nodes[0]
  );
}

/**
 * 将紧凑图结构展开为 Excalidraw 元素（含 Dagre 自动布局）
 */
export function compactGraphToExcalidraw(graph: CompactGraph): ExcalidrawElement[] {
  const direction = graph.layout === "LR" ? "LR" : "TD";
  const chartType = graph.chartType || inferChartType(graph);
  const colorScheme = getColorScheme(chartType);
  const sizeMap = getSizeMap(chartType);

  // 分配默认 role（不修改输入数据）
  const resolvedNodes: Array<CompactNode & { role: NonNullable<CompactNode["role"]> }> = graph.nodes.map((node) => ({
    ...node,
    role: node.role || inferRole(node, graph),
  }));

  // ── Dagre 布局 ──
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: direction === "LR" ? 60 : 100,
    ranksep: direction === "LR" ? 120 : 100,
    edgesep: 40,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of resolvedNodes) {
    const sz = sizeMap[node.role] || SIZE_DEFAULT.process;
    g.setNode(node.id, { width: sz.w, height: sz.h });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.from, edge.to);
  }

  try {
    dagre.layout(g);
  } catch (e) {
    console.warn("[graphLayout] dagre layout failed, using fallback", e);
    return fallbackLayout(graph);
  }

  // ── 生成 Excalidraw 元素 ──
  const elements: ExcalidrawElement[] = [];
  const graphCenter = computeGraphCenter(g);

  for (const node of resolvedNodes) {
    const dagreNode = g.node(node.id);
    if (!dagreNode) continue;

    const sz = sizeMap[node.role] || SIZE_DEFAULT.process;
    const colors = colorScheme[node.role] || colorScheme.process || { bg: "#f5f5f5", stroke: "#666666" };

    // Dagre 返回的是节点中心坐标，Excalidraw 用左上角
    const x = Math.round(dagreNode.x - sz.w / 2 - graphCenter.offsetX);
    const y = Math.round(dagreNode.y - sz.h / 2 - graphCenter.offsetY);

    const elType = node.role === "start" || node.role === "end" ? "ellipse"
      : node.role === "decision" ? "diamond"
      : node.type === "ellipse" ? "ellipse"
      : node.type === "diamond" ? "diamond"
      : "rectangle";

    elements.push({
      id: node.id,
      type: elType,
      x,
      y,
      width: sz.w,
      height: sz.h,
      backgroundColor: colors.bg,
      strokeColor: colors.stroke,
      fillStyle: "solid",
      strokeStyle: "solid",
      strokeWidth: 2,
      roughness: 1,
      boundElements: [],
      label: { text: node.label, fontSize: 16, fontFamily: 5 },
    });
  }

  // 记录每个 shape 被哪些 arrow 引用，用于填充 boundElements
  const boundMap = new Map<string, { type: string; id: string }[]>();

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const edgeId = `a${i + 1}`;

    // 获取 Dagre 计算的边控制点
    const dagreEdge = g.edge(edge.from, edge.to);
    const points = dagreEdge?.points || [];

    let ax: number, ay: number, aw: number, ah: number;
    if (points.length >= 2) {
      // 使用 Dagre 路由点
      const startPt = points[0];
      const endPt = points[points.length - 1];
      // 从节点中心偏移到边缘
      const startNode = g.node(edge.from);
      const endNode = g.node(edge.to);
      const startSz = startNode ? { w: startNode.width, h: startNode.height } : { w: 160, h: 80 };
      const endSz = endNode ? { w: endNode.width, h: endNode.height } : { w: 160, h: 80 };

      // 将 Dagre 绝对坐标转为 Excalidraw 左上角相对坐标
      ax = Math.min(startPt.x, endPt.x) - graphCenter.offsetX;
      ay = Math.min(startPt.y, endPt.y) - graphCenter.offsetY;
      aw = Math.max(Math.abs(endPt.x - startPt.x), 1);
      ah = Math.max(Math.abs(endPt.y - startPt.y), 1);
    } else {
      // 简单 fallback
      ax = 0; ay = 0; aw = 80; ah = 1;
    }

    const arrowEl: ExcalidrawElement = {
      id: edgeId,
      type: "arrow",
      x: ax,
      y: ay,
      width: aw,
      height: ah,
      strokeColor: "#333333",
      strokeWidth: 2,
      roughness: 1,
      endArrowhead: "arrow",
      start: { id: edge.from },
      end: { id: edge.to },
    };

    if (edge.label) {
      arrowEl.label = { text: edge.label, fontSize: 14, fontFamily: 5 };
    }

    elements.push(arrowEl);

    // 记录 boundElements
    if (edge.from) {
      if (!boundMap.has(edge.from)) boundMap.set(edge.from, []);
      boundMap.get(edge.from)!.push({ type: "arrow", id: edgeId });
    }
    if (edge.to) {
      if (!boundMap.has(edge.to)) boundMap.set(edge.to, []);
      boundMap.get(edge.to)!.push({ type: "arrow", id: edgeId });
    }
  }

  // 填充 boundElements
  for (const el of elements) {
    if (el.id && boundMap.has(el.id)) {
      el.boundElements = boundMap.get(el.id) || [];
    }
  }

  return elements;
}

// ── 辅助函数 ──────────────────────────────────────────

function inferChartType(graph: CompactGraph): string {
  const types = graph.nodes.map((n) => n.type);
  const diamondCount = types.filter((t) => t === "diamond").length;
  if (diamondCount > 0) return "flowchart";
  if (graph.nodes.some((n) => n.role === "root")) return "hierarchy";
  return "flowchart";
}

function inferRole(node: CompactNode, graph: CompactGraph): NonNullable<CompactNode["role"]> {
  if (node.role) return node.role;
  // 第一个节点通常是开始
  if (node.id === graph.nodes[0]?.id && node.type === "ellipse") return "start";
  // 最后一个节点通常是结束
  if (node.id === graph.nodes[graph.nodes.length - 1]?.id && node.type === "ellipse") return "end";
  // diamond 通常是决策
  if (node.type === "diamond") return "decision";
  return "process";
}

function getColorScheme(chartType: string): ColorScheme {
  switch (chartType) {
    case "hierarchy": return COLOR_HIERARCHY;
    case "er": return COLOR_ER;
    case "network": return COLOR_NETWORK;
    default: return COLOR_FLOWCHART;
  }
}

function getSizeMap(chartType: string): SizeMap {
  switch (chartType) {
    case "hierarchy": return SIZE_HIERARCHY;
    case "flowchart": return SIZE_FLOWCHART;
    default: return SIZE_DEFAULT;
  }
}

function computeGraphCenter(g: any): { offsetX: number; offsetY: number } {
  const nodes = g.nodes();
  if (nodes.length === 0) return { offsetX: 0, offsetY: 0 };
  let minX = Infinity, minY = Infinity;
  for (const id of nodes) {
    const n = g.node(id);
    if (n) {
      minX = Math.min(minX, n.x - (n.width || 0) / 2);
      minY = Math.min(minY, n.y - (n.height || 0) / 2);
    }
  }
  return {
    offsetX: Math.max(0, minX - 60),
    offsetY: Math.max(0, minY - 60),
  };
}

function fallbackLayout(graph: CompactGraph): ExcalidrawElement[] {
  // 简单垂直排列作为兜底
  const elements: ExcalidrawElement[] = [];
  let y = 50;
  const startX = 200;
  const nodeW = 180;
  const nodeH = 80;
  const gap = 120;

  for (const node of graph.nodes) {
    const elType = node.type === "diamond" ? "diamond"
      : node.type === "ellipse" ? "ellipse"
      : "rectangle";
    elements.push({
      id: node.id,
      type: elType,
      x: startX,
      y,
      width: nodeW,
      height: nodeH,
      backgroundColor: "#e3f2fd",
      strokeColor: "#1565c0",
      fillStyle: "solid",
      strokeStyle: "solid",
      strokeWidth: 2,
      roughness: 1,
      // opacity handled by Excalidraw internally
      boundElements: [],
      label: { text: node.label, fontSize: 16, fontFamily: 5 },
    });
    y += nodeH + gap;
  }

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    elements.push({
      id: `a${i + 1}`,
      type: "arrow",
      x: startX + nodeW / 2,
      y: 50 + (graph.nodes.findIndex((n) => n.id === edge.from)) * (nodeH + gap) + nodeH,
      width: 1,
      height: gap,
      strokeColor: "#333333",
      strokeWidth: 2,
      roughness: 1,
      endArrowhead: "arrow",
      start: { id: edge.from },
      end: { id: edge.to },
    });
  }

  return elements;
}
