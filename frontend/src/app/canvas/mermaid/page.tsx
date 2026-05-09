"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Home,
  Code2,
  Copy,
  Check,
  X,
  Download,
  FileImage,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import AIAssistantPanel from "@/components/AIAssistantPanel";
import ThemeToggle from "@/components/ThemeToggle";
import Sidebar, { MenuButton } from "@/components/Sidebar";
import DirectionSelector from "@/components/DirectionSelector";
import { FlowDirection, ProjectRecord, getProject, updateProject, createProject } from "@/lib/projectApi";
import { fixMermaidLineBreaks, extractMermaidCode, convertDirectionInMermaid, sanitizeMermaidCode } from "@/lib/mermaidUtils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

let _mermaidModule: any = null;

function MermaidRenderer({ code, zoom, onZoomChange, onFitToScreenRef }: { code: string; zoom: number; onZoomChange?: (z: number) => void; onFitToScreenRef?: React.MutableRefObject<(() => void) | null> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [svgHtml, setSvgHtml] = useState<string>("");
  const transformRef = useRef({ panX: 0, panY: 0, zoom: 1 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  const clampZoom = (z: number) => Math.min(3, Math.max(0.1, z));

  const applyTransform = () => {
    const el = containerRef.current;
    if (!el) return;
    const inner = el.querySelector(".mermaid-canvas-inner") as HTMLElement;
    if (!inner) return;
    const { panX, panY, zoom: z } = transformRef.current;
    inner.style.transform = `translate(${panX}px, ${panY}px) scale(${z})`;
  };

  const fitToScreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const inner = el.querySelector(".mermaid-canvas-inner") as HTMLElement;
    if (!inner) return;

    const svgEl = inner.querySelector("svg");
    if (!svgEl) return;

    const prevTransform = inner.style.transform;
    inner.style.transform = "translate(0px, 0px) scale(1)";

    const containerRect = el.getBoundingClientRect();
    const svgRect = svgEl.getBoundingClientRect();

    inner.style.transform = prevTransform;

    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;

    if (svgWidth <= 0 || svgHeight <= 0) return;

    const padding = 60;
    const availW = containerRect.width - padding * 2;
    const availH = containerRect.height - padding * 2;

    const scaleX = availW / svgWidth;
    const scaleY = availH / svgHeight;
    const fitScale = Math.min(scaleX, scaleY, 2);

    const panX = (containerRect.width - svgWidth * fitScale) / 2;
    const panY = (containerRect.height - svgHeight * fitScale) / 2;

    transformRef.current = { panX, panY, zoom: fitScale };
    onZoomChangeRef.current?.(fitScale);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(applyTransform);
  }, []);

  useEffect(() => {
    if (onFitToScreenRef) {
      onFitToScreenRef.current = fitToScreen;
    }
  }, [fitToScreen, onFitToScreenRef]);

  useEffect(() => {
    transformRef.current.zoom = zoom;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(applyTransform);
  }, [zoom]);

  useEffect(() => {
    if (!code) return;

    const renderMermaid = async () => {
      setRenderError(null);
      setErrorDetail("");

      try {
        if (!_mermaidModule) {
          _mermaidModule = (await import("mermaid")).default;
        }

        // 🔧 关键修复：在渲染前进行语法容错处理
        // 修复 AI 生成的 classDiagram 中常见的 flowchart 语法误用（如 -->|label|）
        const sanitizedCode = sanitizeMermaidCode(code);

        _mermaidModule.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "antiscript",
          fontFamily: "Segoe UI, Roboto, sans-serif",
          fontSize: 16,
            flowchart: {
              useMaxWidth: true,
              htmlLabels: true,
              curve: "basis",
              padding: 15,
              nodeSpacing: 50,
              rankSpacing: 50,
              diagramPadding: 8,
            },
            sequence: {
              useMaxWidth: true,
              wrap: true,
              width: 150,
              height: 65,
              actorMargin: 50,
              boxMargin: 10,
              boxTextMargin: 5,
              noteMargin: 10,
              messageMargin: 35,
            },
            class: {
              useMaxWidth: true,
            },
            er: {
              useMaxWidth: true,
            },
            gantt: {
              useMaxWidth: true,
              fontSize: 12,
              sectionFontSize: 14,
              numberSectionStyles: 4,
              axisFormat: "%Y-%m-%d",
            },
            mindmap: {
              useMaxWidth: true,
              padding: 20,
              maxNodeWidth: 200,
              maxNodeHeight: 100,
            },
            pie: {
              useMaxWidth: true,
            },
            state: {
              useMaxWidth: true,
            },
          } as any);

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
          const { svg, bindFunctions } = await _mermaidModule.render(id, sanitizedCode);

          if (!svg || typeof svg !== "string" || svg.length < 50) {
            throw new Error("渲染结果为空");
          }

          const isActualError = svg.includes('class="error"') && 
                                (svg.includes('error-icon') || svg.includes('error-text') || svg.includes('error-message'));

          if (isActualError) {
            throw new Error("图表语法错误，请检查代码格式");
          }

          setSvgHtml(svg);
          setRenderError(null);
          setErrorDetail("");
          transformRef.current = { panX: 0, panY: 0, zoom: 1 };
          onZoomChange?.(1);

          requestAnimationFrame(() => {
            applyTransform();
            const inner = containerRef.current?.querySelector(".mermaid-canvas-inner");
            if (inner && bindFunctions) {
              try {
                bindFunctions(inner);
              } catch (e) {
                console.warn("[AutoFlow] bindFunctions failed:", e);
              }
            }
            setTimeout(() => {
              fitToScreen();
            }, 50);
          });
        } catch (renderErr: any) {
          console.error("[AutoFlow] Mermaid render failed:", renderErr);

          const errMsg = String(renderErr?.message || renderErr?.hash?.text || renderErr || "");
          
          if (errMsg.includes("Parse error") ||
              errMsg.includes("Syntax error") ||
              errMsg.includes("Lexical error") ||
              errMsg.includes("图表语法") ||
              errMsg.includes("Error parsing")) {
            setRenderError("Mermaid 代码存在语法问题");
            setErrorDetail(code.substring(0, 500));
            setSvgHtml("");
          } else {
            throw renderErr;
          }
        }
      } catch (err: any) {
        console.error("[AutoFlow] Mermaid fatal error:", err);
        const errMsg = String(err?.message || err?.toString() || "渲染失败");
        
        if (errMsg.includes("语法") || errMsg.includes("Syntax") || errMsg.includes("Parse") || errMsg.includes("Lexical") || errMsg.includes("parsing")) {
          setRenderError("Mermaid 代码存在语法问题");
          setErrorDetail(code.substring(0, 500));
        } else {
          setRenderError(`渲染失败: ${errMsg}`);
          setErrorDetail(code.substring(0, 300));
        }
        setSvgHtml("");
      }
    };

    renderMermaid();
  }, [code]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      const newZoom = clampZoom(transformRef.current.zoom + delta);
      transformRef.current.zoom = newZoom;
      onZoomChange?.(newZoom);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(applyTransform);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("a, button, input, textarea, select")) return;
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      panStart.current = { x: transformRef.current.panX, y: transformRef.current.panY };
      el.style.cursor = "grabbing";
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      transformRef.current.panX = panStart.current.x + dx;
      transformRef.current.panY = panStart.current.y + dy;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(applyTransform);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      el.style.cursor = "grab";
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("resize", fitToScreen);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", fitToScreen);
      cancelAnimationFrame(rafRef.current);
    };
  }, [fitToScreen]);

  if (!code) return null;

  if (renderError) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="bg-amber-50 dark:bg-amber-900/15 border-2 border-dashed border-amber-300 dark:border-amber-700 p-6 rounded-2xl max-w-lg w-full" style={{ borderColor: "#1e1b4b", borderStyle: "dashed" }}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-800 dark:text-amber-300 font-bold mb-2" style={{ fontFamily: "'Segoe UI', 'Roboto', sans-serif" }}>Mermaid 代码存在语法问题</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 break-all font-mono bg-amber-100/50 dark:bg-amber-900/30 p-2 rounded">{errorDetail || renderError}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">点击右上角「显示代码」按钮查看并修正</p>
            </div>
          </div>
          </div>
        </div>
      );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-renderer w-full h-full overflow-hidden relative"
      style={{
        cursor: "grab",
        backgroundSize: "24px 24px",
        backgroundImage: "radial-gradient(circle, #d4d4d4 1px, transparent 1px)",
        backgroundPosition: "0 0",
      }}
    >
      <div
        className="mermaid-canvas-inner"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          transform: "translate(0px, 0px) scale(1)",
        }}
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    </div>
  );
}

export default function MermaidPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center bg-white dark:bg-[#1a1918] text-[#5c5c5c] dark:text-[#b0c4de]">加载中...</div>}>
      <MermaidContent />
    </Suspense>
  );
}

function MermaidContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("project") || "";
  const initialPrompt = searchParams.get("prompt") || "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [mermaidCode, setMermaidCode] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [direction, setDirection] = useState<FlowDirection>("TD");
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectLoaded, setProjectLoaded] = useState(!projectId);
  const [zoom, setZoom] = useState(1);
  const fitToScreenRef = useRef<(() => void) | null>(null);
  const [isUploadLoading, setIsUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "upload">("chat");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{ url: string; name: string }[]>([]);
  const promptFilledRef = useRef(false);
  const hasAutoSent = useRef(false);

  useEffect(() => {
    if (!projectLoaded || !initialPrompt || hasAutoSent.current) {
      return;
    }

    if (initialPrompt && !hasAutoSent.current) {
      hasAutoSent.current = true;
      setInputValue(initialPrompt);
      handleGenerateFromPrompt(initialPrompt);
    }
  }, [initialPrompt, projectLoaded]);

  useEffect(() => {
    let isCancelled = false;

    const ensureProject = async () => {
      try {
        if (projectId) {
          const data = await getProject(projectId);
          if (isCancelled) return;
          setProject(data);
          setDirection(data.direction || "TD");
          setProjectLoaded(true);

          if (!promptFilledRef.current && data.prompt) {
            promptFilledRef.current = true;
            setInputValue(data.prompt);
          }

          if (data.mermaidCode) {
            setMermaidCode(data.mermaidCode);
          }

          if (data.messages?.length) {
            setMessages(data.messages as Message[]);
          }
        } else {
          const newProject = await createProject({ lastMode: "mermaid", direction: "TD" });
          if (isCancelled) return;
          setProject(newProject);
          setDirection("TD");
          setProjectLoaded(true);
        }
      } catch (error) {
        console.error("Failed to load/create project", error);
        setProjectLoaded(true);
      }
    };

    void ensureProject();

    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  const persistProject = async (updates: Record<string, any>) => {
    if (!projectId) {
      return;
    }

    setProjectSaving(true);
    try {
      const updated = await updateProject(projectId, updates);
      setProject(updated);
      setDirection(updated.direction || direction);
    } catch (error) {
      console.error("Failed to persist project", error);
    } finally {
      setProjectSaving(false);
    }
  };

  useEffect(() => {
    if (!projectId || messages.length === 0) return;
    const timer = setTimeout(() => {
      void persistProject({ messages });
    }, 800);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFileUpload(files[0]);
  };

  const handleDropHandler = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFileUpload(files[0] as unknown as File);
  };

  const handleDragOverHandler = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeaveHandler = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };

  const handleFileUpload = async (file: File) => {
    if (!file.type.match(/^image\/(jpeg|jpg|png|gif)$/)) {
      setMessages((prev) => [...prev, { role: "assistant", content: "仅支持 JPG、PNG、GIF 格式的图片。" }]);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessages((prev) => [...prev, { role: "assistant", content: "图片大小不能超过 10MB" }]);
      return;
    }

    setIsUploadLoading(true);
    setUploadProgress(`正在上传图片：${file.name}...`);

    const imageUrl = URL.createObjectURL(file);
    setUploadedImages((prev) => [{ url: imageUrl, name: file.name }, ...prev].slice(0, 5));

    try {
      const formData = new FormData();
      formData.append("file", file);
      setUploadProgress("正在识别图片中的流程图...");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      const response = await fetch("/api/recognize-image", { method: "POST", body: formData, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error("API_REQUEST_FAILED");

      const data = await response.json();

      if (data.success && data.data?.mermaid_code) {
        const code = data.data.mermaid_code;
        setMermaidCode(code);
        void persistProject({ mermaidCode: code });
        setMessages((prev) => [...prev, { role: "assistant", content: "✅ 图片识别成功！Mermaid 流程图已生成" }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "😅 识别图片时遇到问题，请换张图片再试" }]);
      }
    } catch (error: any) {
      const errMsg = error?.message === "API_REQUEST_FAILED"
        ? "😅 服务暂时繁忙，请稍后再试"
        : error?.message?.includes("Failed to fetch") || error?.message?.includes("fetch failed")
        ? "🔌 无法连接到服务，请检查网络连接后重试"
        : "❌ 上传过程中出现问题，请重试";
      setMessages((prev) => [...prev, { role: "assistant", content: errMsg }]);
    } finally {
      setIsUploadLoading(false);
      setUploadProgress("");
    }
  };

  const handleGenerateFromPrompt = async (prompt?: string) => {
    const userPrompt = prompt || inputValue.trim();
    if (!userPrompt) return;

    setIsChatLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: userPrompt }]);
    setInputValue("");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      const response = await fetch("/api/generate-flowchart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, mode: "text", output_format: "mermaid", direction }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("API_REQUEST_FAILED");
      }

      const data = await response.json();

      if (data.success) {
        let mermaidStr = "";

        if (data.data?.format === "mermaid" && data.data?.mermaid_code) {
          mermaidStr = data.data.mermaid_code;
        } else if (typeof data.data === "string") {
          mermaidStr = extractMermaidCode(data.data);
        } else if (data.data?.mermaid_code) {
          mermaidStr = data.data.mermaid_code;
        }

        mermaidStr = fixMermaidLineBreaks(mermaidStr);

        const MERMAID_VALID = ["graph ", "flowchart ", "sequenceDiagram", "classDiagram", "erDiagram", "mindmap", "gantt", "pie", "gitGraph", "stateDiagram", "journey"];

        if (mermaidStr && MERMAID_VALID.some(kw => mermaidStr.startsWith(kw))) {
          setMermaidCode(mermaidStr);
          void persistProject({
            name: project?.name,
            direction,
            lastMode: "mermaid",
            prompt: userPrompt,
            mermaidCode: mermaidStr,
          });
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Mermaid 流程图已生成！请在右侧预览区查看渲染结果。" },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "⚠️ 流程图已生成，但格式需要调整，请重试" },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ ${data.detail || "生成流程图时遇到问题，请换个描述再试一次"}` },
        ]);
      }
    } catch (error: any) {
      let errMsg: string;
      if (error?.name === "AbortError") {
        errMsg = "⏱ 请求耗时较长，AI 正在努力思考中，请稍后重试";
      } else if (error?.message === "API_REQUEST_FAILED") {
        errMsg = "😅 服务暂时繁忙，请稍后再试";
      } else if (error?.message?.includes("Failed to fetch") || error?.message?.includes("NetworkError") || error?.message?.includes("fetch failed")) {
        errMsg = "🔌 无法连接到服务，请检查网络连接后重试";
      } else {
        errMsg = `❌ 生成过程中出现问题: ${error?.message || "请重试"}`;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errMsg },
      ]);
    }

    setIsChatLoading(false);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isChatLoading) return;
    await handleGenerateFromPrompt();
  };

  const handleGoHome = () => router.push("/");

  const getRenderedSvgElement = () => document.querySelector(".mermaid-renderer svg") as SVGSVGElement | null;

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportSVG = async () => {
    const svg = getRenderedSvgElement();
    if (!svg) return;

    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, `autoflow_${Date.now()}.svg`);
  };

  const handleExportPNG = async () => {
    const svg = getRenderedSvgElement();
    if (!svg) {
      alert("未找到可导出的图表，请确保图表已渲染完成");
      return;
    }

    const rect = svg.getBoundingClientRect();
    const svgWidth = rect.width || 1200;
    const svgHeight = rect.height || 800;

    const serialized = new XMLSerializer().serializeToString(svg);
    const image = new window.Image();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      alert("浏览器不支持 Canvas，无法导出 PNG");
      return;
    }

    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      const w = image.width || svgWidth;
      const h = image.height || svgHeight;
      // 限制最大分辨率，避免内存溢出
      const maxDim = 4000;
      const scale = Math.min(2, maxDim / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          downloadBlob(pngBlob, `autoflow_${Date.now()}.png`);
        } else {
          alert("PNG 生成失败，请重试");
        }
        URL.revokeObjectURL(url);
      }, "image/png");
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      alert("SVG 加载失败，无法导出 PNG");
    };
    image.src = url;
  };

  const handleRenameProject = async () => {
    if (!projectId) return;
    const nextName = window.prompt("输入新项目名称", project?.name || "")?.trim();
    if (!nextName || nextName === project?.name) return;
    await persistProject({ name: nextName, direction, lastMode: "mermaid", mermaidCode, prompt: inputValue });
  };

  const handleDirectionChange = async (nextDirection: FlowDirection) => {
    setDirection(nextDirection);
    if (mermaidCode) {
      const converted = convertDirectionInMermaid(mermaidCode, nextDirection);
      setMermaidCode(converted);
    }
    await persistProject({ direction: nextDirection, lastMode: "mermaid", mermaidCode, prompt: inputValue });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="h-screen flex bg-white dark:bg-[#0f172a] text-[#0f172a] dark:text-[#f1f5f9] overflow-hidden">

      {/* 统一导航栏（与 Excalidraw 模式一致） */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-3 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-sm border-b border-[#e5e2dd] dark:border-[#3f3d39]">
        <div className="flex items-center gap-4">
          <MenuButton onClick={() => setSidebarOpen(true)} />
          <button onClick={handleGoHome} className="flex items-center gap-2 hover:text-[#8b5cf6] dark:hover:text-[#a78bfa] transition-colors cursor-pointer px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2d2b29]">
            <Home className="w-5 h-5" />
            <span className="text-sm font-semibold" style={{ fontFamily: "'Segoe UI', 'Roboto', sans-serif" }}>主页</span>
          </button>

          {/* 当前模式标识 */}
          <div className="px-3 py-1.5 rounded-lg bg-[#dbeafe] dark:bg-[#1e3a8a]/30 border border-[#93c5fd] dark:border-[#60a5fa]">
            <span className="text-xs font-bold text-[#1e40af] dark:text-[#93c5fd]" style={{ fontFamily: "'Segoe UI', 'Roboto', sans-serif" }}>
              <Code2 className="w-3.5 h-3.5 inline mr-1" />Mermaid 模式
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f8f7ff] dark:bg-[#2d2b29] border border-[#e5e2dd] dark:border-[#3f3d39]">
            <div className="text-sm font-bold text-[#3730a3] dark:text-[#818cf8] truncate max-w-55" style={{ fontFamily: "'Segoe UI', 'Roboto', sans-serif" }}>
              {project?.name || "Mermaid 编辑器"}
            </div>
            <button
              onClick={handleRenameProject}
              disabled={!projectId || projectSaving}
              className="px-2 py-1 rounded-lg text-xs font-semibold text-[#5c5c5c] dark:text-[#c8c4bc] hover:bg-white/80 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="重命名项目"
            >
              重命名
            </button>
          </div>

          <DirectionSelector 
            direction={direction} 
            onChange={handleDirectionChange}
          />

          <ThemeToggle />
        </div>
      </div>

      {/* 左侧边栏 */}
      <AIAssistantPanel
        messages={messages}
        inputValue={inputValue}
        isChatLoading={isChatLoading}
        activeTab={activeTab}
        isUploadLoading={isUploadLoading}
        uploadProgress={uploadProgress}
        isDragOver={isDragOver}
        uploadedImages={uploadedImages}
        showImagesInChat={false}
        onInputChange={setInputValue}
        onSendMessage={handleSendMessage}
        onKeyDown={handleKeyDown}
        onTabChange={setActiveTab}
        onFileSelect={handleFileSelect}
        onDrop={handleDropHandler}
        onDragOver={handleDragOverHandler}
        onDragLeave={handleDragLeaveHandler}
        fileInputId="mermaid-file-upload-input"
        fontFamily="'Segoe UI', 'Roboto', sans-serif"
      />

      {/* 右侧画布区 */}
      <div className="flex-1 relative mt-14 flex flex-col bg-white dark:bg-[#0f172a]">
        {mermaidCode ? (
          <div className="flex-1 overflow-hidden">
            <MermaidRenderer code={mermaidCode} zoom={zoom} onZoomChange={(z) => setZoom(z)} onFitToScreenRef={fitToScreenRef} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-[#8a8a8a] dark:text-[#737373]">
              <Code2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-base font-bold" style={{ fontFamily: "'Segoe UI', 'Roboto', sans-serif", color: "#3730a3", opacity: 0.6 }}>在左侧输入描述生成 Mermaid 流程图</p>
              <p className="text-xs mt-2 opacity-50">流程图将在此处全屏渲染预览</p>
            </div>
          </div>
        )}

        {mermaidCode && (
          <button
            onClick={() => setShowCodeModal(true)}
            className="absolute top-4 right-4 z-20 px-4 py-2.5 bg-[#dbeafe] dark:bg-[#1e3a8a]/30 border-2 border-[#1e1b4b] rounded-xl text-sm font-bold text-[#1e1b4b] dark:text-[#93c5fd] flex items-center gap-2 cursor-pointer hover:bg-[#bfdbfe] dark:hover:bg-[#1e3a8a]/50 transition-colors"
            style={{ fontFamily: "'Segoe UI', 'Roboto', sans-serif", borderRadius: "12px 16px 14px 10px" }}
          >
            <Code2 className="w-4 h-4" />
            显示 Mermaid 代码
          </button>
        )}
      </div>

      {/* 代码弹窗 */}
      {showCodeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCodeModal(false); }}
        >
          <div
            className="relative bg-[#dbeafe] dark:bg-[#1e1b4b] border-3 border-[#1e1b4b] dark:border-[#93c5fd] flex flex-col"
            style={{ width: "70vw", height: "80vh", borderRadius: "18px 24px 20px 16px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b-2 border-dashed border-[#1e1b4b]/30 dark:border-[#93c5fd]/30">
              <h3 className="text-lg font-bold text-[#1e1b4b] dark:text-[#93c5fd]" style={{ fontFamily: "'Segoe UI', 'Roboto', sans-serif" }}>
                Mermaid 代码
              </h3>
              <button
                onClick={() => setShowCodeModal(false)}
                className="p-2 hover:bg-[#1e1b4b]/10 dark:hover:bg-[#93c5fd]/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-[#1e1b4b] dark:text-[#93c5fd]" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <pre
                className="text-sm text-[#1e1b4b] dark:text-[#e0e7ff] whitespace-pre-wrap leading-relaxed bg-white/60 dark:bg-[#0f172a]/40 p-4 rounded-xl border border-dashed border-[#1e1b4b]/20 dark:border-[#93c5fd]/20"
                style={{ fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}
              >
                {mermaidCode}
              </pre>
            </div>

            <div className="px-6 py-4 border-t-2 border-dashed border-[#1e1b4b]/30 dark:border-[#93c5fd]/30 flex justify-end">
              <button
                onClick={handleCopyCode}
                className="px-6 py-2.5 bg-[#1e1b4b] dark:bg-[#93c5fd] text-white dark:text-[#1e1b4b] font-bold text-sm flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity"
                style={{ fontFamily: "'Segoe UI', 'Roboto', sans-serif", borderRadius: "10px 14px 12px 8px" }}
              >
                {copied ? (
                  <><Check className="w-4 h-4" />已复制 ✨</>
                ) : (
                  <><Copy className="w-4 h-4" />一键复制</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 画布工具栏 */}
      {mermaidCode && (
        <div className="absolute bottom-5 left-5 right-5 z-20 flex justify-end gap-2 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2">
            <button onClick={() => setZoom((v) => Math.max(0.1, v - 0.15))} title="缩小" className="p-2.5 bg-white/90 dark:bg-[#2d2b29]/90 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:bg-slate-100 dark:hover:bg-[#3f3d39] transition-colors cursor-pointer shadow-sm">
              <ZoomOut className="w-4.5 h-4.5 text-[#5c5c5c] dark:text-[#8a8a8a]" />
            </button>
            <button onClick={() => setZoom(1)} title="重置缩放" className="px-3 py-2.5 bg-white/90 dark:bg-[#2d2b29]/90 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:bg-slate-100 dark:hover:bg-[#3f3d39] transition-colors cursor-pointer shadow-sm text-xs font-semibold text-[#5c5c5c] dark:text-[#c8c4bc]">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => setZoom((v) => Math.min(3, v + 0.15))} title="放大" className="p-2.5 bg-white/90 dark:bg-[#2d2b29]/90 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:bg-slate-100 dark:hover:bg-[#3f3d39] transition-colors cursor-pointer shadow-sm">
              <ZoomIn className="w-4.5 h-4.5 text-[#5c5c5c] dark:text-[#8a8a8a]" />
            </button>
            <div className="w-px h-6 bg-[#e5e2dd] dark:border-[#3f3d39]" />
            <button onClick={() => fitToScreenRef.current?.()} title="居中适配" className="p-2.5 bg-white/90 dark:bg-[#2d2b29]/90 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:bg-slate-100 dark:hover:bg-[#3f3d39] transition-colors cursor-pointer shadow-sm">
              <Maximize className="w-4.5 h-4.5 text-[#5c5c5c] dark:text-[#8a8a8a]" />
            </button>
            <div className="w-px h-6 bg-[#e5e2dd] dark:border-[#3f3d39]" />
            <button onClick={handleExportPNG} title="导出 PNG" className="p-2.5 bg-white/90 dark:bg-[#2d2b29]/90 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:bg-slate-100 dark:hover:bg-[#3f3d39] transition-colors cursor-pointer shadow-sm">
              <Download className="w-4.5 h-4.5 text-[#5c5c5c] dark:text-[#8a8a8a]" />
            </button>
            <button onClick={handleExportSVG} title="导出 SVG" className="p-2.5 bg-white/90 dark:bg-[#2d2b29]/90 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:bg-slate-100 dark:hover:bg-[#3f3d39] transition-colors cursor-pointer shadow-sm">
              <FileImage className="w-4.5 h-4.5 text-[#5c5c5c] dark:text-[#8a8a8a]" />
            </button>
          </div>
        </div>
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
}
