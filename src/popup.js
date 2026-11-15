const KEYS = [
  "enabled",
  "translateUI",
  "translateTitles",
  "translatePosts",
  "translateComments",
  "hoverOriginal"
];

const DEFAULTS = {
  enabled: true,
  translateUI: true,
  translateTitles: true,
  translatePosts: true,
  translateComments: true,
  hoverOriginal: true
};

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  for (const key of KEYS) {
    const el = document.getElementById(key);
    el.checked = Boolean(stored[key]);
    el.addEventListener("change", () => {
      chrome.storage.sync.set({ [key]: el.checked });
    });
  }

  document.getElementById("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.runtime.sendMessage({ type: "GET_STATS" }, (res) => {
    if (res?.ok) {
      document.getElementById("cacheStats").textContent =
        `Cached translations: ${res.cacheCount}`;
    }
  });
});
