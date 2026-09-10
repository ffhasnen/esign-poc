# eSign WebView proof of concept

Reproduces and fixes: "eSign's `window.open()`/`postMessage` popup flow
works in a normal mobile browser, but opens Perfios in a separate Chrome tab
instead of staying inside the host app, and the result never comes back."

**Confirmed architecture:** the host app is a React Native app. Its WebView
(`react-native-webview`, backed by `android.webkit.WebView` on Android)
loads the CSP Flutter web app's URL **directly** - no wrapper page, no
iframe. From inside the CSP app, eSign calls `window.open()`.

**Root cause:** that popup pattern assumes a real browser popup with a live
`window.opener` link back to the calling page. A native WebView doesn't
give you that for free - with nothing wired up, the request either hangs,
navigates the WebView away in place, or (what production shows) escapes to
the system browser. Once it's in Chrome there is no relationship back to
the app; the result can never arrive, in any configuration.

**The fix, proven end to end here:** catch the popup request natively
before it escapes, show it in-app, and manually relay the result back -
`window.opener` never enters into it. `react-native-webview`'s own native
code overwrites any custom `WebChromeClient` config, so this has to be a
real native Android module (Kotlin/Java) that the host app's native project
calls into, not something configurable through `react-native-webview`'s
JS props. See [`android-kotlin-repro/`](android-kotlin-repro) for the
working shape of it.

## Try it in under a minute (hosted, no setup)

Everything is already built and hosted on Firebase - no local server
needed:

1. Open **[the Flutter clone](https://example-app-ff--csp-esign-clone-xmfe0dvz.web.app)**
   in any browser.
2. Click **Confirm & Proceed (eSign)**. It opens
   **[PerfiosEsign Simulation](https://example-app-ff--perfios-simulation-xrtyd1tg.web.app/)**
   in a real popup (this part only works as a real popup in a normal
   browser - see below for why it doesn't inside the app's WebView).
3. Click **Simulate SUCCESS** or **Simulate FAIL**. Watch the log panel on
   the Flutter page - it'll show `RESULT: SUCCESS` (or `FAIL`), proving the
   `PerfiosEsign` class and `eSignature()` Dart function both work exactly
   as designed, in a real browser.

To see it actually run *inside* a native WebView - where it currently
breaks in production, and where the fix applies - build and run
`android-kotlin-repro/` (below). No local server needed there either; it's
already pointed at the same hosted URLs.

## Repo layout

| Path | What it is |
|---|---|
| [`android-kotlin-repro/`](android-kotlin-repro) | Native Kotlin Android app. `MainActivity.kt` (launcher) &rarr; `CspActivity.kt` (WebView 1, loads the CSP URL directly, catches `window.open()` via `onCreateWindow`) &rarr; `EsignActivity.kt` (WebView 2, full screen, JS bridge back to CspActivity). This is the proof that the fix works, and the closest thing to what the host app's native module needs to do. |
| [`csp-esign-clone/`](csp-esign-clone) | A minimal, real, compiled Flutter web app. `web/index.html` has the exact same `PerfiosEsign` class / `esignInitiate` / `esignProcess` JS as the real app (copied verbatim, with the two hygiene fixes described below), and `lib/main.dart` calls it the same way the real DBT confirmation screens do. Hosted at the URL above; rebuild with `flutter build web`. |
| [`server/popup.html`](server/popup.html) | **PerfiosEsign Simulation** - stands in for the real Perfios/Aadhaar page. Hosted at the URL above; also served locally by `server/serve.js` on port 8788 if you want to run everything on your own network instead. |
| [`server/serve.js`](server/serve.js) | Optional zero-dependency local static server, useful for local dev without redeploying to Firebase each time. Not required to try the hosted version above. |
| `App.js` | A single-file reference of an earlier `react-native-webview`/Expo attempt at the same fix, kept for comparison. The Kotlin version above supersedes it and is closer to what a real native module needs to do. |

## Running the Android app

Requires Android Studio or the SDK command-line tools.

```
cd android-kotlin-repro
./gradlew installDebug            # phone connected via USB, USB debugging on
adb shell am start -n com.example.webviewrepro/.MainActivity
```

Or just open `android-kotlin-repro/` in Android Studio and hit Run.

In the app: the URL field is prefilled with the hosted Flutter clone URL.
Tap **Launch CSP** &rarr; **Confirm & Proceed (eSign)** inside the WebView.
`CspActivity` catches the popup and opens `EsignActivity` full screen
instead of letting it escape - tap **Simulate SUCCESS** or **Simulate
FAIL** there, and the result should show up back in WebView 1's log panel
as `RESULT: SUCCESS` / `RESULT: FAIL`, exactly as it did in the browser
test above. That round trip - full screen swap, result relayed back -
never touches `window.opener` at all.

## What the host app's team needs to build

`react-native-webview` does not reliably support what this fix needs from
the JS side - its own native code overwrites any custom `WebChromeClient`
whenever other features are toggled, so the `onOpenWindow` prop can't be
depended on. The fix has to be a real native Android module in the host app's
own `android/` project, doing what `CspActivity`/`EsignActivity` do here:

- Own the WebView's `WebChromeClient` directly; catch `onCreateWindow()`.
- Show the eSign page in-app (a new screen/Activity), not let it escape to
  Chrome.
- Relay the result back manually - a JS bridge on the eSign WebView +
  `evaluateJavascript()` on the original WebView - since `window.opener`
  is never available across two separate WebView instances, no matter how
  it's configured.
- React Native's own job is just one bridge call to launch that native
  module. Nothing on the JS/RN side needs to configure the WebView itself.

**No changes needed on the Flutter side.** The `PerfiosEsign` class's
contract - call `window.open()`, listen for `postMessage` - is exactly
what it always was. Two small hygiene fixes were applied directly to the
real `web/index.html` (not just this clone), unrelated to the architecture
change:
- A dangling `<script>` tag was closed - it would have thrown a syntax
  error and silently broken the entire eSign block.
- `window.open()` returning `null` (popup blocked) now fails fast as
  `"PopupBlocked"` instead of hanging the waiting modal forever.

## Security notes

Found and fixed while building this proof of concept:

- **JS-injection risk in the native relay, fixed.** The eSign page's result
  is parsed and re-serialized as JSON (`org.json.JSONObject`) before it can
  reach another WebView - a raw, unvalidated string pasted into a script
  would have let a malicious result run arbitrary code in the app's page.
- **Untrusted popup content, fixed.** `window.open()` is only allowed to
  open full screen with the native bridge attached for a known-trusted
  eSign host (`CspActivity.TRUSTED_ESIGN_HOSTS`) - not whatever URL
  happened to be requested.
- **Message spoofing on the JS side, fixed in the clone.** The Flutter
  page's listener checks `event.origin` against an allow-list instead of
  accepting a result from anywhere. The real app needs Perfios's actual
  production domain here - not guessed, needs to come from the team.
- **Pre-existing, not introduced by this fix:** the original listener never
  checked who sent a message at all. Worth confirming whether that's
  handled elsewhere before shipping.
