let settings = null;
let translating = false;

initPageTranslator();

async function initPageTranslator() {
  const response = await sendMessage({ type: "BIREAD_GET_SETTINGS" }).catch(() => null);
  settings = response?.settings;
  if (!settings?.enabled) return;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "BIREAD_TRANSLATE_PAGE") {
      translatePage().then(() => sendResponse({ ok: true }), error => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "BIREAD_SELECTION_TRANSLATED") {
      showPopover(message.translatedText);
    }

    if (message?.type === "BIREAD_SETTINGS_UPDATED") {
      settings = { ...settings, ...message.settings };
    }

    return false;
  });

  if (settings.pageAutoTranslate) {
    translatePage();
  }
}

async function translatePage() {
  if (translating || !settings?.enabled) return;
  translating = true;
  try {
    const nodes = collectReadableNodes();
    const items = nodes.map((node, index) => ({ id: String(index), text: node.innerText.trim() }));
    if (!items.length) return;

    const response = await sendMessage({
      type: "BIREAD_TRANSLATE_BATCH",
      items,
      options: settings
    });
    if (!response?.ok) throw new Error(response?.error || "Translation failed");

    const byId = new Map(response.items.map(item => [item.id, item.text]));
    nodes.forEach((node, index) => renderTranslation(node, byId.get(String(index))));
  } finally {
    translating = false;
  }
}

function collectReadableNodes() {
  const selector = [
    "main p",
    "article p",
    "#mw-content-text p",
    "#mw-content-text li",
    "main li",
    "article li",
    "h1",
    "h2",
    "h3"
  ].join(",");

  const candidates = Array.from(document.querySelectorAll(selector));
  return candidates.filter(node => {
    if (node.closest(".biread-translation, nav, header, footer, aside, script, style")) return false;
    const text = node.innerText?.replace(/\s+/g, " ").trim() || "";
    return text.length >= (settings.minTextLength || 12) && text.length <= 1200;
  }).slice(0, settings.maxPageItems || 80);
}

function renderTranslation(node, translatedText) {
  if (!translatedText || node.dataset.bireadTranslated === "true") return;
  node.dataset.bireadTranslated = "true";

  if (settings.displayMode === "translation") {
    node.dataset.bireadOriginal = node.innerText;
    node.innerText = translatedText;
    node.classList.add("biread-replaced");
    return;
  }

  if (settings.displayMode === "original") return;

  const translation = document.createElement("span");
  translation.className = "biread-translation";
  translation.textContent = translatedText;
  node.insertAdjacentElement("afterend", translation);
}

function showPopover(text) {
  document.querySelector(".biread-popover")?.remove();
  const popover = document.createElement("div");
  popover.className = "biread-popover";
  popover.textContent = text;
  document.documentElement.appendChild(popover);
  setTimeout(() => popover.remove(), 10000);
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}
