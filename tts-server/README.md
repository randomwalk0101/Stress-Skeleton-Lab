# BiRead Local Edge TTS Server

This optional local service lets the browser extension play Microsoft Edge-style neural speech with `en-US-JennyNeural`.

## Start

```sh
cd tts-server
npm install
npm start
```

The server listens on:

```text
http://127.0.0.1:8787
```

The extension calls `POST /api/tts` with:

```json
{
  "text": "I want to go to the store this afternoon.",
  "voice": "en-US-JennyNeural",
  "rate": 1
}
```

Generated MP3 files are cached in:

```text
~/.biread-tts-cache
```

If this server is not running, the extension automatically falls back to the browser's built-in `SpeechSynthesis`.
