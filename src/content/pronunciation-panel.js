let pronunciationSettings = null;
let selectedText = "";
let selectionButton = null;
let panel = null;
let repeatAbort = false;

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
    const text = selection?.toString().replace(/\s+/g, " ").trim() || "";
    if (!isEnglishSelection(text)) {
      removeSelectionButton();
      return;
    }

    selectedText = text.slice(0, 2400);
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    showSelectionButton(rect);
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
  showPanel({ loading: true, original: selectedText });

  const response = await sendMessage({ type: "BIREAD_ANALYZE_PRONUNCIATION", text: selectedText }).catch(error => ({
    ok: false,
    error: error.message
  }));

  if (!response?.ok) {
    showPanel({ error: response?.error || "Pronunciation analysis failed.", original: selectedText });
    return;
  }

  showPanel({ analysis: response.analysis });
}

function showPanel(state) {
  panel?.remove();
  panel = document.createElement("section");
  panel.className = "biread-pronunciation-panel";
  panel.innerHTML = buildPanelHtml(state);
  document.documentElement.appendChild(panel);

  panel.querySelector("[data-close]")?.addEventListener("click", closePanel);
  panel.querySelector("[data-play='normal']")?.addEventListener("click", () => speakText(getPanelOriginal(), 1, 1));
  panel.querySelector("[data-play='slow']")?.addEventListener("click", () => speakText(getPanelOriginal(), 0.72, 1));
  panel.querySelector("[data-play='repeat']")?.addEventListener("click", () => speakText(getPanelOriginal(), 0.86, 3));
  panel.querySelector("[data-show-ipa]")?.addEventListener("change", event => {
    panel.querySelector(".biread-pronunciation-ipa").hidden = !event.target.checked;
  });
}

function buildPanelHtml(state) {
  const analysis = state.analysis;
  const original = escapeHtml(analysis?.original || state.original || selectedText);
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
  return `
    <div class="biread-pronunciation-actions">
      <button type="button" data-play="normal">Play normal speed</button>
      <button type="button" data-play="slow">Play slow speed</button>
      <button type="button" data-play="repeat">Repeat 3 times</button>
    </div>
    <label class="biread-pronunciation-toggle">
      <input type="checkbox" data-show-ipa>
      Show IPA
    </label>
    <section>
      <h2>重音骨架</h2>
      <p>${escapeHtml(analysis.stress_skeleton || "")}</p>
    </section>
    ${renderList("单词重音", analysis.word_stress, item => `<b>${escapeHtml(item.word)}</b> -> ${escapeHtml(item.stress)}<span>${escapeHtml(item.note)}</span>`)}
    ${renderList("连读、弱读、吞音", analysis.linking_reduction, item => `<b>${escapeHtml(item.text)}</b><em>${escapeHtml(item.type)}</em><span>${escapeHtml(item.note)}</span>`)}
    ${renderList("闪音提示", analysis.flap_t, item => `<b>${escapeHtml(item.text)}</b><span>${escapeHtml(item.note)}</span>`)}
    <section class="biread-pronunciation-ipa" hidden>
      <h2>关键词 IPA</h2>
      ${renderPlainList(analysis.ipa, item => `<b>${escapeHtml(item.word)}</b><span>${escapeHtml(item.ipa)}</span>`)}
    </section>
    <section>
      <h2>学习建议</h2>
      <p>${escapeHtml(analysis.practice_tip || "")}</p>
    </section>
  `;
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
  window.speechSynthesis?.cancel();
  panel?.remove();
  panel = null;
}

function removeSelectionButton() {
  selectionButton?.remove();
  selectionButton = null;
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
