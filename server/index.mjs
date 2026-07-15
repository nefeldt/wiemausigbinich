import { randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { quizRouter } from "./quiz.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "people.json");
const DIST_DIR = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT ?? 3000);
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
// Admin password from the deploy pipeline (GitHub secret APP_PASSWORD).
// It guards the runtime admin settings — empty = admin endpoints are open (local dev).
const ADMIN_PASSWORD = process.env.APP_PASSWORD ?? "";

const DEFAULT_SETTINGS = { deletePassword: "" };

async function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(await fs.readFile(SETTINGS_FILE, "utf8")) };
  } catch (err) {
    if (err.code === "ENOENT") return { ...DEFAULT_SETTINGS };
    throw err;
  }
}

async function writeSettings(settings) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${SETTINGS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2));
  await fs.rename(tmp, SETTINGS_FILE);
}

function timingSafeMatch(given, expected) {
  const g = Buffer.from(String(given));
  const e = Buffer.from(String(expected));
  return g.length === e.length && timingSafeEqual(g, e);
}

function adminOk(req) {
  if (!ADMIN_PASSWORD) return true;
  return timingSafeMatch(req.get("x-admin-password") ?? "", ADMIN_PASSWORD);
}

// Deleting people is unprotected by default; a password can be set at runtime
// through the admin settings
async function deleteAllowed(req) {
  const { deletePassword } = await readSettings();
  if (!deletePassword) return true;
  return timingSafeMatch(req.get("x-app-password") ?? "", deletePassword);
}

async function readPeople() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

// Mutations run serially through a promise chain; writes are atomic via temp file + rename
let queue = Promise.resolve();
function mutatePeople(mutator) {
  const run = queue.then(async () => {
    const people = await readPeople();
    const result = mutator(people);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(people, null, 2));
    await fs.rename(tmp, DATA_FILE);
    return result;
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function parseScore(value) {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) return null;
  if (num < 0 || num > 10) return null;
  return Math.round(num * 10) / 10;
}

const app = express();
app.use(express.json());

app.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/people", async (req, res, next) => {
  try {
    res.json(await readPeople());
  } catch (err) {
    next(err);
  }
});

app.post("/api/people", async (req, res, next) => {
  try {
    const { name, m, a, f } = req.body ?? {};
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const scores = { m: parseScore(m), a: parseScore(a), f: parseScore(f) };

    if (!trimmedName || trimmedName.length > 40) {
      return res
        .status(400)
        .json({ error: "A name is required (40 characters max)." });
    }
    if (scores.m === null || scores.a === null || scores.f === null) {
      return res
        .status(400)
        .json({ error: "m, a, and f must be numbers between 0 and 10." });
    }
    if (scores.m + scores.a + scores.f <= 0) {
      return res
        .status(400)
        .json({ error: "At least one score must be greater than 0." });
    }

    const person = {
      id: randomUUID(),
      name: trimmedName,
      ...scores,
      createdAt: new Date().toISOString(),
    };
    await mutatePeople((people) => people.push(person));
    res.status(201).json(person);
  } catch (err) {
    next(err);
  }
});

// Public app configuration (no secrets — only what the UI needs to know)
app.get("/api/config", async (req, res, next) => {
  try {
    const settings = await readSettings();
    res.json({ deleteRequiresPassword: Boolean(settings.deletePassword) });
  } catch (err) {
    next(err);
  }
});

// Admin: change the delete password while the app is running
app.put("/api/admin/delete-password", async (req, res, next) => {
  try {
    if (!adminOk(req)) {
      return res.status(401).json({ error: "Wrong admin password." });
    }
    const password = req.body?.password;
    if (typeof password !== "string" || password.length > 100) {
      return res
        .status(400)
        .json({ error: "password must be a string (empty to disable protection)." });
    }
    const settings = await readSettings();
    settings.deletePassword = password;
    await writeSettings(settings);
    res.json({ deleteRequiresPassword: Boolean(password) });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/people/:id", async (req, res, next) => {
  try {
    if (!(await deleteAllowed(req))) {
      return res.status(401).json({ error: "Wrong password." });
    }
    const removed = await mutatePeople((people) => {
      const index = people.findIndex((p) => p.id === req.params.id);
      if (index === -1) return false;
      people.splice(index, 1);
      return true;
    });
    if (!removed) return res.status(404).json({ error: "Person not found." });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.use("/api/quiz", quizRouter);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal server error." });
});

app.use(express.static(DIST_DIR));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(DIST_DIR, "index.html"), (err) => {
    if (err) next();
  });
});

const server = app.listen(PORT, () => {
  console.log(`AFM triangle listening on http://localhost:${PORT} (data: ${DATA_FILE})`);
});

// As PID 1 in the container, Node gets no default signal handlers — without
// this, a stop request is ignored until the platform SIGKILLs (exit code 137)
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
