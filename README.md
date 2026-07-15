# Atzig-Fotzig-Mausig Triangle

A team triangle inspired by [atzigfotzigmausig.de](https://atzigfotzigmausig.de):
place yourself on a ternary chart between **mausig 🍷**, **atzig 🚬**, and **fotzig 🫦**.
Entries are stored server-side in a simple JSON file. You can also import your
result URL from atzigfotzigmausig.de (`…/result?m=4&a=2.8&f=6.2`) and export the
triangle as a pretty A4 PDF. The UI uses the mStudio dark theme via Flow design tokens.

See [REQUIREMENTS.md](./REQUIREMENTS.md) for requirements and the implementation plan.

## Stack

- React 19 + Vite + TypeScript, UI components from
  [mittwald Flow](https://github.com/mittwald/flow) (`@mittwald/flow-react-components`)
- Express server (Node 24) serving the API and the built frontend
- Persistence: JSON file at `$DATA_DIR/people.json` (defaults to `./data` locally,
  `/data` volume in the container)

## Development

```shell
npm install
npm run dev   # Express on :3000 + Vite dev server on :5173 (proxies /api)
```

## Production build

```shell
npm run build # type-check + vite build → dist/
npm start     # serves dist/ and the API on :3000
```

## API

| Method | Path             | Description                              |
| ------ | ---------------- | ---------------------------------------- |
| GET    | /api/people      | List all people                          |
| POST   | /api/people      | Add a person `{name, m, a, f}` (0–10)    |
| DELETE | /api/people/:id  | Remove a person (`X-App-Password` header) |
| GET    | /healthz         | Health check                             |

## Deployment (mittwald container hosting)

Pushing to `main` runs `.github/workflows/deploy.yml`:

1. Builds the Docker image and pushes it to GHCR (`ghcr.io/<repo>`)
2. Updates the mittwald container stack via `mittwald/deploy-container-action@v1`
   (`deploy/stack.yaml`, image tag injected as `IMAGE_TAG`)

Required GitHub repo configuration (already set up):

- Secret `MITTWALD_API_TOKEN` — mStudio API token
- Secret `STACK_ID` — container stack UUID (look up via
  `mw stack list --project-id <p-XXXXXX>`)
- Secret `APP_PASSWORD` — team password required to delete people
  (locally: set the `APP_PASSWORD` env var, or leave unset to disable the check)

Also make sure the GHCR image is public (or add GHCR registry credentials in
mStudio), and connect a domain/ingress to container port `3000`.
