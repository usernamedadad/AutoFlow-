"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/**
 * 画布元素选中局部 AI 编辑输入框
 *
 * 用户选中画布元素时自动弹出，输入自然语言指令后回车发送。
 * - 渲染在 Excalidraw wrapper 内部，position:absolute 定位
 * - 锁定画布空间坐标（不随元素拖动而移动），但随 scroll/zoom 同步变换
 * - Esc 关闭，Enter 发送；发送后自动关闭
 */

export interface SelectionEditBarProps {
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  selectedCount: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
  containerWidth: number;
  containerHeight: number;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function SelectionEditBar({
  boundingBox,
  selectedCount,
  zoom,
  scrollX,
  scrollY,
  containerWidth,
  containerHeight,
  onSubmit,
  onClose,
  loading,
}: SelectionEditBarProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 锁定画布空间位置：只在选中元素集合变化时更新，忽略纯位置移动
  const lockedCanvasPosRef = useRef<{ x: number; y: number } | null>(null);
  const prevBBoxKeyRef = useRef("");

  const bboxKey = boundingBox
    ? `${boundingBox.x.toFixed(0)},${boundingBox.y.toFixed(0)},${boundingBox.width.toFixed(0)},${boundingBox.height.toFixed(0)}`
    : "";

  // 仅当选中的元素形状/位置真正变化时才解锁
  if (bboxKey && bboxKey !== prevBBoxKeyRef.current) {
    prevBBoxKeyRef.current = bboxKey;
    lockedCanvasPosRef.current = null;
  }

  useEffect(() => {
    if (boundingBox && selectedCount > 0) {
      setValue("");
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [bboxKey, selectedCount]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && value.trim() && !loading) {
        e.preventDefault();
        onSubmit(value.trim());
        setValue("");
      }
    },
    [value, loading, onSubmit, onClose],
  );

  if (!boundingBox || selectedCount === 0) return null;

  const z = zoom || 1;
  const barWidth = Math.max(320, Math.min(420, boundingBox.width * z));

  // 仅在锁定为空时用 boundingBox 的中心上方计算画布空间位置
  if (!lockedCanvasPosRef.current) {
    const cx = boundingBox.x + boundingBox.width / 2;
    const topY = boundingBox.y - 48 / z;
    const bottomY = boundingBox.y + boundingBox.height + 12 / z;
    // 优先放上方，若上方空间不够则放下方
    const containerH = containerHeight || 800;
    const screenTop = (topY - scrollY) * z;
    const canvasY = screenTop < 40 ? bottomY : topY;
    lockedCanvasPosRef.current = { x: cx, y: canvasY };
  }

  const canvasCX = lockedCanvasPosRef.current.x;
  const canvasY = lockedCanvasPosRef.current.y;

  // 画布坐标 → wrapper 内视觉坐标
  let visualLeft = (canvasCX - scrollX) * z - barWidth / 2;
  let visualTop = (canvasY - scrollY) * z;

  // 钳位在 wrapper 可视区域内
  const cw = containerWidth || 1200;
  const ch = containerHeight || 800;
  if (visualLeft < 8) visualLeft = 8;
  if (visualLeft + barWidth > cw - 8) visualLeft = cw - barWidth - 8;
  if (visualTop < 8) visualTop = 8;
  if (visualTop + 40 > ch - 8) visualTop = ch - 48;

  return (
    <div
      className="absolute z-50 flex items-center gap-2.5 px-4 py-2 rounded-xl shadow-lg border-2 border-indigo-300/60 bg-white/95 backdrop-blur-md pointer-events-auto"
      style={{ top: visualTop, left: visualLeft, width: barWidth }}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs font-bold text-white bg-indigo-500 rounded-full px-2.5 py-0.5 whitespace-nowrap shrink-0 shadow-sm">
        {selectedCount}个
      </span>

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? "AI 正在处理..." : "描述你想怎么改..."}
        disabled={loading}
        className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-700 placeholder:text-zinc-300 disabled:opacity-50 font-medium"
      />

      {loading ? (
        <span className="text-indigo-400 text-sm shrink-0 animate-pulse">⏳</span>
      ) : (
        <button
          onClick={onClose}
          className="text-zinc-300 hover:text-zinc-500 text-xs shrink-0 leading-none px-1.5 py-0.5 rounded hover:bg-zinc-100 transition-colors"
          title="关闭 (Esc)"
        >
          ✕
        </button>
      )}
    </div>
  );
}
