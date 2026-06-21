# Stress-Skeleton-Lab

## English

Stress Skeleton is a pronunciation-first WebExtension for English learners. It keeps the live-page pronunciation analysis workflow for websites such as Wikipedia and adds a real-time stress-skeleton overlay for YouTube English subtitles.

### Quick Start

Run these commands from the project root:

```sh
npm install
npm run package:browsers
```

This creates ready-to-install browser builds in `outputs/browser-builds/`.

### How To Use

#### Chrome Or Edge

1. Open the extension page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Turn on Developer mode.
3. Choose `Load unpacked`.
4. Select `outputs/browser-builds/chrome` for Chrome or `outputs/browser-builds/edge` for Edge.

If you prefer the zip package, use:

```text
outputs/browser-builds/bi-read-pronunciation-chrome.zip
outputs/browser-builds/bi-read-pronunciation-edge.zip
```

#### Firefox

1. Open `about:debugging`.
2. Choose `This Firefox`.
3. Select `Load Temporary Add-on`.
4. Pick `outputs/browser-builds/firefox/manifest.json`.

For the packaged upload file, use:

```text
outputs/browser-builds/bi-read-pronunciation-firefox.zip
```

#### Safari

```sh
npm run convert:safari
```

Then open the generated Xcode project in `safari/`, build the app target, and enable the extension in Safari settings.

### Features

- Analyze selected English text on live web pages.
- Show a pronunciation coach panel with:
  stress skeleton, rhythm grouping, linking, reduction, flap-t hints, difficult sounds, IPA keywords, and concise Chinese notes.
- Keep `Auto pronounce` for spoken playback support.
- Show a real-time YouTube overlay when English subtitles are available:
  the current subtitle line plus an uppercase stress skeleton for shadowing practice.
- Play selected text with local Edge TTS when available, and fall back to browser speech synthesis when needed.
- Open local `.txt`, `.md`, `.srt`, `.vtt`, `.html`, `.htm`, and selectable-text `.pdf` files in a simplified reader and analyze any selected passage.

### Browser Support

- Chrome
- Microsoft Edge
- Firefox
- Safari

Chrome and Edge use the standard Manifest V3 build directly. Firefox uses the same source with a Firefox-specific packaging step. Safari uses Apple's WebExtension conversion flow.

### Development

```sh
npm install
npm run check
npm run build
```

### Package Browser Builds

```sh
npm run package:browsers
```

This writes unpacked builds and zip packages into `outputs/browser-builds`.

Single-browser packaging is also available:

```sh
npm run package:chrome
npm run package:edge
npm run package:firefox
```

### Install In Chrome Or Edge

1. Run `npm run build`.
2. Open the extensions management page.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select the `dist` folder, or the unpacked build under `outputs/browser-builds/chrome` or `outputs/browser-builds/edge`.

For local files, enable file URL access in the extension details page.

### Install In Firefox

For temporary local testing:

1. Run `npm run package:firefox`.
2. Open `about:debugging`.
3. Choose **This Firefox**.
4. Use **Load Temporary Add-on** and select `outputs/browser-builds/firefox/manifest.json`.

For distribution, use the generated Firefox zip as the upload artifact.

### Install In Safari

```sh
npm run convert:safari
```

Then open the generated Xcode project in `safari`, build the app target, and enable the extension in Safari settings.

### Options

The popup keeps only the pronunciation-related quick toggles:

- `Auto pronounce`
- `YouTube realtime stress`
- `Open local reader`

The options page keeps the deeper pronunciation settings:

- Pronunciation provider: `local`, `openai`, or `gemini`
- OpenAI / Gemini API keys and model names
- Local Edge TTS endpoint
- Minimum text length
- Maximum page items
- Pronunciation analyzer toggle

Default models:

- OpenAI: `gpt-4.1-mini`
- Gemini: `gemini-3.5-flash`

### Local TTS Server

```sh
cd tts-server
npm install
npm start
```

The local server listens on `http://127.0.0.1:8787`.

---

## 简体中文

Stress Skeleton 是一个以英语发音训练为核心的 WebExtension。它保留了网页上的发音分析流程，并新增了 YouTube 英文字幕的实时重音骨架浮层，方便跟读练习。

### 功能

- 在网页上对选中的英文文本做发音分析。
- 显示发音分析面板，包含：
  重音骨架、意群节奏、连读、弱读、flap t 提示、易错音、关键词 IPA，以及简洁中文说明。
- 保留 `Auto pronounce`，支持朗读播放。
- 当 YouTube 存在英文字幕时，显示实时浮层：
  一行当前字幕，一行适合跟读的重音骨架大写标注。
- 优先使用本地 Edge TTS 播放选中文本；不可用时回退到浏览器语音合成。
- 可在本地阅读器中打开 `.txt`、`.md`、`.srt`、`.vtt`、`.html`、`.htm` 以及可选中文本的 `.pdf` 文件，并对选中段落做发音分析。

### 支持浏览器

- Chrome
- Microsoft Edge
- Firefox
- Safari

Chrome 和 Edge 直接使用标准 Manifest V3 构建。Firefox 使用同一套源码并在打包时应用 Firefox 专用配置。Safari 使用 Apple 的 WebExtension 转换流程。

### 开发

```sh
npm install
npm run check
npm run build
```

### 浏览器打包

```sh
npm run package:browsers
```

打包结果会输出到 `outputs/browser-builds`。

也可以单独打包：

```sh
npm run package:chrome
npm run package:edge
npm run package:firefox
```

### 在 Chrome 或 Edge 中安装

1. 运行 `npm run build`。
2. 打开扩展管理页面。
3. 开启开发者模式。
4. 选择 **Load unpacked**。
5. 选择 `dist` 文件夹，或 `outputs/browser-builds/chrome` / `outputs/browser-builds/edge` 下的解包目录。

如果要读取本地文件，请在扩展详情里开启文件 URL 访问权限。

### 在 Firefox 中安装

临时本地测试方式：

1. 运行 `npm run package:firefox`。
2. 打开 `about:debugging`。
3. 进入 **This Firefox**。
4. 选择 **Load Temporary Add-on**，并选中 `outputs/browser-builds/firefox/manifest.json`。

如果用于分发，请使用生成的 Firefox zip 包。

### 在 Safari 中安装

```sh
npm run convert:safari
```

然后打开 `safari` 目录中的 Xcode 工程，构建 app target，并在 Safari 设置中启用扩展。

### 选项

弹窗只保留发音相关的快捷开关：

- `Auto pronounce`
- `YouTube realtime stress`
- `Open local reader`

选项页保留更深层的发音设置：

- 发音分析提供方：`local`、`openai`、`gemini`
- OpenAI / Gemini API Key 与模型名
- 本地 Edge TTS 服务地址
- 最短文本长度
- 页面最大处理条数
- 发音分析开关

默认模型：

- OpenAI：`gpt-4.1-mini`
- Gemini：`gemini-3.5-flash`

### 本地 TTS 服务

```sh
cd tts-server
npm install
npm start
```

本地服务默认监听 `http://127.0.0.1:8787`。

---

## 繁體中文

Stress Skeleton 是一個以英語發音訓練為核心的 WebExtension。它保留了網頁上的發音分析流程，並新增了 YouTube 英文字幕的即時重音骨架浮層，方便跟讀練習。

### 功能

- 在網頁上對選取的英文文字做發音分析。
- 顯示發音分析面板，包含：
  重音骨架、意群節奏、連讀、弱讀、flap t 提示、易錯音、關鍵詞 IPA，以及簡潔中文說明。
- 保留 `Auto pronounce`，支援朗讀播放。
- 當 YouTube 有英文字幕時，顯示即時浮層：
  一行目前字幕，一行適合跟讀的重音骨架大寫標註。
- 優先使用本地 Edge TTS 播放選取文字；不可用時回退到瀏覽器語音合成。
- 可在本地閱讀器中開啟 `.txt`、`.md`、`.srt`、`.vtt`、`.html`、`.htm` 以及可選取文字的 `.pdf` 檔案，並對選取段落做發音分析。

### 支援瀏覽器

- Chrome
- Microsoft Edge
- Firefox
- Safari

Chrome 和 Edge 直接使用標準 Manifest V3 建置。Firefox 使用同一套原始碼並在打包時套用 Firefox 專用設定。Safari 使用 Apple 的 WebExtension 轉換流程。

### 開發

```sh
npm install
npm run check
npm run build
```

### 瀏覽器打包

```sh
npm run package:browsers
```

打包結果會輸出到 `outputs/browser-builds`。

也可以單獨打包：

```sh
npm run package:chrome
npm run package:edge
npm run package:firefox
```

### 在 Chrome 或 Edge 中安裝

1. 執行 `npm run build`。
2. 打開擴充功能管理頁面。
3. 啟用開發者模式。
4. 選擇 **Load unpacked**。
5. 選取 `dist` 資料夾，或 `outputs/browser-builds/chrome` / `outputs/browser-builds/edge` 下的解包目錄。

如果要讀取本地檔案，請在擴充功能詳情中啟用檔案 URL 存取權限。

### 在 Firefox 中安裝

臨時本地測試方式：

1. 執行 `npm run package:firefox`。
2. 打開 `about:debugging`。
3. 進入 **This Firefox**。
4. 選擇 **Load Temporary Add-on**，並選取 `outputs/browser-builds/firefox/manifest.json`。

如果要發佈，請使用產生出的 Firefox zip 檔。

### 在 Safari 中安裝

```sh
npm run convert:safari
```

然後打開 `safari` 目錄中的 Xcode 專案，建置 app target，並在 Safari 設定中啟用擴充功能。

### 選項

彈窗只保留發音相關的快捷開關：

- `Auto pronounce`
- `YouTube realtime stress`
- `Open local reader`

選項頁保留更深層的發音設定：

- 發音分析提供方：`local`、`openai`、`gemini`
- OpenAI / Gemini API Key 與模型名稱
- 本地 Edge TTS 服務位址
- 最短文字長度
- 頁面最大處理條數
- 發音分析開關

預設模型：

- OpenAI：`gpt-4.1-mini`
- Gemini：`gemini-3.5-flash`

### 本地 TTS 服務

```sh
cd tts-server
npm install
npm start
```

本地服務預設監聽 `http://127.0.0.1:8787`。
