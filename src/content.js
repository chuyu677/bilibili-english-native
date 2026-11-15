/**
 * Content Script for BiliNative.
 * - Replaces Bilibili UI labels instantaneously via BILI_UI_DICT
 * - Observes video titles, UP posts/descriptions, and comments (including Shadow DOM)
 * - Uses IntersectionObserver to translate only visible content
 * - Provides hover-to-peek original Chinese tooltip for English learning
 */
(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    hoverOriginal: true,
    translateUI: true,
    translateTitles: true,
    translatePosts: true,
    translateComments: true,
    batchSize: 8
  };

  let settings = { ...DEFAULT_SETTINGS };
  const observedRoots = new WeakSet();
  let seenElements = new WeakSet();
  const translatedElements = new Set();

  // Floating tooltip for original Chinese (works across regular & Shadow DOM)
  let tooltipEl = null;
  function getTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.id = "bilinative-orig-tooltip";
    tooltipEl.style.display = "none";
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function showTooltip(target, text) {
    if (!settings.hoverOriginal || !settings.enabled || !text) return;
    const tip = getTooltip();
    tip.textContent = text;
    tip.style.display = "block";
    const rect = target.getBoundingClientRect();
    const top = Math.max(8, rect.top - tip.offsetHeight - 8);
    const left = Math.min(window.innerWidth - tip.offsetWidth - 12, Math.max(8, rect.left));
    tip.style.top = `${top + window.scrollY}px`;
    tip.style.left = `${left + window.scrollX}px`;
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = "none";
  }

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (!settings.enabled) return;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        intersectionObserver.unobserve(el);
        translateElement(el);
      }
    },
    { rootMargin: "250px 0px" }
  );

  function getElementKind(el) {
    if (!el || !el.matches) return null;

    if (
      settings.translateTitles &&
      el.matches(
        ".bili-video-card__info--tit, .bili-video-card__info--tit a, h1.video-title, .video-info-title .video-title, .video-page-card-small .title, .bili-dyn-card-video__title, .rank-item .title, .video-name"
      )
    ) {
      return "title";
    }

    if (
      settings.translateComments &&
      (el.matches(".reply-content, .sub-reply-content") ||
        (el.id === "contents" && el.getRootNode() instanceof ShadowRoot))
    ) {
      return "comment";
    }

    if (
      settings.translatePosts &&
      el.matches(
        ".bili-dyn-content__orig__desc, .dyn-card-opus__summary, .bili-rich-text__content, .desc-info-text, .basic-desc-info, .opus-module-content"
      )
    ) {
      return "post";
    }

    return null;
  }

  function applyStaticUI(el) {
    if (!settings.enabled || !settings.translateUI) return;
    if (el.childElementCount > 0) return;
    const raw = (el.textContent || "").trim();
    if (!raw || raw.length > 16) return;
    const mapped = window.BILI_UI_DICT?.[raw];
    if (mapped && el.dataset.bilinativeUi !== "1") {
      el.dataset.bilinativeOrig = raw;
      el.dataset.bilinativeUi = "1";
      el.textContent = mapped;
      translatedElements.add(el);
    }
  }

  async function translateElement(el) {
    if (!settings.enabled) return;
    if (el.dataset.bilinativeDone === "1") return;

    // Avoid translating container elements that wrap other translatable targets
    const kind = el.dataset.bilinativeKind || "text";
    const originalText = (el.textContent || "").trim();
    if (!originalText || !window.BiliTranslator.hasChinese(originalText)) return;

    el.dataset.bilinativeDone = "pending";
    const translated = await window.BiliTranslator.enqueue(originalText, kind);
    if (!translated || !settings.enabled) {
      delete el.dataset.bilinativeDone;
      return;
    }

    // Only replace if the element hasn't been mutated to something else
    if ((el.textContent || "").trim() === originalText) {
      el.dataset.bilinativeOrig = originalText;
      el.dataset.bilinativeTrans = translated;
      el.dataset.bilinativeDone = "1";
      el.textContent = translated;
      translatedElements.add(el);

      if (!el.dataset.bilinativeHoverBound) {
        el.dataset.bilinativeHoverBound = "1";
        el.addEventListener("mouseenter", () => {
          if (el.dataset.bilinativeDone === "1") {
            showTooltip(el, el.dataset.bilinativeOrig);
          }
        });
        el.addEventListener("mouseleave", hideTooltip);
      }
    }
  }

  function scanNode(node) {
    if (!settings.enabled || !node) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      // Traverse into open Shadow DOM (used by Bilibili's new comment section)
      if (node.shadowRoot && !observedRoots.has(node.shadowRoot)) {
        observeRoot(node.shadowRoot);
      }

      if (!seenElements.has(node)) {
        seenElements.add(node);
        const kind = getElementKind(node);
        if (kind) {
          node.dataset.bilinativeKind = kind;
          intersectionObserver.observe(node);
        } else {
          applyStaticUI(node);
        }
      }

      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        scanNode(children[i]);
      }
    } else if (node instanceof ShadowRoot) {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        scanNode(children[i]);
      }
    }
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);

    const observer = new MutationObserver((mutations) => {
      if (!settings.enabled) return;
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          scanNode(added);
        }
      }
    });

    observer.observe(root, { childList: true, subtree: true });
    scanNode(root === document ? document.body : root);
  }

  function restoreOriginals() {
    hideTooltip();
    for (const el of translatedElements) {
      if (el.dataset.bilinativeOrig) {
        el.textContent = el.dataset.bilinativeOrig;
      }
      delete el.dataset.bilinativeDone;
      delete el.dataset.bilinativeUi;
    }
    translatedElements.clear();
    seenElements = new WeakSet();
  }

  function reapplyAll() {
    if (!settings.enabled) {
      restoreOriginals();
      return;
    }
    scanNode(document.body);
  }

  async function init() {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    settings = { ...DEFAULT_SETTINGS, ...stored };
    window.BiliTranslator.setBatchSize(settings.batchSize);

    if (settings.enabled && document.body) {
      observeRoot(document);
    }

    // Periodically check for newly attached Shadow DOMs (Bilibili lazy-loads comments)
    setInterval(() => {
      if (!settings.enabled) return;
      document.querySelectorAll("bili-comments, bili-comment-thread-renderer, bili-comment-renderer, bili-rich-text").forEach((host) => {
        if (host.shadowRoot && !observedRoots.has(host.shadowRoot)) {
          observeRoot(host.shadowRoot);
        }
      });
    }, 1500);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    let needsRefresh = false;
    for (const [k, { newValue }] of Object.entries(changes)) {
      settings[k] = newValue;
      if (k === "batchSize") window.BiliTranslator.setBatchSize(newValue);
      if (["enabled", "translateUI", "translateTitles", "translatePosts", "translateComments"].includes(k)) {
        needsRefresh = true;
      }
    }
    if (needsRefresh) {
      if (!settings.enabled) {
        restoreOriginals();
      } else {
        if (!observedRoots.has(document)) observeRoot(document);
        reapplyAll();
      }
    }
  });

  init();
})();
