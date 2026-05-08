/**
 * 结构化中间表示层 (GraphModel)
 *
 * 将 Excalidraw 原始 JSON 数组抽象为「节点 + 连线 + 布局」的结构化模型，
 * 作为增量编辑请求的输入/输出契约。
 */

// ─── 类型定义 ───────────────────────────────────────

export type ShapeType = "rectangle" | "ellipse" | "diamond";
export type ElementType = ShapeType | "text" | "arrow" | "line";

export interface GraphStyle {
  backgroundColor: string;
  strokeColor: string;
  strokeStyle: "solid" | "dashed" | "dotted";
  strokeWidth: number;
  roughness: number;
  fontSize: number;
  fontFamily: number; // 5=手写 6=标准
}

export interface GraphNode {
  id: string;
  type: ShapeType | "text";
  label: string;        // 显示文本 (label.text 或 text)
  x: number;
  y: number;
  width: number;
  height: number;
  style: GraphStyle;
  group?: string;       // 容启分组 id 列表 (逗号分隔)
  order?: number;       // 流程顺序，预留
}

export interface GraphEdge {
  id: string;
  from: string;          // source node/element id
  to: string;            // target node/element id
  label: string;
  type: "arrow" | "line";
  x: number;
  y: number;
  width: number;
  height: number;
  style: Omit<GraphStyle, "fontSize" | "fontFamily"> & {
    endArrowhead?: string;
    fontSize?: number;
    fontFamily?: number;
  };
}

export interface LayoutMeta {
  direction: "TD" | "LR";
  canvasWidth: number;
  canvasHeight: number;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: LayoutMeta;
}

// ─── 默认样式 ───────────────────────────────────────

export const DEFAULT_STYLE: GraphStyle = {
  backgroundColor: "#e3f2fd",
  strokeColor: "#1565c0",
  strokeStyle: "solid",
  strokeWidth: 2,
  roughness: 1,
  fontSize: 16,
  fontFamily: 5,
};

// ─── Excalidraw ↔ GraphModel 互转 ───────────────────

export interface ExcalidrawElement {
  id?: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  label?: { text: string; fontSize?: number; fontFamily?: number };
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  start?: { id: string };
  end?: { id: string };
  endArrowhead?: string;
  boundElements?: { type: string; id: string }[] | null;
  groupIds?: string[];
  containerId?: string;
  points?: [number, number][];
}

const SHAPE_TYPES: Set<string> = new Set(["rectangle", "ellipse", "diamond"]);
const EDGE_TYPES: Set<string> = new Set(["arrow", "line"]);

/**
 * Excalidraw elements 数组 → GraphModel
 */
export function elementsToGraphModel(
  elements: ExcalidrawElement[],
  direction: "TD" | "LR" = "TD",
): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let maxX = 0;
  let maxY = 0;

  for (const el of elements) {
    if (SHAPE_TYPES.has(el.type)) {
      const node: GraphNode = {
        id: el.id || "",
        type: el.type as ShapeType,
        label: el.label?.text || "",
        x: el.x,
        y: el.y,
        width: el.width ?? 160,
        height: el.height ?? 80,
        style: {
          backgroundColor: el.backgroundColor || DEFAULT_STYLE.backgroundColor,
          strokeColor: el.strokeColor || DEFAULT_STYLE.strokeColor,
          strokeStyle: (el.strokeStyle as GraphStyle["strokeStyle"]) || DEFAULT_STYLE.strokeStyle,
          strokeWidth: el.strokeWidth ?? DEFAULT_STYLE.strokeWidth,
          roughness: el.roughness ?? DEFAULT_STYLE.roughness,
          fontSize: el.label?.fontSize ?? DEFAULT_STYLE.fontSize,
          fontFamily: el.label?.fontFamily ?? DEFAULT_STYLE.fontFamily,
        },
        group: el.groupIds?.join(","),
      };
      nodes.push(node);
      maxX = Math.max(maxX, el.x + (el.width ?? 160));
      maxY = Math.max(maxY, el.y + (el.height ?? 80));
    } else if (el.type === "text") {
      const node: GraphNode = {
        id: el.id || "",
        type: "text",
        label: el.text || "",
        x: el.x,
        y: el.y,
        width: el.width ?? 0,
        height: el.height ?? 0,
        style: {
          backgroundColor: "transparent",
          strokeColor: el.strokeColor || "#1f2937",
          strokeStyle: "solid",
          strokeWidth: 0,
          roughness: el.roughness ?? 0,
          fontSize: el.fontSize ?? 14,
          fontFamily: el.fontFamily ?? 5,
        },
        group: el.groupIds?.join(","),
      };
      nodes.push(node);
    } else if (EDGE_TYPES.has(el.type)) {
      const edge: GraphEdge = {
        id: el.id || "",
        from: el.start?.id || "",
        to: el.end?.id || "",
        label: el.label?.text || "",
        type: el.type as "arrow" | "line",
        x: el.x,
        y: el.y,
        width: el.width ?? 0,
        height: el.height ?? 0,
        style: {
          backgroundColor: el.backgroundColor || "transparent",
          strokeColor: el.strokeColor || "#333333",
          strokeStyle: (el.strokeStyle as GraphStyle["strokeStyle"]) || "solid",
          strokeWidth: el.strokeWidth ?? 2,
          roughness: el.roughness ?? 1,
          endArrowhead: el.endArrowhead,
          fontSize: el.label?.fontSize ?? 14,
          fontFamily: el.label?.fontFamily ?? 5,
        },
      };
      edges.push(edge);
    } else {
      console.warn("[AutoFlow] elementsToGraphModel: 未识别的元素类型", el.type, el.id);
    }
  }

  return {
    nodes,
    edges,
    layout: {
      direction,
      canvasWidth: Math.max(maxX + 200, 1200),
      canvasHeight: Math.max(maxY + 200, 800),
    },
  };
}

/**
 * GraphModel → Excalidraw elements 数组
 */
export function graphModelToElements(model: GraphModel): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];

  for (const node of model.nodes) {
    if (node.type === "text") {
      elements.push({
        id: node.id,
        type: "text",
        x: node.x,
        y: node.y,
        width: node.width || undefined,
        height: node.height || undefined,
        text: node.label,
        fontSize: node.style.fontSize,
        fontFamily: node.style.fontFamily,
        strokeColor: node.style.strokeColor,
        roughness: node.style.roughness,
        groupIds: node.group ? node.group.split(",") : undefined,
      });
    } else {
      elements.push({
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        backgroundColor: node.style.backgroundColor,
        strokeColor: node.style.strokeColor,
        strokeStyle: node.style.strokeStyle,
        strokeWidth: node.style.strokeWidth,
        roughness: node.style.roughness,
        fillStyle: "solid",
        label: { text: node.label, fontSize: node.style.fontSize, fontFamily: node.style.fontFamily },
        boundElements: [],
        groupIds: node.group ? node.group.split(",") : undefined,
      });
    }
  }

  for (const edge of model.edges) {
    elements.push({
      id: edge.id,
      type: edge.type,
      x: edge.x,
      y: edge.y,
      width: edge.width || 0,
      height: edge.height || 0,
      strokeColor: edge.style.strokeColor,
      strokeStyle: edge.style.strokeStyle,
      strokeWidth: edge.style.strokeWidth,
      roughness: edge.style.roughness,
      start: edge.from ? { id: edge.from } : undefined,
      end: edge.to ? { id: edge.to } : undefined,
      endArrowhead: edge.style.endArrowhead,
      label: edge.label ? { text: edge.label, fontSize: edge.style.fontSize, fontFamily: edge.style.fontFamily } : undefined,
    });
  }

  return elements;
}

/**
 * 浅层快照复制
 */
export function cloneGraphModel(model: GraphModel): GraphModel {
  return {
    nodes: model.nodes.map((n) => ({ ...n, style: { ...n.style } })),
    edges: model.edges.map((e) => ({ ...e, style: { ...e.style } })),
    layout: { ...model.layout },
  };
}
