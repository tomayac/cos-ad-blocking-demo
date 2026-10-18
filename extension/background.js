// SPDX-FileCopyrightText: 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

const MAX_ENTRIES = 50;

// The log lives in session storage, so the popup can read it while it is
// open and it survives the service worker going idle. Writes are chained, so
// that matches arriving together each make it in.
let pending = Promise.resolve();
function log(entry) {
  const time = Date.now();
  pending = pending.then(async () => {
    const { entries = [] } = await chrome.storage.session.get("entries");
    entries.unshift({ time, ...entry });
    await chrome.storage.session.set({
      entries: entries.slice(0, MAX_ENTRIES),
    });
  });
  return pending;
}

// Every rule that matched, including lookups in Cross-Origin Storage, which
// declarativeNetRequest reports like any other request. Needs the extension
// to be loaded unpacked.
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(
  ({ request, rule }) => {
    log({
      kind: "blocked",
      ruleset: rule.rulesetId,
      url: request.url,
      type: request.type,
    });
  },
);

// Script requests that failed, such as one a rule blocked on the network.
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    log({
      kind: "error",
      url: details.url,
      type: details.type,
      error: details.error,
    });
  },
  { urls: ["<all_urls>"], types: ["script"] },
);
