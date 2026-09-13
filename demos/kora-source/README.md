# Kora portfolio demo

Source: https://github.com/korastudios/Kora, commit `2276bbdf996ad081ea2622801121a97ee8a65499`.

## Build

Run `npm ci --ignore-scripts` and `npm run build` in this directory. Vite outputs the standalone static application to `../kora/`. Serve the portfolio root, then open `/demos/kora/#/kora`. Requires a current Node runtime compatible with Vite 8 (Node 22.12+ or 24).

Embed `/demos/kora/#/kora` lazily in an iframe with a descriptive title. An approximately 700px-tall frame works on desktop; provide a standalone/full-screen link. The demo is responsive. No server, credential, native host, provider, or model is required. `connect-src 'none'` prevents runtime network requests.

## What is reused

`upstream/` is the pinned public GUI source. The production `features/work/ProjectsWorkspace.tsx` runs directly, including cards/list/board, filtering, search and the new-project form. Kora's design primitives, font, mark, styles, ViewBar context, React Query and motion behavior are reused.

`main.tsx` is a deliberately reduced portfolio shell. Conversation, knowledge, project detail and task detail are adapted sample panes using these shared foundations. They are not represented as an unmodified full native application. The synthetic conversations are authored illustrative examples, not recorded agent runs. Work mutations are local deterministic JavaScript, not native service execution.

`fixture.ts` supplies synthetic Alex records and the production Work service contract. No private database or user record was exported. `desktop.ts` rejects native operations. Build-time aliases keep the real network runtime outside the output import graph. In-memory changes reset on reload or Reset; nothing is transmitted.

## Supported interactions

- Switch Conversation, Work and Brain.
- Choose two prepared conversations and expand their context.
- Open linked project and knowledge records.
- Search/filter projects, switch cards/list/board, change allowed project stages, create a project.
- Complete/reopen a task, add a next step, inspect task details.
- Search sample notes and follow their connected project links.
- Reset all sample data.

The full application shell, model input, integrations, settings, native lifecycle and live evaluation harness are intentionally excluded. The visible banner identifies fictional data and no live AI.

## License

Kora source is MIT, copyright 2026 Mobolaji Ogunbiyi. See LICENSE-KORA. Dependencies retain their respective licenses. Rebuilds copy attribution into the published artifact.

Demo-specific upstream adaptation: the new-project form action label “Plan with Kora” is changed to “View conversation example”; this opens an illustrative example rather than implying the visitor draft is executed. Other production Work controls remain source-derived.
