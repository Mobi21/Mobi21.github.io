# Mobolaji Ogunbiyi portfolio

Personal portfolio and resume site for Mobolaji Ogunbiyi.
Built as a small multi-page vanilla HTML/CSS/JS site, deployed via GitHub Pages.

Primary navigation: Home, Projects, Work & Writing, and About. Major projects have stable case-study routes; client work and longer technical pieces live under Work & Writing.

**Canonical:** https://mobolaji.builtbykora.com

The repository remains the GitHub Pages host. `builtbykora.com` is the separate Kora Studio business site.

## Custom-domain DNS

GitHub Pages is configured through `CNAME` for `mobolaji.builtbykora.com`. Cloudflare contains this record so the canonical URL resolves and GitHub can issue its certificate:

- Type: `CNAME`
- Name: `mobolaji`
- Target: `mobi21.github.io`
- Proxy status: `DNS only` during certificate provisioning
- TTL: `Auto`
