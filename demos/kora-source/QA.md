# Full Kora application verification — September 13, 2026

## Current candidate

The actual public App, entrypoint, providers, route tree and styles now run against fixture adapters. Full browser route review and representative interaction checks completed on September 13, 2026. Build success alone does not establish route/data correctness.

The source baseline is public commit 2276bbdf996ad081ea2622801121a97ee8a65499, not the dirty private checkout. `verify-ui-parity.mjs` compares every non-test source file byte-for-byte. Fixture adapters are separate from upstream.

## Historical checks — superseded reduced demo

An earlier reduced shell was tested for cards, project creation, task edits, search, prepared conversations and phone widths. It also received static-only network inspection. The user rejected that implementation. Those results and its conversation/work screenshots are historical only and must not be cited as full-application verification.

## Browser verification

- Rendered Work overview, projects, tasks, timeline, archive, project detail and task detail; Brain home, memory, pages, people, sources and created outputs; Calendar; Life overview, Today, all Money and Wellbeing pages, About You; every settings category; and Conversation.
- Created a task through the original Add Work dialog and confirmed it appeared in the original project table.
- Switched from Lisbon to Portfolio using the original conversation manager and confirmed the title and transcript changed.
- Submitted a message through the original composer; it displayed the explicit static-runtime limitation without inventing an AI response.
- Fixed a Money summary response mismatch and a relative runtime import escaping the transport alias, then rechecked both flows.
- Inspected original Work at desktop 1440px and phone 390px. The mobile Work navigation and stacked layout are retained from upstream.
- Loaded the full application inside the portfolio iframe; used its original navigation to reach Brain, including keyboard activation.
- Replaced the portfolio cover with a screenshot of the real Work screen (assets/projects/kora-real-workspace.png).

These checks establish full UI inclusion and representative fixture behavior, not live backend parity. Model execution, authentication, provider sync, native windows, and external actions require the installed application. Sample records reset when the app reloads. Browser presentation settings and unsent drafts use the original local browser persistence.

## Current mechanical checks
- Source parity: 300 non-test files checked against public apps/gui/src; zero differences.
- Fixture TypeScript suite passed with ES2022, bundler resolution, DOM libs and vite/client types across fixture.ts, brain-life-fixture.ts, work-calendar-fixture.ts, settings-fixture.ts and desktop.ts. Initial invocation without vite/client reported ImportMeta.env; adding the build environment types resolved it.
- Production build passed after correcting aliases to resolve absolute module identity from importer paths, covering both ../lib/runtime and ./runtime imports.
- Final bundle scan has no native connection implementation markers (native runtime is not connected, prepare_runtime, x-kora-review-key, /__kora/). The review_gateway_unreachable identifier remains in a production UI error-label mapping, not transport code. Browser session switching and the Money overview passed after these corrections.
