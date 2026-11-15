# Privacy Policy for BiliNative

**Effective Date:** November 15, 2026

BiliNative ("the Extension") is an open-source browser extension that translates text on `bilibili.com` into English.

## Data Handling
- **No Developer Tracking or Analytics:** BiliNative does not collect, store, or transmit any personal information, browsing history, or usage analytics to the extension developer.
- **Translation Requests:** When enabled, visible Chinese text (video titles, creator posts, descriptions, and comments) on `bilibili.com` is sent directly from your browser to the translation API endpoint configured in your **Model & API Settings** (by default, Bilibili's public `https://index-translate.bilibili.com/v1/chat/completions`, or a custom local/cloud OpenAI-compatible endpoint you choose).
- **Local Storage:** Your settings (endpoint URL, model name, optional API key, and feature toggles) are stored in `chrome.storage.sync`. Translated text snippets are cached locally in `chrome.storage.local` to improve speed and reduce repeated API requests. You can clear this cache at any time from the Settings page.

## Contact
If you have questions or concerns, please open an issue on the project's GitHub repository.
