"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Edit3,
  FolderOpen,
  Clock,
  Code2,
  Loader2,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import Sidebar, { MenuButton } from "@/components/Sidebar";
import { FlowchartBackground } from "@/components/BackgroundEffects";
import { HandDrawnPencil } from "@/components/HandDrawnIcons";
import {
  createProject,
  deleteAllProjects,
  deleteProject,
  listProjects,
  ProjectRecord,
  updateProject,
} from "@/lib/projectApi";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterMode, setFilterMode] = useState<"all" | "excalidraw" | "mermaid">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedMode, setSelectedMode] = useState<"excalidraw" | "mermaid">("excalidraw");
  const router = useRouter();

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setNewProjectName("");
    setSelectedMode("excalidraw");
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewProjectName("");
  };

  const createNewProject = async () => {
    if (creating) return;
    const name = newProjectName.trim() || `新项目 ${new Date().toLocaleDateString("zh-CN")}`;
    setCreating(true);
    setShowCreateModal(false);
    try {
      const project = await createProject({
        name,
        lastMode: selectedMode,
        direction: "TD",
      });
      setProjects((prev) => [project, ...prev]);
      router.push(`/canvas/${selectedMode}?mode=new&project=${project.id}`);
    } catch {
      alert("创建项目失败，请稍后重试。");
    } finally {
      setCreating(false);
    }
  };

  const deleteProjectById = async (projectId: string) => {
    if (!confirm("确定要删除这个项目吗？删除后无法恢复。")) return;
    setUpdatingId(projectId);
    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch {
      alert("删除失败，请稍后重试。");
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteAll = async () => {
    if (!confirm(`确定要删除所有项目吗？共 ${projects.length} 个项目，删除后无法恢复。`)) return;
    setLoading(true);
    try {
      const result = await deleteAllProjects();
      setProjects([]);
      alert(`已删除 ${result.deleted_count} 个项目。`);
    } catch {
      alert("批量删除失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const renameProject = async (project: ProjectRecord) => {
    const nextName = window.prompt("输入新项目名称", project.name)?.trim();
    if (!nextName || nextName === project.name) return;
    setUpdatingId(project.id);
    try {
      const updated = await updateProject(project.id, { name: nextName });
      setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      alert("重命名失败，请稍后重试。");
    } finally {
      setUpdatingId(null);
    }
  };

  const openProject = (project: ProjectRecord) => {
    const mode = project.lastMode || "excalidraw";
    router.push(`/canvas/${mode}?mode=edit&project=${project.id}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredProjects = projects
    .filter((p) => {
      if (filterMode !== "all" && p.lastMode !== filterMode) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0c1222] relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <FlowchartBackground />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 py-3 bg-white/80 dark:bg-[#0c1222]/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-700/40">
        <div className="flex items-center gap-4">
          <MenuButton onClick={() => setSidebarOpen(true)} />
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              AutoFlow
            </span>
          </Link>
          <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
          <span className="hidden sm:block text-sm font-medium text-slate-500 dark:text-slate-400">
            项目管理
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {projects.length > 0 && (
            <button
              onClick={deleteAll}
              disabled={loading}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="删除所有项目"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">清空项目</span>
            </button>
          )}
          <button
            onClick={openCreateModal}
            disabled={creating}
            className="ml-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            创建新项目
          </button>
        </div>
      </nav>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeCreateModal} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6">创建新项目</h3>
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  项目名称
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createNewProject()}
                  placeholder="输入项目名称（可选）"
                  autoFocus
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  选择模式
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSelectedMode("excalidraw")}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      selectedMode === "excalidraw"
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <HandDrawnPencil className={`w-8 h-8 mx-auto mb-2 ${selectedMode === "excalidraw" ? "text-emerald-600" : "text-slate-400"}`} />
                    <div className={`font-medium text-sm ${selectedMode === "excalidraw" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"}`}>
                      Excalidraw 模式
                    </div>
                    <div className="text-xs text-slate-400 mt-1">手绘风格自由编辑</div>
                  </button>

                  <button
                    onClick={() => setSelectedMode("mermaid")}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      selectedMode === "mermaid"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <Code2 className={`w-8 h-8 mx-auto mb-2 ${selectedMode === "mermaid" ? "text-blue-600" : "text-slate-400"}`} />
                    <div className={`font-medium text-sm ${selectedMode === "mermaid" ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"}`}>
                      Mermaid 模式
                    </div>
                    <div className="text-xs text-slate-400 mt-1">代码驱动精准渲染</div>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={closeCreateModal}
                className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={createNewProject}
                disabled={creating}
                className="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    创建项目
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="relative z-10 w-full mx-auto px-6 pt-8 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              我的项目
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              管理你创建的所有流程图项目
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索项目..."
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
                {(["all", "excalidraw", "mermaid"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      filterMode === mode
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {mode === "all" ? "全部" : mode === "excalidraw" ? "Excalidraw" : "Mermaid"}
                  </button>
                ))}
              </div>

              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === "grid"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === "list"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-400" />
              <p className="text-sm text-slate-400">加载项目中...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {searchQuery || filterMode !== "all" ? "没有匹配的项目" : "还没有项目"}
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                {searchQuery || filterMode !== "all"
                  ? "尝试调整搜索条件或筛选器"
                  : "创建你的第一个流程图项目吧"}
              </p>
              {!searchQuery && filterMode === "all" && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => { setSelectedMode("excalidraw"); openCreateModal(); }}
                    disabled={creating}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <HandDrawnPencil className="w-4 h-4" />
                    Excalidraw 项目
                  </button>
                  <button
                    onClick={() => { setSelectedMode("mermaid"); openCreateModal(); }}
                    disabled={creating}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Code2 className="w-4 h-4" />
                    Mermaid 项目
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((project) => {
                const isExcalidraw = (project.lastMode || "excalidraw") === "excalidraw";
                return (
                  <div
                    key={project.id}
                    className="group bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 p-5 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-400/5 hover:border-emerald-300 dark:hover:border-emerald-500/40 cursor-pointer hover:-translate-y-1"
                    onClick={() => openProject(project)}
                  >
                    <div className="h-28 mb-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/40 overflow-hidden flex items-center justify-center">
                      {project.mermaidCode || project.excalidrawData?.elements?.length ? (
                        <div className="text-center p-2">
                          {project.mermaidCode ? (
                            <Code2 className="w-8 h-8 text-blue-400 mx-auto mb-1" />
                          ) : (
                            <HandDrawnPencil className="w-8 h-8 text-emerald-400 mx-auto mb-1" />
                          )}
                          <p className="text-[10px] text-slate-400 truncate max-w-full">
                            {project.mermaidCode
                              ? project.mermaidCode.split("\n")[0].substring(0, 40)
                              : `${project.excalidrawData?.elements?.length || 0} 个元素`}
                          </p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="mx-auto mb-1 opacity-30">
                            <rect x="8" y="6" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" className="text-slate-400" />
                            <path d="M16 36 L24 42 L32 36" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" className="text-slate-400" />
                            <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" className="text-violet-400" />
                            <path d="M24 14 L30 18 L24 22" stroke="currentColor" strokeWidth="1.5" className="text-amber-400" />
                          </svg>
                          <p className="text-[10px] text-slate-300 dark:text-slate-600">空白项目</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate flex-1 mr-2">
                        {project.name}
                      </h3>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                          isExcalidraw
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}
                      >
                        {isExcalidraw ? <HandDrawnPencil className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
                        {isExcalidraw ? "Excalidraw" : "Mermaid"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 mb-4">
                      <Clock className="w-3 h-3" />
                      {formatDate(project.updatedAt)}
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/40">
                      <button
                        onClick={(e) => { e.stopPropagation(); renameProject(project); }}
                        disabled={updatingId === project.id}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {updatingId === project.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit3 className="w-3 h-3" />}
                        重命名
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteProjectById(project.id); }}
                        disabled={updatingId === project.id}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {updatingId === project.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700/40">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">名称</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">模式</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">更新时间</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => {
                    const isExcalidraw = (project.lastMode || "excalidraw") === "excalidraw";
                    return (
                      <tr
                        key={project.id}
                        className="border-b border-slate-50 dark:border-slate-700/20 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 cursor-pointer transition-colors"
                        onClick={() => openProject(project)}
                      >
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                          {project.name}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 ${
                              isExcalidraw
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}
                          >
                            {isExcalidraw ? <HandDrawnPencil className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
                            {isExcalidraw ? "Excalidraw" : "Mermaid"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-400 dark:text-slate-500">
                          {formatDate(project.updatedAt)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); renameProject(project); }}
                              disabled={updatingId === project.id}
                              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                              title="重命名"
                            >
                              {updatingId === project.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Edit3 className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteProjectById(project.id); }}
                              disabled={updatingId === project.id}
                              className="p-1.5 rounded-md text-red-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer disabled:opacity-50"
                              title="删除"
                            >
                              {updatingId === project.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
}
