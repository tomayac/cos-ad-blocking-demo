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

In the Chromium prototype, extensions see COS lookups:

- **URL rules apply to a COS hit.** A hit reaches `declarativeNetRequest` and
  `webRequest` as the request it serves, answered from a cache. A rule or
  listener that blocks the URL blocks the hit, so case 1 is caught by the
  rules blockers already have.
- **Rules can name a hash.** A new rule condition, `crossOriginStorageHashes`,
  lists SRI-style hashes and matches only lookups of those files in COS, from
  any integration and from `getFileHandle()`. It catches cases 2 and 3:

  ```json
  {
    "id": 1,
    "action": { "type": "block" },
    "condition": {
      "crossOriginStorageHashes": ["sha384-WgFFnswl8Nno…"]
    }
  }
  ```

  A blocked lookup reads as a miss, so a fetch falls back to the network,
  where the URL rules apply, and `getFileHandle()` rejects with
  `NotFoundError`.

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
   the hash rule off to see steps 3 and 4 get through.

| Step                 | URL rule only | URL and hash rules |
| -------------------- | ------------- | ------------------ |
| 2. COS hit           | Blocked       | Blocked            |
| 3. Renamed URL       | Runs from COS | Blocked            |
| 4. `getFileHandle()` | Runs from COS | Blocked            |

The popup logs every rule match, including matches on COS lookups, and the
script requests answered from a cache, which is how a COS hit appears to
`webRequest`. It also shows whether Prebid.js is in COS, through the
`chrome.crossOriginStorage` extension API, and can delete it.

Each attempt adds a `?visit=` query string, which stands in for a later page
visit. Without it, the browser would reuse the script it already holds in
memory for the page, and no request, so no COS lookup, would happen.

The 2026-10-17 release blocks as described. Logging matches of the hash rule
and showing COS hits to `webRequest` come with
[CL 8606266](https://chromium-review.googlesource.com/c/chromium/src/+/8606266),
which is not in that release.

## Chromium changes

- [8605006](https://chromium-review.googlesource.com/c/chromium/src/+/8605006):
  the `chrome.crossOriginStorage` extension API
- [8605007](https://chromium-review.googlesource.com/c/chromium/src/+/8605007):
  `declarativeNetRequest` and `crossOriginStorageHashes`
- [8606266](https://chromium-review.googlesource.com/c/chromium/src/+/8606266):
  COS hits shown to `webRequest`

Tracked in [crbug.com/547675864](https://crbug.com/547675864).

## License

[Apache 2.0](LICENSE)
