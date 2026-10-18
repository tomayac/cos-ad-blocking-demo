// SPDX-FileCopyrightText: 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

import { clearLog, showLog } from "./log.js";

// Rule IDs of hashes blocked from the entries list start here.
const FIRST_DYNAMIC_RULE_ID = 1000;

const $ = (selector) => document.querySelector(selector);

const formatBytes = (bytes) =>
  bytes >= 1e6
    ? `${(bytes / 1e6).toFixed(1)} MB`
    : bytes >= 1e3
      ? `${(bytes / 1e3).toFixed(1)} kB`
      : `${bytes} B`;

const formatTime = (ms) => (ms ? new Date(ms).toLocaleString() : "never");

// An entry's hash in the SRI form rules and `integrity` use.
function toSri({ algorithm, hash }) {
  const bytes = hash.match(/../g).map((pair) => parseInt(pair, 16));
  return `${algorithm.replace("-", "").toLowerCase()}-${btoa(String.fromCharCode(...bytes))}`;
}

function sharing(entry) {
  if (entry.globallyDisclosable) {
    return entry.onPublicHashList
      ? "any origin (on the Public Hash List)"
      : "any origin, once on the Public Hash List";
  }
  return entry.sharedWithOrigins.length
    ? entry.sharedWithOrigins.join("\n")
    : "same-site only";
}

// Entries.
let pageToken;
let nextPageToken;

async function blockedHashes() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return new Set(
    rules.flatMap((r) => r.condition.crossOriginStorageHashes ?? []),
  );
}

async function showEntries() {
  const page = await chrome.crossOriginStorage.getEntries({
    pageSize: Number($("#page-size").value),
    pageToken,
  });
  nextPageToken = page.nextPageToken;
  $("#next-page").disabled = !nextPageToken;
  $("#summary").textContent =
    `${page.entries.length} on this page` +
    (nextPageToken ? ", more on the next" : "");
  const blocked = await blockedHashes();
  $("#entries").replaceChildren(
    ...page.entries.map((entry) => {
      const row = document.createElement("tr");
      const cells = [
        `${entry.algorithm} ${entry.hash.slice(0, 12)}…`,
        formatBytes(entry.size),
        entry.mimeType || "?",
        entry.storingOrigins.join("\n"),
        sharing(entry),
        entry.readers.map((r) => `${r.origin} (${r.count}×)`).join("\n") || "—",
        formatTime(entry.lastReadTime),
      ];
      for (const text of cells) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.append(cell);
      }
      row.cells[0].title = toSri(entry);

      const actions = document.createElement("td");
      const remove = document.createElement("button");
      remove.textContent = "Delete";
      remove.addEventListener("click", () =>
        chrome.crossOriginStorage.removeEntry({
          algorithm: entry.algorithm,
          hash: entry.hash,
        }),
      );
      const block = document.createElement("button");
      const sri = toSri(entry);
      block.textContent = blocked.has(sri) ? "Blocked" : "Block";
      block.disabled = blocked.has(sri);
      block.addEventListener("click", () => addHashRule(sri));
      actions.append(remove, block);
      row.append(actions);
      return row;
    }),
  );
}

$("#page-size").addEventListener("change", () => {
  pageToken = undefined;
  showEntries();
});
$("#first-page").addEventListener("click", () => {
  pageToken = undefined;
  showEntries();
});
$("#next-page").addEventListener("click", () => {
  pageToken = nextPageToken;
  showEntries();
});
chrome.crossOriginStorage.onChanged.addListener(showEntries);

// Blocking.
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

async function showDynamicRules() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  $("#dynamic-rules").replaceChildren(
    ...rules.map((rule) => {
      const item = document.createElement("li");
      const remove = document.createElement("button");
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [rule.id],
        });
        refreshBlocking();
      });
      item.append(
        `${rule.condition.crossOriginStorageHashes.join(", ")} `,
        remove,
      );
      return item;
    }),
  );
  if (!rules.length) {
    $("#dynamic-rules").textContent = "None yet.";
  }
}

async function addHashRule(sri) {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const id = Math.max(FIRST_DYNAMIC_RULE_ID - 1, ...rules.map((r) => r.id)) + 1;
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [
      {
        id,
        action: { type: "block" },
        condition: { crossOriginStorageHashes: [sri] },
      },
    ],
  });
  refreshBlocking();
}

$("#add-rule").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = event.target.elements.hash;
  try {
    await addHashRule(input.value.trim());
    input.value = "";
  } catch (error) {
    input.setCustomValidity(error.message);
    input.reportValidity();
    input.addEventListener("input", () => input.setCustomValidity(""), {
      once: true,
    });
  }
});

function refreshBlocking() {
  showDynamicRules();
  showEntries();
}

// Clearing site data.
async function clear(origins) {
  await chrome.browsingData.remove(origins ? { origins } : {}, {
    crossOriginStorage: true,
  });
  $("#clear-result").textContent = origins
    ? `Cleared ${origins[0]}.`
    : "Cleared all sites.";
}
$("#clear-site").addEventListener("submit", (event) => {
  event.preventDefault();
  clear([new URL(event.target.elements.origin.value).origin]);
});
$("#clear-all").addEventListener("click", () => clear());

// DevTools protocol.
$("#cdp-list").addEventListener("click", async () => {
  const result = $("#cdp-result");
  const [tab] = await chrome.tabs.query({
    url: ["https://*/*", "http://*/*"],
  });
  if (!tab) {
    result.textContent = "Open any web page first, to attach to.";
    return;
  }
  const target = { tabId: tab.id };
  try {
    await chrome.debugger.attach(target, "1.3");
    const hashes = [];
    let pages = 0;
    let token;
    do {
      const page = await chrome.debugger.sendCommand(
        target,
        "Storage.getCrossOriginStorageEntries",
        { pageSize: 10, pageToken: token },
      );
      pages++;
      hashes.push(...page.entries.map((e) => e.hash));
      token = page.nextPageToken;
    } while (token);
    result.textContent = `${hashes.length} entries in ${pages} pages of up to 10.`;
  } catch (error) {
    result.textContent = `Failed: ${error.message}`;
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
});

// Log.
showLog($("#log"));
$("#clear-log").addEventListener("click", clearLog);

showEntries();
showDynamicRules();
