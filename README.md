# BiRead-Translator

BiRead Translator is a Chrome/Safari WebExtension for English and Simplified Chinese reading. It focuses on Wikipedia, YouTube captions, and local text-style documents, with bilingual rendering inspired by immersive reading translators.

## Features

- Translate selected text from the context menu.
- Hover over English words to see Chinese meaning, phonetic spelling, and automatic pronunciation.
- Select English text and click **Analyze Pronunciation** for American English stress, linking, reduction, flap-t hints, optional IPA, and speech playback.
- Translate readable page paragraphs, headings, list items, and article blocks.
- Show original, translated, or bilingual text.
- Preserve page layout by inserting compact inline translation blocks.
- Translate YouTube caption segments while captions are enabled.
- Show YouTube subtitles as English, Simplified Chinese, or bilingual.
- Provide a local reader for `.txt`, `.md`, `.srt`, `.vtt`, `.html`, and `.htm` files.
- Cache translation results in extension storage to reduce duplicate requests.
- Use MyMemory without setup for lightweight testing, or LibreTranslate with a custom endpoint/API key.

## Install In Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the `dist` directory.

For local files, open the extension details in Chrome and enable **Allow access to file URLs**.

## Install In Safari

1. Install Xcode and Safari extension tooling.
2. Run `npm run convert:safari`.
3. Open the generated Xcode project in `safari`.
4. Build and run the app target, then enable the extension in Safari settings.

Safari's conversion flow signs and wraps the WebExtension in a native app. Some permissions may require confirmation in Safari settings.

## Translation Providers

Open the extension options page to choose a provider:

- `MyMemory`: simple default, useful for testing, rate limited.
- `LibreTranslate`: recommended for private or heavier use. Configure your own endpoint and optional API key.

The extension intentionally does not ship with a paid translation key. For production use, run your own LibreTranslate instance or add a provider in `src/background/service-worker.js`.

Automatic page translation and hover dictionary are off by default to avoid sending reading text to third-party services unexpectedly. Enable them only when you are comfortable using the configured provider.

## Pronunciation Analyzer

Open the options page and save an OpenAI API key. The key is stored in `chrome.storage.local`, not in source code. When text is selected, BiRead shows an **Analyze Pronunciation** button. Clicking it sends only the selected text to OpenAI and renders the returned JSON in a dictionary-style floating panel.

The first version uses browser `SpeechSynthesis` for playback and prefers an available `en-US` female voice. Browser extensions cannot reliably call Microsoft Edge Read Aloud voices directly. A later local Node service can add `edge-tts` with `en-US-JennyNeural`.

Example local Edge TTS direction for a later version:

```sh
npm install express edge-tts
```

Then expose a localhost endpoint that accepts text and streams audio generated with `voice = en-US-JennyNeural`.

## Hover Dictionary

When **Hover dictionary** is enabled, pause the mouse over an English word. BiRead shows a small definition card with Chinese meaning and phonetic spelling. Pronunciation uses dictionary audio when available, then falls back to the browser's English speech voice.

## YouTube Notes

Turn on YouTube captions first. BiRead watches the visible caption text and translates the active segments. If YouTube changes its caption DOM, the fallback overlay can still show the translated line, but native caption styling may vary.

## Local Documents

Use **Open local reader** in the popup. The reader processes local text-like documents in the browser. Native PDF translation is not included in this first version because browser PDF viewers do not expose reliable page text to extensions across Chrome and Safari.

Browser PDF pronunciation analysis is planned for a second version. The current version supports normal webpage text selection first.

## Development

```sh
npm run check
npm run build
npm run package:chrome
```

Build artifacts are written to `dist`, and the Chrome zip package is written to `outputs`.
