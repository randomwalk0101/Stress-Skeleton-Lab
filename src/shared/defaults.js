export const DEFAULT_SETTINGS = {
  enabled: true,
  autoSpeak: false,
  youtubeStressOverlay: true,
  pronunciationAnalyzer: true,
  pronunciationProvider: "local",
  openaiModel: "gpt-4.1-mini",
  openaiApiKey: "",
  geminiModel: "gemini-3.5-flash",
  geminiApiKey: "",
  localTtsEndpoint: "http://127.0.0.1:8787",
  minTextLength: 12,
  maxPageItems: 80
};

export const STORAGE_KEYS = {
  settings: "biread.settings",
  secrets: "biread.secrets"
};
