from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import AsyncGenerator
from typing import Annotated, Literal, TypedDict

from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from app.services import session_service

logger = logging.getLogger(__name__)

# DeepSeek 默认配置（OpenAI 兼容接口），均可通过环境变量覆盖
DEFAULT_BASE_URL = "https://api.deepseek.com"
# 官方已弃用 deepseek-chat / deepseek-reasoner，统一用 V4 系列；日常聊天选 v4-flash 更便宜
DEFAULT_MODEL = "deepseek-v4-flash"
# 传给模型的最大历史消息条数（含刚插入的 user 消息），防止上下文过长
MAX_HISTORY_MESSAGES = int(os.getenv("DEEPSEEK_MAX_HISTORY", "20"))
# 单条消息最长字符数，超长截断避免超出上下文窗口
MAX_MESSAGE_CHARS = int(os.getenv("DEEPSEEK_MAX_MESSAGE_CHARS", "8000"))
# LangGraph agent 最大循环次数（agent ⇄ tools），达到即强制结束，防止无限循环
MAX_AGENT_ITERATIONS = int(os.getenv("DEEPSEEK_MAX_ITERATIONS", "3"))

# 系统提示词：明确模型身份，避免模型从训练数据中臆测（如自报 Claude/GPT）
SYSTEM_PROMPT = os.getenv(
    "DEEPSEEK_SYSTEM_PROMPT",
    "你是 DeepChat 智能助手，底层由 DeepSeek 提供的 deepseek-v4-flash 模型驱动。"
    "你可以调用工具获取实时信息：get_current_time 获取当前时间、get_city_weather 获取城市天气。"
    "回答使用简体中文，简洁准确。"
    "当被问及你的身份或所用模型时，必须回答：你是由 DeepSeek 提供的 deepseek-v4-flash 模型。",
)


def build_mock_response(prompt: str) -> str:
    normalized_prompt = prompt.strip()
    return (
        f"我已收到你的问题：**{normalized_prompt}**\n\n"
        "下面是一个模拟的流式回答，当前项目已经把数据层和接口层拆开，后续可以直接替换为真实大模型调用。\n\n"
        "- 我会先理解你的问题背景\n"
        "- 然后给出结构化分析\n"
        "- 最后补充可执行的下一步\n\n"
        "示例代码块：\n\n"
        "```python\n"
        "print('streaming response is working')\n"
        "```\n\n"
        "如果你配置真实 DeepSeek API，可以在 `chat_service.py` 中把 mock 生成器替换为模型的流式响应。"
    )


def _api_key() -> str:
    return os.getenv("DEEPSEEK_API_KEY", "").strip()


# ---------------------------------------------------------------------------
# Function Calling 工具集（LangGraph agent 可调用的函数）
# ---------------------------------------------------------------------------
@tool
def get_current_time(timezone: str = "Asia/Shanghai") -> str:
    """获取指定 IANA 时区的当前日期时间。时区示例：Asia/Shanghai、UTC、America/New_York。"""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    try:
        tz = ZoneInfo(timezone)
    except Exception:
        tz = ZoneInfo("Asia/Shanghai")
    return datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S %Z")


@tool
def get_city_weather(city: str) -> str:
    """查询指定城市的实时天气（当前为演示用 mock 数据）。传入中文或英文城市名，例如：北京、Shanghai。"""
    return f"{city} 当前天气：晴，26°C，东北风 3 级，空气质量：优。"


AGENT_TOOLS = [get_current_time, get_city_weather]


# ---------------------------------------------------------------------------
# 消息构建
# ---------------------------------------------------------------------------
def _build_messages(session_id: str) -> list[dict[str, str]]:
    """取会话最近的 N 条历史消息，构造 OpenAI 兼容 messages 数组（开头注入 system 身份提示）。"""
    detail = session_service.get_session(session_id)
    messages = [
        {"role": msg.role, "content": msg.content[:MAX_MESSAGE_CHARS]}
        for msg in detail.messages
    ]
    history = messages[-MAX_HISTORY_MESSAGES:]
    return [{"role": "system", "content": SYSTEM_PROMPT}] + history


# ---------------------------------------------------------------------------
# Mock 流式（未配置 API Key 时使用）
# ---------------------------------------------------------------------------
async def _mock_stream(prompt: str) -> AsyncGenerator[str, None]:
    """本地模拟流式输出（未配置 API Key 时使用）。"""
    full_response = build_mock_response(prompt)
    for index in range(0, len(full_response), 4):
        yield full_response[index : index + 4]
        await asyncio.sleep(0.035)


# ---------------------------------------------------------------------------
# LangGraph agent 编排（DeepSeek + Function Calling + 循环次数熔断）
#
# 图结构：agent(LLM) ⇄ tools
#   agent 节点调用模型（绑定了工具）；若模型返回 tool_calls 则进入 tools 节点
#   执行工具后回到 agent；直到模型不再调用工具，或达到 MAX_AGENT_ITERATIONS。
# ---------------------------------------------------------------------------
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    iteration: int


def _build_model() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("DEEPSEEK_MODEL", DEFAULT_MODEL),
        api_key=_api_key(),
        base_url=os.getenv("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
        temperature=0.7,
        timeout=300,
        max_retries=1,
    )


def _should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    """路由决策：达到最大循环次数则熔断结束；否则有 tool_calls 继续进 tools，无则结束。"""
    if state["iteration"] >= MAX_AGENT_ITERATIONS:
        return "__end__"
    last_message = state["messages"][-1]
    if getattr(last_message, "tool_calls", None):
        return "tools"
    return "__end__"


def _build_agent():
    """构建 ReAct agent 图。iteration 达到上限即强制结束，防止无限循环。"""
    model = _build_model().bind_tools(AGENT_TOOLS)

    async def agent_node(state: AgentState) -> dict:
        response = await model.ainvoke(state["messages"])
        return {"messages": [response], "iteration": state["iteration"] + 1}

    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(AGENT_TOOLS))
    workflow.set_entry_point("agent")
    workflow.add_edge("tools", "agent")
    workflow.add_conditional_edges(
        "agent",
        _should_continue,
        {"tools": "tools", "__end__": END},
    )
    return workflow.compile()


async def _agent_stream(session_id: str) -> AsyncGenerator[str, None]:
    """用 LangGraph agent 编排对话，流式产出模型增量文本。"""
    messages = _build_messages(session_id)
    agent = _build_agent()

    try:
        async for event in agent.astream_events(
            {"messages": messages, "iteration": 0},
            version="v2",
        ):
            if event.get("event") != "on_chat_model_stream":
                continue
            chunk = event["data"].get("chunk")
            content = getattr(chunk, "content", None)
            if isinstance(content, str) and content:
                yield content
    except GraphRecursionError:
        # 兜底：即使迭代计数失效，引擎级 recursion_limit 也会阻止无限循环
        yield "⚠️ 已达到最大工具调用循环次数（3 次），已停止继续执行。请尝试重新描述你的问题。"


async def stream_chat_response(session_id: str, message: str) -> AsyncGenerator[str, None]:
    session_service.add_message(session_id=session_id, role="user", content=message)

    collected: list[str] = []

    try:
        if not _api_key():
            logger.warning("未配置 DEEPSEEK_API_KEY，本次回复使用 mock 数据")
            generator: AsyncGenerator[str, None] = _mock_stream(message)
        else:
            generator = _agent_stream(session_id)

        async for chunk in generator:
            collected.append(chunk)
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

    except Exception as exc:  # noqa: BLE001 —— 流式过程中任何异常都以错误消息呈现
        logger.exception("DeepSeek 流式调用失败")
        error_text = f"⚠️ DeepSeek 调用失败：{exc}\n\n请检查 API Key 是否有效、账户余额是否充足。"
        collected.append(error_text)
        yield f"data: {json.dumps(error_text, ensure_ascii=False)}\n\n"

    finally:
        assistant_message = "".join(collected)
        if assistant_message:
            session_service.add_message(session_id=session_id, role="assistant", content=assistant_message)

    yield "event: done\ndata: [DONE]\n\n"
