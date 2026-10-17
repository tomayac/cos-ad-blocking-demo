// SPDX-FileCopyrightText: 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

const PREBID_URL =
  "https://cdn.jsdelivr.net/npm/prebid.js@11.40.0/dist/not-for-prod/prebid.js";
// A path that does not exist on this site, so only Cross-Origin Storage can
// answer it.
const RENAMED_URL = new URL("vendor/a7f3c9.js", location.href).href;
const INTEGRITY =
  "sha384-WgFFnswl8NnogiwWkApVoAWEF6vl/rKrK8DMtjvkMjZPsTzppXV9c1ddCRki5jAJ";

const hex = (base64) =>
  Array.from(atob(base64), (c) =>
    c.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
const HASH = { algorithm: "SHA-384", value: hex(INTEGRITY.slice(7)) };

const support = document.querySelector("#support");
if (!("crossOriginStorage" in navigator)) {
  support.textContent =
    "Cross-Origin Storage is not available. Start a Chromium build that " +
    "has it with --enable-features=CrossOriginStorage, and open this page " +
    "over https:// or on localhost.";
  support.classList.add("error");
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
}

// Prebid.js refuses to load twice into one page, so each attempt starts from
// a clean slate.
function reset() {
  delete window.pbjs;
  document.querySelectorAll("script[data-attempt]").forEach((s) => s.remove());
}

// Each attempt stands in for a later page visit. A fresh query string keeps
// the browser from reusing the script it already holds in memory for this
// page, which no request, and so no Cross-Origin Storage lookup, would see.
let attempt = 0;
const visit = (url) => `${url}?visit=${++attempt}`;

function inject(src, { integrity = true } = {}) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.attempt = "";
    if (integrity) {
      script.integrity = INTEGRITY;
      script.crossOrigin = "anonymous";
      script.setAttribute("crossoriginstorage", "");
    }
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("the script did not load"));
    script.src = src;
    document.head.append(script);
  });
}

const steps = {
  warm: () => inject(visit(PREBID_URL)),
  hit: () => inject(visit(PREBID_URL)),
  renamed: () => inject(visit(RENAMED_URL)),
  async handle() {
    let handle;
    try {
      handle = await navigator.crossOriginStorage.getFileHandle(HASH);
    } catch (error) {
      throw new Error(`getFileHandle() rejected with ${error.name}`);
    }
    const url = URL.createObjectURL(await handle.getFile());
    try {
      await inject(url, { integrity: false });
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};

for (const button of document.querySelectorAll("button[data-step]")) {
  const output = document.querySelector(
    `output[data-for="${button.dataset.step}"]`,
  );
  button.addEventListener("click", async () => {
    reset();
    output.className = "";
    output.textContent = "Loading…";
    const start = performance.now();
    try {
      await steps[button.dataset.step]();
      // The library defines `pbjs` when it runs.
      const version = window.pbjs?.version;
      if (!version) {
        throw new Error("the script loaded but Prebid.js did not run");
      }
      const ms = Math.round(performance.now() - start);
      output.className = "ran";
      output.textContent = `Prebid.js ${version} ran, ${ms} ms.`;
    } catch (error) {
      output.className = "blocked";
      output.textContent = `Blocked: ${error.message}.`;
    }
  });
}
