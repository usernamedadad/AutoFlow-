import httpx
import asyncio
import logging
from typing import Dict, Any, List, Optional
from config import LLM_API_KEY, LLM_MODEL_ID, LLM_BASE_URL
from prompts.system_prompts import (
    IMAGE_RECOGNITION_PROMPT,
    get_flowchart_generation_prompt,
    get_excalidraw_skeleton_prompt,
    get_excalidraw_hybrid_prompt,
    CHAT_ASSISTANT_PROMPT,
)
from utils.mermaid_utils import (
    _is_valid_mermaid,
    _extract_mermaid,
)
from utils.excalidraw_utils import (
    extract_json_array,
    validate_skeleton,
    fix_zero_dimensions,
    center_elements_py,
    ensure_bound_elements,
    normalize_skeleton,
)

logger = logging.getLogger(__name__)


def _parse_hybrid_format(content: str) -> tuple:
    """解析混合模式 AI 返回的首行 FORMAT 声明。

    支持容错：
    - ``` 包裹的代码块
    - FORMAT 前后的空行 / 全角冒号
    - 大小写不敏感

    Returns: (fmt 或 None, body)
    """
    if not content:
        return None, ""
    text = content.strip()
    # 剥除最外层 ```xxx ... ``` 代码块
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 2:
            lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()

    # 首行提取 FORMAT
    first_line, _, rest = text.partition("\n")
    fl = first_line.strip().lower().replace("：", ":")
    if fl.startswith("format:"):
        fmt = fl.split(":", 1)[1].strip()
        if fmt in ("skeleton", "mermaid"):
            return fmt, rest.strip()
    return None, text


class AIService:
    def __init__(self):
        self.api_key = LLM_API_KEY
        self.base_url = LLM_BASE_URL.rstrip("/")
        self.model = LLM_MODEL_ID
        self.vl_model = "qwen-vl-max"
        self.max_retries = 3
        self.retry_delay = 1
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        """获取或创建复用的 httpx 客户端（连接池复用）。"""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(60.0, connect=10.0),
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )
        return self._client

    def reload_config(self):
        """重新加载 LLM 配置（用于运行时更新 API Key/模型）。"""
        from config import LLM_API_KEY, LLM_MODEL_ID, LLM_BASE_URL
        self.api_key = LLM_API_KEY
        self.base_url = LLM_BASE_URL.rstrip("/")
        self.model = LLM_MODEL_ID
        # 关闭旧客户端，下次调用时会自动创建新客户端
        if self._client and not self._client.is_closed:
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(self._client.aclose())
                else:
                    loop.run_until_complete(self._client.aclose())
            except RuntimeError:
                pass
            self._client = None

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
                    error_detail = response.json().get("message", "请求参数错误")
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
                    "max_tokens": 2048
                },
                timeout=90.0,
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

    async def generate_flowchart(
        self,
        prompt: str,
        output_format: str = "excalidraw",
        direction: str = "TD",
    ) -> Dict[str, Any]:
        direction_mode = "LR" if str(direction).upper() == "LR" else "TD"

        # Excalidraw 模式：混合分流 — AI 根据图表类型自选 skeleton / mermaid
        if output_format == "excalidraw":
            return await self._generate_excalidraw_hybrid(prompt, direction_mode)

        # Mermaid 模式保持原有逻辑
        return await self._generate_mermaid(prompt, direction_mode)

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

    async def _generate_excalidraw_hybrid(self, prompt: str, direction_mode: str) -> Dict[str, Any]:
        """混合分流：单次 LLM 调用，由 AI 首行 FORMAT 声明选择 skeleton / mermaid。

        - FORMAT: skeleton → 走 extract_json_array + validate + normalize_skeleton + center_elements_py
        - FORMAT: mermaid → 走 _extract_mermaid + _is_valid_mermaid
        - 解析失败或 FORMAT 丢失 → 尝试按 Mermaid 着落（更稳），再不行才报错
        """
        system_prompt = get_excalidraw_hybrid_prompt(direction_mode)
        user_prompt = f"请根据以下描述生成图表，按规则自选 FORMAT：\n{prompt}"

        try:
            logger.info(
                f"_generate_excalidraw_hybrid called: direction={direction_mode}, "
                f"prompt_length={len(prompt)}"
            )
            result = await self._call_api(
                payload={
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 4096,
                },
                timeout=300.0,
            )

            if not result["success"]:
                logger.warning(f"LLM API call failed (hybrid): {result.get('message', 'unknown')}")
                return result

            content = result["data"]["choices"][0]["message"]["content"]
            logger.info(f"Hybrid AI response length: {len(content)}")

            # 解析首行 FORMAT 声明
            fmt, body = _parse_hybrid_format(content)
            logger.info(f"Hybrid format detected: {fmt}")

            if fmt == "skeleton":
                skeleton_result = self._handle_skeleton_body(body, direction_mode)
                if skeleton_result["success"]:
                    return skeleton_result
                # skeleton 解析失败 → 试着从同一 content 里抽 Mermaid（有可能 AI 误标 FORMAT）
                logger.info("Skeleton parse failed, trying mermaid fallback from same content")
                mermaid_result = self._handle_mermaid_body(content, direction_mode)
                if mermaid_result["success"]:
                    return mermaid_result
                return skeleton_result  # 返回 skeleton 错误更具体

            # fmt == "mermaid" 或未识别 → 统一按 mermaid 处理
            mermaid_result = self._handle_mermaid_body(body if fmt == "mermaid" else content, direction_mode)
            if mermaid_result["success"]:
                return mermaid_result

            # 最后兑底：尝试把整个 content 当 skeleton 解
            logger.info("Mermaid parse failed, trying skeleton fallback from raw content")
            skeleton_result = self._handle_skeleton_body(content, direction_mode)
            if skeleton_result["success"]:
                return skeleton_result

            return {
                "success": False,
                "data": None,
                "message": "AI 返回内容无法解析为 skeleton 或 mermaid，请重试或更换描述",
            }

        except Exception as e:
            logger.exception(f"Unexpected error in _generate_excalidraw_hybrid: {e}")
            return {
                "success": False,
                "data": None,
                "message": f"服务错误: {str(e)}",
            }

    def _handle_skeleton_body(self, body: str, direction_mode: str) -> Dict[str, Any]:
        """解析 skeleton JSON 并进行校验、容错修复、bbox 居中。

        v2 重构：AI 直接输出最终坐标，后端不再做二次布局。
        """
        elements = extract_json_array(body)
        if elements is None:
            return {
                "success": False,
                "data": None,
                "message": "AI 返回的 skeleton 不是有效 JSON 数组",
            }

        is_valid, err = validate_skeleton(elements)
        if not is_valid:
            return {
                "success": False,
                "data": None,
                "message": f"skeleton 结构无效: {err}",
            }

        elements = fix_zero_dimensions(elements)
        elements = normalize_skeleton(elements)  # 容错加固：补 id / 修 arrow / 吸收孤立 text
        elements = ensure_bound_elements(elements)
        elements = center_elements_py(elements)

        logger.info(f"Hybrid(skeleton) success, element count: {len(elements)}")
        return {
            "success": True,
            "data": {
                "elements": elements,
                "format": "skeleton",
                "direction": direction_mode,
            },
            "message": "图表生成成功",
        }

    def _handle_mermaid_body(self, body: str, direction_mode: str) -> Dict[str, Any]:
        """解析 mermaid 代码并校验。

        所有 mermaid 类型（流程图/时序图/类图/ER/甘特等）统一走同一个处理函数，
        format 返回 "mermaid"。前端 `mermaidToExcalidraw` 会自动做官方包转换（流程图/时序图）
        或降级 SVG 贴图（类图/ER 等不支持的类型）。
        """
        mermaid_code = _extract_mermaid(body)
        if not mermaid_code or not _is_valid_mermaid(mermaid_code):
            return {
                "success": False,
                "data": None,
                "message": "AI 未生成有效的 Mermaid 代码",
            }

        logger.info(f"Hybrid(mermaid) success, code length: {len(mermaid_code)}")
        return {
            "success": True,
            "data": {
                "mermaid_code": mermaid_code,
                "format": "mermaid",
                "direction": direction_mode,
            },
            "message": "图表生成成功",
        }

    async def _generate_excalidraw_skeleton(self, prompt: str, direction_mode: str) -> Dict[str, Any]:
        """调用 LLM 生成 Excalidraw Skeleton JSON 数组。

        所有图表类型都生成可编辑元素，绕过 @excalidraw/mermaid-to-excalidraw
        的降级为图片问题。
        """
        system_prompt = get_excalidraw_skeleton_prompt(direction_mode)
        user_prompt = f"请根据以下描述生成 Excalidraw Skeleton JSON 数组：\n{prompt}"

        try:
            logger.info(f"_generate_excalidraw_skeleton called: direction={direction_mode}, prompt_length={len(prompt)}")
            result = await self._call_api(
                payload={
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 4096
                },
                timeout=300.0
            )

            if not result["success"]:
                logger.warning(f"LLM API call failed (skeleton): {result.get('message', 'unknown error')}")
                return result

            content = result["data"]["choices"][0]["message"]["content"]
            logger.info(f"Skeleton AI response received, content length: {len(content)}")

            elements = extract_json_array(content)
            if elements is None:
                logger.warning(f"Failed to extract JSON array from skeleton response, preview: {content[:200]}")
                return {
                    "success": False,
                    "data": None,
                    "message": "AI 返回的内容不是有效的 JSON 数组，请重试"
                }

            is_valid, err = validate_skeleton(elements)
            if not is_valid:
                logger.warning(f"Skeleton validation failed: {err}")
                return {
                    "success": False,
                    "data": None,
                    "message": f"AI 返回的 Skeleton 结构无效: {err}"
                }

            elements = fix_zero_dimensions(elements)

            # === v2：AI 直出坐标 + bbox 居中（不再走 BFS 重排）===
            elements = ensure_bound_elements(elements)
            elements = center_elements_py(elements)

            logger.info(f"Skeleton generation success, element count: {len(elements)}")

            return {
                "success": True,
                "data": {
                    "elements": elements,
                    "format": "skeleton",
                    "direction": direction_mode,
                },
                "message": "图表生成成功"
            }

        except Exception as e:
            logger.exception(f"Unexpected error in _generate_excalidraw_skeleton: {e}")
            return {
                "success": False,
                "data": None,
                "message": f"服务错误: {str(e)}"
            }

    async def chat(self, messages: List[Dict], flowchart_data: Optional[Dict] = None) -> Dict[str, Any]:
        """AI 对话助手。flowchart_data 预留用于未来让 AI 感知画布上下文。"""
        try:
            result = await self._call_api(
                payload={
                    "messages": [
                        {"role": "system", "content": CHAT_ASSISTANT_PROMPT},
                        *messages
                    ],
                    "temperature": 0.7,
                    "max_tokens": 2048
                },
                timeout=60.0
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
