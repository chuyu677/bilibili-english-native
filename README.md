# BiliNative — Natural English Bilibili

An open-source Chrome/Edge extension that turns **bilibili.com** into a **native-feeling English YouTube experience**, powered by Bilibili's open-source **`Index-Translate`** model (or any OpenAI-compatible LLM).

Built for English learners who want to enjoy Bilibili videos naturally in English without literal, robotic machine-translation—with **hover-to-peek original Chinese** whenever you want to check a word.

## Features
- **Instant UI Localization:** Replaces navigation, buttons, tabs, and video actions (`首页` → `Home`, `点赞` → `Like`, `投币` → `Coin`, etc.) with zero API latency.
- **Natural AI Translation:** Translates video titles, UP主 posts/dynamics, descriptions, and comments (including Bilibili's Shadow DOM comment threads).
- **Hover-to-Peek Chinese:** Clean English-only view by default; hover over any translated title or comment to see the original Chinese.
- **Viewport-Aware & Cached:** Uses `IntersectionObserver` + debounced batching + `chrome.storage.local` caching so scrolling stays fast and cheap.
- **Pluggable Backend:** Works with local `Index-Translate` (`vllm`), local `Ollama`, or cloud APIs (DeepSeek, OpenAI, etc.).

---

## 1. Install the Extension (Chrome / Edge)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder (`bilibili-english-native`).
4. Click the **BiliNative** icon in your toolbar → **Model & API Settings** to configure your model and test the connection.

---

## 2. Use It as a Desktop App on Windows
1. Open `https://www.bilibili.com` in Edge or Chrome with **BiliNative** enabled.
2. In the browser menu:
   - **Edge:** `...` → **Apps** → **Install this site as an app**
   - **Chrome:** `⋮` → **Cast, save, and share** → **Install page as app...**
3. Bilibili will now open in its own dedicated Windows app window with full English translation active.

---

## 3. Running Bilibili's `Index-Translate` Locally
If you have an NVIDIA GPU, you can run Bilibili's official open-source translation model locally using `vllm`:

```bash
pip install -U vllm
vllm serve IndexTeam/Index-Translate-9B \
  --served-model-name IndexTeam/Index-Translate-9B \
  --host 127.0.0.1 \
  --port 8000 \
  --max-model-len 4096
```

For lighter GPUs, use `IndexTeam/Index-Translate-2B`. Then in BiliNative's **Model & API Settings**, click **Local Index-Translate-9B (vLLM)** (or **2B**), click **Save Settings**, and click **Test Connection**.
