// SPDX-FileCopyrightText: 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

import { clearLog, showLog } from "./log.js";

// The SHA-384 digest of Prebid.js 11.40.0's not-for-prod/prebid.js, which
// the demo page stores.
const PREBID_HASH = {
  algorithm: "SHA-384",
  hash: "5a01459ecc25f0d9e8822c16900a55a0058417abe5feb2ab2bc0ccb63be432364fb13ce9a5757d73575d091922e63009",
};

// Rules.
const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
for (const box of document.querySelectorAll("input[data-ruleset]")) {
  box.checked = enabled.includes(box.dataset.ruleset);
  box.addEventListener("change", () =>
    chrome.declarativeNetRequest.updateEnabledRulesets(
      box.checked
        ? { enableRulesetIds: [box.dataset.ruleset] }
        : { disableRulesetIds: [box.dataset.ruleset] },
    ),
  );
}

// The entry, through the chrome.crossOriginStorage API.
const entryText = document.querySelector("#entry");
const removeButton = document.querySelector("#remove");
async function showEntry() {
  const entries = [];
  let pageToken;
  do {
    const page = await chrome.crossOriginStorage.getEntries({ pageToken });
    entries.push(...page.entries);
    pageToken = page.nextPageToken;
  } while (pageToken);
  const entry = entries.find(
    (e) => e.algorithm === PREBID_HASH.algorithm && e.hash === PREBID_HASH.hash,
  );
  removeButton.hidden = !entry;
  entryText.textContent = entry
    ? `Stored (${(entry.size / 1e6).toFixed(1)} MB) by ${entry.storingOrigins.join(", ")}; ` +
      `read ${entry.readers.reduce((n, r) => n + r.count, 0)} times.`
    : "Not stored.";
}
removeButton.addEventListener("click", async () => {
  await chrome.crossOriginStorage.removeEntry(PREBID_HASH);
});
chrome.crossOriginStorage.onChanged.addListener(showEntry);
showEntry();

// Log.
showLog(document.querySelector("#log"));
document.querySelector("#clear").addEventListener("click", clearLog);
document
  .querySelector("#manage")
  .addEventListener("click", () => chrome.runtime.openOptionsPage());
