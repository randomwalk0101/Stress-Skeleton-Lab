import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../shared/defaults.js";

const api = globalThis.browser || globalThis.chrome;
const memoryCache = new Map();

api.runtime.onInstalled.addListener(async () => {
  const { [STORAGE_KEYS.settings]: existing } = await api.storage.sync.get(STORAGE_KEYS.settings);
  if (!existing) {
    await api.storage.sync.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  }

  api.contextMenus.create({
    id: "biread-translate-selection",
    title: "Translate with BiRead",
    contexts: ["selection"]
  });

  api.contextMenus.create({
    id: "biread-open-reader",
    title: "Open BiRead local reader",
    contexts: ["action"]
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "biread-open-reader") {
    api.tabs.create({ url: api.runtime.getURL("src/reader/reader.html") });
    return;
  }

  if (info.menuItemId === "biread-translate-selection" && tab?.id && info.selectionText) {
    const settings = await getSettings();
    const translatedText = await translateText(info.selectionText, settings);
    api.tabs.sendMessage(tab.id, {
      type: "BIREAD_SELECTION_TRANSLATED",
      originalText: info.selectionText,
      translatedText
    });
  }
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "BIREAD_GET_SETTINGS") {
    getSettings().then(settings => sendResponse({ ok: true, settings }), error => sendResponse(toError(error)));
    return true;
  }

  if (message.type === "BIREAD_SAVE_SETTINGS") {
    saveSettings(message.settings).then(settings => sendResponse({ ok: true, settings }), error => sendResponse(toError(error)));
    return true;
  }

  if (message.type === "BIREAD_TRANSLATE") {
    getSettings()
      .then(settings => translateText(message.text, { ...settings, ...message.options }))
      .then(text => sendResponse({ ok: true, text }))
      .catch(error => sendResponse(toError(error)));
    return true;
  }

  if (message.type === "BIREAD_TRANSLATE_BATCH") {
    getSettings()
      .then(settings => translateBatch(message.items || [], { ...settings, ...message.options }))
      .then(items => sendResponse({ ok: true, items }))
      .catch(error => sendResponse(toError(error)));
    return true;
  }

  if (message.type === "BIREAD_LOOKUP_WORD") {
    getSettings()
      .then(settings => lookupWord(message.word, settings))
      .then(entry => sendResponse({ ok: true, entry }))
      .catch(error => sendResponse(toError(error)));
    return true;
  }

  if (message.type === "BIREAD_ANALYZE_PRONUNCIATION") {
    getSettings()
      .then(settings => analyzePronunciation(message.text, settings))
      .then(analysis => sendResponse({ ok: true, analysis }))
      .catch(error => sendResponse(toError(error)));
    return true;
  }

  return false;
});

async function getSettings() {
  const stored = await api.storage.sync.get(STORAGE_KEYS.settings);
  const local = await api.storage.local.get(STORAGE_KEYS.secrets);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored[STORAGE_KEYS.settings] || {}),
    ...(local[STORAGE_KEYS.secrets] || {})
  };
}

async function saveSettings(nextSettings) {
  const settings = { ...DEFAULT_SETTINGS, ...nextSettings };
  const { openaiApiKey, openaiModel, ...syncSettings } = settings;
  await api.storage.sync.set({ [STORAGE_KEYS.settings]: syncSettings });
  await api.storage.local.set({
    [STORAGE_KEYS.secrets]: {
      openaiApiKey: openaiApiKey || "",
      openaiModel: openaiModel || DEFAULT_SETTINGS.openaiModel
    }
  });
  return { ...syncSettings, openaiApiKey: openaiApiKey || "", openaiModel: openaiModel || DEFAULT_SETTINGS.openaiModel };
}

async function translateBatch(items, settings) {
  const limited = items.filter(item => item?.text).slice(0, settings.maxPageItems || DEFAULT_SETTINGS.maxPageItems);
  const translated = [];
  for (const item of limited) {
    translated.push({ id: item.id, text: await translateText(item.text, settings) });
  }
  return translated;
}

async function translateText(rawText, settings) {
  const text = normalizeText(rawText);
  if (!text) return "";

  const target = settings.targetLanguage || "zh-CN";
  const source = chooseSourceLanguage(text, settings.sourceLanguage || "auto", target);
  if (source === target) return text;

  const cacheKey = `${settings.provider}:${source}:${target}:${text}`;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  const storedCache = await api.storage.local.get(STORAGE_KEYS.cache);
  const diskCache = storedCache[STORAGE_KEYS.cache] || {};
  if (diskCache[cacheKey]) {
    memoryCache.set(cacheKey, diskCache[cacheKey]);
    return diskCache[cacheKey];
  }

  const translated = settings.provider === "libretranslate"
    ? await translateWithLibre(text, source, target, settings)
    : await translateWithMyMemory(text, source, target);

  memoryCache.set(cacheKey, translated);
  const nextCache = trimCache({ ...diskCache, [cacheKey]: translated });
  await api.storage.local.set({ [STORAGE_KEYS.cache]: nextCache });
  return translated;
}

async function translateWithLibre(text, source, target, settings) {
  const endpoint = settings.libreEndpoint || DEFAULT_SETTINGS.libreEndpoint;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: source === "auto" ? "auto" : source,
      target: target === "zh-CN" ? "zh" : target,
      format: "text",
      api_key: settings.libreApiKey || undefined
    })
  });

  if (!response.ok) throw new Error(`LibreTranslate failed: ${response.status}`);
  const data = await response.json();
  return data.translatedText || text;
}

async function translateWithMyMemory(text, source, target) {
  const langpair = `${source === "auto" ? detectLanguage(text) : source}|${target === "zh-CN" ? "zh-CN" : target}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MyMemory failed: ${response.status}`);
  const data = await response.json();
  return data?.responseData?.translatedText || text;
}

async function lookupWord(rawWord, settings) {
  const word = String(rawWord || "").toLowerCase().replace(/[^a-z'-]/g, "").trim();
  if (!word || word.length > 48) throw new Error("No word to look up");

  const cacheKey = `dict:${word}`;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  let phonetic = "";
  let audio = "";
  let englishMeaning = "";

  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (response.ok) {
    const data = await response.json();
    const first = data?.[0];
    phonetic = first?.phonetic || first?.phonetics?.find(item => item.text)?.text || "";
    audio = first?.phonetics?.find(item => item.audio)?.audio || "";
    const definitions = first?.meanings?.flatMap(meaning => meaning.definitions || []) || [];
    englishMeaning = definitions.slice(0, 2).map(item => item.definition).filter(Boolean).join("; ");
  }

  const translated = await translateText(englishMeaning || word, {
    ...settings,
    sourceLanguage: "en",
    targetLanguage: "zh-CN"
  });

  const entry = {
    word,
    phonetic,
    audio,
    meaning: translated,
    englishMeaning
  };
  memoryCache.set(cacheKey, entry);
  return entry;
}

async function analyzePronunciation(rawText, settings) {
  const text = String(rawText || "").replace(/\s+/g, " ").trim().slice(0, 2400);
  if (!text) throw new Error("Please select English text first.");
  if (!settings.openaiApiKey) throw new Error("OpenAI API key is not configured. Open the extension options page and save your key.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.openaiModel || DEFAULT_SETTINGS.openaiModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are an American English pronunciation coach for Chinese-speaking learners. Return only valid JSON matching the requested shape. Keep Chinese notes concise and practical."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPronunciationPrompt(text)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "pronunciation_analysis",
          strict: true,
          schema: pronunciationSchema()
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI request failed: ${response.status}`);
  }

  return parseOpenAIJson(data);
}

function buildPronunciationPrompt(text) {
  return `Analyze this selected English text for American English pronunciation practice.

Selected text:
${text}

Return JSON with:
- original: the exact original text
- stress_skeleton: phrase groups split with /, marking main stressed words in uppercase
- word_stress: multi-syllable words only; mark stressed syllables in uppercase, with a short Chinese note
- linking_reduction: weak forms, linking, reductions, elision, concise Chinese notes
- flap_t: /t/ or /d/ places that may become American flap, concise Chinese notes
- ipa: important words only, with General American IPA
- practice_tip: one short Chinese sentence telling the learner what to imitate most`;
}

function pronunciationSchema() {
  const item = properties => ({
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties)
  });

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      original: { type: "string" },
      stress_skeleton: { type: "string" },
      word_stress: {
        type: "array",
        items: item({
          word: { type: "string" },
          stress: { type: "string" },
          note: { type: "string" }
        })
      },
      linking_reduction: {
        type: "array",
        items: item({
          text: { type: "string" },
          type: { type: "string" },
          note: { type: "string" }
        })
      },
      flap_t: {
        type: "array",
        items: item({
          text: { type: "string" },
          note: { type: "string" }
        })
      },
      ipa: {
        type: "array",
        items: item({
          word: { type: "string" },
          ipa: { type: "string" }
        })
      },
      practice_tip: { type: "string" }
    },
    required: ["original", "stress_skeleton", "word_stress", "linking_reduction", "flap_t", "ipa", "practice_tip"]
  };
}

function parseOpenAIJson(data) {
  const outputText = data.output_text || data.output?.flatMap(item => item.content || [])
    .map(part => part.text || "")
    .join("")
    .trim();
  if (!outputText) throw new Error("OpenAI returned an empty response.");

  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new Error("OpenAI response was not valid JSON.");
  }
}

function chooseSourceLanguage(text, sourceLanguage, targetLanguage) {
  if (sourceLanguage !== "auto") return sourceLanguage;
  const detected = detectLanguage(text);
  return detected === targetLanguage ? (targetLanguage === "en" ? "zh-CN" : "en") : detected;
}

function detectLanguage(text) {
  return /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en";
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function trimCache(cache) {
  const entries = Object.entries(cache);
  if (entries.length <= 500) return cache;
  return Object.fromEntries(entries.slice(entries.length - 500));
}

function toError(error) {
  return { ok: false, error: error?.message || String(error) };
}
