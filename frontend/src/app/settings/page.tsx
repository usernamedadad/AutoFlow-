"use client";

import { useState, useEffect } from "react";
import { Save, Server, Key, Hash, RefreshCw, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import Sidebar, { MenuButton } from "@/components/Sidebar";
import { FlowchartBackground } from "@/components/BackgroundEffects";

interface LLMConfig {
  apiType: string;
  apiUrl: string;
  apiKey: string;
  modelId: string;
}

interface BackendConfig {
  api_key: string;
  model_id: string;
  base_url: string;
  has_api_key: boolean;
}

export default function SettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [config, setConfig] = useState<LLMConfig>({
    apiType: "openai",
    apiUrl: "",
    apiKey: "",
    modelId: "",
  });
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [synced, setSynced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadConfig();
    fetchBackendConfig();
  }, []);

  const loadConfig = () => {
    const savedConfig = localStorage.getItem("autoflow_llm_config");
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    }
  };

  const fetchBackendConfig = async () => {
    try {
      const res = await fetch("/api/config/llm");
      if (res.ok) {
        const data = await res.json();
        setBackendConfig(data);
        if (!localStorage.getItem("autoflow_llm_config")) {
          setConfig({
            apiType: detectApiType(data.base_url),
            apiUrl: data.base_url,
            apiKey: "",
            modelId: data.model_id,
          });
        }
      }
    } catch (_e) {
      console.error("Failed to fetch backend config:", _e);
    } finally {
      setLoading(false);
    }
  };

  const detectApiType = (url: string): string => {
    if (!url) return "openai";
    if (url.includes("dashscope") || url.includes("aliyun")) return "dashscope";
    if (url.includes("openai.com")) return "openai";
    return "custom";
  };

  const saveConfig = async () => {
    setSaving(true);
    localStorage.setItem("autoflow_llm_config", JSON.stringify(config));

    try {
      const res = await fetch("/api/config/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: config.apiKey,
          model_id: config.modelId,
          base_url: config.apiUrl,
        }),
      });

      if (res.ok) {
        setSynced(true);
        await fetchBackendConfig();
      }
    } catch (_e) {
      console.error("Failed to sync to backend:", _e);
    }

    setSaved(true);
    setSaving(false);
    setTimeout(() => {
      setSaved(false);
      setSynced(false);
    }, 3000);
  };

  const apiTypes = [
    { value: "dashscope", label: "阿里云 DashScope", url: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
    { value: "openai", label: "OpenAI 兼容", url: "https://api.openai.com/v1" },
    { value: "custom", label: "自定义 API", url: "" },
  ];

  const handleApiTypeChange = (type: string) => {
    const selected = apiTypes.find((t) => t.value === type);
    setConfig({ ...config, apiType: type, apiUrl: selected?.url || config.apiUrl });
  };

  const presetModels = [
    { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
    { id: "qwen-max", name: "Qwen-Max", provider: "阿里云" },
    { id: "qwen-plus", name: "Qwen-Plus", provider: "阿里云" },
    { id: "qwen-turbo", name: "Qwen-Turbo", provider: "阿里云" },
    { id: "claude-3.5-sonnet", name: "Claude 3.5", provider: "Anthropic" },
  ];

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
            设置
          </span>
        </div>

        <ThemeToggle />
      </nav>

      <main className="relative z-10 w-full mx-auto px-6 pt-8 pb-20">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              LLM 配置
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              配置你的大语言模型 API 设置，支持任意 OpenAI 兼容接口
            </p>
          </div>

          {backendConfig && (
            <div
              className={`mb-6 p-4 rounded-xl flex items-start gap-3 ${
                backendConfig.has_api_key
                  ? "bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800/40"
                  : "bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40"
              }`}
            >
              {backendConfig.has_api_key
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                : <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm ${backendConfig.has_api_key ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
                  后端状态：{backendConfig.has_api_key ? "已连接" : "未配置"}
                </p>
                <p className={`text-xs mt-1 ${backendConfig.has_api_key ? "text-emerald-600/80 dark:text-emerald-400/70" : "text-amber-600/80 dark:text-amber-400/70"}`}>
                  模型：<code className="px-1.5 py-0.5 bg-black/5 dark:bg-white/10 rounded font-mono text-xs">{backendConfig.model_id}</code>
                  {" · "}
                  接口：<code className="px-1.5 py-0.5 bg-black/5 dark:bg-white/10 rounded font-mono text-xs truncate max-w-[260px] inline-block align-bottom">{backendConfig.base_url}</code>
                </p>
              </div>
              <button
                onClick={() => { fetchBackendConfig(); }}
                className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
                title="刷新"
              >
                <RefreshCw className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                <Server className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                API 类型
              </label>
              <select
                value={config.apiType}
                onChange={(e) => handleApiTypeChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors cursor-pointer text-sm"
              >
                {apiTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                API 地址 (Base URL)
              </label>
              <input
                type="url"
                value={config.apiUrl}
                onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 transition-colors text-sm"
              />
              <p className="mt-1.5 text-xs text-slate-400">兼容 OpenAI 格式的 API 基础地址</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                <Key className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                LLM_API_KEY
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="sk-xxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2.5 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 transition-colors text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">将同步写入后端 .env 文件</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                <Hash className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                LLM_MODEL_ID
              </label>
              <input
                type="text"
                value={config.modelId}
                onChange={(e) => setConfig({ ...config, modelId: e.target.value })}
                placeholder="gpt-4o / qwen-plus / claude-3.5-sonnet"
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 transition-colors text-sm"
              />
              <p className="mt-1.5 text-xs text-slate-400">目标模型的标识符</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2.5 text-slate-700 dark:text-slate-300">快速选择</label>
              <div className="grid grid-cols-3 gap-2">
                {presetModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setConfig({ ...config, modelId: model.id })}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      config.modelId === model.id
                        ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm"
                        : "border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-500/40"
                    }`}
                  >
                    <div className="font-medium text-xs text-slate-900 dark:text-slate-100">{model.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{model.provider}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-700/40">
              <button
                onClick={saveConfig}
                disabled={saving}
                className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
                  saved
                    ? synced
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-emerald-500 text-white"
                    : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                }`}
              >
                <Save className="w-4 h-4" />
                {saving
                  ? "保存中..."
                  : saved
                    ? synced
                      ? "已同步到后端"
                      : "已保存（本地）"
                  : "保存并同步到后端"}
              </button>
            </div>
          </div>

          <div className="mt-6 p-4 bg-sky-50 dark:bg-sky-900/10 rounded-xl border border-sky-200/60 dark:border-sky-800/30">
            <h3 className="font-semibold text-sky-800 dark:text-sky-300 mb-2 text-sm flex items-center gap-2">
              环境变量说明
            </h3>
            <ul className="text-xs text-sky-700/80 dark:text-sky-300/70 space-y-1.5 list-disc list-inside">
              <li><code className="px-1 py-0.5 bg-white/70 dark:bg-white/10 rounded font-mono">LLM_API_KEY</code> — 大语言模型的 API 密钥</li>
              <li><code className="px-1 py-0.5 bg-white/70 dark:bg-white/10 rounded font-mono">LLM_MODEL_ID</code> — 要使用的模型 ID</li>
              <li><code className="px-1 py-0.5 bg-white/70 dark:bg-white/10 rounded font-mono">LLM_BASE_URL</code> — API 端点地址</li>
            </ul>
          </div>
        </div>
      </main>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
}
