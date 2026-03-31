# Contributing to OneRail

First off — thank you for considering contributing! OneRail is an open-source project and every contribution, whether it's a bug fix, a new feature, or improved documentation, is genuinely appreciated.

---

## Table of Contents

- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Branch Naming](#branch-naming)
- [Commit Style](#commit-style)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Project Areas](#project-areas)
- [Where to Ask for Help](#where-to-ask-for-help)

---

## Getting Started

Before contributing, make sure your local environment is working. Follow the full setup guide in [`docs/getting_started.md`](./docs/getting_started.md). At minimum you'll need:

- Node.js v18+
- PostgreSQL 14+ running locally
- The `web/` app running without errors (`npm run dev`)

---

## How to Contribute

1. **Find something to work on** — Browse [open issues](../../issues) or check the [`ROADMAP.md`](./ROADMAP.md) for planned features. If you have an idea not already tracked, open an issue first and describe what you want to do. This avoids duplicate work.

2. **Fork the repository** and clone your fork locally.

3. **Create a branch** from `main` (or `feature/*` for feature work — see branch naming below).

4. **Make your changes**, following the code style guidelines below.

5. **Test your changes** — run the app locally, verify the affected pages/APIs work, and check that nothing is broken.

6. **Open a Pull Request** against the appropriate base branch (see below).

---

## Branch Naming

Use the following prefixes:

| Prefix | Use for |
|---|---|
| `feature/` | New features or enhancements |
| `bugfix/` | Bug fixes |
| `docs/` | Documentation-only changes |
| `refactor/` | Code refactors with no behaviour change |
| `data/` | Data pipeline or ETL script changes |
| `chore/` | Dependency bumps, config changes |

Examples: `feature/station-detail-page`, `bugfix/atlas-missing-coords`, `docs/contributing-guide`

---

## Commit Style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `data`, `perf`

Scopes (optional but helpful): `atlas`, `search`, `train`, `station`, `pipeline`, `db`, `api`

Examples:
```
feat(atlas): add gauge filter toggle to map sidebar
fix(pipeline): handle overnight trains crossing midnight correctly
docs(db): document TrackSection model in database source of truth
data(osm): increase bounding box grid resolution for PBF import
```

Keep the subject line under 72 characters. Use the body for _why_, not _what_.

---

## Pull Request Process

1. **Base branch:**
   - Bug fixes → `main`
   - New features → `feature/<area>` if one exists, otherwise `main`

2. Fill out the PR template completely. At minimum explain what changed and how to test it.

3. PRs that touch the database schema must include the updated `schema.prisma` and any relevant migration notes.

4. PRs that touch the data pipeline (`tools/` or `web/scripts/`) should document the script's expected inputs/outputs in the corresponding `docs/` file (or create one).

5. A maintainer will review your PR. Be responsive to feedback — PRs that go silent for 2+ weeks may be closed.

---

## Code Style

- **TypeScript everywhere** in `web/`. Avoid `any` where possible.
- **No commented-out code** in PRs — delete it or open an issue instead.
- **No magic numbers** — use named constants.
- Prisma queries go through `src/lib/prisma.ts` — never create a second client instance.
- API routes live in `web/src/app/api/`. Keep them thin — business logic belongs in a lib file.
- For scripts (`web/scripts/`), always log progress and handle errors explicitly. Scripts that can run for minutes need heartbeat logging.

---

## Project Areas

If you're not sure where to start, here's a map of the codebase by area:

| Area | Path | What it does |
|---|---|---|
| Web app | `web/src/app/` | Next.js pages and API routes |
| Components | `web/src/components/` | Shared React components |
| Database schema | `web/prisma/schema.prisma` | Single source of truth for all models |
| Data scripts | `web/scripts/` | One-off data processing and import scripts |
| ETL tools | `tools/` | Scrapers and transformers (Bronze → Silver) |
| Documentation | `docs/` | Architecture and developer guides |

Good first issues are typically in the `docs/` area or small isolated bug fixes in the web app.

---

## Where to Ask for Help

- **GitHub Issues** — for bugs, feature requests, or questions about the codebase.
- **GitHub Discussions** (if enabled) — for broader ideas or design questions.

Please don't open issues for general Node.js/PostgreSQL/Next.js help — Stack Overflow is better for that.
