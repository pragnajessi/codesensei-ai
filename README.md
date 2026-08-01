# CodeSensei AI

An interactive coding tutor and error-debugger, powered by Gemini, that streams its explanations token-by-token: mental models, "Use This, Not That" best practices, step-by-step logic with clean code, debugging notes, and a follow-up chat.

## Stack

* **Frontend:** vanilla HTML/CSS/JS, streaming via fetch + ReadableStream, Markdown rendered with marked.js
* **Backend:** Python 3.11, FastAPI, Server-Sent Events (SSE)
* **LLM:** Google Gemini API (`google-genai` Python SDK), streaming enabled
* **Container:** single Dockerfile, deployed to Render.com as a Docker web service

## Project structure

```text
codesensei-ai/
├── backend/
│   ├── main.py           # FastAPI app, SSE streaming endpoint, Gemini integration
│   ├── requirements.txt
│   └── .env.example       # copy to .env locally, never commit the real one
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── Dockerfile
├── .gitignore
└── README.md
```
## Run it locally

```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

Open `http://localhost:8000` — the backend also serves the frontend directly, so there's nothing else to run.

Get a Google Gemini API key at [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

## Run it with Docker

docker build -t codesensei-ai .
docker run -p 8000:8000 -e GEMINI_API_KEY=your-gemini-key-here codesensei-ai

Then open `http://localhost:8000`.

## Deploy to Render.com

1. Push this folder to a GitHub repository.
2. In Render, click **New** → **Web Service** and connect the repo.
3. Set **Environment** to **Docker** (Render will detect the Dockerfile automatically).
4. Under **Environment Variables**, add:
* `GEMINI_API_KEY` = your real key
* *(optional)* `GEMINI_MODEL` — defaults to `gemini-2.5-flash` if unset


5. Click **Deploy**. Render builds the image and gives you a public HTTPS URL.

Your API key lives only in Render's environment variables and your local `.env` — it's never sent to or stored in the browser, and `.gitignore` keeps it out of git.

## How it works

* You paste code (and, in Debug Error mode, a stack trace) and click the button.
* The frontend POSTs to `/api/stream`. FastAPI builds the conversation history, configures the CodeSensei system instructions, and streams Gemini's response back as SSE events using the Gemini API SDK.
* The browser renders each chunk as Markdown in real time, with a blinking cursor while streaming and one-click "Copy" buttons on every code block.
* Once the first lesson finishes, a chat box appears below it — every follow-up question is sent along with the full conversation history so Gemini keeps context.

## Customizing the tutor persona

The system prompt lives in `backend/main.py` as `SYSTEM_PROMPT`. Edit it to change the response structure, tone, or add new sections.
