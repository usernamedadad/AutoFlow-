/**
 * Diff DSL 执行引擎
 *
 * 解析 LLM 返回的增量变更指令 (Diff DSL) 并应用到 Excalidraw elements 数组。
 */

// ─── 类型定义 ───────────────────────────────────────

export type DiffOpType =
  | "add_node"
  | "delete"
  | "update_style"
  | "update_text"
  | "add_edge"
  | "reorder"
  | "move";

export interface AddNodeOp {
  op: "add_node";
  node: {
    id: string;
    type: "rectangle" | "ellipse" | "diamond" | "text";
    label: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    style?: Record<string, unknown>;
  };
  position?: "before" | "after" | "below" | "above";
  reference?: string;
}

export interface DeleteOp {
  op: "delete";
  target: string;
}

export interface UpdateStyleOp {
  op: "update_style";
  target: string;
  changes: Record<string, unknown>;
}

export interface UpdateTextOp {
  op: "update_text";
  target: string;
  text: string;
}

export interface AddEdgeOp {
  op: "add_edge";
  edge: {
    id: string;
    from: string;
    to: string;
    label?: string;
    type?: "arrow" | "line";
    style?: Record<string, unknown>;
  };
}

export interface ReorderOp {
  op: "reorder";
  targets: string[];
  layout: "horizontal" | "vertical";
  gap?: number;
}

export interface MoveOp {
  op: "move";
  target: string;
  x: number;
  y: number;
}

export type DiffOperation =
  | AddNodeOp
  | DeleteOp
  | UpdateStyleOp
  | UpdateTextOp
  | AddEdgeOp
  | ReorderOp
  | MoveOp;

export interface DiffResponse {
  operations: DiffOperation[];
  notes?: string;
}

import { type ExcalidrawElement } from "./graphModel";

// ─── 主函数 ─────────────────────────────────────────

/**
 * 将 Diff DSL 应用到 elements 数组，返回修改后的数组。
 *
 * 核心原则：只修改受影响的元素，其余完全不动。
 *
 * @param elements 当前画布元素数组
 * @param diffResponse LLM 返回的增量变更指令
 * @returns 修改后的元素数组 (新数组，但未修改元素保持原引用)
 */
export function applyDiff(
  elements: ExcalidrawElement[],
  diffResponse: DiffResponse,
): ExcalidrawElement[] {
  if (!diffResponse.operations?.length) return elements;

  const result = [...elements];

  function findIdx(id: string): number {
    return result.findIndex((el) => el.id === id);
  }

  for (const op of diffResponse.operations) {
    switch (op.op) {
      case "update_style":
        applyUpdateStyle(result, op, findIdx);
        break;
      case "update_text":
        applyUpdateText(result, op, findIdx);
        break;
      case "add_node":
        applyAddNode(result, op);
        break;
      case "add_edge":
        applyAddEdge(result, op);
        break;
      case "delete":
        applyDelete(result, op, findIdx);
        break;
      case "reorder":
        applyReorder(result, op, findIdx);
        break;
      case "move":
        applyMove(result, op, findIdx);
        break;
    }
  }

  return result;
}

// ─── 操作实现 ───────────────────────────────────────

type FindFn = (id: string) => number;

function applyUpdateStyle(arr: ExcalidrawElement[], op: UpdateStyleOp, findEl: FindFn): void {
  const idx = findEl(op.target);
  if (idx === -1) return;
  const el = { ...arr[idx] };
  for (const [key, value] of Object.entries(op.changes)) {
    (el as Record<string, unknown>)[key] = value;
  }
  if (el.label) {
    if (typeof op.changes.fontSize === "number") el.label.fontSize = op.changes.fontSize as number;
    if (typeof op.changes.fontFamily === "number") el.label.fontFamily = op.changes.fontFamily as number;
  }
  arr[idx] = el;
}

function applyUpdateText(arr: ExcalidrawElement[], op: UpdateTextOp, findEl: FindFn): void {
  const idx = findEl(op.target);
  if (idx === -1) return;
  const el = { ...arr[idx] };
  if (el.type === "text") {
    el.text = op.text;
  } else if (el.label) {
    el.label = { ...el.label, text: op.text };
  }
  arr[idx] = el;
}

function applyAddNode(arr: ExcalidrawElement[], op: AddNodeOp): void {
  const refIdx = op.reference ? arr.findIndex((el) => el.id === op.reference) : -1;
  const refEl = refIdx >= 0 ? arr[refIdx] : null;

  const gap = 100;
  let x = op.node.x ?? 100;
  let y = op.node.y ?? 100;

  if (refEl) {
    switch (op.position) {
      case "after":
        x = refEl.x + (refEl.width ?? 160) + gap;
        y = refEl.y;
        break;
      case "before":
        x = refEl.x - (op.node.width ?? 160) - gap;
        y = refEl.y;
        break;
      case "below":
        x = refEl.x;
        y = refEl.y + (refEl.height ?? 80) + gap;
        break;
      case "above":
        x = refEl.x;
        y = refEl.y - (op.node.height ?? 80) - gap;
        break;
    }
  }

  const nodeType = op.node.type;
  if (nodeType === "text") {
    arr.push({
      id: op.node.id,
      type: "text",
      x,
      y,
      text: op.node.label,
      fontSize: (op.node.style?.fontSize as number) ?? 14,
      fontFamily: (op.node.style?.fontFamily as number) ?? 5,
      strokeColor: (op.node.style?.strokeColor as string) ?? "#1f2937",
      roughness: (op.node.style?.roughness as number) ?? 0,
    });
  } else {
    arr.push({
      id: op.node.id,
      type: nodeType,
      x,
      y,
      width: op.node.width ?? 160,
      height: op.node.height ?? 80,
      backgroundColor: (op.node.style?.backgroundColor as string) ?? "#e3f2fd",
      strokeColor: (op.node.style?.strokeColor as string) ?? "#1565c0",
      strokeStyle: ((op.node.style?.strokeStyle as string) ?? "solid") as "solid" | "dashed" | "dotted",
      strokeWidth: (op.node.style?.strokeWidth as number) ?? 2,
      roughness: (op.node.style?.roughness as number) ?? 1,
      fillStyle: "solid",
      label: {
        text: op.node.label,
        fontSize: (op.node.style?.fontSize as number) ?? 16,
        fontFamily: (op.node.style?.fontFamily as number) ?? 5,
      },
      boundElements: [],
    });
  }
}

function applyAddEdge(arr: ExcalidrawElement[], op: AddEdgeOp): void {
  const edgeId = op.edge.id;
  arr.push({
    id: edgeId,
    type: op.edge.type || "arrow",
    x: 0, y: 0, width: 0, height: 0,
    strokeColor: (op.edge.style?.strokeColor as string) ?? "#333333",
    strokeStyle: ((op.edge.style?.strokeStyle as string) ?? "solid") as "solid" | "dashed" | "dotted",
    strokeWidth: (op.edge.style?.strokeWidth as number) ?? 2,
    roughness: (op.edge.style?.roughness as number) ?? 1,
    start: { id: op.edge.from },
    end: { id: op.edge.to },
    endArrowhead: (op.edge.style?.endArrowhead as string) ?? "arrow",
    label: op.edge.label
      ? {
          text: op.edge.label,
          fontSize: (op.edge.style?.fontSize as number) ?? 14,
          fontFamily: (op.edge.style?.fontFamily as number) ?? 5,
        }
      : undefined,
  });

  // 更新 source/target 节点的 boundElements
  for (const targetId of [op.edge.from, op.edge.to]) {
    const idx = arr.findIndex((el) => el.id === targetId);
    if (idx === -1) continue;
    const el = { ...arr[idx] };
    const bound = el.boundElements?.filter((b) => b.type !== "arrow" || b.id !== edgeId) ?? [];
    bound.push({ type: "arrow", id: edgeId });
    el.boundElements = bound;
    arr[idx] = el;
  }
}

function applyDelete(arr: ExcalidrawElement[], op: DeleteOp, _findEl: FindFn): void {
  const targetId = op.target;
  const idx = arr.findIndex((el) => el.id === targetId);
  if (idx === -1) return;

  const targetType = arr[idx].type;
  arr.splice(idx, 1);

  // 删除节点时同时清理连接到该节点的所有边
  if (targetType !== "arrow" && targetType !== "line") {
    for (let i = arr.length - 1; i >= 0; i--) {
      const el = arr[i];
      if (el.type === "arrow" || el.type === "line") {
        if (el.start?.id === targetId || el.end?.id === targetId) {
          arr.splice(i, 1);
        }
      }
    }
  }
}

function applyReorder(arr: ExcalidrawElement[], op: ReorderOp, findEl: FindFn): void {
  if (op.targets.length < 2) return;

  const gap = op.gap ?? 100;
  const targetIds = new Set(op.targets);
  const targetEls = arr.filter((el) => el.id && targetIds.has(el.id));
  if (targetEls.length < 2) return;

  if (op.layout === "horizontal") {
    targetEls.sort((a, b) => a.x - b.x);
    const startX = targetEls[0].x;
    for (let i = 0; i < targetEls.length; i++) {
      const el = targetEls[i];
      const newX = startX + i * ((el.width ?? 160) + gap);
      const idx = findEl(el.id!);
      if (idx >= 0) arr[idx] = { ...arr[idx], x: newX };
    }
  } else {
    targetEls.sort((a, b) => a.y - b.y);
    const startY = targetEls[0].y;
    for (let i = 0; i < targetEls.length; i++) {
      const el = targetEls[i];
      const newY = startY + i * ((el.height ?? 80) + gap);
      const idx = findEl(el.id!);
      if (idx >= 0) arr[idx] = { ...arr[idx], y: newY };
    }
  }
}

function applyMove(arr: ExcalidrawElement[], op: MoveOp, findEl: FindFn): void {
  const idx = findEl(op.target);
  if (idx >= 0) arr[idx] = { ...arr[idx], x: op.x, y: op.y };
}
