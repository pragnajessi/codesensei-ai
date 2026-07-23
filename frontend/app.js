// ---------------------------------------------------------------
// CodeSensei.ai — frontend logic
// Streams from the existing /api/stream SSE endpoint (backend untouched)
// and drives the glass UI: theme toggle, 3D tilt, mascot, chat.
// ---------------------------------------------------------------

const state = {
  mode: "explain",
  history: [],
  streaming: false,
};

const els = {
  modeBtns: document.querySelectorAll(".mode-btn"),
  inputTitle: document.getElementById("input-title"),
  codeInput: document.getElementById("code-input"),
  errorField: document.getElementById("error-field"),
  errorInput: document.getElementById("error-input"),
  analyzeBtn: document.getElementById("analyze-btn"),
  analyzeBtnText: document.getElementById("analyze-btn-text"),
  output: document.getElementById("output"),
  lessonStatus: document.getElementById("lesson-status"),
  chatThread: document.getElementById("chat-thread"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  chatSend: document.getElementById("chat-send"),
  hint: document.getElementById("input-hint"),
  themeToggle: document.getElementById("theme-toggle"),
  uploadBtn: document.getElementById("upload-btn"),
  codeFileInput: document.getElementById("code-file-input"),
  uploadFilename: document.getElementById("upload-filename"),
};

marked.setOptions({ breaks: true });

/* =================================================================
   THEME: dark / light, persisted to localStorage.
   NOTE: localStorage doesn't work inside Claude.ai's in-chat artifact
   preview sandbox (it throws), so this falls back to an in-memory
   value there and simply won't persist across reloads in that preview.
   Once deployed for real (Render, Docker, your own domain) localStorage
   works normally and the theme choice sticks between visits.
   ================================================================= */
const LARGE_FILE_WARN_CHARS = 60000;
els.uploadBtn.addEventListener("click", () => els.codeFileInput.click());
els.codeFileInput.addEventListener("change", () => {
  const file = els.codeFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    els.codeInput.value = text;
    els.uploadFilename.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    if (text.length > LARGE_FILE_WARN_CHARS) {
      els.hint.textContent = "That's a big file — Sensei will summarize the overall structure first, then dig into the most important parts.";
    }
  };
  reader.readAsText(file);
});
const THEME_KEY = "codesensei-theme";
let memoryTheme = null; // in-memory fallback when storage is unavailable

function readStoredTheme() {
  try {
    return window.localStorage.getItem(THEME_KEY);
  } catch {
    return memoryTheme;
  }
}

function writeStoredTheme(value) {
  try {
    window.localStorage.setItem(THEME_KEY, value);
  } catch {
    memoryTheme = value;
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  els.themeToggle.setAttribute("aria-pressed", theme === "light");
}

(function initTheme() {
  const stored = readStoredTheme();
  if (stored === "light" || stored === "dark") {
    applyTheme(stored);
  } else {
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    applyTheme(prefersLight ? "light" : "dark");
  }
})();

els.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  writeStoredTheme(next);
});

/* =================================================================
   3D MASCOT: use <spline-viewer> if a real scene URL is set on it,
   otherwise fall back to the built-in CSS cube (always looks finished).
   ================================================================= */

(function initMascot() {
  const dock = document.getElementById("mascot-dock");
  const spline = document.getElementById("mascot-spline");
  const url = spline?.getAttribute("url");

  if (!url) {
    dock.classList.add("no-spline");
    return;
  }
  // If a URL was provided but the custom element fails to load
  // (network blocked, bad URL, etc.), still fall back gracefully.
  const fallbackTimer = setTimeout(() => dock.classList.add("no-spline"), 4000);
  spline.addEventListener("load", () => clearTimeout(fallbackTimer));
  spline.addEventListener("error", () => { clearTimeout(fallbackTimer); dock.classList.add("no-spline"); });
})();

/* =================================================================
   3D TILT: panels track the cursor and tilt toward it, with a
   spotlight glow that follows the mouse (driven by CSS vars).
   ================================================================= */

function attachTilt(panel) {
  const MAX_TILT = 6; // degrees

  function onMove(e) {
    const rect = panel.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;  // 0..1
    const py = (e.clientY - rect.top) / rect.height;   // 0..1

    const rotateY = (px - 0.5) * MAX_TILT * 2;
    const rotateX = (0.5 - py) * MAX_TILT * 2;

    panel.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(0)`;
    panel.style.setProperty("--mx", `${px * 100}%`);
    panel.style.setProperty("--my", `${py * 100}%`);
    panel.classList.add("tilting");
  }

  function onLeave() {
    panel.style.transform = "rotateX(0deg) rotateY(0deg)";
    panel.classList.remove("tilting");
  }

  panel.addEventListener("mousemove", onMove);
  panel.addEventListener("mouseleave", onLeave);
}

if (!window.matchMedia("(pointer: coarse)").matches) {
  document.querySelectorAll(".panel.glass").forEach(attachTilt);
}

/* =================================================================
   MODE TOGGLE (Tutor / Debug)
   ================================================================= */

els.modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    els.modeBtns.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    state.mode = btn.dataset.mode;

    const isDebug = state.mode === "debug";
    els.errorField.classList.toggle("hidden", !isDebug);
    els.inputTitle.textContent = isDebug
      ? "Paste your code and the error it threw:"
      : "Paste your code below:";
    els.analyzeBtnText.textContent = isDebug ? "🐞 Debug It" : "🚀 Ask CodeSensei";
    els.hint.textContent = isDebug
      ? "Include the full traceback if you have it — the more context, the sharper the fix. Just have a question, no code? Use the chat box on the right →"
      : "Sensei is patient — but code and a clear question help most. Got a plain question with no code? Use the chat box on the right instead →";
  });
});

/* =================================================================
   STREAMING HELPERS (unchanged contract with backend /api/stream)
   ================================================================= */

function buildInitialUserMessage(mode, code, error) {
  const parts = [`Mode: ${mode}`, `Code:\n\`\`\`\n${code}\n\`\`\``];
  if (error && error.trim()) {
    parts.push(`Error Trace:\n\`\`\`\n${error}\n\`\`\``);
  }
  return parts.join("\n\n");
}

function attachCopyButtons(container) {
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".copy-btn")) return;
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code")?.textContent ?? pre.textContent;
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = "Copied";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1400);
      } catch {
        btn.textContent = "Failed";
      }
    });
    pre.appendChild(btn);
  });
}

function setLessonStatus(text, cls) {
  els.lessonStatus.textContent = text;
  els.lessonStatus.className = `status-pill ${cls}`;
}

function setBusy(isBusy) {
  state.streaming = isBusy;
  els.analyzeBtn.disabled = isBusy;
  els.chatSend.disabled = isBusy;
  els.chatInput.disabled = isBusy;
}

async function streamRequest(body, { onDelta, onDone, onError }) {
  let response;
  try {
    response = await fetch("/api/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    onError("Could not reach the server. Is the backend running?");
    return;
  }

  if (!response.ok || !response.body) {
    if (response.status === 405 || response.status === 404) {
      onError(
        "This page is being served by a static file server (e.g. Live Server on port 5500), " +
        "which has no /api/stream route. Start the backend instead — run " +
        "'uvicorn main:app --reload --port 8000' from the backend folder, then open " +
        "http://localhost:8000 in your browser."
      );
    } else {
      onError(`Server error (${response.status}). Check that ANTHROPIC_API_KEY is set.`);
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop();

    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) { onError(parsed.error); return; }
        if (typeof parsed.delta === "string") onDelta(parsed.delta);
      } catch {
        // ignore malformed keep-alive lines
      }
    }
  }
  onDone();
}

/* =================================================================
   INITIAL ANALYSIS
   ================================================================= */

els.analyzeBtn.addEventListener("click", async () => {
  const code = els.codeInput.value.trim();
  if (!code) { els.codeInput.focus(); return; }
  const error = state.mode === "debug" ? els.errorInput.value.trim() : "";

  setBusy(true);
  setLessonStatus("Streaming", "streaming");
  els.output.innerHTML = `
    <div class="lesson" id="lesson">
      <p style="color:var(--text-dim); font-size:0.85rem;">Sensei is thinking<span class="cursor-blink"></span></p>
    </div>`;
  els.chatThread.innerHTML = "";
  state.history = [];

  let full = "";
  const lessonEl = () => document.getElementById("lesson");

  await streamRequest(
    { code, error, mode: state.mode, history: [] },
    {
      onDelta: (chunk) => {
        full += chunk;
        const el = lessonEl();
        if (el) {
          el.innerHTML = marked.parse(full) + '<span class="cursor-blink"></span>';
          attachCopyButtons(el);
          els.output.scrollTop = els.output.scrollHeight;
        }
      },
      onDone: () => {
        const el = lessonEl();
        if (el) { el.innerHTML = marked.parse(full); attachCopyButtons(el); }
        state.history.push({ role: "user", content: buildInitialUserMessage(state.mode, code, error) });
        state.history.push({ role: "assistant", content: full });
        setLessonStatus("Done", "done");
        setBusy(false);
      },
      onError: (msg) => {
        els.output.innerHTML = `<div class="stream-error">${msg}</div>`;
        setLessonStatus("Idle", "idle");
        setBusy(false);
      },
    }
  );
});

/* =================================================================
   FOLLOW-UP CHAT
   ================================================================= */

els.chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = els.chatInput.value.trim();
  if (!question || state.streaming) return;

  els.chatInput.value = "";
  setBusy(true);
  setLessonStatus("Streaming", "streaming");

  if (els.output.querySelector(".empty-state")) {
    els.output.innerHTML = "";
  }

  const userBubble = document.createElement("div");
  userBubble.className = "chat-msg user";
  userBubble.textContent = question;
  els.chatThread.appendChild(userBubble);

  const assistantBubble = document.createElement("div");
  assistantBubble.className = "chat-msg assistant";
  assistantBubble.innerHTML = '<span class="cursor-blink"></span>';
  els.chatThread.appendChild(assistantBubble);
  els.output.scrollTop = els.output.scrollHeight;

  const historyForRequest = [...state.history, { role: "user", content: question }];
  let full = "";

  await streamRequest(
    { history: historyForRequest },
    {
      onDelta: (chunk) => {
        full += chunk;
        assistantBubble.innerHTML = marked.parse(full) + '<span class="cursor-blink"></span>';
        attachCopyButtons(assistantBubble);
        els.output.scrollTop = els.output.scrollHeight;
      },
      onDone: () => {
        assistantBubble.innerHTML = marked.parse(full);
        attachCopyButtons(assistantBubble);
        state.history.push({ role: "user", content: question });
        state.history.push({ role: "assistant", content: full });
        setLessonStatus("Done", "done");
        setBusy(false);
        els.chatInput.focus();
      },
      onError: (msg) => {
        assistantBubble.innerHTML = `<div class="stream-error">${msg}</div>`;
        setLessonStatus("Done", "done");
        setBusy(false);
      },
    }
  );
});
