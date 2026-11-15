/**
 * Background Service Worker for BiliNative.
 * Handles OpenAI-compatible API calls (Index-Translate / vLLM / Ollama / Cloud LLMs)
 * and persistent translation caching.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  apiUrl: "https://index-translate.bilibili.com/v1/chat/completions",
  apiKey: "",
  model: "Index-Translate-35B-A3B",
  promptMode: "index-translate", // "index-translate" | "general-llm"
  hoverOriginal: true,
  translateUI: true,
  translateTitles: true,
  translatePosts: true,
  translateComments: true,
  batchSize: 8
};

const CACHE_KEY = "bilinative_translation_cache_v1";
const MAX_CACHE_ENTRIES = 5000;

let memoryCache = null;
let saveTimer = null;

async function loadCache() {
  if (memoryCache) return memoryCache;
  const data = await chrome.storage.local.get(CACHE_KEY);
  const raw = data[CACHE_KEY] || {};
  memoryCache = new Map(Object.entries(raw));
  return memoryCache;
}

function scheduleSaveCache() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!memoryCache) return;
    // Trim oldest entries if over limit
    if (memoryCache.size > MAX_CACHE_ENTRIES) {
      const excess = memoryCache.size - MAX_CACHE_ENTRIES;
      const keys = memoryCache.keys();
      for (let i = 0; i < excess; i++) {
        const next = keys.next();
        if (!next.done) memoryCache.delete(next.value);
      }
    }
    await chrome.storage.local.set({
      [CACHE_KEY]: Object.fromEntries(memoryCache)
    });
  }, 1000);
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

function buildHeaders(settings) {
  const headers = { "Content-Type": "application/json" };
  if (settings.apiKey && settings.apiKey.trim()) {
    headers["Authorization"] = `Bearer ${settings.apiKey.trim()}`;
  }
  return headers;
}

async function callChatCompletion(settings, messages, temperature = 0.2) {
  const body = {
    model: settings.model,
    messages,
    temperature
  };
  if (settings.promptMode === "index-translate") {
    body.chat_template_kwargs = { enable_thinking: false };
  }

  const resp = await fetch(settings.apiUrl, {
    method: "POST",
    headers: buildHeaders(settings),
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from model");
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function translateSingleIndexTranslate(settings, text) {
  // Index-Translate models respond best to direct, clean translation instructions
  const messages = [
    {
      role: "user",
      content: `Translate the following Chinese text from Bilibili into natural, idiomatic English. Output only the English translation without explanations:\n\n${text}`
    }
  ];
  return callChatCompletion(settings, messages, 0.1);
}

async function translateBatchLLM(settings, items) {
  const systemPrompt =
    "You are a native English translator localizing Bilibili (a Chinese video platform like YouTube) into natural, idiomatic English.\n" +
    "Rules:\n" +
    "1. Translate video titles, UP主 (creator) posts, and viewer comments into natural English that sounds like real YouTube titles and comments—NEVER literal word-for-word translation.\n" +
    "2. Adapt Chinese internet slang, memes, ACG/gaming jargon, and tone naturally (e.g., 绝了 -> 'insane' / 'next level', 笑死 -> 'lmao' / 'I'm dead', 泪目 -> 'hit me right in the feels', UP主 -> 'creator' or 'uploader').\n" +
    "3. Keep proper nouns, game/anime titles, and @mentions accurate.\n" +
    "4. You will receive a JSON array of strings. Return ONLY a valid JSON array of translated strings in the exact same order and length. No markdown fences, no commentary.";

  const payload = JSON.stringify(items.map((x) => x.text));
  const raw = await callChatCompletion(
    settings,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: payload }
    ],
    0.25
  );

  // Strip optional markdown code fences if a model adds them
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length !== items.length) {
    throw new Error("Batch JSON length mismatch");
  }
  return parsed.map((s) => String(s).trim());
}

async function handleTranslateBatch(items) {
  const settings = await getSettings();
  if (!settings.enabled) return { translations: {} };

  const cache = await loadCache();
  const results = {};
  const uncached = [];

  for (const item of items) {
    const key = item.text.trim();
    if (!key) continue;
    if (cache.has(key)) {
      results[key] = cache.get(key);
    } else if (!uncached.some((u) => u.text === key)) {
      uncached.push({ text: key, kind: item.kind || "text" });
    }
  }

  if (uncached.length === 0) {
    return { translations: results };
  }

  if (settings.promptMode === "index-translate") {
    // Translate items concurrently in small parallel groups for Index-Translate
    const translatedList = await Promise.all(
      uncached.map((item) =>
        translateSingleIndexTranslate(settings, item.text).catch(() => null)
      )
    );
    uncached.forEach((item, idx) => {
      const tr = translatedList[idx];
      if (tr) {
        results[item.text] = tr;
        cache.set(item.text, tr);
      }
    });
  } else {
    // Batch JSON translation, with single-item fallback if JSON parsing fails
    try {
      const translatedList = await translateBatchLLM(settings, uncached);
      uncached.forEach((item, idx) => {
        const tr = translatedList[idx];
        if (tr) {
          results[item.text] = tr;
          cache.set(item.text, tr);
        }
      });
    } catch (batchErr) {
      console.warn("[BiliNative] Batch JSON failed, falling back to single:", batchErr);
      const translatedList = await Promise.all(
        uncached.map((item) =>
          translateSingleIndexTranslate(settings, item.text).catch(() => null)
        )
      );
      uncached.forEach((item, idx) => {
        const tr = translatedList[idx];
        if (tr) {
          results[item.text] = tr;
          cache.set(item.text, tr);
        }
      });
    }
  }

  scheduleSaveCache();
  return { translations: results };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TRANSLATE_BATCH") {
    handleTranslateBatch(message.items || [])
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === "TEST_CONNECTION") {
    (async () => {
      const settings = message.settings ? { ...DEFAULT_SETTINGS, ...message.settings } : await getSettings();
      const sample = "这波操作直接封神，UP主太强了！";
      const out = await translateSingleIndexTranslate(settings, sample);
      return { sample, translation: out };
    })()
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === "CLEAR_CACHE") {
    (async () => {
      memoryCache = new Map();
      await chrome.storage.local.remove(CACHE_KEY);
      return { cleared: true };
    })()
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === "GET_STATS") {
    loadCache()
      .then((cache) => sendResponse({ ok: true, cacheCount: cache.size }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
