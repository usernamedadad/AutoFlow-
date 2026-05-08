/**
 * 撤销 / 重做历史栈
 *
 * 每次 AI 增量修改前自动保存完整快照，支持 Ctrl+Z / Ctrl+Shift+Z 回退和前进。
 */

import { GraphModel, cloneGraphModel } from "./graphModel";

export interface UndoEntry {
  graph: GraphModel;
  // 可选：raw elements 快照，用于快速恢复（无转换开销）
  rawElements?: unknown[];
}

export class UndoStack {
  private snapshots: UndoEntry[] = [];
  private _currentIndex = -1;
  readonly maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = Math.max(1, Math.floor(maxSize));
  }

  get currentIndex(): number {
    return this._currentIndex;
  }

  get size(): number {
    return this.snapshots.length;
  }

  get canUndo(): boolean {
    return this._currentIndex > 0;
  }

  get canRedo(): boolean {
    return this._currentIndex < this.snapshots.length - 1;
  }

  /** 保存新快照。如果当前不在栈顶，会截断之后的记录。 */
  push(graph: GraphModel, rawElements?: unknown[]): void {
    this.snapshots = this.snapshots.slice(0, this._currentIndex + 1);
    // 深拷贝 rawElements 防止 Excalidraw 内部修改污染历史记录
    const clonedRaw = rawElements ? JSON.parse(JSON.stringify(rawElements)) : undefined;
    this.snapshots.push({ graph, rawElements: clonedRaw });
    this._currentIndex = this.snapshots.length - 1;

    // 超出上限时移除最旧的
    while (this.snapshots.length > this.maxSize) {
      this.snapshots.shift();
      this._currentIndex--;
    }
  }

  /** 撤销：返回上一个快照 */
  undo(): UndoEntry | null {
    if (!this.canUndo) return null;
    this._currentIndex--;
    return this._deepCopy(this.snapshots[this._currentIndex]);
  }

  /** 重做：返回下一个快照 */
  redo(): UndoEntry | null {
    if (!this.canRedo) return null;
    this._currentIndex++;
    return this._deepCopy(this.snapshots[this._currentIndex]);
  }

  /** 获取当前快照 */
  peek(): UndoEntry | null {
    if (this._currentIndex < 0) return null;
    return this._deepCopy(this.snapshots[this._currentIndex]);
  }

  /** 清空历史 */
  clear(): void {
    this.snapshots = [];
    this._currentIndex = -1;
  }

  private _deepCopy(entry: UndoEntry): UndoEntry {
    return {
      graph: cloneGraphModel(entry.graph),
      rawElements: entry.rawElements ? [...entry.rawElements] : undefined,
    };
  }
}
