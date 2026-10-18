// SPDX-FileCopyrightText: 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

const RULESET_NAMES = {
  block_by_url: "URL rule",
  block_by_hash: "hash rule",
  _dynamic: "hash rule from the entries list",
};

// Renders `entries`, newest first, into the list `list`, and keeps it current.
export async function showLog(list) {
  const render = (entries = []) =>
    list.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement("li");
        const kind = document.createElement("span");
        kind.className = `kind ${entry.kind}`;
        kind.textContent = {
          blocked: `Matched the ${RULESET_NAMES[entry.ruleset] ?? entry.ruleset}`,
          cache: "Served from cache or Cross-Origin Storage",
          error: `Failed: ${entry.error}`,
        }[entry.kind];
        item.append(
          kind,
          ` · ${new Date(entry.time).toLocaleTimeString()} · ${entry.type} · ${entry.url}`,
        );
        return item;
      }),
    );
  const { entries } = await chrome.storage.session.get("entries");
  render(entries);
  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes.entries) {
      render(changes.entries.newValue);
    }
  });
}

export const clearLog = () => chrome.storage.session.set({ entries: [] });
