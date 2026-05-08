"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/**
 * 画布元素选中局部 AI 编辑输入框
 *
 * 用户选中画布元素时自动弹出，输入自然语言指令后回车发送。
 * - 位置自适应：优先放在选中元素上方，不够则放下方
 * - Esc 关闭，Enter 发送
 * - 发送后自动关闭
 */

export interface SelectionEditBarProps {
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  selectedCount: number;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function SelectionEditBar({
  boundingBox,
  selectedCount,
  onSubmit,
  onClose,
  loading,
}: SelectionEditBarProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus when visible
  useEffect(() => {
    if (boundingBox && selectedCount > 0) {
      setValue("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [boundingBox, selectedCount]);

  // Keyboard handlers
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

  // Position: above selection, clamp to viewport
  const barWidth = Math.max(300, Math.min(400, boundingBox.width));
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;

  let top = boundingBox.y - 48; // above selection
  if (top < 48) top = boundingBox.y + boundingBox.height + 12; // below if above is too high
  if (top + 40 > viewportH) top = viewportH - 80; // clamp to bottom

  let left = boundingBox.x + boundingBox.width / 2 - barWidth / 2;
  if (left < 12) left = 12;
  if (left + barWidth > viewportW - 12) left = viewportW - barWidth - 12;

  return (
    <div
      className="fixed z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg shadow-lg border border-zinc-200 bg-white/90 backdrop-blur-sm pointer-events-auto"
      style={{ top, left, width: barWidth }}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs text-zinc-400 whitespace-nowrap shrink-0">
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
        className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-700 placeholder:text-zinc-300 disabled:opacity-50"
      />
      <button
        onClick={onClose}
        className="text-zinc-300 hover:text-zinc-500 text-xs shrink-0 leading-none px-1"
      >
        Esc
      </button>
    </div>
  );
}
