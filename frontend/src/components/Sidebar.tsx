"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Home, FolderOpen, Settings } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const menuItems = [
    {
      icon: Home,
      label: "回到主页",
      href: "/",
    },
    {
      icon: FolderOpen,
      label: "项目管理",
      href: "/projects",
    },
    {
      icon: Settings,
      label: "用户配置",
      href: "/settings",
    },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/60 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        ref={sidebarRef}
        className={`fixed left-0 top-0 h-full w-64 bg-white dark:bg-[#1a2744] shadow-xl z-50 transform transition-transform duration-300 ease-in-out border-r border-[#e2e8f0] dark:border-[#3b5278] ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-[#e2e8f0] dark:border-[#3b5278]">
          <h2 className="text-base font-semibold text-[#0f172a] dark:text-[#f1f5f9]" suppressHydrationWarning>
            AutoFlow+
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#253a5c] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-[#475569] dark:text-[#b0c4de]" />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-[#ccfbf1] dark:bg-[#0d9488]/20 text-[#0d9488] dark:text-[#2dd4bf]"
                    : "text-[#475569] dark:text-[#b0c4de] hover:bg-slate-100 dark:hover:bg-[#253a5c]"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#e2e8f0] dark:border-[#3b5278]">
          <p className="text-xs text-[#94a3b8] dark:text-[#7a94b0] text-center">
            AutoFlow+ v1.0.0
          </p>
        </div>
      </div>
    </>
  );
}

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#253a5c] transition-colors cursor-pointer"
      title="打开菜单"
      aria-label="打开菜单"
    >
      <Menu className="w-5 h-5 text-[#475569] dark:text-[#b0c4de]" />
    </button>
  );
}
