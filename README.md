# 🤖 CodeSensei AI

CodeSensei AI is a lightweight, real-time AI code assistant web application built with a **FastAPI** backend and a clean **HTML/CSS/JS** frontend. It leverages Google’s Gemini API with Server-Sent Events (SSE) to stream real-time responses for code explanation, debugging, and optimization.

---

## ✨ Features

- ⚡ **Real-Time Response Streaming**: Powered by Server-Sent Events (SSE) for zero delay.
- 🐍 **FastAPI Backend**: Asynchronous and lightweight API engine.
- 🎨 **Minimal & Modern UI**: Simple frontend without complex framework overhead.
- 🐳 **Docker Ready**: Easy deployment using containerization.

---

## 🛠️ Tech Stack

| Component  | Technology / Library |
| :---       | :---                 |
| **Backend** | Python 3.10+, FastAPI, Uvicorn, `google-genai` |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (Fetch & EventSource API) |
| **DevOps** | Docker, Git |

---

## 📁 Project Structure

```text
codesensei-ai/
├── backend/
│   ├── main.py           # FastAPI app, SSE streaming endpoint, Gemini integration
│   ├── requirements.txt  # Python dependencies
│   └── .env     # Environment variables template
├── frontend/
│   ├── index.html        # Main web app page
│   ├── style.css         # Styling and layouts
│   └── app.js            # Client-side API integration & streaming logic
├── Dockerfile            # Container configuration
├── .gitignore            # Git exclusion rules
└── README.md             # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

- [Python 3.10+](https://www.python.org/) installed
- A **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)

---

### 💻 Local Setup

#### 1. Clone the Repository
```bash
git clone [https://github.com/your-username/codesensei-ai.git](https://github.com/your-username/codesensei-ai.git)
cd codesensei-ai
```

#### 2. Set Up the Backend
```bash
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate
# On Windows:
# .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

#### 3. Configure Environment Variables
Copy the example `.env` file and add your API key:
```bash
cp .env.example .env
```
Inside `.env`, set your API key:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

#### 4. Run the Server
```bash
uvicorn main:app --reload --port 8000
```
The backend server will start at `http://127.0.0.1:8000`.

#### 5. Open the Frontend
Simply open `frontend/index.html` in your web browser (or serve it using Live Server in VS Code).

---

## 🐳 Docker Setup

To run the application using Docker:

```bash
# Build the Docker image
docker build -t codesensei-ai .

# Run the container
docker run -d -p 8000:8000 --env-file backend/.env codesensei-ai
```

---
