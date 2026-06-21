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
  hoverDictionary: true,
  autoSpeak: true,
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
  cache: "biread.cache"
};
