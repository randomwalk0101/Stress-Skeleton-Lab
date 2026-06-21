import { sendMessage } from "../shared/browser.js";

const form = document.getElementById("optionsForm");
const fields = ["provider", "libreEndpoint", "libreApiKey", "minTextLength", "maxPageItems", "pageAutoTranslate", "hoverDictionary", "autoSpeak"];
let settings = {};

load();
form.addEventListener("submit", save);

async function load() {
  const response = await sendMessage({ type: "BIREAD_GET_SETTINGS" });
  settings = response.settings;
  for (const id of fields) {
    const element = document.getElementById(id);
    if (element.type === "checkbox") element.checked = Boolean(settings[id]);
    else element.value = settings[id] ?? "";
  }
}

async function save(event) {
  event.preventDefault();
  const next = { ...settings };
  for (const id of fields) {
    const element = document.getElementById(id);
    next[id] = element.type === "checkbox" ? element.checked : element.value;
  }
  next.minTextLength = Number(next.minTextLength) || 12;
  next.maxPageItems = Number(next.maxPageItems) || 80;

  const response = await sendMessage({ type: "BIREAD_SAVE_SETTINGS", settings: next });
  settings = response.settings;
  document.getElementById("status").textContent = "Options saved";
}
