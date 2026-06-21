import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../shared/defaults.js";

const api = globalThis.browser || globalThis.chrome;
const memoryCache = new Map();
api.runtime.onInstalled.addListener(async () => {
  const { [STORAGE_KEYS.settings]: existing } = await api.storage.sync.get(STORAGE_KEYS.settings);
  if (!existing) {
    await api.storage.sync.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
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

  if (message.type === "BIREAD_TTS_LOCAL") {
    getSettings()
      .then(settings => synthesizeWithLocalTts(message.text, message.rate, settings))
      .then(audio => sendResponse({ ok: true, audio }))
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
  const { openaiApiKey, openaiModel, geminiApiKey, geminiModel, ...syncSettings } = settings;
  await api.storage.sync.set({ [STORAGE_KEYS.settings]: syncSettings });
  await api.storage.local.set({
    [STORAGE_KEYS.secrets]: {
      openaiApiKey: openaiApiKey || "",
      openaiModel: openaiModel || DEFAULT_SETTINGS.openaiModel,
      geminiApiKey: geminiApiKey || "",
      geminiModel: geminiModel || DEFAULT_SETTINGS.geminiModel
    }
  });
  return {
    ...syncSettings,
    openaiApiKey: openaiApiKey || "",
    openaiModel: openaiModel || DEFAULT_SETTINGS.openaiModel,
    geminiApiKey: geminiApiKey || "",
    geminiModel: geminiModel || DEFAULT_SETTINGS.geminiModel
  };
}

async function analyzePronunciation(rawText, settings) {
  const text = cleanPronunciationText(rawText).slice(0, 2400);
  if (!text) throw new Error("Please select English text first.");
  if (settings.pronunciationProvider === "local" || (!settings.openaiApiKey && !settings.geminiApiKey)) {
    return buildLocalPronunciationAnalysis(text, settings);
  }
  const provider = settings.pronunciationProvider === "gemini" && settings.geminiApiKey
    ? "gemini"
    : "openai";

  try {
    return await (provider === "gemini"
      ? analyzePronunciationWithGemini(text, settings)
      : analyzePronunciationWithOpenAI(text, settings));
  } catch {
    return buildLocalPronunciationAnalysis(text, settings);
  }
}

async function lookupWord(rawWord, settings) {
  const word = String(rawWord || "").toLowerCase().replace(/[^a-z'-]/g, "").trim();
  if (!word || word.length > 48) throw new Error("No word to look up");

  const cacheKey = `dict:${word}`;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  let phonetic = "";
  let audio = "";
  let englishMeaning = "";

  const response = await fetchWithTimeout(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    {},
    8000
  );
  if (response.ok) {
    const data = await response.json();
    const first = data?.[0];
    phonetic = first?.phonetic || first?.phonetics?.find(item => item.text)?.text || "";
    audio = first?.phonetics?.find(item => item.audio)?.audio || "";
    const definitions = first?.meanings?.flatMap(meaning => meaning.definitions || []) || [];
    englishMeaning = definitions.slice(0, 2).map(item => item.definition).filter(Boolean).join("; ");
  }

  const entry = {
    word,
    phonetic,
    audio,
    meaning: englishMeaning || word,
    englishMeaning
  };
  memoryCache.set(cacheKey, entry);
  return entry;
}

async function analyzePronunciationWithOpenAI(text, settings) {
  if (!settings.openaiApiKey) throw new Error("OpenAI API key is not configured in this Safari extension build. Open Options, paste the key again, and save.");

  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
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
              text: "You are an American English pronunciation coach for English learners. Return only valid JSON matching the requested shape. Keep Chinese notes concise and practical."
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
  }, 12000);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI request failed: ${response.status}`);
  }

  return parseOpenAIJson(data);
}

async function buildLocalPronunciationAnalysis(text, settings) {
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const uniqueWords = [...new Set(words.map(word => word.replace(/^['-]+|['-]+$/g, "")))];
  const importantWords = uniqueWords
    .filter(word => isContentWord(word) && countSyllables(word) >= 2)
    .sort((a, b) => scoreStressWord(b) - scoreStressWord(a))
    .slice(0, 12);

  return {
    original: text,
    stress_skeleton: buildLocalStressSkeleton(text),
    word_stress: importantWords.map(word => ({
      word,
      stress: markLikelyStress(word),
      note: explainStressRule(word)
    })),
    linking_reduction: findLocalLinkingHints(text),
    flap_t: findLocalFlapHints(text),
    intonation_pause: buildLocalIntonationHints(text),
    sound_focus: buildLocalSoundFocus(text),
    ipa_keywords: [],
    practice_tip: "本地规则分析：先按 / 断意群，重读大写内容词，功能词轻读并连接。"
  };
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

function markLikelyStress(word) {
  const syllables = splitRoughSyllables(word);
  if (syllables.length <= 1) return word;
  const stressIndex = likelyStressIndex(word, syllables);
  return syllables
    .map((part, index) => index === stressIndex ? part.toUpperCase() : part.toLowerCase())
    .join("-");
}

function explainStressRule(word) {
  if (/(tion|sion|cian)$/i.test(word)) return "-tion/-sion 前一音节常重读。";
  if (/(ic|ical|ity|ety|graphy|logy)$/i.test(word)) return "这类后缀通常让前一音节重读。";
  if (/(ee|eer|ese|ette|oon)$/i.test(word)) return "这类后缀本身常带重音。";
  if (/^(un|re|pre|dis|mis|non|over|under)/i.test(word)) return "前缀通常不重读，重心多在词根。";
  return "多音节内容词通常承载句子重音。";
}

function likelyStressIndex(word, syllables) {
  if (/(ee|eer|ese|ette|oon)$/i.test(word)) return syllables.length - 1;
  if (/(tion|sion|cian|ic|ical|ity|ety|graphy|logy)$/i.test(word)) return Math.max(0, syllables.length - 2);
  if (/^(un|re|pre|dis|mis|non|over|under)/i.test(word) && syllables.length > 1) return 1;
  if (syllables.length === 2) return isLikelyVerb(word) ? 1 : 0;
  return Math.max(0, syllables.length - 2);
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

function scoreStressWord(word) {
  return word.length + countSyllables(word) * 3 + (/(tion|sion|ity|ic|ical)$/i.test(word) ? 8 : 0);
}

function isLikelyVerb(word) {
  return /(ate|ise|ize|fy|en)$/i.test(word);
}

function isFunctionWord(word) {
  return /^(a|an|the|and|or|but|so|yet|for|nor|to|of|in|on|at|by|from|with|as|into|onto|than|that|which|who|whom|whose|this|these|those|it|its|they|them|their|he|she|we|you|your|i|me|my|our|is|are|was|were|be|been|being|am|do|does|did|have|has|had|can|could|should|would|will|may|might|must)$/i.test(word);
}

function isContentWord(word) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(word) && !isFunctionWord(word);
}

function cleanWord(word) {
  return word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
}

function isVowelStart(word) {
  return /^[aeiou]/i.test(cleanWord(word));
}

function isConsonantEnd(word) {
  return /[bcdfghjklmnpqrstvwxyz]$/i.test(cleanWord(word));
}

function isVowelEnd(word) {
  return /[aeiou]$/i.test(cleanWord(word));
}

function pairWords(text) {
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const pairs = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    pairs.push([words[index], words[index + 1]]);
  }
  return pairs;
}

function findLocalLinkingHints(text) {
  const hints = [];
  for (const [first, second] of pairWords(text)) {
    if (hints.length >= 10) break;
    if (isFunctionWord(first)) {
      hints.push({ text: `${first} ${second}`, type: "弱读", note: `${first} 通常弱读，贴到后面的词。` });
      continue;
    }
    if (isConsonantEnd(first) && isVowelStart(second)) {
      hints.push({ text: `${first} ${second}`, type: "辅音+元音连读", note: "前词尾辅音接到后词开头元音。" });
      continue;
    }
    if (isVowelEnd(first) && isVowelStart(second)) {
      hints.push({ text: `${first} ${second}`, type: "元音连读", note: "两个元音之间可加轻微 /j/ 或 /w/ 过渡。 " });
    }
  }
  return hints;
}

function findLocalFlapHints(text) {
  const matches = text.match(/\b\w*[aeiou]t[aeiou]\w*\b/gi) || [];
  return matches.slice(0, 6).map(match => ({
    text: match,
    note: "美音中两个元音之间的 t 可能接近闪音。"
  }));
}

function buildLocalIntonationHints(text) {
  const chunks = text
    .split(/(?<=[.!?])\s+|;\s+|,\s+/)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .slice(0, 6);

  return chunks.map(chunk => {
    const last = chunk.slice(-1);
    const pattern = last === "?" ? "升调或升降调" : "降调";
    const note = last === "?"
      ? "疑问句末尾保持一点上扬，重点词仍要读清楚。"
      : "陈述信息末尾自然下降，逗号处短停不断气。";
    return { text: chunk, pattern, note };
  });
}

function buildLocalSoundFocus(text) {
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const candidates = [];
  const rules = [
    { pattern: /th/i, sound: "/θ/ /ð/", note: "舌尖轻放齿间，不要读成 /s/、/z/ 或 /d/。" },
    { pattern: /r/i, sound: "/r/", note: "美音 r 舌尖后卷或舌身收紧，元音后也要保留。" },
    { pattern: /v/i, sound: "/v/", note: "上齿轻触下唇并振动，不要读成 /w/。" },
    { pattern: /w/i, sound: "/w/", note: "先圆唇再滑向后面的元音。" },
    { pattern: /l/i, sound: "/l/", note: "词尾 l 要有舌尖抵上齿龈的收尾。" }
  ];

  for (const word of words) {
    if (candidates.length >= 6) break;
    const clean = cleanWord(word);
    if (candidates.some(item => item.text.toLowerCase() === clean.toLowerCase())) continue;
    const rule = rules.find(entry => entry.pattern.test(clean));
    if (rule && clean.length > 2) {
      candidates.push({ text: clean, sound: rule.sound, note: rule.note });
    }
  }

  return candidates;
}

async function analyzePronunciationWithGemini(text, settings) {
  if (!settings.geminiApiKey) throw new Error("Gemini API key is not configured. Open the extension options page and save your key.");

  const model = encodeURIComponent(settings.geminiModel || DEFAULT_SETTINGS.geminiModel);
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{
          text: "You are an American English pronunciation coach for English learners. Return only valid JSON matching the requested shape. Keep Chinese notes concise and practical."
        }]
      },
      contents: [{
        parts: [{ text: buildPronunciationPrompt(text) }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiPronunciationSchema()
      }
    })
  }, 12000);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini request failed: ${response.status}`);
  }

  return parseGeminiJson(data);
}

function buildPronunciationPrompt(text) {
  return `Analyze this selected English text for American English pronunciation practice.

Selected text:
${text}

Return JSON with:
- original: the exact original text
- stress_skeleton: phrase groups split with /, marking main stressed words in uppercase
- word_stress: multi-syllable words only; mark stressed syllables in uppercase, with a short Chinese note
- linking_reduction: the 3 to 8 most useful weak forms, linking, reductions, and elisions; concise Chinese notes; do not over-analyze
- flap_t: /t/ or /d/ places that may become American flap, concise Chinese notes
- intonation_pause: phrase-level intonation and pause advice for 2 to 6 chunks; concise Chinese notes
- sound_focus: likely difficult sounds for English learners, such as /θ/, /ð/, /r/, /v/, /w/, final /l/; concise Chinese notes
- ipa_keywords: important words only, with General American IPA; do not transcribe the whole sentence
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
      intonation_pause: {
        type: "array",
        items: item({
          text: { type: "string" },
          pattern: { type: "string" },
          note: { type: "string" }
        })
      },
      sound_focus: {
        type: "array",
        items: item({
          text: { type: "string" },
          sound: { type: "string" },
          note: { type: "string" }
        })
      },
      ipa_keywords: {
        type: "array",
        items: item({
          word: { type: "string" },
          ipa: { type: "string" }
        })
      },
      practice_tip: { type: "string" }
    },
    required: ["original", "stress_skeleton", "word_stress", "linking_reduction", "flap_t", "intonation_pause", "sound_focus", "ipa_keywords", "practice_tip"]
  };
}

function geminiPronunciationSchema() {
  const item = properties => ({
    type: "OBJECT",
    properties,
    required: Object.keys(properties)
  });

  return {
    type: "OBJECT",
    properties: {
      original: { type: "STRING" },
      stress_skeleton: { type: "STRING" },
      word_stress: {
        type: "ARRAY",
        items: item({
          word: { type: "STRING" },
          stress: { type: "STRING" },
          note: { type: "STRING" }
        })
      },
      linking_reduction: {
        type: "ARRAY",
        items: item({
          text: { type: "STRING" },
          type: { type: "STRING" },
          note: { type: "STRING" }
        })
      },
      flap_t: {
        type: "ARRAY",
        items: item({
          text: { type: "STRING" },
          note: { type: "STRING" }
        })
      },
      intonation_pause: {
        type: "ARRAY",
        items: item({
          text: { type: "STRING" },
          pattern: { type: "STRING" },
          note: { type: "STRING" }
        })
      },
      sound_focus: {
        type: "ARRAY",
        items: item({
          text: { type: "STRING" },
          sound: { type: "STRING" },
          note: { type: "STRING" }
        })
      },
      ipa_keywords: {
        type: "ARRAY",
        items: item({
          word: { type: "STRING" },
          ipa: { type: "STRING" }
        })
      },
      practice_tip: { type: "STRING" }
    },
    required: ["original", "stress_skeleton", "word_stress", "linking_reduction", "flap_t", "intonation_pause", "sound_focus", "ipa_keywords", "practice_tip"],
    propertyOrdering: ["original", "stress_skeleton", "word_stress", "linking_reduction", "flap_t", "intonation_pause", "sound_focus", "ipa_keywords", "practice_tip"]
  };
}

function parseOpenAIJson(data) {
  const outputText = data.output_text || data.output?.flatMap(item => item.content || [])
    .map(part => part.text || "")
    .join("")
    .trim();
  if (!outputText) throw new Error("OpenAI returned an empty response.");

  try {
    return normalizePronunciationAnalysis(JSON.parse(outputText));
  } catch (error) {
    throw new Error("OpenAI response was not valid JSON.");
  }
}

function parseGeminiJson(data) {
  const outputText = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();
  if (!outputText) throw new Error("Gemini returned an empty response.");

  try {
    return normalizePronunciationAnalysis(JSON.parse(outputText));
  } catch (error) {
    throw new Error("Gemini response was not valid JSON.");
  }
}

async function synthesizeWithLocalTts(rawText, rawRate, settings) {
  const text = String(rawText || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!text) throw new Error("No text to speak.");

  const endpoint = String(settings.localTtsEndpoint || DEFAULT_SETTINGS.localTtsEndpoint).replace(/\/+$/, "");
  const response = await fetchWithTimeout(`${endpoint}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice: "en-US-JennyNeural",
      rate: Number(rawRate) || 1
    })
  }, 12000);

  if (!response.ok) throw new Error(`Local TTS failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  return {
    mimeType: response.headers.get("content-type") || "audio/mpeg",
    dataUrl: `data:${response.headers.get("content-type") || "audio/mpeg"};base64,${base64}`
  };
}

function normalizePronunciationAnalysis(analysis) {
  const cleanItems = (items, fields, limit = Infinity) => (Array.isArray(items) ? items.slice(0, limit) : [])
    .map(item => {
      const next = { ...item };
      for (const field of fields) {
        if (field in next) next[field] = cleanPronunciationText(next[field]);
      }
      return next;
    });

  return {
    original: cleanPronunciationText(analysis?.original || ""),
    stress_skeleton: cleanPronunciationText(analysis?.stress_skeleton || ""),
    word_stress: cleanItems(analysis?.word_stress, ["word", "stress", "note"]),
    linking_reduction: cleanItems(analysis?.linking_reduction, ["text", "type", "note"], 8),
    flap_t: cleanItems(analysis?.flap_t, ["text", "note"]),
    intonation_pause: cleanItems(analysis?.intonation_pause, ["text", "pattern", "note"], 6),
    sound_focus: cleanItems(analysis?.sound_focus, ["text", "sound", "note"], 6),
    ipa_keywords: cleanItems(Array.isArray(analysis?.ipa_keywords) ? analysis.ipa_keywords : (Array.isArray(analysis?.ipa) ? analysis.ipa : []), ["word", "ipa"]),
    practice_tip: String(analysis?.practice_tip || "")
  };
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


async function fetchWithTimeout(input, init = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function toError(error) {
  return { ok: false, error: error?.message || String(error) };
}
