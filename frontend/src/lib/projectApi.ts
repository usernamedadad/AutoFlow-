export type FlowDirection = "TD" | "LR";
export type EditorMode = "excalidraw" | "mermaid";

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  direction: FlowDirection;
  lastMode: EditorMode;
  prompt?: string;
  excalidrawData?: { elements?: any[]; [key: string]: any };
  mermaidCode?: string;
  skeletonElements?: any[];
  messages?: { role: string; content: string }[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  detail?: string;
}

async function requestJson<T>(input: string, init?: RequestInit, timeout = 15000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

    let body: ApiResponse<T> | null = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const message = body?.detail || body?.message || `Request failed: ${response.status}`;
      throw new Error(message);
    }

    if (!body || !body.success) {
      throw new Error(body?.message || "Unexpected API response");
    }

    return body.data;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("请求超时，请检查网络连接后重试");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return requestJson<ProjectRecord[]>("/api/projects");
}

export async function createProject(payload?: {
  name?: string;
  lastMode?: EditorMode;
  direction?: FlowDirection;
}): Promise<ProjectRecord> {
  return requestJson<ProjectRecord>("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: payload?.name,
      last_mode: payload?.lastMode || "excalidraw",
      direction: payload?.direction || "TD",
    }),
  });
}

export async function getProject(projectId: string): Promise<ProjectRecord> {
  return requestJson<ProjectRecord>(`/api/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  payload: {
    name?: string;
    lastMode?: EditorMode;
    direction?: FlowDirection;
    excalidrawData?: { elements?: any[]; [key: string]: any };
    mermaidCode?: string;
    skeletonElements?: any[];
    prompt?: string;
    messages?: { role: string; content: string }[];
  }
): Promise<ProjectRecord> {
  const reqBody: Record<string, any> = {};

  if (payload.name !== undefined) reqBody.name = payload.name;
  if (payload.lastMode !== undefined) reqBody.last_mode = payload.lastMode;
  if (payload.direction !== undefined) reqBody.direction = payload.direction;
  if (payload.excalidrawData !== undefined) reqBody.excalidraw_data = payload.excalidrawData;
  if (payload.mermaidCode !== undefined) reqBody.mermaid_code = payload.mermaidCode;
  if (payload.skeletonElements !== undefined) reqBody.skeleton_elements = payload.skeletonElements;
  if (payload.prompt !== undefined) reqBody.prompt = payload.prompt;
  if (payload.messages !== undefined) reqBody.messages = payload.messages;

  return requestJson<ProjectRecord>(`/api/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(reqBody),
  });
}

export async function deleteProject(projectId: string): Promise<{ id: string }> {
  return requestJson<{ id: string }>(`/api/projects/${projectId}`, {
    method: "DELETE",
  });
}

export async function deleteAllProjects(): Promise<{ deleted_count: number }> {
  return requestJson<{ deleted_count: number }>("/api/projects", {
    method: "DELETE",
  });
}
