let hoverSettings = null;
let hoverTimer = 0;
let currentWord = "";
let activeAudio = null;

initHoverDictionary();

async function initHoverDictionary() {
  const response = await sendMessage({ type: "BIREAD_GET_SETTINGS" }).catch(() => null);
  hoverSettings = response?.settings;
  if (!hoverSettings?.enabled) return;

  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("scroll", hideCard, true);

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "BIREAD_SETTINGS_UPDATED") {
      hoverSettings = { ...hoverSettings, ...message.settings };
    }
  });
}

function handleMouseMove(event) {
  if (!hoverSettings?.hoverDictionary || isEditable(event.target)) return;

  const hit = getWordAtPoint(event.clientX, event.clientY);
  if (!hit?.word || hit.word === currentWord) return;

  currentWord = hit.word;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => lookupAndShow(hit.word, event.clientX, event.clientY), 420);
}

async function lookupAndShow(word, x, y) {
  if (word !== currentWord) return;
  const response = await sendMessage({ type: "BIREAD_LOOKUP_WORD", word }).catch(() => null);
  if (!response?.ok) return;
  showCard(response.entry, x, y);
  speak(response.entry);
}

function getWordAtPoint(x, y) {
  if (!document.caretRangeFromPoint && !document.caretPositionFromPoint) return null;

  let range;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else {
    const position = document.caretPositionFromPoint(x, y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }

  const node = range?.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent || "";
  const offset = range.startOffset;
  const left = text.slice(0, offset).search(/[A-Za-z][A-Za-z'-]*$/);
  const rightMatch = text.slice(offset).match(/^[A-Za-z'-]*/);
  if (left < 0 || !rightMatch) return null;

  const word = (text.slice(left, offset) + rightMatch[0]).replace(/^'+|'+$/g, "");
  if (!/^[A-Za-z][A-Za-z'-]{1,47}$/.test(word)) return null;
  return { word };
}

function showCard(entry, x, y) {
  hideCard();
  const card = document.createElement("div");
  card.className = "biread-dict-card";
  card.innerHTML = `
    <div class="biread-dict-word"></div>
    <div class="biread-dict-phonetic"></div>
    <div class="biread-dict-meaning"></div>
  `;
  card.querySelector(".biread-dict-word").textContent = entry.word;
  card.querySelector(".biread-dict-phonetic").textContent = entry.phonetic || "No phonetic";
  card.querySelector(".biread-dict-meaning").textContent = entry.meaning;
  document.documentElement.appendChild(card);

  const rect = card.getBoundingClientRect();
  card.style.left = `${Math.min(x + 14, window.innerWidth - rect.width - 12)}px`;
  card.style.top = `${Math.min(y + 18, window.innerHeight - rect.height - 12)}px`;
}

function speak(entry) {
  if (!hoverSettings?.autoSpeak) return;
  if (entry.audio) {
    activeAudio?.pause();
    activeAudio = new Audio(entry.audio);
    activeAudio.play().catch(() => speakWithSystemVoice(entry.word));
    return;
  }
  speakWithSystemVoice(entry.word);
}

function speakWithSystemVoice(word) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function hideCard() {
  document.querySelector(".biread-dict-card")?.remove();
}

function isEditable(target) {
  return target?.closest?.("input, textarea, select, [contenteditable='true'], [role='textbox']");
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
