const DEFAULTS = {
  apiUrl: "https://index-translate.bilibili.com/v1/chat/completions",
  apiKey: "",
  model: "Index-Translate-35B-A3B",
  promptMode: "index-translate",
  batchSize: 8
};

const PRESETS = {
  "bilibili-public": {
    apiUrl: "https://index-translate.bilibili.com/v1/chat/completions",
    model: "Index-Translate-35B-A3B",
    promptMode: "index-translate"
  },
  "index-9b": {
    apiUrl: "http://localhost:8000/v1/chat/completions",
    model: "IndexTeam/Index-Translate-9B",
    promptMode: "index-translate"
  },
  "index-2b": {
    apiUrl: "http://localhost:8000/v1/chat/completions",
    model: "IndexTeam/Index-Translate-2B",
    promptMode: "index-translate"
  },
  ollama: {
    apiUrl: "http://localhost:11434/v1/chat/completions",
    model: "qwen2.5:7b",
    promptMode: "general-llm"
  },
  deepseek: {
    apiUrl: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    promptMode: "general-llm"
  },
  openai: {
    apiUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    promptMode: "general-llm"
  }
};

function showStatus(msg, isError = false) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = isError ? "err" : "ok";
}

function readForm() {
  return {
    apiUrl: document.getElementById("apiUrl").value.trim(),
    model: document.getElementById("model").value.trim(),
    apiKey: document.getElementById("apiKey").value.trim(),
    promptMode: document.getElementById("promptMode").value,
    batchSize: Number(document.getElementById("batchSize").value) || 8
  };
}

async function ensureOriginPermission(apiUrl) {
  try {
    const url = new URL(apiUrl);
    const originPattern = `${url.protocol}//${url.hostname}/*`;
    const has = await chrome.permissions.contains({ origins: [originPattern] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [originPattern] });
  } catch {
    return false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById("apiUrl").value = stored.apiUrl;
  document.getElementById("model").value = stored.model;
  document.getElementById("apiKey").value = stored.apiKey;
  document.getElementById("promptMode").value = stored.promptMode;
  document.getElementById("batchSize").value = stored.batchSize;

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      document.getElementById("apiUrl").value = p.apiUrl;
      document.getElementById("model").value = p.model;
      document.getElementById("promptMode").value = p.promptMode;
      showStatus(`Applied preset: ${btn.textContent}. Click Save Settings to persist.`);
    });
  });

  document.getElementById("saveBtn").addEventListener("click", async () => {
    const form = readForm();
    const granted = await ensureOriginPermission(form.apiUrl);
    if (!granted) {
      showStatus("Permission denied for that API domain. Settings not saved.", true);
      return;
    }
    await chrome.storage.sync.set(form);
    showStatus("Settings saved!");
  });

  document.getElementById("testBtn").addEventListener("click", async () => {
    const form = readForm();
    const granted = await ensureOriginPermission(form.apiUrl);
    if (!granted) {
      showStatus("Permission denied for that API domain.", true);
      return;
    }
    showStatus("Testing connection...");
    chrome.runtime.sendMessage(
      { type: "TEST_CONNECTION", settings: form },
      (res) => {
        if (res?.ok) {
          showStatus(`Success! "${res.sample}" → "${res.translation}"`);
        } else {
          showStatus(`Connection failed: ${res?.error || "Unknown error"}`, true);
        }
      }
    );
  });

  document.getElementById("clearCacheBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_CACHE" }, (res) => {
      if (res?.ok) {
        showStatus("Translation cache cleared.");
      } else {
        showStatus("Failed to clear cache.", true);
      }
    });
  });
});
