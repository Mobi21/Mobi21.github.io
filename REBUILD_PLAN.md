# Portfolio rebuild — implementation plan

Status: implemented and locally verified. Deployment verification is recorded in the task result.
Owner: primary Codex agent, with bounded independent project and QA audits.
Site: https://mobolaji.builtbykora.com

## Outcome

Remake the personal portfolio into a distinctive, approachable, product-led presentation of Mobolaji's engineering. Let visitors understand him, see actual work, explore useful demonstrations, inspect public source, and download the current one-page resume. Rebuild composition, information hierarchy, imagery, navigation, interactions, responsive layouts, and project storytelling together. Preserve stable incoming URLs. Keep the separate Kora Studio business site outside this implementation.

The user delegates design and implementation decisions and explicitly requests subagent audits. Proceed autonomously with reviewable local changes and visual iteration. No fabricated achievements, benchmark results, client testimonials, or simulated model execution presented as live execution.

## Sequence and page-by-page scope

### 1. Foundation and art direction

- Preserve existing work; check git status and create a dedicated implementation branch.
- Reconcile PRODUCT.md against the current resume and source audits; remove stale evidence claims.
- Set a new visual direction: friendly personal introduction, prominent product imagery, readable contemporary type, distinct project treatments, compact navigation, stronger contrast, and intentional motion. Avoid the existing oversized editorial hero and long preambles.
- Explore a visual composition before implementation; use the user's delegation to choose and refine it.
- Retain static hosting. Add a small reproducible generation/build layer only where useful for shared layouts and isolated interactive demos; do not introduce a server dependency for reading the portfolio.
- Define shared navigation, footer, buttons, project previews, media viewer, focus styles, spacing, and responsive behavior.

### 2. Home — /

- Introduce Mobolaji directly, with software engineering/applied AI focus and May 2027 graduation.
- Make selected work visible immediately; include a substantial Kora visual, KS App preview, and shipped client work with different useful visual treatments.
- Lead actions: explore work and resume; keep GitHub, contact, and LinkedIn easy to find.
- Add concise background and a compact Seneca Signal achievement feature if source assets support it.
- Put writing below the primary product story. No arbitrary benchmark score strips or exhaustive skill clouds.

### 3. Work index — /projects/

- Provide a visually useful index of Kora, KS App, commercial engineering, and appropriate supporting projects.
- Explain each product in a sentence; show an actual asset and project status.
- Make project, demo, repository, and live-site links distinguishable. Only offer actions that work.
- Move WorldBuilder into exploratory work rather than treating historical tests as headline proof.

### 4. Kora — /projects/kora/

- Before implementation, independent subagent deep dive into current/public React UI, native bridge, runtime boundaries, assets, license, and build constraints.
- Determine whether the real UI can build as a static browser application backed by deterministic synthetic fixtures. Prefer a small adapter or bounded extraction over a visual imitation.
- If feasible, embed the isolated demo lazily with an open-fullscreen option, keyboard access, reset, clear synthetic-data labeling, and functional navigation. Do not connect providers, native APIs, real accounts, or credentials. Preserve upstream attribution.
- If reuse would be disproportionately invasive, use actual product screenshots and a narrowly scoped honest interactive tour; document the decision instead of implying UI reuse.
- Present public GitHub prominently. Explain personal contribution around Pi, local state, tools/skills, retrieval, and shared surfaces.
- Explain the newer evaluation harness through a concrete scenario and actual implementation boundaries; no unrun rival-agent leaderboard or universal safety claims.

### 5. KS App — /projects/ks-app/

- Deep dive into current source, permission model, skills/tools, workflows, current product scope, and available real assets before authoring.
- Open with the business workspace and a clear user outcome; avoid a module inventory as the lead.
- Show real UI assets or a source-grounded synthetic walkthrough with explicit labeling. Demonstrate a coherent client/project/assistant workflow where supported.
- Explain shared domain services, tenant identity, approvals, durable execution, and uncertain-action reconciliation through concrete examples.
- Distinguish working implementation from release readiness and connected integration qualification. Omit canceled inbox product scope.

### 6. Commercial work — /commercial-work/

- Show client work early, with live links, actual screenshots, and per-project ownership.
- Audit linked descriptions against source/assets; never imply every client received every integration.
- Give Zube's Grub a direct route to its technical article. Present studio accomplishments compactly.
- Preserve the distinction between Mobolaji's engineering portfolio and studio services.

### 7. Supporting project — /projects/worldbuilder/

- Deep dive into current implementation versus historical version before rewriting.
- Describe the project's purpose, current state, and concrete engineering choices accurately.
- Remove misleading headline test-count evidence and scripted traces that appear to be live generation.
- Preserve the route and explain exploratory status; show real outputs only when available.

### 8. About — /about/

- Write a concise personal introduction with CS/Psychology context and engineering interests.
- Include relevant experience, POETS research, and Seneca Signal without recreating the entire resume.
- Link available poster/presentation assets where relevant and suitable for publication; do not publish unrelated private documents.
- Remove unsupported DAMS metrics. Keep contact and current resume immediately accessible.

### 9. Writing index — /work-writing/

- Rebuild as a compact, readable supporting library with concrete article summaries.
- Keep client case studies discoverable under Work rather than hiding them behind writing terminology.
- Remove repeated promotional prose and misleading aggregate project visuals.

### 10. Every existing article

- /work-writing/zubes-grub-system/: preserve valuable technical depth and diagrams; add a concise visual opening and navigable reading structure. Recheck layout, SVG readability, and narrow-screen interactions.
- /work-writing/websites-as-systems/: tighten abstract repetition, retain concrete engineering judgment, and apply the shared reading layout.
- /work-writing/building-with-ai/: retain personal process only where specific and defensible; avoid unsupported generic claims; apply the new reading layout.
- /work-writing/kora-runtime/: update public-source status and runtime/evaluation story, link the main Kora page, and remove stale benchmark emphasis.

### 11. Resume, metadata, and delivery

- Synchronize assets/resume.pdf with the canonical approved candidate PDF; preserve its one-page formatting.
- Keep canonical URLs, CNAME, sitemap, robots, document titles, descriptions, social previews, and meaningful link text consistent.
- Make builds and demo regeneration reproducible, record upstream source revision/licenses, and document maintenance.
- Finish a clean local candidate and inspect it before deploying through the existing GitHub Pages setup. Verify the live site after publication if deployment access is available; report any external blocker explicitly.

## Project deep-dive protocol

For each project: inspect AGENTS.md and relevant README/product docs; trace code supporting the proposed claims; locate real assets; distinguish shipped/live behavior from implementation and experiments; choose the most compelling demonstrable workflow; record source pointers and limitations; then author the page. Use bounded subagent audits where independent review helps, while the primary agent owns coherent design and integration.

## Acceptance and review

- Every existing route receives deliberate review and the shared redesign; no leftover old header/footer or mismatched styling.
- Home shows recognizable work early on mobile and desktop. Each featured page answers what it does, personal contribution, what can be inspected, and current status.
- All advertised demo controls work. Synthetic demos reset, use fictional data, and cannot invoke real external effects. No secrets/private runtime state in generated assets.
- Inspect screenshots of top, middle, and bottom sections at desktop, tablet, and 390/320px mobile. Test keyboard navigation, focus, menus, project links, demo states, media expansion, reduced motion, and text enlargement.
- Verify color contrast, no unintended horizontal overflow, headings/landmarks, alt text, touch targets, readable diagrams, and loading fallbacks.
- Run build plus meaningful automated link/asset and demo-behavior checks. Check browser console for application errors; do not mistake extension noise for site failures.
- Independent final content and visual/interaction audit; fix material findings and recheck affected views.
- Completion means implementation, verification, documentation, and available deployment are finished. Do not claim perfection or mark the goal complete for a partial prototype.

## Progress log

- Initial audit completed: current site buries visuals, presents static explanatory fixtures as demos (labeled), uses stale evidence, and serves an outdated resume.
- Kora UI-reuse audit and KS App/WorldBuilder content audits dispatched.

- Rebuilt eight core pages and integrated all four articles with the shared design.
- Kora static sample ships with production Work components and bounded adapted panes.
- Independent content, mechanical typography, and rendered desktop/mobile audits completed; material findings corrected.
- Current resume synchronized; local checks pass. Publishing through existing main-branch GitHub Pages source.
