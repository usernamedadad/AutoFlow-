"use client";

import { MessageSquare, Upload, Loader2, Image as ImageIcon } from "lucide-react";
import Logo from "./Logo";
import PaperPlaneButton from "./PaperPlaneButton";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

export interface AIAssistantPanelProps {
  messages: ChatMessage[];
  inputValue: string;
  isChatLoading: boolean;
  activeTab: "chat" | "upload";
  isUploadLoading: boolean;
  uploadProgress: string;
  isDragOver: boolean;
  uploadedImages: { url: string; name: string }[];
  showImagesInChat?: boolean;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onTabChange: (tab: "chat" | "upload") => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  fileInputId: string;
  fontFamily?: string;
}

export default function AIAssistantPanel({
  messages,
  inputValue,
  isChatLoading,
  activeTab,
  isUploadLoading,
  uploadProgress,
  isDragOver,
  uploadedImages,
  showImagesInChat = false,
  onInputChange,
  onSendMessage,
  onKeyDown,
  onTabChange,
  onFileSelect,
  onDrop,
  onDragOver,
  onDragLeave,
  fileInputId,
  fontFamily = "'Comic Sans MS', cursive",
}: AIAssistantPanelProps) {
  const tabItems = [
    { key: "chat" as const, icon: MessageSquare, label: "对话" },
    { key: "upload" as const, icon: ImageIcon, label: "上传图片" },
  ];

  return (
    <div className="w-115 shrink-0 flex flex-col border-r border-[#3730a3]/25 dark:border-[#3730a3]/30 bg-white dark:bg-[#1e1b4b] mt-14">
      {/* Header */}
      <div className="p-5 border-b border-dashed border-[#3730a3]/20 dark:border-[#3730a3]/15">
        <div className="flex items-center gap-3 mb-4">
          <Logo size={36} />
          <div>
            <h2
              className="text-lg font-bold text-[#3730a3] dark:text-[#818cf8]"
              style={{ fontFamily }}
            >
              凹凸 AI 助手
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-xs text-[#8a8a8a]">在线</span>
            </div>
          </div>
        </div>

        {/* Tab buttons */}
        <div className="flex gap-2">
          {tabItems.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === key
                  ? "bg-[#3730a3] text-white shadow-md"
                  : "bg-[#f8f7ff] dark:bg-[#2d2b29] text-[#5c5c5c] dark:text-[#8a8a8a] hover:bg-[#ede9fe] dark:hover:bg-[#3f3d39] border border-[#3730a3]/20"
              }`}
              style={{ fontFamily }}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Tab */}
      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-[#9ca3af] mt-8">
                <Logo size={48} />
                <p
                  className="text-sm mt-3"
                  style={{ fontFamily, color: "#3730a3" }}
                >
                  描述你想要创建的流程图：
                </p>
                <p className="text-xs mt-1">我会帮你生成专业的流程图 ✨</p>
              </div>
            )}
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {msg.role === "assistant" && (
                  <div className="shrink-0">
                    <Logo size={28} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] p-3.5 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-[#3730a3] text-white rounded-tr-none"
                      : "bg-[#f8f7ff] dark:bg-[#2d2b29] text-[#0f172a] dark:text-[#f1f5f9] shadow-sm border border-[#3730a3]/15 rounded-tl-none"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.imageUrl && (
                    <a
                      href={msg.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-2 rounded-lg overflow-hidden border border-[#3730a3]/15 bg-white"
                    >
                      <img
                        src={msg.imageUrl}
                        alt="图表渲染结果"
                        className="w-full h-auto block"
                      />
                    </a>
                  )}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex gap-2.5">
                <div className="shrink-0">
                  <Logo size={28} />
                </div>
                <div className="bg-[#f8f7ff] dark:bg-[#2d2b29] p-3.5 rounded-2xl rounded-tl-none flex items-center gap-2 shadow-sm border border-[#3730a3]/15">
                  <Loader2 className="w-4 h-4 animate-spin text-[#3730a3]" />
                  <span className="text-sm text-[#9ca3af]" style={{ fontFamily }}>
                    思考中...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-[#e5e2dd] dark:border-[#3f3d39]">
            <div className="relative">
              <textarea
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="描述你的流程图需求..."
                className="w-full bg-white dark:bg-[#2d2b29] border border-[#e5e2dd] dark:border-[#3f3d39] rounded-xl px-4 py-3 pr-12 resize-none focus:outline-none focus:border-[#8b5cf6] dark:focus:border-[#a78bfa] text-sm min-h-20 text-[#0f172a] dark:text-[#f1f5f9] placeholder-[#8a8a8a] dark:placeholder-[#737373]"
                rows={3}
                disabled={isChatLoading}
                style={{ fontFamily }}
              />
              <button
                onClick={onSendMessage}
                disabled={!inputValue.trim() || isChatLoading}
                className="absolute right-3 bottom-3 transition-all cursor-pointer disabled:opacity-60 hover:scale-105"
              >
                <PaperPlaneButton />
              </button>
            </div>
          </div>

          {/* Uploaded images (optional, shown in chat tab for Excalidraw mode) */}
          {showImagesInChat && uploadedImages.length > 0 && (
            <div className="px-4 pb-4 space-y-2">
              <p
                className="text-xs font-semibold text-[#5c5c5c] dark:text-[#c8c4bc]"
                style={{ fontFamily }}
              >
                已上传图片
              </p>
              {uploadedImages.map((img, idx) => (
                <a
                  key={idx}
                  href={img.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2 rounded-xl bg-[#f8f7ff] dark:bg-[#2d2b29] border border-[#e5e2dd] dark:border-[#3f3d39] hover:border-[#8b5cf6] transition-colors cursor-pointer"
                >
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-10 h-10 object-cover rounded-lg border border-[#e5e2dd] dark:border-[#3f3d39]"
                  />
                  <span className="text-xs text-[#5c5c5c] dark:text-[#c8c4bc] truncate flex-1">
                    {img.name}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Tab */}
      {activeTab === "upload" && (
        <div className="flex-1 p-5 overflow-y-auto">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              isDragOver
                ? "border-[#8b5cf6] bg-[#ede9fe]/40 dark:bg-[#8b5cf6]/8"
                : "border-[#d1d5db] dark:border-[#5c5c5c] hover:border-[#8b5cf6] dark:hover:border-[#a78bfa]"
            } ${isUploadLoading ? "pointer-events-none opacity-60" : ""}`}
            onClick={() => document.getElementById(fileInputId)?.click()}
          >
            <input
              id={fileInputId}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif"
              onChange={onFileSelect}
              className="hidden"
            />
            {!isUploadLoading ? (
              <>
                <Upload className="w-14 h-14 mx-auto mb-4 text-[#8b5cf6] dark:text-[#a78bfa]" />
                <h3
                  className="text-base font-bold"
                  style={{ fontFamily }}
                >
                  上传流程图图片
                </h3>
                <p className="text-xs text-[#9ca3af] mb-4">
                  点击选择文件或拖拽图片到此处
                </p>
                <div className="text-xs text-[#9ca3af] space-y-1">
                  <p>支持格式：JPG、PNG、GIF</p>
                  <p>最大尺寸：10MB</p>
                </div>

                {uploadedImages.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-dashed border-[#e5e2dd] dark:border-[#3f3d39]">
                    <p
                      className="text-xs font-semibold text-[#5c5c5c] dark:text-[#c8c4bc] mb-3"
                      style={{ fontFamily }}
                    >
                      已上传图片（点击查看原图）
                    </p>
                    {uploadedImages.map((img, idx) => (
                      <a
                        key={idx}
                        href={img.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-2.5 px-3 py-2 mx-1 my-1 rounded-xl bg-white dark:bg-[#262524] border border-[#e5e2dd] dark:border-[#3f3d39] hover:border-[#8b5cf6] transition-colors cursor-pointer"
                      >
                        <img
                          src={img.url}
                          alt={img.name}
                          className="w-10 h-10 object-cover rounded-lg border border-[#e5e2dd] dark:border-[#3f3d39]"
                        />
                        <span className="text-xs text-[#5c5c5c] dark:text-[#c8c4bc] max-w-30 truncate">{img.name}</span>
                      </a>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="py-10">
                <Loader2 className="w-11 h-11 mx-auto mb-4 animate-spin text-[#8b5cf6]" />
                <p className="text-sm text-[#5c5c5c] dark:text-[#8a8a8a]">{uploadProgress}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}