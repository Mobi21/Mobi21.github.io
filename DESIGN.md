# Portfolio design system

## Direction

The site is a centered, dark, recruiter-first personal portfolio: direct, proof-first, and quiet enough to scan in ten seconds. Real product artifacts, sanitized interactive fixtures, and client-site screenshots carry the visual identity. It deliberately avoids landing-page theatrics, gradients, glows, card grids, tag clouds, decorative dashboards, and fake public-code links.

## Typography

- Display and body: Schibsted Grotesk, weights 400–700.
- Technical labels: IBM Plex Mono, weights 400–500.
- Type ramp: `0.8125rem`, `1rem`, `1.1875rem`, `clamp(1.5rem, 2vw, 1.875rem)`, `clamp(2rem, 4vw, 3.25rem)`, and `clamp(2.75rem, 7vw, 5.25rem)`.
- The 13px mono label is intentionally retained instead of reducing it to 12.8px solely to make the ratio mathematical; practical legibility wins.
- Body copy is 16px at 1.65 leading. Display and project headings use 1.1 leading.

## Color

- Canvas: cool near-black.
- Surfaces: two elevated graphite steps.
- Text: cool white with two muted levels.
- Accent: restrained electric cobalt for links, proof labels, and focus.
- Signal colors appear only when they communicate status inside proof artifacts.
- All functional text and controls target WCAG AA contrast.

## Layout

- Maximum content width: 72rem.
- Spacing follows a 4px-derived token scale from 4px through fluid 96px/144px section spacing.
- Homepage work is presented as three full-width artifact-and-copy records rather than equal cards or numbered scaffolding.
- Major evidence gets a bordered frame; other grouping uses whitespace and hairlines.
- Z-index tiers are intentionally small: sticky header `20`, skip link `100`.

## Responsive behavior

- Mobile starts as one column and retains all content.
- Navigation collapses below 40rem with a 44px minimum target.
- Project proof changes from three columns to stacked rows.
- Architecture diagrams reflow vertically and do not rely on hover.
- Every interactive demo has an equivalent no-JavaScript reading path.
- The site remains usable at 320px and removes nonessential motion under `prefers-reduced-motion`.
