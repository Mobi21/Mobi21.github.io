# Kora portfolio application preview

## Source and scope

The preview mounts the full production React application from public Kora commit `2276bbdf996ad081ea2622801121a97ee8a65499` (https://github.com/korastudios/Kora). `main.tsx` imports `upstream/main.tsx`, which mounts the original App, ConnectionProvider, QueryClientProvider, motion configuration, route tree, shell, fonts and styles. There are no alternate portfolio panes or reduced navigation shell.

Every non-test file in `upstream/` is retained byte-for-byte from that public revision. This is not the latest dirty private Kora checkout. Run `node verify-ui-parity.mjs <path-to-original-apps/gui/src>` to verify source parity.

## Data and execution

Build-time aliases replace the native runtime and desktop-host modules with browser-only fixture adapters. Fictional records populate the existing product UI. Local fixture mutations do not invoke the native backend, providers or models. Model/account connections and external execution return explicit unavailable errors. Presentation preferences use the original UI's browser local storage; fixture records reset on reload. No private database is included.

Keeping the full UI does not imply the full native backend runs in a browser. The renderer is the real application; the backing data and supported actions are a simulation. The previous reduced demo was rejected and replaced. Its screenshots and interaction results do not establish parity for this version.

## Build and integration

Run `npm ci --ignore-scripts`, then `npm run build` here. Vite writes `../kora/`. Serve the portfolio root and open `/demos/kora/#/kora`. Use Node compatible with Vite 8 (22.12+ or 24).

Embed the application lazily with a descriptive iframe title and standalone link. The published Content Security Policy specifies `connect-src 'none'`; static assets are local. Do not remove unsupported routes or restyle the renderer to hide fixture gaps. Complete the adapter and verify the affected production UI instead.

## Verification status

Source parity and build/fixture checks are recorded in QA.md. Full application browser verification is ongoing. Do not transfer successful checks from the earlier reduced demo to this application.

## License

Kora is MIT, copyright 2026 Mobolaji Ogunbiyi. LICENSE-KORA and generated dependency notices are included in the built artifact. Upstream dependencies retain their licenses.
