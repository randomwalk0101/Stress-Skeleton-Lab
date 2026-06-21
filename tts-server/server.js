import express from "express";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { EdgeTTS } from "node-edge-tts";

const app = express();
const port = Number(process.env.PORT || 8787);
const cacheDir = path.join(os.homedir(), ".biread-tts-cache");

app.use(express.json({ limit: "256kb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, voice: "en-US-JennyNeural" });
});

app.post("/api/tts", async (req, res) => {
  try {
    const text = String(req.body?.text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
    const voice = String(req.body?.voice || "en-US-JennyNeural");
    const rate = normalizeRate(req.body?.rate);
    if (!text) {
      res.status(400).json({ ok: false, error: "Missing text" });
      return;
    }

    await fs.mkdir(cacheDir, { recursive: true });
    const cacheKey = crypto.createHash("sha256").update(JSON.stringify({ text, voice, rate })).digest("hex");
    const audioPath = path.join(cacheDir, `${cacheKey}.mp3`);

    try {
      await fs.access(audioPath);
    } catch {
      await synthesizeToFile({ text, voice, rate, audioPath });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "audio/mpeg");
    res.sendFile(audioPath);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || String(error) });
  }
});

app.options("/api/tts", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});

app.listen(port, "127.0.0.1", () => {
  console.log(`BiRead local Edge TTS server listening at http://127.0.0.1:${port}`);
});

async function synthesizeToFile({ text, voice, rate, audioPath }) {
  const tts = new EdgeTTS({
    voice,
    lang: "en-US",
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    rate,
    volume: "+0%",
    pitch: "+0Hz"
  });
  await tts.ttsPromise(text, audioPath);
}

function normalizeRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "+0%";
  if (numeric <= 0.8) return "-25%";
  if (numeric >= 1.15) return "+10%";
  return "+0%";
}
