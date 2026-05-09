import httpx
import asyncio
import logging
import os
import threading
from typing import Dict, Any, List, Optional
from config import LLM_API_KEY, LLM_MODEL_ID, LLM_BASE_URL
from prompts import (
    IMAGE_RECOGNITION_PROMPT,
    get_flowchart_generation_prompt,
    get_incremental_edit_prompt,
    CHAT_ASSISTANT_PROMPT,
)
from utils.mermaid_utils import (
    _is_valid_mermaid,
    _extract_mermaid,
)

logger = logging.getLogger(__name__)


class AIService:
    def __init__(self):
        self.api_key = LLM_API_KEY
        self.base_url = LLM_BASE_URL.rstrip("/")
        self.model = LLM_MODEL_ID
        self.vl_model = "qwen-vl-max"
        self.max_retries = 3
        self.retry_delay = 1
        self._client: Optional[httpx.AsyncClient] = None
        self._client_lock = threading.Lock()

    def _get_client(self) -> httpx.AsyncClient:
        with self._client_lock:
            if self._client is None or self._client.is_closed:
                self._client = httpx.AsyncClient(
                    timeout=httpx.Timeout(60.0, connect=10.0),
                    limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
                )
            return self._client

    def reload_config(self) -> None:
        """重新加载 LLM 配置（用于运行时更新 API Key/模型）。"""
        from dotenv import load_dotenv
        import config as cfg

        load_dotenv(override=True)
        self.api_key = os.getenv("LLM_API_KEY", "")
        self.base_url = os.getenv("LLM_BASE_URL", "").rstrip("/")
        self.model = os.getenv("LLM_MODEL_ID", "qwen-plus")
        cfg.LLM_API_KEY = self.api_key
        cfg.LLM_MODEL_ID = self.model
        cfg.LLM_BASE_URL = self.base_url
        try:
            cfg.LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "16000"))
        except ValueError:
            cfg.LLM_MAX_TOKENS = 6000

        with self._client_lock:
            if self._client is not None and not self._client.is_closed:
                old = self._client
                self._client = None
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.ensure_future(old.aclose())
                    else:
                        loop.run_until_complete(old.aclose())
                except RuntimeError:
                    pass

    async def _call_api(self, payload: Dict[str, Any], timeout: float = 60.0, is_vision: bool = False) -> Dict[str, Any]:
        model = self.vl_model if is_vision else self.model
        logger.info(f"Calling LLM API: model={model}, timeout={timeout}s, is_vision={is_vision}")

        for attempt in range(self.max_retries):
            try:
                client = self._get_client()
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        **payload,
                        "model": model
                    }
                )

                logger.info(f"LLM API response: status={response.status_code}")

                if response.status_code == 200:
                    return {"success": True, "data": response.json()}
                elif response.status_code == 429:
                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(self.retry_delay * (attempt + 1))
                        continue
                    return {
                        "success": False,
                        "message": f"API 请求过于频繁，请稍后重试 (HTTP {response.status_code})"
                    }
                elif response.status_code == 401:
                    return {
                        "success": False,
                        "message": "API 密钥无效或已过期，请检查配置"
                    }
                elif response.status_code == 400:
                    try:
                        error_detail = response.json().get("message", "请求参数错误")
                    except Exception:
                        error_detail = response.text[:200] if response.text else "请求参数错误"
                    return {
                        "success": False,
                        "message": f"请求错误: {error_detail}"
                    }
                else:
                    error_text = response.text[:200] if response.text else "未知错误"
                    return {
                        "success": False,
                        "message": f"API 调用失败 (HTTP {response.status_code}): {error_text}"
                    }

            except httpx.TimeoutException:
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                    continue
                return {
                    "success": False,
                    "message": "请求超时，服务器响应时间过长，请稍后重试"
                }
            except httpx.ConnectError:
                return {
                    "success": False,
                    "message": "无法连接到 AI 服务，请检查网络连接"
                }
            except Exception as e:
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                    continue
                return {
                    "success": False,
                    "message": f"服务错误: {str(e)}"
                }

        return {"success": False, "message": "重试次数已用完，请稍后重试"}

    async def recognize_image(self, image_base64: str) -> Dict[str, Any]:
        try:
            result = await self._call_api(
                payload={
                    "messages": [
                        {"role": "system", "content": IMAGE_RECOGNITION_PROMPT},
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{image_base64}"
                                    }
                                },
                                {
                                    "type": "text",
                                    "text": "请识别这张图片中的图表，自动判断图表类型并转换为标准的 Mermaid 代码。"
                                }
                            ]
                        }
                    ],
                    "temperature": 0.2,
                    "max_tokens": 4096
                },
                timeout=120.0,
                is_vision=True
            )

            if result["success"]:
                content = result["data"]["choices"][0]["message"]["content"]
                mermaid_code = _extract_mermaid(content)

                if mermaid_code and _is_valid_mermaid(mermaid_code):
                    return {
                        "success": True,
                        "data": {"mermaid_code": mermaid_code, "format": "mermaid"},
                        "message": "图片识别成功"
                    }

                return {
                    "success": False,
                    "data": None,
                    "message": f"AI 返回的内容不是有效的 Mermaid 代码: {mermaid_code[:100]}"
                }
            else:
                return result

        except Exception as e:
            return {
                "success": False,
                "data": None,
                "message": f"服务错误: {str(e)}"
            }

    async def _generate_mermaid(self, prompt: str, direction_mode: str) -> Dict[str, Any]:
        system_prompt = get_flowchart_generation_prompt(direction_mode)
        user_prompt = f"请根据以下描述生成图表：\n{prompt}"

        try:
            logger.info(f"_generate_mermaid called: direction={direction_mode}, prompt_length={len(prompt)}")
            result = await self._call_api(
                payload={
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 4096
                },
                timeout=120.0
            )

            if not result["success"]:
                logger.warning(f"LLM API call failed: {result.get('message', 'unknown error')}")
                return result

            content = result["data"]["choices"][0]["message"]["content"].strip()
            logger.info(f"Mermaid AI response received, content length: {len(content)}")

            mermaid_code = _extract_mermaid(content)
            logger.info(f"Extracted mermaid code preview: {mermaid_code[:100]}")

            if not _is_valid_mermaid(mermaid_code):
                return {
                    "success": False,
                    "data": None,
                    "message": "AI 未能生成有效的 Mermaid 代码，请重试或更换描述"
                }

            return {
                "success": True,
                "data": {
                    "mermaid_code": mermaid_code,
                    "format": "mermaid",
                    "direction": direction_mode,
                },
                "message": "流程图生成成功"
            }

        except Exception as e:
            logger.exception(f"Unexpected error in _generate_mermaid: {e}")
            return {
                "success": False,
                "data": None,
                "message": f"服务错误: {str(e)}"
            }

    async def chat(self, messages: List[Dict], flowchart_data: Optional[Dict] = None) -> Dict[str, Any]:
        try:
            result = await self._call_api(
                payload={
                    "messages": [
                        {"role": "system", "content": CHAT_ASSISTANT_PROMPT},
                        *messages
                    ],
                    "temperature": 0.7,
                    "max_tokens": 4096
                },
                timeout=120.0
            )

            if result["success"]:
                content = result["data"]["choices"][0]["message"]["content"]
                return {
                    "success": True,
                    "content": content,
                    "message": "成功"
                }
            else:
                return {
                    "success": False,
                    "content": None,
                    "message": result.get("message", "调用失败")
                }

        except Exception as e:
            return {
                "success": False,
                "content": None,
                "message": f"服务错误: {str(e)}"
            }

    async def chat_edit(
        self,
        graph_state: Dict[str, Any],
        instruction: str,
        mode: str = "chat_incremental",
    ) -> Dict[str, Any]:
        import json as _json

        MAX_RETRIES = 2
        system_prompt = get_incremental_edit_prompt()
        user_content = (
            f"mode: {mode}\n"
            f"graph_state: {_json.dumps(graph_state, ensure_ascii=False)}\n\n"
            f"instruction: \"{instruction}\""
        )

        for attempt in range(1 + MAX_RETRIES):
            try:
                result = await self._call_api(
                    payload={
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_content},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 4096,
                    },
                    timeout=120.0,
                )

                if not result["success"]:
                    return {
                        "success": False,
                        "data": None,
                        "message": result.get("message", "增量编辑 LLM 调用失败"),
                    }

                raw_content = result["data"]["choices"][0]["message"]["content"]

                try:
                    raw = raw_content.strip()
                    if raw.startswith("```"):
                        lines = raw.splitlines()
                        if lines and lines[0].startswith("```"):
                            lines = lines[1:]
                        if lines and lines[-1].strip().startswith("```"):
                            lines = lines[:-1]
                        raw = "\n".join(lines)
                    diff_data = _json.loads(raw)
                except Exception:
                    if attempt < MAX_RETRIES:
                        user_content = (
                            f"{user_content}\n\n"
                            f"你上次返回的内容无法解析为 JSON: {raw_content[:200]}\n"
                            f"请只输出纯 JSON，不要 markdown 代码块、不要解释。"
                        )
                        continue
                    return {
                        "success": False,
                        "data": None,
                        "message": f"增量编辑返回无法解析为 JSON: {raw_content[:200]}",
                    }

                if "operations" not in diff_data:
                    if attempt < MAX_RETRIES:
                        user_content = (
                            f"{user_content}\n\n"
                            f"你上次返回的 JSON 缺少 operations 字段。请确保包含 operations 数组。"
                        )
                        continue
                    return {
                        "success": False,
                        "data": None,
                        "message": "增量编辑返回缺少 operations 字段",
                    }

                return {
                    "success": True,
                    "data": diff_data,
                    "message": "增量编辑成功",
                }

            except Exception as e:
                if attempt < MAX_RETRIES:
                    continue
                return {
                    "success": False,
                    "data": None,
                    "message": f"服务错误: {str(e)}",
                }
