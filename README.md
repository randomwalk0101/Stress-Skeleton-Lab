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

Safari requires Apple's converter from the full Xcode install. Command Line Tools alone are not enough.

1. Install Xcode from the Mac App Store.
2. Open Xcode once and finish installing components.
3. Point command line tools at Xcode:

   ```sh
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

4. Accept the Xcode license:

   ```sh
   sudo xcodebuild -license
   ```

5. Run `npm run convert:safari`.
6. Open the generated Xcode project in `safari`.
7. Build and run the app target, then enable the extension in Safari settings.

Safari's conversion flow signs and wraps the WebExtension in a native app. Some permissions may require confirmation in Safari settings.

For local unsigned testing, enable Safari's Develop menu, then choose **Develop > Allow Unsigned Extensions**.

## Translation Providers

Open the extension options page to choose a provider:

- `MyMemory`: simple default, useful for testing, rate limited.
- `LibreTranslate`: recommended for private or heavier use. Configure your own endpoint and optional API key.

The extension intentionally does not ship with a paid translation key. For production use, run your own LibreTranslate instance or add a provider in `src/background/service-worker.js`.

Automatic page translation and hover dictionary are off by default to avoid sending reading text to third-party services unexpectedly. Enable them only when you are comfortable using the configured provider.

## Pronunciation Analyzer

Open the options page, choose OpenAI or Gemini as the pronunciation provider, and save the matching API key. Keys are stored in `chrome.storage.local`, not in source code. When text is selected, BiRead shows an **Analyze Pronunciation** button. Clicking it sends only the selected text to the configured provider and renders the returned JSON in a dictionary-style floating panel.

Default models:

- OpenAI: `gpt-4.1-mini`
- Gemini: `gemini-3.5-flash`

For speech playback, BiRead first tries the optional local Edge TTS service with `en-US-JennyNeural`. If the local service is not running, it falls back to browser `SpeechSynthesis`.

```sh
cd tts-server
npm install
npm start
```

The service listens on `http://127.0.0.1:8787` and caches MP3 files in `~/.biread-tts-cache`.

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
npm run tts:server
```

Build artifacts are written to `dist`, and the Chrome zip package is written to `outputs`.
