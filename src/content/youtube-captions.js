if (!globalThis.__bireadYoutubeCaptionsLoaded) {
  globalThis.__bireadYoutubeCaptionsLoaded = true;

  let youtubeSettings = null;
  let lastCaption = "";
  let pollTimer = 0;

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
        if (!youtubeSettings?.enabled || !youtubeSettings?.youtubeStressOverlay) {
          removeOverlay();
        }
      }
    });

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(scheduleUpdate, 900);
    scheduleUpdate();
  }

  function scheduleUpdate() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(handleCaptionMutation, 90);
  }

  function handleCaptionMutation() {
    if (!youtubeSettings?.enabled || !youtubeSettings?.youtubeStressOverlay) {
      removeOverlay();
      lastCaption = "";
      return;
    }

    const caption = readCaptionText();
    if (!caption) {
      removeOverlay();
      lastCaption = "";
      return;
    }
    if (caption === lastCaption) return;
    lastCaption = caption;

    if (!isLikelyEnglishCaption(caption)) {
      removeOverlay();
      return;
    }

    renderYouTubeOverlay(caption, buildLocalStressSkeleton(caption));
  }

  function readCaptionText() {
    const segments = Array.from(document.querySelectorAll(".ytp-caption-segment"));
    return segments
      .map(segment => segment.textContent.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function renderYouTubeOverlay(original, skeleton) {
    const overlay = getOverlay();
    overlay.innerHTML = "";
    overlay.appendChild(line(original, "biread-youtube-overlay__original"));
    overlay.appendChild(line(skeleton, "biread-youtube-overlay__skeleton"));
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

  function line(text, className) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  function removeOverlay() {
    document.querySelector(".biread-youtube-overlay")?.remove();
  }

  function isLikelyEnglishCaption(text) {
    const letters = text.match(/[A-Za-z]/g) || [];
    if (!letters.length) return false;
    const cjk = text.match(/[\u3400-\u9fff]/g) || [];
    return letters.length >= Math.max(6, cjk.length * 2);
  }

  function buildLocalStressSkeleton(text) {
    return text
      .split(/(?<=[.!?;:])\s+|,\s+/)
      .map(sentence => sentence
        .split(/\s+/)
        .map(markSentenceWordForStress)
        .join(" "))
      .filter(Boolean)
      .join(" / ");
  }

  function markSentenceWordForStress(word) {
    const clean = word.replace(/[^A-Za-z'-]/g, "");
    if (!clean) return word;
    if (isFunctionWord(clean)) return word.toLowerCase();
    if (isContentWord(clean) && (clean.length >= 5 || countSyllables(clean) >= 2)) {
      return word.replace(clean, clean.toUpperCase());
    }
    return word;
  }

  function splitRoughSyllables(word) {
    const clean = word.toLowerCase().replace(/[^a-z]/g, "");
    const groups = clean.match(/[bcdfghjklmnpqrstvwxyz]*[aeiouy]+(?:[bcdfghjklmnpqrstvwxyz](?![aeiouy]))?/g) || [clean];
    if (groups.length > 1 && groups.at(-1) === "e") groups.pop();
    return groups.length ? groups : [word];
  }

  function countSyllables(word) {
    return splitRoughSyllables(word).length;
  }

  function isFunctionWord(word) {
    return /^(a|an|the|and|or|but|so|yet|for|nor|to|of|in|on|at|by|from|with|as|into|onto|than|that|which|who|whom|whose|this|these|those|it|its|they|them|their|he|she|we|you|your|i|me|my|our|is|are|was|were|be|been|being|am|do|does|did|have|has|had|can|could|should|would|will|may|might|must)$/i.test(word);
  }

  function isContentWord(word) {
    return /^[A-Za-z][A-Za-z'-]*$/.test(word) && !isFunctionWord(word);
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
