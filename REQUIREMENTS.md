# Atzig-Fotzig-Mausig Triangle — Requirements & Plan

A web app inspired by [atzigfotzigmausig.de](https://atzigfotzigmausig.de/result?m=4&a=2.8&f=6.2):
a ternary chart ("the triangle") with the three dimensions **mausig 🍷**, **atzig 🚬**, and
**fotzig 🫦**, in which people are placed. Meant as a shared team triangle: everyone adds
themselves, and all entries are stored server-side.

## Requirements

### Functional

1. **Triangle visualization**: a ternary chart with the corners mausig / atzig / fotzig.
   Every person appears as a labeled dot. The position is derived barycentrically from the
   three scores (normalized — only the ratio matters).
2. **Add people**: a form with a name and three scores (0–10 each, sliders) plus a live
   preview of the position in the triangle.
3. **Import from atzigfotzigmausig.de**: a result URL
   (`https://atzigfotzigmausig.de/result?m=4&a=2.8&f=6.2`) can be pasted; the `m`, `a`, `f`
   query parameters are parsed and filled into the form.
4. **Remove people**: entries can be deleted again — guarded by a **team password**.
   The delete button opens a password dialog; the server checks the password against
   the `APP_PASSWORD` environment variable (provided as a GitHub secret through the
   deploy pipeline; if unset, e.g. locally, deletion is unprotected).
5. **Persistence**: entries are persisted server-side — intentionally simple, as a
   **JSON file** (`people.json`). No database server, no native modules. In the container
   the file lives on a volume and survives restarts and deployments.
6. **Print/PDF export**: a "Print triangle" button generates a pretty A4 landscape PDF
   containing only the triangle (title, chart with all people, date footer). The chart is
   rendered to a canvas client-side and embedded via jsPDF — no server round-trip.
7. **AI quiz** (live in the web app): 15 questions determine your position in the
   triangle. The first 10 questions come from a **single** LLM request at quiz start;
   the last 5 are generated **one request each, based on the answers given so far**.
   The result appears as a popup asking whether to save it to the triangle (with name),
   or to only apply it to the form sliders. Aborted quizzes are cached in the browser
   (localStorage, 24 h) and can be resumed. The LLM gateway allows 30 requests/minute —
   a 429 is surfaced as a friendly rate-limit banner with a retry that keeps progress.
8. **Runtime admin settings**: deleting people is unprotected by default. A gear icon
   opens the admin dialog (authenticated with `APP_PASSWORD`), where a delete password
   can be set/cleared while the app is running — persisted in `settings.json` on the
   data volume, effective immediately.

### Non-functional

- **UI components**: [mittwald Flow](https://github.com/mittwald/flow)
  (`@mittwald/flow-react-components`). The triangle itself is a custom SVG component
  (Flow does not ship a ternary chart).
- **Design**: 1:1 the mStudio look, in the **dark theme** — achieved by activating
  Flow's design tokens via `<html data-theme="dark">` and styling all custom elements
  (page background, chart, list) exclusively with Flow token CSS variables
  (`--color--gray--*`, `--color--categorical--*` for the person dots, Inter font).
- **Deployment**: mittwald container hosting via GitHub Actions
  ([container actions guide](https://developer.mittwald.de/docs/v2/guides/deployment/container-actions/))
  using `mittwald/deploy-container-action`.
- **Language**: all code, docs, and UI copy in English (the three dimension names are
  proper nouns and stay as-is).

## Architecture

```
Browser ── React 19 + Vite + Flow ──► Express (Node 24)
                                        ├── GET/POST/DELETE /api/people
                                        ├── static frontend (dist/)
                                        └── JSON file  $DATA_DIR/people.json  (volume)
```

- **Frontend**: Vite + React 19 + TypeScript. Flow components for forms, layout, and
  feedback; a custom `TernaryChart` SVG component for the triangle.
- **Backend**: a small Express server (`server/index.mjs`, ESM, no build step).
  Writes are atomic (temp file + `rename`) and serialized through a promise queue.
- **Data model**: `{ id, name, m, a, f, createdAt }` — raw scores like on
  atzigfotzigmausig.de (scale 0–10); percentages are computed client-side.

## Deployment to mittwald

- **Dockerfile** (multi-stage): `node:24-alpine` builds the frontend; the runtime image
  contains only the server, `dist/`, and production dependencies. Listens on port `3000`.
- **`deploy/stack.yaml`**: one service `app` with port `3000/tcp` and a volume
  `data:/data` (holds `people.json`, `DATA_DIR=/data`).
- **GitHub Actions workflow** (`.github/workflows/deploy.yml`), on push to `main`:
  1. Build the image and push it to the GitHub Container Registry (GHCR)
  2. `mittwald/deploy-container-action@v1` updates the stack
     (image tag is templated into the stack file via `{{ .Env.IMAGE_TAG }}`)

### One-time prerequisites (mStudio / GitHub)

- GitHub secret `MITTWALD_API_TOKEN` — an mStudio API token ✅ (already set up)
- GitHub secret `STACK_ID` — the container stack UUID ✅ (already set up).
  Can be looked up with the CLI: `mw stack list --project-id <p-XXXXXX>`
- GitHub secret `APP_PASSWORD` — the **admin password** for the runtime settings dialog
- GitHub secret `LLM_BASE_URL` — OpenAI-compatible gateway base URL (incl. `/v1`)
- GitHub secret `LLM_SECRET` — bearer token for the gateway. **Server-side only**: the
  browser only ever talks to `/api/quiz/*`; the token never reaches the client, and
  upstream error bodies are logged server-side instead of being forwarded.
- GitHub secret `LLM_MODEL` — primary model (default `Qwen3.6-35B-A3B-FP8`); on errors
  or rate limits the server retries once with `Mistral-Medium-3.5-128B`
  (`LLM_FALLBACK_MODEL` env to override)
- Make the GHCR image **public** — or store GHCR registry credentials in mStudio
- Connect a domain/ingress in mStudio to port `3000` of the container

## Implementation steps

1. ✏️ This document (requirements + plan)
2. Project scaffold: Vite + React + TS, install Flow
3. Backend: Express + JSON file storage + API
4. Frontend: triangle, people management, URL import
5. Deployment: Dockerfile, `stack.yaml`, GitHub Actions workflow
6. Local verification (build, API tests, UI walkthrough)
