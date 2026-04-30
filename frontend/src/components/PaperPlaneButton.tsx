"use client";

import React from "react";

interface PaperPlaneButtonProps {
  className?: string;
}

export default function PaperPlaneButton({
  className = "",
}: PaperPlaneButtonProps) {
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: 40, height: 40 }}
      aria-label="发送"
    >
      <img
        src="/fasong.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="w-full h-full object-contain pointer-events-none select-none"
      />
    </span>
  );
}
