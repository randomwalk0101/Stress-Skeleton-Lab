import { runtime, sendMessage } from "../shared/browser.js";

const fields = ["enabled", "displayMode", "targetLanguage", "youtubeMode", "hoverDictionary", "autoSpeak"];
let settings = {};

load();

document.getElementById("translatePage").addEventListener("click", translatePage);
document.getElementById("openReader").addEventListener("click", () => {
  runtime.tabs.create({ url: runtime.runtime.getURL("src/reader/reader.html") });
});
document.getElementById("openOptions").addEventListener("click", () => runtime.runtime.openOptionsPage());

for (const id of fields) {
  document.getElementById(id).addEventListener("change", save);
}

async function load() {
  const response = await sendMessage({ type: "BIREAD_GET_SETTINGS" });
  settings = response.settings;
  document.getElementById("enabled").checked = Boolean(settings.enabled);
  for (const id of fields.filter(field => field !== "enabled")) {
    const element = document.getElementById(id);
    if (element.type === "checkbox") element.checked = Boolean(settings[id]);
    else element.value = settings[id];
  }
}

async function save() {
  const next = {
    ...settings,
    enabled: document.getElementById("enabled").checked,
    displayMode: document.getElementById("displayMode").value,
    targetLanguage: document.getElementById("targetLanguage").value,
    youtubeMode: document.getElementById("youtubeMode").value,
    hoverDictionary: document.getElementById("hoverDictionary").checked,
    autoSpeak: document.getElementById("autoSpeak").checked
  };
  const response = await sendMessage({ type: "BIREAD_SAVE_SETTINGS", settings: next });
  settings = response.settings;
  setStatus("Saved");
  notifyActiveTab({ type: "BIREAD_SETTINGS_UPDATED", settings });
}

async function translatePage() {
  const [tab] = await runtime.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  runtime.tabs.sendMessage(tab.id, { type: "BIREAD_TRANSLATE_PAGE" }, response => {
    const error = runtime.runtime.lastError;
    setStatus(error ? "Refresh the page and try again" : (response?.ok ? "Translating" : "Could not translate"));
  });
}

async function notifyActiveTab(message) {
  const [tab] = await runtime.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) runtime.tabs.sendMessage(tab.id, message);
}

function setStatus(text) {
  const status = document.getElementById("status");
  status.textContent = text;
  setTimeout(() => {
    if (status.textContent === text) status.textContent = "";
  }, 1800);
}
