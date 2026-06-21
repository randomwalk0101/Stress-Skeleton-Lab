let lastCaption = "";
let lastTranslated = "";
let youtubeSettings = null;

if (location.hostname.includes("youtube.com")) {
  initYouTubeCaptions();
}

async function initYouTubeCaptions() {
  const response = await sendMessage({ type: "BIREAD_GET_SETTINGS" }).catch(() => null);
  youtubeSettings = response?.settings;
  if (!youtubeSettings?.enabled) return;

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "BIREAD_SETTINGS_UPDATED") {
      youtubeSettings = { ...youtubeSettings, ...message.settings };
    }
  });

  const observer = new MutationObserver(handleCaptionMutation);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(handleCaptionMutation, 900);
}

async function handleCaptionMutation() {
  const mode = youtubeSettings?.youtubeMode || "bilingual";
  if (mode === "off") {
    removeOverlay();
    return;
  }

  const caption = readCaptionText();
  if (!caption || caption === lastCaption) return;
  lastCaption = caption;

  const targetLanguage = mode === "english" ? "en" : "zh-CN";
  const response = await sendMessage({
    type: "BIREAD_TRANSLATE",
    text: caption,
    options: { ...youtubeSettings, targetLanguage }
  }).catch(() => null);

  if (!response?.ok) return;
  lastTranslated = response.text;
  renderYouTubeOverlay(caption, lastTranslated, mode);
}

function readCaptionText() {
  const segments = Array.from(document.querySelectorAll(".ytp-caption-segment"));
  return segments.map(segment => segment.textContent.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function renderYouTubeOverlay(original, translated, mode) {
  const overlay = getOverlay();
  overlay.textContent = "";

  if (mode === "english") {
    overlay.appendChild(line(original));
    return;
  }

  if (mode === "chinese") {
    overlay.appendChild(line(translated));
    return;
  }

  overlay.appendChild(line(original));
  overlay.appendChild(line(translated));
}

function getOverlay() {
  let overlay = document.querySelector(".biread-youtube-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "biread-youtube-overlay";
    document.documentElement.appendChild(overlay);
  }
  return overlay;
}

function line(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function removeOverlay() {
  document.querySelector(".biread-youtube-overlay")?.remove();
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
