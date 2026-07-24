// ==UserScript==
// @name         pi-web slash command descriptions (zh-CN)
// @namespace    https://github.com/1731300623/pi-web-zh
// @version      1.0.1
// @description  Localize slash-command palette descriptions on localhost pi-web using the shared JSON dictionary. Never translates chat messages.
// @author       pi-web-zh
// @match        http://localhost:30141/*
// @match        http://127.0.0.1:30141/*
// @grant        GM_getResourceText
// @resource     SLASH_ZH https://raw.githubusercontent.com/1731300623/pi-web-zh/main/overlay/lib/slash-command-descriptions.zh-CN.json
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /** @type {Record<string, string> | null} */
  let byDescription = null;

  try {
    const raw = GM_getResourceText("SLASH_ZH");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.byDescription !== "object" || parsed.byDescription === null) {
      return;
    }
    byDescription = parsed.byDescription;
  } catch {
    return;
  }

  if (!byDescription || Object.keys(byDescription).length === 0) return;

  /**
   * ChatInput renders each slash item as:
   *   <button>
   *     <span>/{name}</span>
   *     <span>{description}</span>
   *   </button>
   * Only the description span is eligible for translation.
   */

  /**
   * @param {Element | null | undefined} el
   * @returns {el is HTMLButtonElement}
   */
  function isSlashCommandButton(el) {
    if (!el || el.tagName !== "BUTTON") return false;
    // Prefer direct-child spans (palette cards); fall back to nested spans.
    const spans = el.querySelectorAll(":scope > span, span");
    for (const span of spans) {
      const text = (span.textContent || "").trim();
      // Command name leaf: "/foo" (not a free-form sentence).
      if (text.startsWith("/") && text.length > 1 && !/\s/.test(text.slice(0, 48))) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {string | null | undefined} value
   * @returns {string | null}
   */
  function lookupZh(value) {
    if (!value || !byDescription) return null;
    const trimmed = value.trim();
    if (!trimmed || !Object.prototype.hasOwnProperty.call(byDescription, trimmed)) {
      return null;
    }
    const zh = byDescription[trimmed];
    return typeof zh === "string" && zh.length > 0 ? zh : null;
  }

  /**
   * Replace a single text node's value when it exactly matches a dictionary key
   * (optional surrounding whitespace preserved).
   * @param {Text} node
   */
  function translateTextNode(node) {
    const value = node.nodeValue;
    if (!value) return;
    const zh = lookupZh(value);
    if (!zh) return;
    const trimmed = value.trim();
    if (value === trimmed) {
      node.nodeValue = zh;
      return;
    }
    const lead = value.match(/^\s*/)?.[0] ?? "";
    const trail = value.match(/\s*$/)?.[0] ?? "";
    if (value.slice(lead.length, value.length - trail.length) === trimmed) {
      node.nodeValue = lead + zh + trail;
    }
  }

  /**
   * @param {HTMLButtonElement} button
   */
  function translateDescriptionInButton(button) {
    /** @type {Element | null} */
    let commandSpan = null;
    const directSpans = button.querySelectorAll(":scope > span");
    const spans = directSpans.length > 0 ? directSpans : button.querySelectorAll("span");

    for (const span of spans) {
      const text = (span.textContent || "").trim();
      if (text.startsWith("/") && text.length > 1 && !/\s/.test(text.slice(0, 48))) {
        commandSpan = span;
        break;
      }
    }
    if (!commandSpan) return;

    for (const span of spans) {
      if (span === commandSpan) continue;
      // Description spans hold a single text leaf in ChatInput.
      for (const child of span.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          translateTextNode(/** @type {Text} */ (child));
        }
      }
    }
  }

  /**
   * Process an element subtree: only slash-palette command buttons.
   * @param {Node | null | undefined} root
   */
  function processRoot(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      const parent = /** @type {Text} */ (root).parentElement;
      if (!parent) return;
      const button = parent.closest("button");
      if (!button || !isSlashCommandButton(button)) return;
      // Never touch the command-name span ("/foo").
      const parentText = (parent.textContent || "").trim();
      if (parentText.startsWith("/") && !/\s/.test(parentText.slice(0, 48))) return;
      translateTextNode(/** @type {Text} */ (root));
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
      for (const root of roots) {
        processRoot(root);
      }
    } catch {
      // best-effort only
    }
  }

  /**
   * @param {Node | null | undefined} root
   */
  function scheduleProcess(root) {
    if (!root) return;
    pendingRoots.add(root);
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(flushPending, 80);
  }

  // One-time scan for a palette already open at install time.
  try {
    processRoot(document.body);
  } catch {
    // ignore
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          scheduleProcess(node);
        }
        continue;
      }
      if (mutation.type === "characterData" && mutation.target) {
        // Only re-check the changed text node if it sits inside a slash button.
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
