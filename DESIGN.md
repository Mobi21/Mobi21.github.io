# Portfolio design system

## Direction

The site is a dark editorial engineering dossier: centered, direct, proof-first, and quiet enough for recruiters to scan. It deliberately avoids landing-page theatrics, gradients, glows, card grids, tag clouds, and fake product screenshots.

## Typography

- Display and body: Schibsted Grotesk, weights 400–700.
- Technical labels: IBM Plex Mono, weights 400–500.
- Type ramp: `0.8125rem`, `1rem`, `1.25rem`, `clamp(1.5625rem, 2.2vw, 2rem)`, and `clamp(2.25rem, 5vw, 4rem)`.
- The 13px mono label is intentionally retained instead of reducing it to 12.8px solely to make the ratio mathematical; practical legibility wins.
- Body copy is 16px at 1.65 leading. Display and project headings use 1.1 leading.

## Color

- Canvas: cool near-black.
- Surfaces: two elevated graphite steps.
- Text: cool white with two muted levels.
- Accent: restrained electric cobalt for links, proof labels, and focus.
- Signal red appears only in the availability and contact points.
- All functional text and controls target WCAG AA contrast.

## Layout

- Maximum content width: 70rem.
- Spacing follows a 4px-derived token scale from 4px through fluid 96px/144px section spacing.
- The three numbered project markers are a deliberate editorial index, not decorative step markers. They help recruiters map the work index to the full project records.
- Major evidence gets a bordered frame; other grouping uses whitespace and hairlines instead of cards.
- Z-index tiers are intentionally small: background `-1`, sticky header `20`, skip link `100`.

## Responsive behavior

- Mobile starts as one column and retains all content.
- Navigation collapses below 40rem with a 44px minimum target.
- Project proof changes from three columns to stacked rows.
- Architecture diagrams reflow vertically and do not rely on hover.
- The site remains usable at 320px and removes nonessential motion under `prefers-reduced-motion`.
