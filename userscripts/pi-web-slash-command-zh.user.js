// ==UserScript==
// @name         pi-web slash command descriptions (zh-CN)
// @namespace    https://github.com/1731300623/pi-web-zh
// @version      1.1.0
// @description  Localize slash-command palette descriptions on localhost pi-web. Prefers command-name keys (robust to CSS line-clamp). Does not translate chat messages.
// @author       pi-web-zh
// @match        http://localhost:30141/*
// @match        http://127.0.0.1:30141/*
// @grant        GM_getResourceText
// @resource     SLASH_ZH https://raw.githubusercontent.com/1731300623/pi-web-zh/main/overlay/lib/slash-command-descriptions.zh-CN.json
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /** @type {{ byCommandName?: Record<string,string>, byDescription?: Record<string,string> } | null} */
  let dict = null;

  try {
    const raw = GM_getResourceText("SLASH_ZH");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    dict = parsed;
  } catch {
    return;
  }

  if (!dict) return;

  /**
   * ChatInput renders each slash item as:
   *   <button>
   *     <span>/{name}</span>
   *     <span>{description}</span>
   *   </button>
   */

  /**
   * @param {Element | null | undefined} el
   * @returns {el is HTMLButtonElement}
   */
  function isSlashCommandButton(el) {
    if (!el || el.tagName !== "BUTTON") return false;
    const spans = el.querySelectorAll(":scope > span, span");
    for (const span of spans) {
      const text = (span.textContent || "").trim();
      if (text.startsWith("/") && text.length > 1 && !/\s/.test(text.slice(0, 64))) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {string} commandName bare name without leading slash
   * @param {string} englishDesc full description text currently shown
   * @returns {string | null}
   */
  function lookupZh(commandName, englishDesc) {
    if (!dict) return null;
    const byName = dict.byCommandName;
    if (byName && typeof byName === "object" && byName[commandName]) {
      return byName[commandName];
    }
    const byDesc = dict.byDescription;
    if (byDesc && typeof byDesc === "object" && englishDesc && byDesc[englishDesc]) {
      return byDesc[englishDesc];
    }
    // Prefix match for line-clamped / truncated visible text
    if (byDesc && englishDesc && englishDesc.length >= 12) {
      const prefix = englishDesc.replace(/[.…]+$/u, "").trim();
      for (const [en, zh] of Object.entries(byDesc)) {
        if (typeof zh !== "string") continue;
        if (en.startsWith(prefix) || prefix.startsWith(en.slice(0, Math.min(en.length, prefix.length)))) {
          // only accept if prefix is a real start of the English key
          if (en.startsWith(prefix) || (prefix.length >= 20 && en.startsWith(prefix.slice(0, 20)))) {
            return zh;
          }
        }
      }
    }
    return null;
  }

  /**
   * @param {HTMLButtonElement} button
   */
  function translateDescriptionInButton(button) {
    const directSpans = button.querySelectorAll(":scope > span");
    const spans = directSpans.length > 0 ? Array.from(directSpans) : Array.from(button.querySelectorAll("span"));

    /** @type {Element | null} */
    let commandSpan = null;
    /** @type {string} */
    let commandName = "";

    for (const span of spans) {
      const text = (span.textContent || "").trim();
      if (text.startsWith("/") && text.length > 1 && !/\s/.test(text.slice(0, 64))) {
        commandSpan = span;
        commandName = text.slice(1);
        break;
      }
    }
    if (!commandSpan || !commandName) return;

    for (const span of spans) {
      if (span === commandSpan) continue;
      const englishDesc = (span.textContent || "").trim();
      if (!englishDesc) continue;
      // Already Chinese?
      if (/[\u4e00-\u9fff]/.test(englishDesc)) continue;

      const zh = lookupZh(commandName, englishDesc);
      if (!zh) continue;

      // Prefer replacing the text node to keep React structure simple.
      if (span.childNodes.length === 1 && span.firstChild && span.firstChild.nodeType === Node.TEXT_NODE) {
        span.firstChild.nodeValue = zh;
      } else {
        span.textContent = zh;
      }
    }
  }

  /**
   * @param {Node | null | undefined} root
   */
  function processRoot(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      const parent = /** @type {Text} */ (root).parentElement;
      if (!parent) return;
      const button = parent.closest("button");
      if (button && isSlashCommandButton(button)) {
        translateDescriptionInButton(/** @type {HTMLButtonElement} */ (button));
      }
      return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return;
    }

    const el = /** @type {Element} */ (root);
    if (el.tagName === "BUTTON") {
      if (isSlashCommandButton(el)) {
        translateDescriptionInButton(/** @type {HTMLButtonElement} */ (el));
      }
      return;
    }

    if (typeof el.querySelectorAll !== "function") return;
    el.querySelectorAll("button").forEach((btn) => {
      if (isSlashCommandButton(btn)) {
        translateDescriptionInButton(/** @type {HTMLButtonElement} */ (btn));
      }
    });
  }

  /** @type {Set<Node>} */
  const pendingRoots = new Set();
  let debounceTimer = 0;

  function flushPending() {
    debounceTimer = 0;
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    try {
      for (const root of roots) processRoot(root);
    } catch {
      // best-effort
    }
  }

  /**
   * @param {Node | null | undefined} root
   */
  function scheduleProcess(root) {
    if (!root) return;
    pendingRoots.add(root);
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(flushPending, 50);
  }

  try {
    processRoot(document.body);
  } catch {
    // ignore
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) scheduleProcess(node);
      } else if (mutation.type === "characterData" && mutation.target) {
        scheduleProcess(mutation.target);
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
})();
