"use client";

import React from "react";
import Logo from "./Logo";
import { Pencil, Code2, ImageIcon, FolderOpen } from "lucide-react";

export default function Footer() {
  const features = [
    { label: "Excalidraw 编辑器", href: "/canvas/excalidraw?mode=new", icon: Pencil },
    { label: "Mermaid 模式", href: "/canvas/mermaid?mode=new", icon: Code2 },
    { label: "图片识别", href: "/canvas/excalidraw?mode=upload", icon: ImageIcon },
    { label: "项目管理", href: "/projects", icon: FolderOpen },
  ];

  return (
    <footer className="relative bg-[#0f172a] text-white overflow-hidden">
      {/* 手绘风格背景装饰 */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0">
          <defs>
            <pattern id="footer-doodle" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
              <path d="M10 10 Q 30 5 50 10 T 90 10" stroke="#60a5fa" strokeWidth="1.5" fill="none" opacity="0.4" />
              <circle cx="150" cy="40" r="8" stroke="#93c5fd" strokeWidth="1.2" fill="none" opacity="0.35" />
              <path d="M20 80 L 35 95 L 25 110" stroke="#60a5fa" strokeWidth="1.3" fill="none" opacity="0.3" />
              <circle cx="170" cy="180" r="4" fill="#93c5fd" opacity="0.25" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#footer-doodle)" />
        </svg>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-8 py-14">
        <div className="flex flex-col md:flex-row justify-between items-start gap-10">
          {/* 品牌区 */}
          <div className="max-w-xs">
            <div className="flex items-center gap-3 mb-4">
              <Logo size={36} />
              <span
                className="text-xl font-bold"
                style={{ fontFamily: "'Comic Sans MS', 'Chalkboard SE', cursive" }}
              >
                AutoFlow+
              </span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed" style={{ fontFamily: "'Comic Sans MS', cursive" }}>
              用自然语言画出流程图。支持 Excalidraw 手绘风格与 Mermaid 代码渲染，让创意表达更简单。
            </p>
          </div>

          {/* 功能链接区 */}
          <div>
            <h3
              className="text-sm font-bold text-gray-300 mb-4 tracking-wide"
              style={{ fontFamily: "'Comic Sans MS', cursive" }}
            >
              快速入口
            </h3>
            <ul className="space-y-2.5">
              {features.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-sm text-gray-400 hover:text-[#2dd4bf] transition-colors inline-flex items-center gap-2 group"
                      style={{ fontFamily: "'Comic Sans MS', cursive" }}
                    >
                      <Icon className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* 版权栏 */}
        <div className="border-t border-white/10 mt-10 pt-6 text-center md:text-left">
          <p className="text-xs text-gray-500" style={{ fontFamily: "'Comic Sans MS', cursive" }}>
            © 2024 AutoFlow+. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
