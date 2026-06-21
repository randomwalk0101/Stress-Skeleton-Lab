import { sendMessage } from "../shared/browser.js";

const fileInput = document.getElementById("fileInput");
const documentNode = document.getElementById("document");
const statusNode = document.getElementById("status");

document.getElementById("translate").addEventListener("click", translateDocument);
fileInput.addEventListener("change", loadFile);

async function loadFile() {
  const file = fileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  const paragraphs = splitDocument(text, file.name);
  documentNode.textContent = "";
  for (const paragraph of paragraphs) {
    const node = document.createElement("p");
    node.className = "para";
    node.textContent = paragraph;
    documentNode.appendChild(node);
  }
  statusNode.textContent = `${paragraphs.length} sections loaded`;
}

async function translateDocument() {
  const nodes = Array.from(documentNode.querySelectorAll(".para"));
  const mode = document.getElementById("mode").value;
  const items = nodes.map((node, index) => ({ id: String(index), text: node.firstChild?.textContent || node.textContent }));
  if (!items.length) return;

  statusNode.textContent = "Translating";
  const response = await sendMessage({ type: "BIREAD_TRANSLATE_BATCH", items });
  if (!response?.ok) {
    statusNode.textContent = response?.error || "Translation failed";
    return;
  }

  const byId = new Map(response.items.map(item => [item.id, item.text]));
  nodes.forEach((node, index) => {
    const translated = byId.get(String(index));
    node.querySelector(".translation")?.remove();
    if (mode === "translation") {
      node.textContent = translated;
    } else if (mode === "bilingual") {
      const span = document.createElement("span");
      span.className = "translation";
      span.textContent = translated;
      node.appendChild(span);
    }
  });
  statusNode.textContent = "Done";
}

function splitDocument(text, name) {
  const clean = name.match(/\.html?$/i) ? htmlToText(text) : stripSubtitleTiming(text);
  return clean
    .split(/\n{2,}/)
    .map(part => part.replace(/\s+\n/g, "\n").trim())
    .filter(part => part.length > 0)
    .slice(0, 300);
}

function htmlToText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
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
