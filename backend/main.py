import json
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    print(
        "WARNING: GEMINI_API_KEY is not set. /api/stream will fail until it is."
    )

client = genai.Client(api_key=API_KEY) if API_KEY else None

app = FastAPI(title="CodeSensei AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """You are CodeSensei, an expert senior developer and patient computer \
science tutor. Your goal is to break down complex code or debug errors using simple \
analogies, clear reasoning, and actionable recommendations.

Always structure your initial response in this exact Markdown layout:

### 💡 The Core Mental Model
Provide a simple, real-world analogy explaining what the code is trying to achieve.

### 🔄 "Use This, Not That" (Best Practices)
❌ **Avoid:** [Identify a bad practice or inefficient pattern in the user's code]
└─ *Why:* [Explain the performance or readability drawback]

✅ **Prefer:** [Show the modern, clean alternative pattern]
└─ *Why:* [Explain the benefit — speed, memory, safety, or readability]

### 🛠️ Step-by-Step Thinking Logic & Easy Code
**Thinking Process:** [Explain how a senior engineer approaches this logic]
### 🐛 Debugging Notes (only if an error trace was provided)
- **Root Cause:** [Explain why it failed]
- **The Fix:** [Explain what changed]

### 💬 Tutor Chat Ready
Ask me any follow-up questions! You can ask to re-explain a specific line, analyze time \
complexity, or try a practice exercise on this topic.

For any follow-up message in the conversation (i.e. anything after the first turn), skip \
the fixed section headers above and just answer the question directly and conversationally, \
as a tutor would in a live chat, while staying in character as CodeSensei."""


class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class CodeRequest(BaseModel):
    code: str = ""
    error: str = ""
    mode: str = "explain"  # "explain" or "debug"
    history: list[Message] = []  # prior turns for the follow-up chat


def get_live_model() -> str:
    """Dynamically finds the first active, supported model for generateContent on this API key."""
    env_model = os.getenv("GEMINI_MODEL")

    # High-priority modern model order
    candidates = [
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
    ]

    if client:
        try:
            available_models = []
            for m in client.models.list():
                actions = getattr(m, "supported_actions", []) or getattr(
                    m, "supported_generation_methods", []
                )
                if "generateContent" in actions:
                    name = (
                        m.name.replace("models/", "")
                        if hasattr(m, "name")
                        else str(m)
                    )
                    available_models.append(name)

            # Check if user specified a custom valid model in .env
            if env_model and env_model in available_models:
                return env_model

            # Check preferred candidates
            for cand in candidates:
                if cand in available_models:
                    return cand

            # Fallback to first available model from API list
            if available_models:
                return available_models[0]
        except Exception as e:
            print(f"Model list fallback notice: {e}")

    return env_model or "gemini-3.5-flash"


def build_gemini_contents(request: CodeRequest) -> list[types.Content]:
    contents = []

    for m in request.history:
        role = "model" if m.role == "assistant" else "user"
        contents.append(
            types.Content(
                role=role, parts=[types.Part.from_text(text=m.content)]
            )
        )

    if not request.history:
        parts = []
        if request.code:
            parts.append(f"Code:\n```\n{request.code}\n```")
        if request.error:
            parts.append(f"Error Trace:\n```\n{request.error}\n```")
        if request.mode:
            parts.append(f"Mode: {request.mode}")

        initial_prompt = (
            "\n\n".join(parts) if parts else "Hello, I need help with code."
        )
        contents.append(
            types.Content(
                role="user", parts=[types.Part.from_text(text=initial_prompt)]
            )
        )

    return contents


@app.post("/api/stream")
async def stream_explanation(request: CodeRequest):
    if not API_KEY or not client:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured on the server.",
        )

    contents = build_gemini_contents(request)
    active_model = get_live_model()

    def generate():
        try:
            response = client.models.generate_content_stream(
                model=active_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.7,
                ),
            )
            for chunk in response:
                if chunk.text:
                    payload = json.dumps({"delta": chunk.text})
                    yield f"data: {payload}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            payload = json.dumps({"error": str(exc)})
            yield f"data: {payload}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "model": get_live_model(),
        "key_configured": bool(API_KEY),
    }


app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")