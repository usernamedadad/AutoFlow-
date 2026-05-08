"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";

if (typeof window !== "undefined") {
  (window as any).EXCALIDRAW_ASSET_PATH = "/";
}

import { useSearchParams, useRouter } from "next/navigation";

import dynamic from "next/dynamic";

import Image from "next/image";

import "@excalidraw/excalidraw/index.css";

import {

  Download,
  Home,
  RotateCcw,
  FileImage,

} from "lucide-react";

import DirectionSelector from "@/components/DirectionSelector";

import AIAssistantPanel from "@/components/AIAssistantPanel";

import ThemeToggle from "@/components/ThemeToggle";
import SelectionEditBar from "@/components/SelectionEditBar";

import { HandDrawnPencil } from "@/components/HandDrawnIcons";

import { mermaidToExcalidraw, centerElements, convertMermaidDirection, applySkeletonToExcalidraw } from "@/lib/excalidrawConverter";
import { elementsToGraphModel, graphModelToElements } from "@/lib/graphModel";
import { applyDiff, DiffResponse } from "@/lib/diffEngine";
import { UndoStack } from "@/lib/undoStack";

import {
  FlowDirection,
  ProjectRecord,
  getProject,
  updateProject,
  createProject,
} from "@/lib/projectApi";


function detectChartType(code: string): string {
  const trimmed = code.trim().toLowerCase();
  if (trimmed.startsWith("sequencediagram")) return "时序图 (Sequence Diagram)";
  if (trimmed.startsWith("classdiagram")) return "类图 (Class Diagram)";
  if (trimmed.startsWith("erdiagram")) return "ER 图 (Entity Relationship)";
  if (trimmed.startsWith("mindmap")) return "思维导图 (Mind Map)";
  if (trimmed.startsWith("gantt")) return "甘特图 (Gantt Chart)";
  if (trimmed.startsWith("pie")) return "饼图 (Pie Chart)";
  if (trimmed.startsWith("gitgraph")) return "Git 图 (Git Graph)";
  if (trimmed.startsWith("statediagram")) return "状态图 (State Diagram)";
  if (trimmed.startsWith("journey")) return "用户旅程图 (Journey)";
  if (trimmed.startsWith("graph ") || trimmed.startsWith("flowchart ")) return "流程图 (Flowchart)";
  return "图表";
}


const IGNORE_SAVE_DELAY = 300;



const Excalidraw = dynamic(

  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),

  {

    ssr: false,

    loading: () => (

      <div className="flex items-center justify-center h-full bg-white dark:bg-[#0f172a] text-[#5c5c5c] dark:text-[#8a8a8a]">

        加载画布中...

      </div>

    ),

  }

);



interface Message {

  role: "user" | "assistant";

  content: string;
  pending?: boolean;

}



export default function ExcalidrawPage() {

  return (

    <Suspense fallback={<div className="h-screen flex items-center justify-center bg-white dark:bg-[#1a1918] text-[#5c5c5c] dark:text-[#b0c4de]">加载中...</div>}>

      <ExcalidrawContent />

    </Suspense>

  );

}



function ExcalidrawContent() {

  const searchParams = useSearchParams();

  const router = useRouter();

  const projectId = searchParams.get("project") || "";

  const initialPrompt = searchParams.get("prompt") || "";



  const [messages, setMessages] = useState<Message[]>([]);

  const [inputValue, setInputValue] = useState("");

  const [isChatLoading, setIsChatLoading] = useState(false);

  const [isUploadLoading, setIsUploadLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"chat" | "upload">("chat");

  const [uploadedImages, setUploadedImages] = useState<{url: string; name: string}[]>([]);

  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  const [isDragOver, setIsDragOver] = useState(false);

  const [uploadProgress, setUploadProgress] = useState("");

  const [project, setProject] = useState<ProjectRecord | null>(null);

  const [direction, setDirection] = useState<FlowDirection>("TD");

  const [projectSaving, setProjectSaving] = useState(false);
  const [projectLoaded, setProjectLoaded] = useState(!projectId);
  const [mermaidCode, setMermaidCode] = useState("");

  const promptFilledRef = useRef(false);
  const hasAutoSentRef = useRef(false);
  const pendingElementsRef = useRef<any[] | null>(null);
  const ignoreSceneSaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef(0);
  const projectLoadedOnceRef = useRef(false);
  const excalidrawAPISetRef = useRef(false);

  // 增量编辑状态
  const undoStackRef = useRef(new UndoStack(50));
  const [selectionBBox, setSelectionBBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectionEditLoading, setSelectionEditLoading] = useState(false);

  // 稳定化传给 Excalidraw 的 props，避免每次渲染新引用触发内部 useEffect 死循环
  const memoInitialData = useMemo(() => ({
    elements: [],
    appState: {
      gridSize: undefined,
      viewBackgroundColor: "#ffffff",
      currentItemFontFamily: 5,
      currentItemRoughness: 1,
      currentItemStrokeWidth: 2,
    },
  }), []);
  const memoUIOptions = useMemo(() => ({
    canvasActions: { loadScene: false, export: { saveFileToDisk: false } },
  }), []);

  // 跟踪选中 BBox 前值，避免相同值时重复 setState 触发重渲染
  const prevBBoxRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const prevCountRef = useRef(0);
  // 选中元素 ID 锁定：仅当选中元素集合变化时更新 bar，忽略纯位置移动
  const prevSelectedIdsRef = useRef("");
  // 当前画布 zoom 级别
  const [currentZoom, setCurrentZoom] = useState(1);
  const [canvasScroll, setCanvasScroll] = useState({ x: 0, y: 0 });
  const canvasScrollRef = useRef(canvasScroll);
  canvasScrollRef.current = canvasScroll;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperSize, setWrapperSize] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    return () => {
      excalidrawAPISetRef.current = false;
    };
  }, []);



  useEffect(() => {

    if (initialPrompt && !promptFilledRef.current) {

      promptFilledRef.current = true;

      setInputValue(initialPrompt);

    }

  }, [initialPrompt]);



  useEffect(() => {
    if (projectLoadedOnceRef.current) return;

    let isCancelled = false;

    const ensureProject = async () => {
      try {
        if (projectId) {
          const data = await getProject(projectId);
          if (isCancelled) return;
          setProject(data);
          setDirection(data.direction || "TD");
          setProjectLoaded(true);
          projectLoadedOnceRef.current = true;

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

          if (data.excalidrawData?.elements?.length) {
            pendingElementsRef.current = data.excalidrawData.elements;
            // 如果有保存的 files（mermaid-image 贴图等），存下来等 API 初始化后恢复
            if (data.excalidrawData.files) {
              (window as any).__autoflow_pending_files = data.excalidrawData.files;
            }
            if (excalidrawAPI) {
              ignoreSceneSaveRef.current = true;
              // 恢复保存的 files（mermaid-image 贴图等）
              const pendingFiles = (window as any).__autoflow_pending_files;
              if (pendingFiles && typeof pendingFiles === 'object') {
                try {
                  const fileArray = Array.isArray(pendingFiles) ? pendingFiles : Object.values(pendingFiles);
                  excalidrawAPI.addFiles(fileArray);
                } catch (e) { console.warn('[AutoFlow] Failed to restore files:', e); }
                delete (window as any).__autoflow_pending_files;
              }
              const centered = centerElements(data.excalidrawData.elements);
              excalidrawAPI.updateScene({
                elements: centered,
                appState: { viewBackgroundColor: "#ffffff", currentItemFontFamily: 5, currentItemRoughness: 1 },
              });
              window.setTimeout(() => {
                excalidrawAPI.scrollToContent(centered, { fitToContent: true, animate: true });
              }, 50);
              window.setTimeout(() => {
                ignoreSceneSaveRef.current = false;
              }, IGNORE_SAVE_DELAY);
            }
          }
        } else {
          const newProject = await createProject({ lastMode: "excalidraw", direction: "TD" });
          if (isCancelled) return;
          setProject(newProject);
          setDirection("TD");
          setProjectLoaded(true);
          projectLoadedOnceRef.current = true;
        }
      } catch (error) {
        console.error("Failed to load/create project", error);
        setProjectLoaded(true);
        projectLoadedOnceRef.current = true;
      }
    };

    void ensureProject();

    return () => {
      isCancelled = true;
    };
  }, [projectId]); // excalidrawAPI 由独立的 pending elements effect 处理



  useEffect(() => {

    if (!projectLoaded || !initialPrompt || hasAutoSentRef.current) {

      return;

    }



    hasAutoSentRef.current = true;

    void handleGenerateFromPrompt(initialPrompt);

  }, [initialPrompt, projectLoaded]);



  useEffect(() => {

    if (!excalidrawAPI || !pendingElementsRef.current?.length) {

      return;

    }

    console.log("[AutoFlow] Applying", pendingElementsRef.current.length, "pending elements to scene");



    ignoreSceneSaveRef.current = true;

    // 恢复保存的 files（mermaid-image 贴图等）
    const pendingFiles = (window as any).__autoflow_pending_files;
    if (pendingFiles && typeof pendingFiles === 'object') {
      try {
        const fileArray = Array.isArray(pendingFiles) ? pendingFiles : Object.values(pendingFiles);
        excalidrawAPI.addFiles(fileArray);
      } catch (e) { console.warn('[AutoFlow] Failed to restore pending files:', e); }
      delete (window as any).__autoflow_pending_files;
    }

    const centered = centerElements([...pendingElementsRef.current]);

    excalidrawAPI.updateScene({

      elements: centered,

      appState: { viewBackgroundColor: "#ffffff", currentItemFontFamily: 5, currentItemRoughness: 1 },

    });

    pendingElementsRef.current = null;

    window.setTimeout(() => {

      ignoreSceneSaveRef.current = false;

            }, IGNORE_SAVE_DELAY);

  }, [excalidrawAPI]);



  useEffect(() => {

    return () => {

      if (saveTimerRef.current) {

        window.clearTimeout(saveTimerRef.current);

      }

    };

  }, []);



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

  const scheduleProjectSceneSave = (elements: any[]) => {

    const now = Date.now();

    if (!projectId || ignoreSceneSaveRef.current || (now - lastSavedRef.current < 1000)) {

      return;

    }



    if (saveTimerRef.current) {

      window.clearTimeout(saveTimerRef.current);

    }



    saveTimerRef.current = window.setTimeout(() => {

      lastSavedRef.current = Date.now();

      void persistProject({

        lastMode: "excalidraw",

        direction,

        prompt: inputValue,

        excalidrawData: { elements },

      });

    }, 700);

  };



  const handleGenerateFromPrompt = async (prompt: string) => {
    setIsChatLoading(true);
    setInputValue("");
    const startTime = Date.now();

    setMessages((prev) => [
      ...prev,
      { role: "user", content: prompt },
      { role: "assistant", content: "⏳ AI 正在分析并生成图表…", pending: true },
    ]);

    // 每 5 秒更新一次等待提示，让用户感知系统仍在工作
    const progressTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      setMessages((prev) => {
        const withoutPending = prev.filter((m: Message) => !m.pending);
        return [...withoutPending, {
          role: "assistant",
          content: `⏳ AI 正在生成图表… (已等待 ${elapsed}秒)`,
          pending: true,
        }];
      });
    }, 5000);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch("/api/generate-flowchart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "text", output_format: "excalidraw", direction }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error("API_REQUEST_FAILED");
      const json = await response.json();

      if (!json.success) {
        setMessages((prev) => {
          const withoutPending = prev.filter((m: Message) => !m.pending);
          return [...withoutPending, { role: "assistant", content: `❌ ${json.message || "生成失败"}` }];
        });
        setIsChatLoading(false);
        clearInterval(progressTimer);
        return;
      }

      const resultData = json.data;
      let elements: any = null;
      let files: any = null;
      let mermaidStr = "";

      if (resultData?.format === "skeleton" && Array.isArray(resultData.elements) && resultData.elements.length > 0) {
        try {
          const result = await applySkeletonToExcalidraw(resultData.elements);
          elements = result.elements;
        } catch (skelErr: any) {
          console.error("[AutoFlow] Skeleton 转换失败:", skelErr);
        }
      } else if (resultData?.format === "mermaid" || resultData?.mermaid_code) {
        mermaidStr = resultData.mermaid_code;
        setMermaidCode(mermaidStr);
        try {
          const result = await mermaidToExcalidraw(mermaidStr);
          elements = result.elements;
          files = result.files || null;
        } catch (genErr: any) {
          console.error("[AutoFlow] Mermaid 转换失败:", genErr);
        }
      } else if (resultData?.elements && Array.isArray(resultData.elements) && resultData.elements.length > 0) {
        elements = resultData.elements;
      }

      if (elements && elements.length > 0) {
        const centered = centerElements([...elements]);
        if (excalidrawAPI) {
          ignoreSceneSaveRef.current = true;
          const sceneUpdate: any = {
            elements: centered,
            appState: { viewBackgroundColor: "#ffffff", currentItemFontFamily: 5, currentItemRoughness: 1 },
            replaceScene: true,
          };
          if (files && Object.keys(files).length > 0) {
            excalidrawAPI.addFiles(files);
          }
          excalidrawAPI.updateScene(sceneUpdate);
          window.setTimeout(() => {
            const after = excalidrawAPI.getSceneElements?.() || [];
            if (after.length > 0) {
              excalidrawAPI.scrollToContent(after, { fitToContent: true, animate: true });
            }
          }, 150);
          window.setTimeout(() => {
            ignoreSceneSaveRef.current = false;
          }, IGNORE_SAVE_DELAY);
        } else {
          pendingElementsRef.current = [...elements];
        }

        void persistProject({
          lastMode: "excalidraw",
          direction,
          prompt,
          excalidrawData: {
            elements: excalidrawAPI ? centered : elements,
            files: files || undefined,
          },
          mermaidCode: mermaidStr || mermaidCode,
        });
      }

      setMessages((prev) => {
        const withoutPending = prev.filter((m: Message) => !m.pending);
        return [...withoutPending, {
          role: "assistant",
          content: elements && elements.length > 0
            ? `✅ 图表已生成！${json.message || ""}`
            : "❌ 生成流程图时遇到问题，请换个描述再试一次",
        }];
      });
    } catch (error: any) {
      let errMsg: string;
      if (error?.name === "AbortError") {
        errMsg = "⏱ 请求耗时较长，AI 正在努力思考中，请稍后重试";
      } else if (error?.message === "API_REQUEST_FAILED") {
        errMsg = "😅 服务暂时繁忙，请稍后再试";
      } else if (error?.message?.includes("Failed to fetch") || error?.message?.includes("NetworkError") || error?.message?.includes("fetch failed")) {
        errMsg = "🔌 无法连接到服务，请检查网络连接后重试";
      } else {
        errMsg = "❌ 生成过程中出现问题，请重试";
      }
      setMessages((prev) => [
        ...prev.filter((m: Message) => !m.pending),
        { role: "assistant", content: errMsg },
      ]);
    }

    clearInterval(progressTimer);
    setIsChatLoading(false);
  };



  const handleSendMessage = async () => {

    if (!inputValue.trim() || isChatLoading) return;

    const userMessage = inputValue.trim();

    setInputValue("");

    // 画布有元素时走增量编辑，否则走全量生成
    const currentElements = excalidrawAPI?.getSceneElements?.();
    if (currentElements && currentElements.length > 0) {
      await handleChatIncrementalEdit(userMessage, currentElements);
    } else {
      await handleGenerateFromPrompt(userMessage);
    }

  };

  const handleChatIncrementalEdit = async (instruction: string, currentElements: any[]) => {
    setIsChatLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: instruction },
    ]);

    try {
      const graphModel = elementsToGraphModel(currentElements, direction);
      undoStackRef.current.push(graphModel, currentElements);

      const response = await fetch("/api/chat/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph_state: graphModel,
          instruction,
          mode: "chat_incremental",
        }),
      });

      if (!response.ok) throw new Error("EDIT_API_FAILED");
      const result = await response.json();

      if (result.success && result.data) {
        const updated = applyDiff(currentElements, result.data as DiffResponse);
        ignoreSceneSaveRef.current = true;
        excalidrawAPI.updateScene({ elements: updated, replaceScene: true });
        setTimeout(() => { ignoreSceneSaveRef.current = false; }, IGNORE_SAVE_DELAY);

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "✅ 已根据你的指令修改图表" },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ ${result.message || "增量编辑失败，请重试"}` },
        ]);
      }
    } catch (err) {
      console.error("[AutoFlow] Chat incremental edit error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ 增量编辑失败，请检查网络连接后重试" },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };



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

    try {

      const formData = new FormData();

      formData.append("file", file);

      setUploadProgress("正在识别图片中的流程图...");



      const controller = new AbortController();

      const timeoutId = setTimeout(() => controller.abort(), 180000);



      const response = await fetch("/api/recognize-image", { method: "POST", body: formData, signal: controller.signal });



      clearTimeout(timeoutId);



      if (!response.ok) {

        throw new Error("API_REQUEST_FAILED");

      }



      const data = await response.json();



      if (data.success && (data.data?.mermaid_code || data.data?.elements)) {
        let elements = null;
        let uploadFiles: any = null;

        if (data.data.mermaid_code) {
          setUploadProgress("正在转换为可编辑流程图...");
          setMermaidCode(data.data.mermaid_code);
          try {
            const result = await mermaidToExcalidraw(data.data.mermaid_code);
            elements = result.elements;
            uploadFiles = result.files || null;
          } catch (convertErr: any) {
            console.error("[AutoFlow] Upload conversion error:", convertErr);
            setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ 图表转换失败：${convertErr?.message || '未知错误'}` }]);
          }
        } else {
          const result = await mermaidToExcalidraw(`graph TD\n${JSON.stringify(data.data).substring(0, 100)}`);
          elements = result.elements;
          uploadFiles = result.files || null;
        }

        if (elements && excalidrawAPI) {

          ignoreSceneSaveRef.current = true;

          const centered = centerElements(elements);

          if (uploadFiles && Object.keys(uploadFiles).length > 0) {
            excalidrawAPI.addFiles(uploadFiles);
          }
          excalidrawAPI.updateScene({ elements: centered, appState: { viewBackgroundColor: "#ffffff", currentItemFontFamily: 5, currentItemRoughness: 1 } });
          window.setTimeout(() => { excalidrawAPI.scrollToContent(centered, { fitToContent: true, animate: true }); }, 50);

          window.setTimeout(() => {
            ignoreSceneSaveRef.current = false;
          }, IGNORE_SAVE_DELAY);

          void persistProject({
            lastMode: "excalidraw",
            direction,
            prompt: inputValue,
            excalidrawData: { elements: centered },
            mermaidCode: data.data.mermaid_code || mermaidCode,
          });

        }

        setMessages((prev) => [...prev, { role: "assistant", content: "✅ 图片识别成功！流程图已显示在画布上" }]);

        setUploadedImages((prev) => [{ url: imageUrl, name: file.name }, ...prev].slice(0, 5));

      } else {

        setMessages((prev) => [...prev, { role: "assistant", content: `❌ ${data.message || "识别图片时遇到问题，请换张图片再试"}` }]);

      }

    } catch (error: any) {

      const errMsg = error?.message === "API_REQUEST_FAILED"

        ? "😅 服务暂时繁忙，请稍后再试"

        : error?.message?.includes("Failed to fetch") || error?.message?.includes("fetch failed")

        ? "🔌 无法连接到服务，请检查网络连接后重试"

        : "❌ 上传过程中出现问题，请重试";

      setMessages((prev) => [...prev, { role: "assistant", content: errMsg }]);

    }



    setIsUploadLoading(false);

    setUploadProgress("");

  };



  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); const files = Array.from(e.dataTransfer.files); if (files.length > 0) handleFileUpload(files[0]); }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const files = e.target.files; if (files && files.length > 0) handleFileUpload(files[0]); };



  const handleExportPNG = async () => {

    if (!excalidrawAPI) return;

    try {

      const blob = await excalidrawAPI.exportToBlob({ mimeType: "image/png", quality: 1 });

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a"); a.href = url; a.download = `autoflow_${Date.now()}.png`; a.click(); URL.revokeObjectURL(url);

    } catch (error) { console.error("导出PNG失败", error); }

  };



  const handleExportSVG = async () => {

    if (!excalidrawAPI) return;

    try {

      const svg = await excalidrawAPI.exportToSvg({ exportBackground: true, viewBackgroundColor: "#ffffff" });

      const blob = new Blob([svg], { type: "image/svg+xml" });

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a"); a.href = url; a.download = `autoflow_${Date.now()}.svg`; a.click(); URL.revokeObjectURL(url);

    } catch (error) { console.error("导出SVG失败", error); }

  };



  const handleResetCanvas = () => {

    if (!confirm("确定要重置画布吗？所有内容将被清除。")) {

      return;

    }



    if (excalidrawAPI) {

      ignoreSceneSaveRef.current = true;

      excalidrawAPI.updateScene({ elements: [] });

      window.setTimeout(() => {

        ignoreSceneSaveRef.current = false;

            }, IGNORE_SAVE_DELAY);

    }



    void persistProject({

      lastMode: "excalidraw",

      direction,

      prompt: inputValue,

      excalidrawData: { elements: [] },

      mermaidCode: "",

    });

  };

  const handleGoHome = () => router.push("/");

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } };

  // ─── 选中局部编辑 ────────────────────────────────

  const selectionBBoxRef = useRef(selectionBBox);
  selectionBBoxRef.current = selectionBBox;

  const handleSelectionEdit = useCallback(async (instruction: string) => {
    if (!excalidrawAPI || !selectionBBoxRef.current) return;
    setSelectionEditLoading(true);

    try {
      const currentElements = excalidrawAPI.getSceneElements() as any[];
      const idMap = (excalidrawAPI.getAppState().selectedElementIds as Record<string, boolean>) || {};
      const selectedIds = new Set(Object.keys(idMap).filter((k) => idMap[k]));
      const selectedElements = currentElements.filter((el: any) => el.id && selectedIds.has(el.id));

      if (selectedElements.length === 0) {
        setSelectionEditLoading(false);
        return;
      }

      const graphModel = elementsToGraphModel(currentElements, direction);
      const selectedNodes = graphModel.nodes.filter((n) => selectedIds.has(n.id));

      const response = await fetch("/api/chat/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selection: selectedNodes,
          instruction,
          mode: "selection_edit",
          graph_state: { layout: { direction } },
        }),
      });

      if (!response.ok) throw new Error("EDIT_API_FAILED");
      const result = await response.json();

      if (result.success && result.data) {
        // 防御：selection_edit 模式过滤掉 LLM 违规的增删操作
        if (result.data.operations) {
          const blockedOps = result.data.operations.filter(
            (op: any) => op.op === "add_node" || op.op === "delete" || op.op === "add_edge"
          );
          if (blockedOps.length > 0) {
            console.warn("[AutoFlow] selection_edit 过滤 LLM 违规操作:", blockedOps.map((o: any) => o.op));
          }
          result.data.operations = result.data.operations.filter(
            (op: any) => op.op !== "add_node" && op.op !== "delete" && op.op !== "add_edge"
          );
        }

        undoStackRef.current.push(graphModel, currentElements);

        const updated = applyDiff(currentElements, result.data as DiffResponse);

        ignoreSceneSaveRef.current = true;
        excalidrawAPI.updateScene({ elements: updated, replaceScene: true });
        setTimeout(() => { ignoreSceneSaveRef.current = false; }, IGNORE_SAVE_DELAY);

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `✅ 已对选中元素执行：${instruction}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ ${result.message || "局部编辑失败"}` },
        ]);
      }
    } catch (err) {
      console.error("[AutoFlow] Selection edit error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ 局部编辑失败，请检查网络连接后重试" },
      ]);
    } finally {
      setSelectionEditLoading(false);
      setSelectionBBox(null);
      setSelectedCount(0);
    }
  }, [excalidrawAPI, direction]);

  const handleSelectionEditClose = useCallback(() => {
    setSelectionBBox(null);
    setSelectedCount(0);
  }, []);

  // ─── 撤销 / 重做快捷键 ───────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && e.shiftKey) {
          e.preventDefault();
          const entry = undoStackRef.current.redo();
          if (entry && excalidrawAPI) {
            if (entry.rawElements) {
              excalidrawAPI.updateScene({ elements: entry.rawElements, replaceScene: true });
            } else {
              const els = graphModelToElements(entry.graph);
              excalidrawAPI.updateScene({ elements: els, replaceScene: true });
            }
          }
        } else if (e.key === "z") {
          e.preventDefault();
          const entry = undoStackRef.current.undo();
          if (entry && excalidrawAPI) {
            if (entry.rawElements) {
              excalidrawAPI.updateScene({ elements: entry.rawElements, replaceScene: true });
            } else {
              const els = graphModelToElements(entry.graph);
              excalidrawAPI.updateScene({ elements: els, replaceScene: true });
            }
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [excalidrawAPI]);

  // ─── 选中状态跟踪 ─────────────────────────────────

  // ── wrapper 尺寸追踪 ────────────────────────────

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setWrapperSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleExcalidrawChange = useCallback((elements: any[], appState: any) => {
    // 追踪 zoom 级别
    const z = appState?.zoom?.value ?? 1;
    if (z !== currentZoom) setCurrentZoom(z);

    // 追踪画布滚动偏移
    const sx = appState?.scrollX ?? 0;
    const sy = appState?.scrollY ?? 0;
    const prev = canvasScrollRef.current;
    if (sx !== prev.x || sy !== prev.y) {
      setCanvasScroll({ x: sx, y: sy });
    }

    const selectedIds = appState?.selectedElementIds as Record<string, boolean> | undefined;
    const ids = selectedIds ? Object.keys(selectedIds).filter((k) => selectedIds[k]) : [];
    if (ids.length === 0 || !excalidrawAPI) {
      if (prevBBoxRef.current !== null) {
        prevBBoxRef.current = null;
        prevCountRef.current = 0;
        prevSelectedIdsRef.current = "";
        setSelectionBBox(null);
        setSelectedCount(0);
      }
      return;
    }

    const idKey = ids.sort().join(",");

    // 选中元素 ID 未变（仅位置变化），跳过更新
    if (prevSelectedIdsRef.current && idKey === prevSelectedIdsRef.current) return;
    prevSelectedIdsRef.current = idKey;

      const all = elements || excalidrawAPI.getSceneElements() || [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let found = 0;
      for (const el of all) {
        if (el.id && selectedIds?.[el.id]) {
          found++;
          minX = Math.min(minX, el.x);
          minY = Math.min(minY, el.y);
          maxX = Math.max(maxX, el.x + (el.width || 0));
          maxY = Math.max(maxY, el.y + (el.height || 0));
        }
      }
      if (found > 0) {
        const newBBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        const prev = prevBBoxRef.current;
        if (!prev || prev.x !== newBBox.x || prev.y !== newBBox.y || prev.width !== newBBox.width || prev.height !== newBBox.height || prevCountRef.current !== found) {
          prevBBoxRef.current = newBBox;
          prevCountRef.current = found;
          setSelectionBBox(newBBox);
          setSelectedCount(found);
        }
      } else if (prevBBoxRef.current !== null) {
        prevBBoxRef.current = null;
        prevCountRef.current = 0;
        prevSelectedIdsRef.current = "";
        setSelectionBBox(null);
        setSelectedCount(0);
      }
  }, [excalidrawAPI, currentZoom]);

  // 用 ref 桥接 scheduleProjectSceneSave 避免 onChange useCallback 依赖频繁变化
  const scheduleSaveRef = useRef(scheduleProjectSceneSave);
  scheduleSaveRef.current = scheduleProjectSceneSave;

  const handleExcalidrawOnChange = useCallback((elements: any, appState: any) => {
    if (Array.isArray(elements)) {
      scheduleSaveRef.current(elements);
      handleExcalidrawChange(elements, appState);
    }
  }, [handleExcalidrawChange]);

  const handleExcalidrawAPICallback = useCallback((api: any) => {
    if (api) {
      setExcalidrawAPI((prev: any) => {
        if (prev === api) return prev;
        excalidrawAPISetRef.current = true;
        return api;
      });
    }
  }, []);



  return (

    <div className="h-screen flex bg-white dark:bg-[#0f172a] text-[#0f172a] dark:text-[#f1f5f9] overflow-hidden">



      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-3 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-sm border-b border-[#e5e2dd] dark:border-[#3f3d39]">

        <div className="flex items-center gap-4">

          <button onClick={handleGoHome} className="flex items-center gap-2 hover:text-[#8b5cf6] dark:hover:text-[#a78bfa] transition-colors cursor-pointer px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2d2b29]">

            <Home className="w-5 h-5" />

            <span className="text-sm font-semibold" style={{ fontFamily: "'Comic Sans MS', cursive" }}>主页</span>

          </button>

          {/* 当前模式标识 */}
          <div className="px-3 py-1.5 rounded-lg bg-[#dcfce7] dark:bg-[#14532d]/30 border border-[#86efac] dark:border-[#4ade80]">
            <span className="text-xs font-bold text-[#166534] dark:text-[#86efac]" style={{ fontFamily: "'Comic Sans MS', cursive" }}>
              <HandDrawnPencil className="w-3.5 h-3.5 inline mr-1" />Excalidraw 模式
            </span>
          </div>

        </div>



        <div className="flex items-center gap-3">

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f8f7ff] dark:bg-[#2d2b29] border border-[#e5e2dd] dark:border-[#3f3d39]">

            <div className="text-sm font-bold text-[#3730a3] dark:text-[#818cf8] truncate max-w-55" style={{ fontFamily: "'Caveat', 'Kalam', 'Comic Sans MS', cursive" }}>

              {project?.name || "Excalidraw 编辑器"}

            </div>

            <button

              onClick={async () => {

                const nextName = window.prompt("输入新项目名称", project?.name || "")?.trim();

                if (!nextName || !projectId || nextName === project?.name) return;

                await persistProject({ name: nextName });

              }}

              disabled={!projectId || projectSaving}

              className="px-2 py-1 rounded-lg text-xs font-semibold text-[#5c5c5c] dark:text-[#c8c4bc] hover:bg-white/80 dark:hover:bg-white/5 transition-colors cursor-pointer"

              title="重命名项目"

            >

              重命名
            </button>

          </div>



          <DirectionSelector 
            direction={direction} 
            onChange={async (newDirection) => {
              setDirection(newDirection);
              await persistProject({ direction: newDirection, lastMode: "excalidraw" });

              if (mermaidCode && excalidrawAPI) {
                const convertedCode = convertMermaidDirection(mermaidCode, newDirection);
                try {
                  const result = await mermaidToExcalidraw(convertedCode);
                  const newElements = result.elements;
                  const dirFiles = result.files;

                  if (newElements && newElements.length > 0) {
                  setMermaidCode(convertedCode);
                  ignoreSceneSaveRef.current = true;
                  const centered = centerElements(newElements);
                  if (dirFiles && Object.keys(dirFiles).length > 0) {
                    excalidrawAPI.addFiles(dirFiles);
                  }
                  excalidrawAPI.updateScene({ elements: centered, appState: { viewBackgroundColor: "#ffffff", currentItemFontFamily: 5, currentItemRoughness: 1 } });
                  window.setTimeout(() => { excalidrawAPI.scrollToContent(centered, { fitToContent: true, animate: true }); }, 100);
                  window.setTimeout(() => { ignoreSceneSaveRef.current = false; }, IGNORE_SAVE_DELAY);
                  void persistProject({
                    lastMode: "excalidraw",
                    direction: newDirection,
                    excalidrawData: { elements: centered },
                    mermaidCode: convertedCode,
                  });
                }
                } catch (dirErr: any) {
                  if (dirErr?.message === "NON_FLOWCHART_RENDER_FAILED") {
                    setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ 该图表类型在 Excalidraw 模式下渲染失败，建议切换到 Mermaid 模式查看" }]);
                  }
                }
              }
            }} 
          />



          <ThemeToggle />

        </div>

      </div>



      <AIAssistantPanel
        messages={messages}
        inputValue={inputValue}
        isChatLoading={isChatLoading}
        activeTab={activeTab}
        isUploadLoading={isUploadLoading}
        uploadProgress={uploadProgress}
        isDragOver={isDragOver}
        uploadedImages={uploadedImages}
        showImagesInChat={true}
        onInputChange={setInputValue}
        onSendMessage={handleSendMessage}
        onKeyDown={handleKeyDown}
        onTabChange={setActiveTab}
        onFileSelect={handleFileSelect}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        fileInputId="excalidraw-file-upload-input"
        fontFamily="'Comic Sans MS', cursive"
      />



      <div className="flex-1 relative mt-14">

        <div className="excalidraw-wrapper" ref={wrapperRef} style={{ width: "100%", height: "calc(100vh - 56px)", position: "relative" }}>

          <Excalidraw

            onChange={handleExcalidrawOnChange}

            excalidrawAPI={handleExcalidrawAPICallback}

            UIOptions={memoUIOptions}

            langCode="zh-CN"

            initialData={memoInitialData}

          />

        </div>



        <div className="absolute bottom-5 left-5 right-5 z-30 flex justify-end gap-2 pointer-events-none">

          <div className="pointer-events-auto flex gap-2">

            <button onClick={handleResetCanvas} title="重置画板" className="p-2.5 bg-white/90 dark:bg-[#2d2b29]/90 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:bg-slate-100 dark:hover:bg-[#3f3d39] transition-colors cursor-pointer shadow-sm">

              <RotateCcw className="w-4.5 h-4.5 text-[#5c5c5c] dark:text-[#8a8a8a]" />

            </button>

            <button onClick={handleExportPNG} title="导出 PNG" className="p-2.5 bg-white/90 dark:bg-[#2d2b29]/90 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:bg-slate-100 dark:hover:bg-[#3f3d39] transition-colors cursor-pointer shadow-sm">

              <Download className="w-4.5 h-4.5 text-[#5c5c5c] dark:text-[#8a8a8a]" />

            </button>

            <button onClick={handleExportSVG} title="导出 SVG" className="p-2.5 bg-white/90 dark:bg-[#2d2b29]/90 backdrop-blur-sm rounded-xl border border-[#e5e2dd] dark:border-[#3f3d39] hover:bg-slate-100 dark:hover:bg-[#3f3d39] transition-colors cursor-pointer shadow-sm">

              <FileImage className="w-4.5 h-4.5 text-[#5c5c5c] dark:text-[#8a8a8a]" />

            </button>

          </div>

        </div>

        <SelectionEditBar
          boundingBox={selectionBBox}
          selectedCount={selectedCount}
          zoom={currentZoom}
          scrollX={canvasScroll.x}
          scrollY={canvasScroll.y}
          containerWidth={wrapperSize.w}
          containerHeight={wrapperSize.h}
          onSubmit={handleSelectionEdit}
          onClose={handleSelectionEditClose}
          loading={selectionEditLoading}
        />

      </div>

    </div>

  );

}

