export const DEFAULT_SETTINGS = {
  enabled: true,
  targetLanguage: "zh-CN",
  sourceLanguage: "auto",
  displayMode: "bilingual",
  provider: "mymemory",
  libreEndpoint: "https://libretranslate.com/translate",
  libreApiKey: "",
  pageAutoTranslate: false,
  youtubeMode: "bilingual",
  hoverDictionary: false,
  autoSpeak: true,
  pronunciationAnalyzer: true,
  openaiModel: "gpt-4.1-mini",
  openaiApiKey: "",
  minTextLength: 12,
  maxPageItems: 80
};

export const LANGUAGE_LABELS = {
  auto: "Auto",
  en: "English",
  "zh-CN": "Simplified Chinese"
};

export const STORAGE_KEYS = {
  settings: "biread.settings",
  secrets: "biread.secrets",
  cache: "biread.cache"
};
