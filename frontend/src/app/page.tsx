"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Upload,
  Image as ImageIcon,
  UserPlus,
  Code2,
  ArrowLeftRight,
  Layers,
  Network,
  Lightbulb,
} from "lucide-react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import Sidebar, { MenuButton } from "@/components/Sidebar";
import { FlowchartBackground } from "../components/BackgroundEffects";
import Footer from "@/components/Footer";
import PaperPlaneButton from "@/components/PaperPlaneButton";
import { createProject, listProjects, FlowDirection } from "@/lib/projectApi";

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [selectedMode, setSelectedMode] = useState<"excalidraw" | "mermaid">("excalidraw");
  const [previewMode, setPreviewMode] = useState<"excalidraw" | "mermaid">("excalidraw");
  const [direction, setDirection] = useState<FlowDirection>("TD");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const preloadResources = async () => {
      await new Promise((r) => setTimeout(r, 100));

      router.prefetch("/canvas/excalidraw");
      router.prefetch("/canvas/mermaid");
      router.prefetch("/projects");
      router.prefetch("/settings");

      import("@excalidraw/excalidraw").catch(() => {});
      import("mermaid").catch(() => {});
      import("@excalidraw/mermaid-to-excalidraw").catch(() => {});
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as any).requestIdleCallback(preloadResources, { timeout: 2000 });
    } else {
      setTimeout(preloadResources, 500);
    }
  }, [router]);

  const openEditorWithProject = async (
    targetMode: "excalidraw" | "mermaid",
    query: Record<string, string>,
    forceNew: boolean = false
  ) => {
    const basePath = targetMode === "mermaid" ? "/canvas/mermaid" : "/canvas/excalidraw";

    try {
      setIsCreatingProject(true);

      let projectId: string | null = null;

      if (!forceNew) {
        try {
          const projects = await listProjects();
          if (projects && projects.length > 0) {
            const modeProjects = projects
              .filter(p => p.lastMode === targetMode)
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            if (modeProjects.length > 0) {
              projectId = modeProjects[0].id;
            }
          }
        } catch {
          // listProjects failed, will create new
        }
      }

      if (projectId) {
        const params = new URLSearchParams({ ...query, project: projectId });
        router.push(`${basePath}?${params.toString()}`);
      } else {
        const project = await createProject({
          lastMode: targetMode,
          direction: direction,
        });
        const params = new URLSearchParams({ ...query, project: project.id });
        router.push(`${basePath}?${params.toString()}`);
      }
    } catch (error) {
      console.error("Failed to open editor:", error);
      const params = new URLSearchParams(query);
      router.push(`${basePath}?${params.toString()}`);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleGenerate = () => {
    if (prompt.trim()) {
      openEditorWithProject(selectedMode, {
        mode: "text",
        prompt: prompt.trim(),
        direction: direction,
      }, true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const templates = [
    { title: "用户注册流程图", description: "填写表单 → 邮箱验证 → 激活账户的完整流程", icon: UserPlus },
    { title: "用户登录时序图", description: "前端、后端、数据库之间的认证交互时序", icon: ArrowLeftRight },
    { title: "新能源汽车 SWOT 分析", description: "优势、劣势、机会、威胁的四象限分析", icon: Layers },
    { title: "科技公司组织架构", description: "CEO 下设产品、技术、运营、市场四大部门的树形架构", icon: Network },
    { title: "项目技术选型思维导图", description: "前端、后端、数据库、部署的技术方案发散", icon: Lightbulb },
    { title: "电商系统类图", description: "用户、订单、商品、支付四个核心类的 UML 关系", icon: Code2 },
  ];

  const handleTemplateClick = (template: typeof templates[0]) => {
    setPrompt("帮我画一个" + template.title + "，包括：" + template.description);
    const textarea = document.querySelector('textarea[placeholder*="流程图"]') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      textarea.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0c1222] relative overflow-hidden">

      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.07] dark:opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="doodle-bg" x="0" y="0" width="300" height="300" patternUnits="userSpaceOnUse">
            <path d="M20 30 Q 60 15 100 30 T 180 28" stroke="#0d9488" strokeWidth="1.5" fill="none" />
            <circle cx="250" cy="50" r="10" stroke="#f59e0b" strokeWidth="1.2" fill="none" />
            <path d="M40 120 L 55 135 L 42 148" stroke="#0d9488" strokeWidth="1.2" fill="none" />
            <rect x="200" y="160" width="35" height="22" rx="3" stroke="#f59e0b" strokeWidth="1.2" fill="none" transform="rotate(-12 217 171)" />
            <path d="M80 230 Q 100 225 120 232" stroke="#0d9488" strokeWidth="1.2" fill="none" />
            <circle cx="260" cy="260" r="5" fill="#f59e0b" opacity="0.6" />
            <path d="M150 80 L 155 95 L 148 98" stroke="#0d9488" strokeWidth="1" fill="none" />
            <ellipse cx="60" cy="200" rx="15" ry="8" stroke="#f59e0b" strokeWidth="1" fill="none" transform="rotate(15 60 200)" />
            <path d="M220 100 Q 240 95 255 105" stroke="#0d9488" strokeWidth="1" fill="none" />
            <circle cx="130" cy="270" r="3" fill="#0d9488" opacity="0.5" />
            <path d="M10 270 L 18 280 L 8 285" stroke="#f59e0b" strokeWidth="1" fill="none" />
            <rect x="170" y="40" width="20" height="14" rx="2" stroke="#0d9488" strokeWidth="0.8" fill="none" transform="rotate(8 180 47)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#doodle-bg)" />
      </svg>
      </div>

      <FlowchartBackground />

      <nav className="relative z-10 flex items-center justify-between px-8 py-4 w-full" style={{ paddingRight: '5rem' }}>
        <div className="flex items-center gap-4">
          <MenuButton onClick={() => setSidebarOpen(true)} />
          <Link href="/" className="flex items-center gap-3 group">
            <Logo size={38} />
            <span
              className="text-xl font-bold tracking-tight text-[#0f172a] dark:text-[#f1f5f9]"
              style={{ fontFamily: "'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive, sans-serif" }}
            >
              AutoFlow+
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3" style={{ marginRight: '-2rem' }}>
          <ThemeToggle />
          <button
            onClick={() => openEditorWithProject(selectedMode, { mode: "new" })}
            disabled={isCreatingProject}
            className="px-6 py-2.5 bg-transparent hover:bg-[#bfdbfe]/20 text-[#1e40af] dark:text-[#93c5fd] rounded-full font-medium transition-all flex items-center gap-2 cursor-pointer border-2 border-[#93c5fd] hover:border-[#60a5fa] hover:shadow-md" style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}
          >
            {isCreatingProject ? "创建项目中..." : "开始使用"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </nav>

      <main className="relative z-10 w-full mx-auto px-8 pt-14 pb-20">
        <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10 relative">
          <h1
            className="text-4xl md:text-5xl font-bold mb-3 leading-tight text-[#2d2d2d] dark:text-[#f1f5f9]"
            style={{
              fontFamily: "'Comic Sans MS', 'Chalkboard SE', cursive, sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            别画了，交给{" "}
            <span className="relative inline-block" style={{ transform: "rotate(-1.5deg)" }}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 56" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <filter id="chalkEdge">
                    <feTurbulence type="fractalNoise" baseFrequency="1.0" numOctaves="4" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
                  </filter>
                </defs>
                <rect x="2" y="2" width="196" height="52" rx="4" ry="4" fill="#dbeafe" opacity="0.7" filter="url(#chalkEdge)" />
              </svg>
              <span
                className="relative z-10 px-5 py-2.5 inline-block"
                style={{
                  color: "#1e3a8a",
                  fontWeight: 700,
                  display: "inline-block",
                  fontFamily: "'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive",
                  fontSize: "1.1em",
                  letterSpacing: "-0.02em",
                }}
              >
                凹凸 Flow+
              </span>
            </span>
          </h1>

          <div className="hidden md:block absolute -top-2 left-[5%] animate-bounce" style={{ animationDuration: '3s', animationDelay: '0s' }}>
            <svg width="28" height="24" viewBox="0 0 28 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 12 Q 8 6 14 8 L 20 5 Q 22 10 18 14 L 24 16 Q 20 20 14 18 L 8 21 Q 6 16 10 12 Z"
                    stroke="#3730a3" strokeWidth="1.8" fill="#f8f7ff" opacity="0.7"/>
              <text x="9" y="15" fontSize="9" fill="#3730a3" fontFamily="'Comic Sans MS', cursive">Hi~</text>
            </svg>
          </div>

          <div className="hidden md:block absolute top-[15%] right-[8%] animate-bounce" style={{ animationDuration: '4s', animationDelay: '1s' }}>
            <svg width="32" height="26" viewBox="0 0 32 26" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="4" width="28" height="18" rx="4" stroke="#3730a3" strokeWidth="1.8" fill="white" opacity="0.8"/>
              <path d="M2 10 L30 10 M 10 22 L16 26 L22 22" stroke="#3730a3" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
              <circle cx="8" cy="7" r="1.2" fill="#ef4444" opacity="0.7"/>
              <circle cx="13" cy="7" r="1.2" fill="#fbbf24" opacity="0.7"/>
              <circle cx="18" cy="7" r="1.2" fill="#22c55e" opacity="0.7"/>
            </svg>
          </div>

          <div className="hidden md:block absolute bottom-[5%] left-[8%] animate-pulse" style={{ animationDuration: '3.5s' }}>
            <svg width="36" height="22" viewBox="0 0 36 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="32" height="18" rx="3" stroke="#3730a3" strokeWidth="1.5" fill="#f0fdf4" opacity="0.75" strokeDasharray="3 2"/>
              <path d="M8 11 L 14 7 L 20 11" stroke="#3730a3" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="10" y1="14" x2="18" y2="14" stroke="#3730a3" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
              <line x1="12" y1="17" x2="16" y2="17" stroke="#3730a3" strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
            </svg>
          </div>

          <p className="text-base text-[#475569] dark:text-[#c8d6e5] max-w-xl mx-auto mb-8 mt-4">
            告诉 AI 你的想法，它将自动生成清晰、美观、可编辑的流程图
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <button
              onClick={() => setSelectedMode("excalidraw")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer border-2 ${
                selectedMode === "excalidraw"
                  ? "bg-[#bfdbfe] text-[#1e40af] border-[#93c5fd] shadow-lg"
                  : "bg-white dark:bg-[#262524] text-[#5c5c5c] dark:text-[#c8c4bc] border-[#e5e2dd] dark:border-[#3f3d39] hover:border-[#93c5fd]"
              }`}
              style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2 L 14 4 L 6 12 L 3 13 L 4 10 Z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
                <path d="M10 4 L 12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Excalidraw 模式
            </button>
            <button
              onClick={() => setSelectedMode("mermaid")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer border-2 ${
                selectedMode === "mermaid"
                  ? "bg-[#bfdbfe] text-[#1e40af] border-[#93c5fd] shadow-lg"
                  : "bg-white dark:bg-[#262524] text-[#5c5c5c] dark:text-[#c8c4bc] border-[#e5e2dd] dark:border-[#3f3d39] hover:border-[#93c5fd]"
              }`}
              style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}
            >
              <Code2 className="w-4 h-4" />
              Mermaid 模式
            </button>
          </div>
        </div>

        <div className="mb-16 max-w-2xl mx-auto">
          <div
            className="rounded-2xl p-1.5 shadow-lg border-2 border-[#8b5cf6]/20 dark:border-[#8b5cf6]/40 bg-white dark:bg-[#262524]"
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={"描述你想创建的流程图...\n\n例如：用户注册流程包括填写表单、验证邮箱、发送欢迎邮件"}
              className="w-full bg-transparent text-[#2d2d2d] dark:text-[#f1f5f9] placeholder-[#8a8a8a] dark:placeholder-[#949088] px-5 py-4 resize-none focus:outline-none min-h-30 text-base leading-relaxed rounded-xl"
              rows={4}
              style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}
            />
            <div className="flex items-center justify-between px-3 pb-1">
              <div className="text-xs text-[#8a8a8a] dark:text-[#949088] flex items-center gap-3">
                <span>按 Enter 快速生成</span>
                <span className="opacity-30">|</span>
                <span>{selectedMode === "mermaid" ? "Mermaid 输出" : "Excalidraw 编辑器"}</span>
              </div>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className={`transition-all cursor-pointer ${prompt.trim() ? "opacity-100 hover:scale-105" : "opacity-60 cursor-not-allowed"}`}
                title="AI 生成"
              >
                <PaperPlaneButton />
              </button>
            </div>
          </div>

          <div className="flex justify-center gap-5 mt-4">
            <button
              onClick={() => openEditorWithProject("excalidraw", { mode: "upload" }, true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-[#5c5c5c] dark:text-[#c8c4bc] hover:text-[#8b5cf6] dark:hover:text-[#a78bfa] transition-colors cursor-pointer"
            >
              <ImageIcon className="w-4 h-4" />
              上传图片识别
            </button>
            <button
              onClick={() => openEditorWithProject(selectedMode, { mode: "new" }, true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-[#5c5c5c] dark:text-[#c8c4bc] hover:text-[#8b5cf6] dark:hover:text-[#a78bfa] transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              手绘转流程图
            </button>
          </div>
        </div>

        <section className="mt-16">
          <h2
            className="text-2xl font-bold text-center mb-2 text-[#2d2d2d] dark:text-[#f1f5f9]"
            style={{ fontFamily: "'Caveat', 'Kalam', 'Comic Sans MS', cursive" }}
          >
            快速开始模板
          </h2>
          <p className="text-center text-[#8a8a8a] dark:text-[#949088] mb-8 text-sm">选择一个模板，快速创建您的流程图</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template, index) => {
              const getTemplateIcon = (idx: number) => {
                const icons = [
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="7" r="3.5" stroke="#3730a3" strokeWidth="1.8" fill="none"/>
                    <path d="M6 20 Q 9 14 12 14 Q 15 14 18 20" stroke="#3730a3" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                    <path d="M12 11 L12 13" stroke="#3730a3" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>,
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="5" y="10" width="14" height="10" rx="2" stroke="#3730a3" strokeWidth="1.8" fill="none" transform="rotate(-5 12 15)"/>
                    <path d="M8 10 L9.5 6 L14.5 6 L16 10" stroke="#3730a3" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="15" r="2.5" stroke="#3730a3" strokeWidth="1.4" fill="none"/>
                    <rect x="16" y="12" width="2" height="1.5" rx="0.5" stroke="#3730a3" strokeWidth="1" fill="none"/>
                  </svg>,
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 17 L 10 7 L 14 17 Z" stroke="#3730a3" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
                    <path d="M14 17 L 18 7 L 22 17 Z" stroke="#3730a3" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
                    <line x1="10" y1="19" x2="18" y2="19" stroke="#3730a3" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>,
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 8 L 12 4 L 20 8 L 20 16 L 12 20 L 4 16 Z" stroke="#3730a3" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
                    <path d="M12 4 L 12 12 M 8 12 L 12 16 L 16 12" stroke="#3730a3" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>,
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 19 Q 8 8 12 6 Q 16 8 18 19" stroke="#3730a3" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                    <path d="M4 19 L 20 19" stroke="#3730a3" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                    <circle cx="9" cy="13" r="1.5" fill="#3730a3" opacity="0.6"/>
                    <circle cx="15" cy="13" r="1.5" fill="#3730a3" opacity="0.6"/>
                  </svg>,
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="6" width="12" height="12" rx="2" stroke="#3730a3" strokeWidth="1.8" fill="none" transform="rotate(8 12 12)"/>
                    <path d="M9 12 L 12 9 L 15 12 M 12 12 L 12 15" stroke="#3730a3" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M18 8 L 20 6 M 18 12 L 21 12 M 18 16 L 20 18" stroke="#3730a3" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                  </svg>
                ];
                return icons[idx] || icons[0];
              };

              return (
                <button
                  key={index}
                  onClick={() => handleTemplateClick(template)}
                  className="group p-5 bg-white/80 dark:bg-[#262524]/80 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:border-[#3730a3]/50 hover:shadow-md transition-all text-left cursor-pointer"
                >
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center mb-3 transition-colors"
                    style={{ background: "#f8f7ff", border: "2px dashed #3730a3/30" }}
                  >
                    {getTemplateIcon(index)}
                  </div>
                  <h3 className="text-base font-semibold mb-1 text-[#2d2d2d] dark:text-[#f1f5f9] group-hover:text-[#3730a3] dark:group-hover:text-[#818cf8] transition-colors">
                    {template.title}
                  </h3>
                  <p className="text-sm text-[#5c5c5c] dark:text-[#c8c4bc]">{template.description}</p>
                </button>
              );
            })}
          </div>
        </section>
      </div>

        <div className="preview-container w-full py-12 flex justify-center">
          <div className="flex items-stretch gap-5" style={{ width: '95vw', maxWidth: '1700px' }}>
            {/* 左侧模式切换控件 */}
            <div className="flex flex-col gap-3 justify-center shrink-0">
              <button
                onClick={() => setPreviewMode("excalidraw")}
                className={`group relative flex flex-col items-center gap-1.5 px-3 py-4 rounded-2xl border-2 transition-all cursor-pointer min-w-22.5 ${
                  previewMode === "excalidraw"
                    ? "bg-[#bfdbfe] border-[#3b82f6] shadow-lg scale-[1.02]"
                    : "bg-white dark:bg-[#262524] border-dashed border-[#c4b5a0] dark:border-[#5c5a56] hover:border-[#93c5fd] hover:shadow-md"
                }`}
                style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  previewMode === "excalidraw" ? "bg-white/60" : "bg-[#f8f7ff]"
                }`}>
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2 L 14 4 L 6 12 L 3 13 L 4 10 Z" stroke={previewMode === "excalidraw" ? "#1e40af" : "#6b7280"} strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
                    <path d="M10 4 L 12 6" stroke={previewMode === "excalidraw" ? "#1e40af" : "#6b7280"} strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className={`text-xs font-bold ${
                  previewMode === "excalidraw" ? "text-[#1e40af]" : "text-[#5c5c5c] dark:text-[#c8c4bc]"
                }`}>Excalidraw</span>
                <span className={`text-[10px] ${
                  previewMode === "excalidraw" ? "text-[#3b82f6]" : "text-[#9ca3af]"
                }`}>手绘风格</span>
                {previewMode === "excalidraw" && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#3b82f6] rounded-full flex items-center justify-center shadow-sm">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M3 6 L5 8 L9 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>

              <button
                onClick={() => setPreviewMode("mermaid")}
                className={`group relative flex flex-col items-center gap-1.5 px-3 py-4 rounded-2xl border-2 transition-all cursor-pointer min-w-22.5 ${
                  previewMode === "mermaid"
                    ? "bg-[#bfdbfe] border-[#3b82f6] shadow-lg scale-[1.02]"
                    : "bg-white dark:bg-[#262524] border-dashed border-[#c4b5a0] dark:border-[#5c5a56] hover:border-[#93c5fd] hover:shadow-md"
                }`}
                style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  previewMode === "mermaid" ? "bg-white/60" : "bg-[#f8f7ff]"
                }`}>
                  <Code2 className="w-5 h-5" style={{ color: previewMode === "mermaid" ? "#1e40af" : "#6b7280" }} />
                </div>
                <span className={`text-xs font-bold ${
                  previewMode === "mermaid" ? "text-[#1e40af]" : "text-[#5c5c5c] dark:text-[#c8c4bc]"
                }`}>Mermaid</span>
                <span className={`text-[10px] ${
                  previewMode === "mermaid" ? "text-[#3b82f6]" : "text-[#9ca3af]"
                }`}>代码渲染</span>
                {previewMode === "mermaid" && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#3b82f6] rounded-full flex items-center justify-center shadow-sm">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M3 6 L5 8 L9 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
            </div>

            {/* 右侧预览图片 */}
            <div className="relative flex-1">
              <img
                src={previewMode === "excalidraw" ? "/preview-excalidraw.png" : "/preview-mermaid.png"}
                alt={previewMode === "excalidraw" ? "Excalidraw 手绘流程图示例" : "Mermaid 流程图示例"}
                className="block w-full h-auto opacity-95 hover:opacity-100 transition-opacity rounded-xl shadow-2xl border-2 border-[#e5e7eb] dark:border-[#374151]"
                style={{ filter: "contrast(1.04) saturate(0.97)" }}
              />
              <div className="absolute top-6 left-6 z-10 bg-white/90 dark:bg-[#0f172a]/70 backdrop-blur-sm px-4 py-3 rounded-lg border border-[#e5e7eb] dark:border-[#374151]/50 shadow-sm">
                <div className="flex items-center gap-2">
                  <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm shrink-0">
                    <circle cx="24" cy="24" r="22" stroke="#3730a3" strokeWidth="2.2" fill="#dbeafe" strokeDasharray="3 2"/>
                    <rect x="12" y="18" width="24" height="14" rx="2" stroke="#3730a3" strokeWidth="1.8" fill="none" transform="rotate(-1 24 25)"/>
                    <path d="M18 18 L20 14 L28 14 L30 18" stroke="#3730a3" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="24" cy="25" r="5" stroke="#3730a3" strokeWidth="1.6" fill="none"/>
                    <circle cx="24" cy="25" r="2" fill="#3730a3" opacity="0.5"/>
                  </svg>
                  <span className="text-base font-bold"
                        style={{ fontFamily: "'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive", color: "#1e40af" }}>
                    凹凸一下，F<span style={{ display: "inline-block", width: "1.1em", textAlign: "center" }}>l</span>ow 自然来 ✨
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
}
