if (!globalThis.__bireadPronunciationPanelLoaded) {
globalThis.__bireadPronunciationPanelLoaded = true;

let pronunciationSettings = null;
let selectedText = "";
let selectionButton = null;
let panel = null;
let repeatAbort = false;
let activeAudio = null;
let selectedRect = null;
let selectedHostNode = null;

initPronunciationPanel();

async function initPronunciationPanel() {
  const response = await sendMessage({ type: "BIREAD_GET_SETTINGS" }).catch(() => null);
  pronunciationSettings = response?.settings;
  if (!pronunciationSettings?.enabled) return;

  document.addEventListener("mouseup", handleSelection, true);
  document.addEventListener("keyup", handleSelection, true);
  document.addEventListener("mousedown", event => {
    if (!event.target.closest?.(".biread-pronunciation-button, .biread-pronunciation-panel")) {
      removeSelectionButton();
    }
  }, true);

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "BIREAD_SETTINGS_UPDATED") {
      pronunciationSettings = { ...pronunciationSettings, ...message.settings };
    }
  });
}

function handleSelection() {
  if (!pronunciationSettings?.pronunciationAnalyzer) return;
  setTimeout(() => {
    const selection = window.getSelection();
    const text = cleanPronunciationText(getSelectionText(selection));
    if (!isEnglishSelection(text)) {
      removeSelectionButton();
      return;
    }

    selectedText = text.slice(0, 2400);
    if (!selection.rangeCount) return;
    selectedRect = selection.getRangeAt(0).getBoundingClientRect();
    selectedHostNode = getSelectionHostNode(selection);
    showSelectionButton(selectedRect);
  }, 20);
}

function showSelectionButton(rect) {
  removeSelectionButton();
  selectionButton = document.createElement("button");
  selectionButton.className = "biread-pronunciation-button";
  selectionButton.type = "button";
  selectionButton.textContent = "Analyze Pronunciation";
  selectionButton.style.left = `${Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 190)}px`;
  selectionButton.style.top = `${rect.bottom + window.scrollY + 8}px`;
  selectionButton.addEventListener("click", analyzeSelection);
  document.documentElement.appendChild(selectionButton);
}

async function analyzeSelection() {
  removeSelectionButton();
  showPanel({ loading: true, original: selectedText }, selectedRect);

  const response = await sendMessage({ type: "BIREAD_ANALYZE_PRONUNCIATION", text: selectedText }).catch(error => ({
    ok: false,
    error: error.message
  }));

  if (!response?.ok) {
    showPanel({ error: response?.error || "Pronunciation analysis failed.", original: selectedText }, selectedRect);
    return;
  }

  showPanel({ analysis: response.analysis }, selectedRect);
}

function showPanel(state, anchorRect = null) {
  panel?.remove();
  panel = document.createElement("section");
  panel.className = "biread-pronunciation-panel";
  panel.innerHTML = buildPanelHtml(state);
  const inlineHost = getInlinePanelHost();
  if (inlineHost?.parentNode) {
    panel.classList.add("biread-pronunciation-panel--inline");
    inlineHost.after(panel);
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } else {
    document.documentElement.appendChild(panel);
    positionPanel(panel, anchorRect);
  }

  panel.querySelector("[data-close]")?.addEventListener("click", closePanel);
  panel.querySelector("[data-play='normal']")?.addEventListener("click", () => speakText(getPanelOriginal(), 1, 1));
  panel.querySelector("[data-play='slow']")?.addEventListener("click", () => speakText(getPanelOriginal(), 0.72, 1));
  panel.querySelector("[data-play='repeat']")?.addEventListener("click", () => speakText(getPanelOriginal(), 0.86, 3));
  panel.querySelector("[data-show-ipa]")?.addEventListener("change", event => {
    panel.querySelector(".biread-pronunciation-ipa").hidden = !event.target.checked;
  });
}

function positionPanel(node, anchorRect) {
  if (!anchorRect) return;

  node.classList.add("biread-pronunciation-panel--anchored");
  const viewportGap = 16;
  const preferredWidth = Math.min(1120, window.innerWidth - viewportGap * 2);
  node.style.width = `${preferredWidth}px`;

  const anchorCenter = anchorRect.left + anchorRect.width / 2 + window.scrollX;
  const left = Math.max(
    window.scrollX + viewportGap,
    Math.min(anchorCenter - preferredWidth / 2, window.scrollX + window.innerWidth - preferredWidth - viewportGap)
  );
  const top = anchorRect.bottom + window.scrollY + 12;

  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  node.style.right = "auto";
}

function buildPanelHtml(state) {
  const analysis = state.analysis;
  const original = escapeHtml(cleanPronunciationText(analysis?.original || state.original || selectedText));
  const body = state.loading
    ? `<p class="biread-pronunciation-muted">Analyzing pronunciation...</p>`
    : state.error
      ? `<p class="biread-pronunciation-error">${escapeHtml(state.error)}</p>`
      : renderAnalysis(analysis);

  return `
    <header>
      <strong>Pronunciation Coach</strong>
      <button type="button" data-close aria-label="Close">x</button>
    </header>
    <div class="biread-pronunciation-original" data-original="${original}">${original}</div>
    ${body}
  `;
}

function renderAnalysis(analysis) {
  const hasIpaKeywords = Array.isArray(analysis.ipa_keywords) && analysis.ipa_keywords.length > 0;
  return `
    <div class="biread-pronunciation-actions">
      <button type="button" data-play="normal">Play Normal</button>
      <button type="button" data-play="slow">Play Slow</button>
      <button type="button" data-play="repeat">Repeat 3x</button>
    </div>
    ${hasIpaKeywords ? `<label class="biread-pronunciation-toggle">
      <input type="checkbox" data-show-ipa>
      显示关键词音标 IPA
    </label>` : ""}
    <section>
      <h2>重音骨架</h2>
      <p>${escapeHtml(cleanPronunciationText(analysis.stress_skeleton || ""))}</p>
    </section>
    ${renderList("语调和停顿", analysis.intonation_pause, item => `<b>${escapeHtml(cleanPronunciationText(item.text))}</b><em>${escapeHtml(item.pattern)}</em><span>${escapeHtml(item.note)}</span>`)}
    <section>
      <h2>跟读节奏</h2>
      <p>${escapeHtml(buildShadowingDrill(cleanPronunciationText(analysis.stress_skeleton || analysis.original || "")))}</p>
    </section>
    ${renderList("单词重音", analysis.word_stress, item => `<b>${escapeHtml(item.word)}</b> -> ${escapeHtml(item.stress)}<span>${escapeHtml(item.note)}</span>`)}
    ${renderList("连读、弱读、吞音", analysis.linking_reduction, item => `<b>${escapeHtml(item.text)}</b><em>${escapeHtml(item.type)}</em><span>${escapeHtml(item.note)}</span>`)}
    ${renderList("闪音提示", analysis.flap_t, item => `<b>${escapeHtml(item.text)}</b><span>${escapeHtml(item.note)}</span>`)}
    ${renderList("易错音", analysis.sound_focus, item => `<b>${escapeHtml(item.text)}</b><em>${escapeHtml(item.sound)}</em><span>${escapeHtml(item.note)}</span>`)}
    <section class="biread-pronunciation-ipa" hidden>
      <h2>关键词 IPA</h2>
      ${renderPlainList(analysis.ipa_keywords, item => `<b>${escapeHtml(item.word)}</b><span>${escapeHtml(item.ipa)}</span>`)}
    </section>
    <section>
      <h2>学习建议</h2>
      <p>${escapeHtml(analysis.practice_tip || "")}</p>
    </section>
  `;
}

function buildShadowingDrill(text) {
  const groups = String(text)
    .split("/")
    .map(group => group.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!groups.length) return "先慢速听一遍，再按每个 / 意群暂停跟读，最后连续读完整段。";
  return `按 ${groups.length} 个意群练：${groups.join(" | ")}。每组先慢读一次，再正常速度连起来。`;
}

function cleanPronunciationText(text) {
  return String(text || "")
    .replace(/\[\s*\d+(?:\s*[-–,]\s*\d+)*\s*\]/g, "")
    .replace(/([.!?;:])\s*\d{1,3}(?=\s+[A-Z]|$)/g, "$1 ")
    .replace(/([a-z])\d{1,3}(?=\s+[A-Z])/g, "$1")
    .replace(/\[\s*citation needed\s*\]/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getSelectionText(selection) {
  if (!selection?.rangeCount) return "";
  const container = document.createElement("div");
  for (let index = 0; index < selection.rangeCount; index += 1) {
    container.appendChild(selection.getRangeAt(index).cloneContents());
  }
  container.querySelectorAll([
    "sup.reference",
    "sup.noprint",
    ".reference",
    ".mw-ref",
    ".mw-editsection",
    ".citation"
  ].join(",")).forEach(element => element.remove());
  return container.textContent || selection.toString() || "";
}

function renderList(title, items, renderer) {
  return `
    <section>
      <h2>${title}</h2>
      ${renderPlainList(items, renderer)}
    </section>
  `;
}

function renderPlainList(items = [], renderer) {
  if (!items.length) return `<p class="biread-pronunciation-muted">No major points.</p>`;
  return `<ul>${items.map(item => `<li>${renderer(item)}</li>`).join("")}</ul>`;
}

async function speakText(text, rate, times) {
  repeatAbort = true;
  activeAudio?.pause();
  window.speechSynthesis?.cancel();
  await delay(60);
  repeatAbort = false;

  for (let index = 0; index < times; index += 1) {
    if (repeatAbort) return;
    await speakOnce(text, rate);
    if (index < times - 1) await delay(450);
  }
}

function speakOnce(text, rate) {
  return speakWithLocalTts(text, rate).catch(() => speakWithBrowserVoice(text, rate));
}

async function speakWithLocalTts(text, rate) {
  const response = await sendMessage({ type: "BIREAD_TTS_LOCAL", text, rate });
  if (!response?.ok || !response.audio?.dataUrl) throw new Error(response?.error || "Local TTS unavailable");

  activeAudio?.pause();
  activeAudio = new Audio(response.audio.dataUrl);
  await activeAudio.play();
  await new Promise(resolve => {
    activeAudio.onended = resolve;
    activeAudio.onerror = resolve;
  });
}

function speakWithBrowserVoice(text, rate) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    utterance.voice = chooseVoice();
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

function chooseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find(voice => /Jenny/i.test(voice.name) && /en-US/i.test(voice.lang))
    || voices.find(voice => /female|zira|samantha|ava/i.test(voice.name) && /en-US/i.test(voice.lang))
    || voices.find(voice => /en-US/i.test(voice.lang))
    || null;
}

function getPanelOriginal() {
  return panel?.querySelector(".biread-pronunciation-original")?.dataset.original || selectedText;
}

function closePanel() {
  repeatAbort = true;
  activeAudio?.pause();
  window.speechSynthesis?.cancel();
  panel?.remove();
  panel = null;
}

function removeSelectionButton() {
  selectionButton?.remove();
  selectionButton = null;
}

function getSelectionHostNode(selection) {
  const anchor = selection?.anchorNode;
  return anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
}

function getInlinePanelHost() {
  const host = selectedHostNode?.closest?.("p, li, dd, blockquote, .para");
  if (!host) return null;
  if (host.closest(".biread-pronunciation-panel")) return null;
  if (host.matches("li") && host.parentElement?.children.length > 20) return null;
  return host;
}

function isEnglishSelection(text) {
  return text.length >= 2 && /[A-Za-z]/.test(text) && !/[\u3400-\u9fff]/.test(text);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
}
