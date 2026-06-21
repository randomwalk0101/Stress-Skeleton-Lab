import { sendMessage } from "../shared/browser.js";
import * as pdfjsLib from "../vendor/pdf.min.mjs";

const fileInput = document.getElementById("fileInput");
const documentNode = document.getElementById("document");
const statusNode = document.getElementById("status");
let selectedText = "";
let selectionButton = null;
let panel = null;
let activeAudio = null;
let repeatAbort = false;
let selectedRect = null;
let selectedHostNode = null;

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("src/vendor/pdf.worker.min.mjs");

document.getElementById("analyzeSelection").addEventListener("click", analyzeCurrentSelection);
fileInput.addEventListener("change", loadFile);
document.addEventListener("mouseup", handleSelection, true);
document.addEventListener("keyup", handleSelection, true);
document.addEventListener("mousedown", event => {
  if (!event.target.closest?.(".biread-pronunciation-button, .biread-pronunciation-panel")) {
    removeSelectionButton();
  }
}, true);

async function loadFile() {
  const file = fileInput.files?.[0];
  if (!file) return;

  statusNode.textContent = "Loading document";
  try {
    const { text, source } = await readDocumentText(file);
    const paragraphs = splitDocument(text, file.name);
    renderParagraphs(paragraphs, source);
    statusNode.textContent = `${paragraphs.length} sections loaded`;
  } catch (error) {
    documentNode.textContent = "";
    statusNode.textContent = error?.message || "Could not load document";
  }
}

function splitDocument(text, name) {
  const clean = name.match(/\.html?$/i) ? htmlToText(text) : stripSubtitleTiming(text);
  const paragraphs = clean
    .split(/\n{2,}/)
    .map(part => part.replace(/\s+\n/g, "\n").trim())
    .filter(part => part.length > 0)
    .flatMap(splitLeadingUrlSection)
    .flatMap(part => splitLongSection(part, 900));
  return paragraphs.slice(0, 300);
}

function renderParagraphs(paragraphs, source = "text") {
  documentNode.textContent = "";
  for (const paragraph of paragraphs) {
    const node = document.createElement("p");
    node.className = "para";
    node.dataset.source = source;
    node.textContent = paragraph;
    documentNode.appendChild(node);
  }
}

function splitLeadingUrlSection(text) {
  const match = text.match(/^(https?:\/\/\S+)(?:\s+(.+))?$/is);
  if (!match) return [text];
  return [match[1], match[2]].filter(Boolean);
}

function splitLongSection(text, maxLength) {
  if (text.length <= maxLength) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const sections = [];
  let current = "";

  for (const sentence of sentences.length ? sentences : [text]) {
    if ((current + " " + sentence).trim().length <= maxLength) {
      current = (current + " " + sentence).trim();
      continue;
    }
    if (current) sections.push(current);
    if (sentence.length <= maxLength) {
      current = sentence;
    } else {
      for (let index = 0; index < sentence.length; index += maxLength) {
        sections.push(sentence.slice(index, index + maxLength));
      }
      current = "";
    }
  }

  if (current) sections.push(current);
  return sections;
}

async function readDocumentText(file) {
  if (isPdf(file)) return { text: await readPdfText(file), source: "pdf" };
  return { text: await file.text(), source: "text" };
}

function isPdf(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

async function readPdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = reconstructPdfPageText(content.items);
    if (text) pages.push(text);
  }

  if (!pages.length) {
    throw new Error("No selectable text found in this PDF");
  }

  return pages.join("\n\n");
}

function reconstructPdfPageText(items) {
  const runs = dedupePdfRuns(items
    .map(item => {
      const str = "str" in item ? item.str : "";
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      return {
        str,
        x: transform[4] || 0,
        y: transform[5] || 0,
        width: item.width || 0
      };
    })
    .filter(item => item.str));

  const lines = [];
  for (const run of runs) {
    let line = lines.find(entry => Math.abs(entry.y - run.y) < 3);
    if (!line) {
      line = { y: run.y, runs: [] };
      lines.push(line);
    }
    line.runs.push(run);
  }

  const textLines = lines
    .sort((a, b) => b.y - a.y)
    .map(line => {
      const sorted = line.runs.sort((a, b) => a.x - b.x);
      const widths = sorted
        .map(run => run.width / Math.max(run.str.length, 1))
        .filter(width => Number.isFinite(width) && width > 0);
      const averageCharWidth = widths.length
        ? widths.reduce((sum, width) => sum + width, 0) / widths.length
        : 5;
      let output = "";
      let previousEnd = null;

      for (const run of sorted) {
        const text = run.str.replace(/\s+/g, " ");
        const gap = previousEnd === null ? 0 : run.x - previousEnd;
        if (output && gap > averageCharWidth * 0.8 && !output.endsWith(" ") && !text.startsWith(" ")) {
          output += " ";
        }
        output += text;
        previousEnd = run.x + (run.width || text.length * averageCharWidth);
      }

      return output.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);

  return reflowPdfLines(textLines);
}

function dedupePdfRuns(runs) {
  const kept = [];
  for (const run of runs) {
    const duplicate = kept.some(existing =>
      existing.str === run.str
      && Math.abs(existing.x - run.x) < 1
      && Math.abs(existing.y - run.y) < 1
    );
    if (!duplicate) kept.push(run);
  }
  return kept;
}

function reflowPdfLines(lines) {
  const paragraphs = [];
  let current = "";

  for (const line of lines) {
    if (isStandalonePdfLine(line, current)) {
      if (current) paragraphs.push(current.trim());
      current = line;
      continue;
    }

    if (!current) {
      current = line;
      continue;
    }

    if (shouldStartNewParagraph(current, line)) {
      paragraphs.push(current.trim());
      current = line;
    } else {
      current = `${current} ${line}`.replace(/\s+/g, " ");
    }
  }

  if (current) paragraphs.push(current.trim());

  return paragraphs
    .map(paragraph => normalizeReaderParagraph(paragraph))
    .map(cleanPronunciationText)
    .join("\n\n");
}

function isStandalonePdfLine(line, current) {
  if (/^(READING PASSAGE|Questions?\s+\d|Solution:|Part\s+\d|TRUE\b|FALSE\b|NOT GIVEN\b)/i.test(line)) return true;
  if (/^https?:\/\//i.test(line)) return true;
  if (line.length <= 48 && /^[A-Z][A-Za-z0-9 ,:'’"-]+$/.test(line) && /[.!?]$/.test(current)) return true;
  return false;
}

function shouldStartNewParagraph(previous, next) {
  if (/^https?:\/\//i.test(previous)) return true;
  if (/^(READING PASSAGE|Questions?\s+\d|Solution:|Part\s+\d|TRUE\b|FALSE\b|NOT GIVEN\b)/i.test(next)) return true;
  if (/^\d+\s/.test(next) || /^[A-G]\s/.test(next)) return true;
  if (/[.!?]["'’)]?$/.test(previous) && /^[A-Z0-9]/.test(next) && previous.length > 140) return true;
  return false;
}

function normalizeReaderParagraph(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?%])/g, "$1")
    .replace(/([(\["'])\s+/g, "$1")
    .replace(/\s+([)\]"'])/g, "$1")
    .replace(/\s*([—–-])\s*/g, " $1 ")
    .replace(/"\s+/g, "\"")
    .replace(/\s+"/g, " \"")
    .trim();
}

function extractReadableWebText(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, svg, canvas, iframe, header nav, footer, .mw-editsection, .reference, .mw-ref, sup.reference").forEach(node => node.remove());

  const wikipediaRoot = doc.querySelector("#mw-content-text .mw-parser-output");
  const root = wikipediaRoot
    || doc.querySelector("article")
    || doc.querySelector("main")
    || doc.body;

  const paragraphs = Array.from(root.querySelectorAll("h1, h2, h3, p, li, blockquote"))
    .map(node => cleanPronunciationText(node.textContent || ""))
    .filter(Boolean);

  if (!paragraphs.length) {
    throw new Error("No readable text found on this page");
  }

  return [url, ...paragraphs].join("\n\n");
}

function handleSelection() {
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
  showPanel(
    response?.ok ? { analysis: response.analysis } : { error: response?.error || "Pronunciation analysis failed.", original: selectedText },
    selectedRect
  );
}

function analyzeCurrentSelection() {
  const text = cleanPronunciationText(getSelectionText(window.getSelection()));
  const fallbackText = selectedText;
  if (!isEnglishSelection(text) && !isEnglishSelection(fallbackText)) {
    showPanel({ error: "Please select a short English sentence or paragraph first.", original: "" });
    return;
  }
  selectedText = (text || fallbackText).slice(0, 2400);
  const selection = window.getSelection();
  selectedRect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
  selectedHostNode = selection?.rangeCount ? getSelectionHostNode(selection) : null;
  analyzeSelection();
}

function showPanel(state, anchorRect = null) {
  panel?.remove();
  panel = document.createElement("section");
  panel.className = "biread-pronunciation-panel";
  panel.innerHTML = buildPanelHtml(state);
  const inlineHost = selectedHostNode?.closest?.(".para");
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
  const sidebarWidth = document.querySelector("aside")?.getBoundingClientRect().right || 0;
  const availableLeft = window.scrollX + Math.max(sidebarWidth + viewportGap, viewportGap);
  const preferredWidth = Math.min(1120, window.innerWidth - (availableLeft - window.scrollX) - viewportGap);
  node.style.width = `${Math.max(360, preferredWidth)}px`;

  const anchorCenter = anchorRect.left + anchorRect.width / 2 + window.scrollX;
  const left = Math.max(
    availableLeft,
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
    ${hasIpaKeywords ? `<label class="biread-pronunciation-toggle">
      <input type="checkbox" data-show-ipa>
      显示关键词音标 IPA
    </label>` : ""}
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
  return `<section><h2>${title}</h2>${renderPlainList(items, renderer)}</section>`;
}

function renderPlainList(items = [], renderer) {
  if (!items?.length) return `<p class="biread-pronunciation-muted">No major points.</p>`;
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
  return sendMessage({ type: "BIREAD_TTS_LOCAL", text, rate })
    .then(response => {
      if (!response?.ok || !response.audio?.dataUrl) throw new Error("Local TTS unavailable");
      activeAudio?.pause();
      activeAudio = new Audio(response.audio.dataUrl);
      return activeAudio.play().then(() => new Promise(resolve => {
        activeAudio.onended = resolve;
        activeAudio.onerror = resolve;
      }));
    })
    .catch(() => speakWithBrowserVoice(text, rate));
}

function speakWithBrowserVoice(text, rate) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
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

function htmlToText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll([
    "sup.reference",
    "sup.noprint",
    ".reference",
    ".mw-ref",
    ".mw-editsection",
    ".citation"
  ].join(",")).forEach(element => element.remove());
  return Array.from(doc.body.querySelectorAll("h1,h2,h3,p,li"))
    .map(node => node.textContent.trim())
    .filter(Boolean)
    .join("\n\n");
}

function stripSubtitleTiming(text) {
  return text
    .replace(/^WEBVTT.*$/m, "")
    .replace(/^\d+\s*$/gm, "")
    .replace(/^\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{3}.*$/gm, "");
}
