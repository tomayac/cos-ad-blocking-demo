# Ad blocking and Cross-Origin Storage

A demo of how a content blocker catches an ad script that
[Cross-Origin Storage](https://wicg.github.io/cross-origin-storage/) (COS)
serves: by its URL, as before, and by its hash, which COS makes necessary.

- **Page:** https://tomayac.github.io/cos-ad-blocking-demo/ (source in
  [`docs/`](docs/))
- **Extension:** [`extension/`](extension/), a small Manifest V3 ad blocker
  for [Prebid.js](https://prebid.org/)

It grew out of the
[prebidjs-cos](https://yoyo.codes/tomayacgoogle/prebidjs-cos) demo.

## The problem

COS lets a page load a file by its hash, from bytes any site stored, with no
network request. A content blocker that only looks at requests no longer sees
everything a page loads:

1. **A COS hit.** `<script src="…/prebid.js" integrity="sha384-…"
crossoriginstorage>` is answered from COS when the bytes are there.
2. **A renamed URL.** The same tag with an innocuous first-party URL, such as
   `vendor/a7f3c9.js`, is answered from COS by the hash in `integrity`, even
   when that URL does not exist.
3. **No URL at all.** `navigator.crossOriginStorage.getFileHandle()` reads the
   bytes by hash, and the page runs them from a `blob:` URL.

## How the browser handles it

In the Chromium prototype, a declarativeNetRequest rule can name a file by
its hash. A new rule condition, `crossOriginStorageHashes`, lists SRI-style
hashes and matches only lookups of those files in COS, from any integration
and from `getFileHandle()`. It catches all three cases:

```json
{
  "id": 1,
  "action": { "type": "block" },
  "condition": {
    "crossOriginStorageHashes": ["sha384-WgFFnswl8Nno…"]
  }
}
```

A blocked lookup reads as a miss, so a fetch falls back to the network, and
`getFileHandle()` rejects with `NotFoundError`. On the network, the blocker's
URL rules apply as always.

URL rules apply to requests, and a COS hit makes none. Every file in COS was
first fetched from a URL, where those rules applied, so a content blocker that
wants to keep a file from being served from COS names its hash as well.

## Run it

1. Get a Chromium build with Cross-Origin Storage, for example from the
   [Linux releases](https://github.com/tomayac/Chromium/releases), and start it
   with the feature on:

   ```sh
   ./chrome --enable-features=CrossOriginStorage
   ```

2. Load [`extension/`](extension/) unpacked from `chrome://extensions`, with
   Developer mode on. Unpacked, it can show which rules matched.
3. Open the [page](https://tomayac.github.io/cos-ad-blocking-demo/), or serve
   `docs/` on `http://localhost`. COS needs a secure context.
4. In the extension's popup, turn both rules off, and run step 1 to store
   Prebid.js in COS, as a visit without a content blocker would.
5. Turn the rules back on, and run steps 2 to 4. All three are blocked. Turn
   the hash rule off to see all three get through.

| Step                 | URL rule only | URL and hash rules |
| -------------------- | ------------- | ------------------ |
| 2. COS hit           | Runs from COS | Blocked            |
| 3. Renamed URL       | Runs from COS | Blocked            |
| 4. `getFileHandle()` | Runs from COS | Blocked            |

The popup logs every rule match, including matches on COS lookups, and the
script requests that failed. It also shows whether Prebid.js is in COS, through the
`chrome.crossOriginStorage` extension API, and can delete it.

Each attempt adds a `?visit=` query string, which stands in for a later page
visit. Without it, the browser would reuse the script it already holds in
memory for the page, and no request, so no COS lookup, would happen.

The [latest Linux release](https://github.com/tomayac/Chromium/releases) has
everything the demo uses.

## Managing Cross-Origin Storage

The extension's manager page (the popup's button, or the extension's options)
shows everything else an extension can do with COS, one requirement of
[crbug.com/547675864](https://crbug.com/547675864) per section:

| Requirement                          | How the manager shows it                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List every entry, paged              | `chrome.crossOriginStorage.getEntries()`, with each entry's hash, size, type, storing origins, sharing, readers, and last read, refreshed by `onChanged` |
| Delete an entry                      | `chrome.crossOriginStorage.removeEntry()`                                                                                                                |
| A permission governing both          | The `crossOriginStorage` permission, whose install prompt reads "Read and delete files that sites share with each other"                                 |
| Block an entry by its hash           | A **Block** button per entry, which adds a dynamic `crossOriginStorageHashes` rule, next to the static URL and hash rulesets                             |
| Clear COS with site data             | `chrome.browsingData.remove()` with `crossOriginStorage`, for one site or all                                                                            |
| List every entry, paged, through CDP | `Storage.getCrossOriginStorageEntries` through `chrome.debugger`, attached to any open web page                                                          |
| See blocked lookups                  | The log: matches of hash rules on COS lookups, which `getMatchedRules()` and `onRuleMatchedDebug` report like any other                                  |

## Chromium changes

- [8605006](https://chromium-review.googlesource.com/c/chromium/src/+/8605006):
  the `chrome.crossOriginStorage` extension API
- [8605007](https://chromium-review.googlesource.com/c/chromium/src/+/8605007):
  `crossOriginStorageHashes` rules in `declarativeNetRequest`
- [8605008](https://chromium-review.googlesource.com/c/chromium/src/+/8605008):
  clearing COS with site data, and `chrome.browsingData`

Tracked in [crbug.com/547675864](https://crbug.com/547675864).

## License

[Apache 2.0](LICENSE)
