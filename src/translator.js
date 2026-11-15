/**
 * Client-side batching queue for BiliNative.
 * Debounces and batches visible Chinese text elements before sending them
 * to the background service worker.
 */
window.BiliTranslator = (() => {
  const pendingMap = new Map(); // text -> { kind, callbacks: [] }
  const inFlight = new Map();   // text -> Promise<string|null>
  const localMemo = new Map();  // text -> translated string
  let flushTimer = null;
  let batchSize = 8;

  function setBatchSize(size) {
    batchSize = Math.max(1, Math.min(20, Number(size) || 8));
  }

  function hasChinese(text) {
    return /[\u4e00-\u9fff]/.test(text);
  }

  function enqueue(text, kind = "text") {
    const clean = (text || "").trim();
    if (!clean || !hasChinese(clean)) {
      return Promise.resolve(null);
    }
    if (localMemo.has(clean)) {
      return Promise.resolve(localMemo.get(clean));
    }
    if (inFlight.has(clean)) {
      return inFlight.get(clean);
    }

    const promise = new Promise((resolve) => {
      if (!pendingMap.has(clean)) {
        pendingMap.set(clean, { kind, callbacks: [] });
      }
      pendingMap.get(clean).callbacks.push(resolve);
      scheduleFlush();
    });

    inFlight.set(clean, promise);
    promise.finally(() => inFlight.delete(clean));
    return promise;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 250);
  }

  async function flush() {
    if (pendingMap.size === 0) return;

    const entries = Array.from(pendingMap.entries());
    pendingMap.clear();

    // Split into chunks of batchSize
    for (let i = 0; i < entries.length; i += batchSize) {
      const chunk = entries.slice(i, i + batchSize);
      const items = chunk.map(([text, meta]) => ({ text, kind: meta.kind }));

      try {
        const response = await chrome.runtime.sendMessage({
          type: "TRANSLATE_BATCH",
          items
        });

        const translations = response?.ok ? response.translations || {} : {};
        for (const [text, meta] of chunk) {
          const translated = translations[text] || null;
          if (translated) localMemo.set(text, translated);
          meta.callbacks.forEach((cb) => cb(translated));
        }
      } catch (err) {
        console.warn("[BiliNative] Flush error:", err);
        for (const [, meta] of chunk) {
          meta.callbacks.forEach((cb) => cb(null));
        }
      }
    }
  }

  return {
    enqueue,
    hasChinese,
    setBatchSize
  };
})();
