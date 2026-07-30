require("dotenv").config();
const express = require("express");
const { Readable } = require("stream");
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// --- Global service helper ---
async function callService(path, body) {
  return fetch(`${process.env.RAPIDNATIVE_GLOBAL_SERVICES_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RAPIDNATIVE_GLOBAL_SERVICES_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ── Google OAuth ──
app.post("/auth/google/authorize-url", async (req, res) => {
  try {
    const { redirectUri } = req.body || {};
    const response = await callService("/google/authorize-url", {
      redirect_uri: redirectUri || `${process.env.RAPIDNATIVE_PROJECT_ID}.rnproject.com/auth/callback`,
    });
    res.status(response.status).json(await response.json());
  } catch (err) {
    console.error("Google auth URL error:", err);
    res.status(500).json({ error: "Could not generate Google auth URL" });
  }
});

app.post("/auth/google/verify", async (req, res) => {
  try {
    const { code, redirectUri } = req.body || {};
    const response = await callService("/google/verify", {
      code,
      redirect_uri: redirectUri,
    });
    res.status(response.status).json(await response.json());
  } catch (err) {
    console.error("Google verify error:", err);
    res.status(500).json({ error: "Google verification failed" });
  }
});

// ── AI chat ──
app.post("/chat", async (req, res) => {
  try {
    const { messages, model } = req.body;
    const response = await callService("/openrouter/v1/chat/completions", {
      model: model || "openai/gpt-4o-mini",
      messages,
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Chat request failed" });
  }
});

app.post("/chat/stream", async (req, res) => {
  try {
    const { messages, model } = req.body;
    const response = await callService("/openrouter/v1/chat/completions", {
      model: model || "openai/gpt-4o-mini",
      messages,
      stream: true,
    });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error("Stream error:", err);
    res.status(500).json({ error: "Stream request failed" });
  }
});

// ── Send email ──
app.post("/send-email", async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    const response = await callService("/resend/emails", {
      from: "noreply@virgo.studio", to, subject, html,
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Email error:", err);
    res.status(500).json({ error: "Email request failed" });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/", (req, res) => res.json({ project: process.env.RAPIDNATIVE_PROJECT_ID, environment: process.env.RAPIDNATIVE_ENV, message: "API server running" }));

app.listen(port, () => console.log("[api] Running on port " + port));
