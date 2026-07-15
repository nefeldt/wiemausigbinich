# Atzig-Fotzig-Mausig-Dreieck — Anforderungen & Plan

Webapp nach dem Vorbild von [atzigfotzigmausig.de](https://atzigfotzigmausig.de/result?m=4&a=2.8&f=6.2):
Ein Ternärdiagramm ("Dreieck") mit den drei Dimensionen **mausig 🍷**, **atzig 🚬** und **fotzig 🫦**,
in dem Personen platziert werden. Gedacht als gemeinsames Team-Dreieck: Jeder trägt sich ein,
alle Einträge werden serverseitig gespeichert.

## Anforderungen

### Funktional

1. **Dreieck-Visualisierung**: Ternärdiagramm mit den Ecken mausig / atzig / fotzig.
   Jede Person erscheint als Punkt mit Namen. Die Position ergibt sich baryzentrisch
   aus den drei Werten (normalisiert, d. h. nur das Verhältnis zählt).
2. **Personen hinzufügen**: Formular mit Name + drei Werten (je 0–10, Schieberegler).
   Live-Vorschau der Position im Dreieck.
3. **Import von atzigfotzigmausig.de**: Eine Result-URL
   (`https://atzigfotzigmausig.de/result?m=4&a=2.8&f=6.2`) kann eingefügt werden;
   die Parameter `m`, `a`, `f` werden ausgelesen und ins Formular übernommen.
4. **Personen entfernen**: Einträge können wieder gelöscht werden.
5. **Speicherung**: Einträge werden serverseitig persistiert — bewusst simpel als
   **JSON-Datei** (`people.json`). Kein Datenbankserver, keine nativen Module.
   Im Container liegt die Datei auf einem Volume und überlebt Neustarts/Deployments.

### Nicht-funktional

- **UI-Komponenten**: [mittwald Flow](https://github.com/mittwald/flow)
  (`@mittwald/flow-react-components`). Das Dreieck selbst ist eine eigene
  SVG-Komponente (Flow bietet keine Charts).
- **Deployment**: mittwald Container Hosting per GitHub Actions
  ([Container-Actions-Guide](https://developer.mittwald.de/docs/v2/guides/deployment/container-actions/))
  mit `mittwald/deploy-container-action`.

## Architektur

```
Browser ── React 19 + Vite + Flow ──► Express (Node 24)
                                        ├── GET/POST/DELETE /api/people
                                        ├── Statisches Frontend (dist/)
                                        └── JSON-Datei  $DATA_DIR/people.json  (Volume)
```

- **Frontend**: Vite + React 19 + TypeScript. Flow-Komponenten für Formulare,
  Layout, Listen. Eigene `TernaryChart`-SVG-Komponente.
- **Backend**: Ein kleiner Express-Server (`server/index.mjs`, ESM, ohne Build-Schritt).
  Schreibzugriffe erfolgen atomar (Temp-Datei + `rename`) und serialisiert.
- **Datenmodell**: `{ id, name, m, a, f, createdAt }` — Rohwerte wie auf
  atzigfotzigmausig.de (Skala ~0–10); Prozente werden clientseitig berechnet.

## Deployment auf mittwald

- **Dockerfile** (multi-stage): `node:24-alpine` baut das Frontend, das Runtime-Image
  enthält nur Server + `dist/` + Prod-Dependencies. Läuft auf Port `3000`.
- **`deploy/stack.yaml`**: ein Service `app` mit Port `3000/tcp` und Volume
  `data:/data` (dort liegt `people.json`, `DATA_DIR=/data`).
- **GitHub-Actions-Workflow** (`.github/workflows/deploy.yml`), bei Push auf `main`:
  1. Image bauen und in die GitHub Container Registry (GHCR) pushen
  2. `mittwald/deploy-container-action@v1` aktualisiert den Stack
     (Image-Tag via `{{ .Env.IMAGE_TAG }}` ins Stack-File)

### Voraussetzungen (einmalig in mStudio / GitHub)

- Container-Stack im mittwald-Projekt anlegen → **Stack-ID** als GitHub-Variable `STACK_ID`
- **mStudio-API-Token** als GitHub-Secret `MITTWALD_API_TOKEN`
- GHCR-Image **public** stellen — oder GHCR-Zugangsdaten in mStudio als
  Registry-Credentials hinterlegen
- In mStudio eine Domain/Ingress auf Port `3000` des Containers verbinden

## Umsetzungsschritte

1. ✏️ Dieses Dokument (Anforderungen + Plan)
2. Projekt-Scaffold: Vite + React + TS, Flow installieren
3. Backend: Express + JSON-Datei-Storage + API
4. Frontend: Dreieck, Personen-Verwaltung, URL-Import
5. Deployment: Dockerfile, `stack.yaml`, GitHub-Actions-Workflow
6. Lokale Verifikation (Build, API-Tests, UI-Durchlauf)
