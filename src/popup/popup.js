import { runtime, sendMessage } from "../shared/browser.js";

const fields = ["enabled", "autoSpeak", "youtubeStressOverlay"];
let settings = {};

load();

document.getElementById("openReader").addEventListener("click", () => {
  runtime.tabs.create({ url: runtime.runtime.getURL("src/reader/reader.html") });
});

for (const id of fields) {
  document.getElementById(id).addEventListener("change", save);
}

async function load() {
  const response = await sendMessage({ type: "BIREAD_GET_SETTINGS" });
  settings = response.settings;
  for (const id of fields) {
    document.getElementById(id).checked = Boolean(settings[id]);
  }
  ensureActiveTabContentScripts().catch(() => {});
}

async function save() {
  const next = {
    ...settings,
    enabled: document.getElementById("enabled").checked,
    autoSpeak: document.getElementById("autoSpeak").checked,
    youtubeStressOverlay: document.getElementById("youtubeStressOverlay").checked
  };
  const response = await sendMessage({ type: "BIREAD_SAVE_SETTINGS", settings: next });
  settings = response.settings;
  setStatus("Saved");
  notifyActiveTab({ type: "BIREAD_SETTINGS_UPDATED", settings });
}

async function notifyActiveTab(message) {
  const [tab] = await runtime.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await ensureContentScripts(tab.id).catch(() => null);
    runtime.tabs.sendMessage(tab.id, message);
  }
}

async function ensureActiveTabContentScripts() {
  const [tab] = await runtime.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await ensureContentScripts(tab.id);
}

async function ensureContentScripts(tabId) {
  if (!runtime.scripting?.executeScript) return;

  if (runtime.scripting.insertCSS) {
    await runtime.scripting.insertCSS({
      target: { tabId },
      files: ["src/content/content.css"]
    }).catch(() => {});
  }

  await runtime.scripting.executeScript({
    target: { tabId },
    files: [
      "src/content/pronunciation-panel.js"
      ,
      "src/content/youtube-captions.js"
    ]
  });
}

function setStatus(text) {
  const status = document.getElementById("status");
  status.textContent = text;
  setTimeout(() => {
    if (status.textContent === text) status.textContent = "";
  }, 1800);
}
