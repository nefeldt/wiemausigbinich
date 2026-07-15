import express from "express";

const LLM_BASE_URL = (process.env.LLM_BASE_URL ?? "").replace(/\/$/, "");
const LLM_SECRET = process.env.LLM_SECRET ?? "";
const LLM_MODEL = process.env.LLM_MODEL || "Qwen3.6-35B-A3B-FP8";
const LLM_FALLBACK_MODEL = process.env.LLM_FALLBACK_MODEL || "Mistral-Medium-3.5-128B";
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 120_000);

const BATCH_SIZE = 10;

const SYSTEM_PROMPT = `Du schreibst Fragen für ein humorvolles deutsches Persönlichkeitsquiz im Stil von atzigfotzigmausig.de.
Das Quiz verortet Menschen in einem Dreieck zwischen drei Vibes:
- mausig (🍷): gemütlich, zurückhaltend, Rotwein-und-Decke-Energie
- atzig (🚬): laut, direkt, Späti-Chaos, null Manieren aber Herz
- fotzig (🫦): dramatisch, extra, lebt laut und ästhetisch auf Krawall

Die Fragen sind auf Deutsch (Du-Form), locker und witzig — über Alltag und Popkultur:
Musik, Netflix, Club, Dating, Urlaub, Essen, Emojis, Sonntage, Einkaufen, Kindheit.
Arbeit/Büro höchstens als seltene Ausnahme, kein Corporate-Sprech.

So klingen die Original-Fragen (Stil-Vorbilder — nicht wörtlich kopieren, erfinde eigene):
- "Wen hörst du am liebsten? 🎶" → Mark Forster (m3/a0/f1) | Mama Ikkimel (m0/a0/f1) | SSIO (m0/a1/f0)
- "Was guckst du auf Netflix? 🍿" → Die Discounter (m0/a3/f0) | Gossip Girl (m0/a0/f3) | Totoro (m1/a0/f0)
- "Wo bist du im Club? 🎉" → Ich passe auf die Getränke auf (m1/a0/f0) | Ich lege auf, na klar (m0/a0/f1) | Vorne links, wo Musik am besten schallert (m0/a1/f0)
- "Was machst du Sonntags?" → Babysitten (m1/a0/f0) | Auskatern (m0/a1/f0) | Sektbrunch (m1/a0/f3)
- "Dein nächster Urlaub geht..." → ins Allgäu (m1/a0/f0) | auf Malle (m0/a1/f0) | nach Marseille (m0/a0/f1)
- "Beziehungsstatus" → Langjährige Beziehung (m1/a0/f0) | Single (m0/a1/f0) | F+ oder Situationship (m0/a0/f1)
- "Was ist dein Lieblingsgetränk? 🍹" → Hugo (m1/a0/f0) | Jägermeister (m0/a1/f0) | Espresso Martini (m0/a0/f1)
- "Beim ersten Date tust du am liebsten..." → Spaziergang im Park (m1/a0/f0) | Macker im Billard abziehen (m0/a1/f0) | Cocktailbar (m0/a0/f1)

KURZ HALTEN: Jede Frage ist EIN knackiger Satz mit höchstens 12 Wörtern — kein Szenario-Aufbau,
keine Schachtelsätze. Jede Antwort ist eine kurze Phrase mit höchstens 7 Wörtern. Ein Emoji pro Frage ist okay.

Jede Frage hat genau 4 Antwortmöglichkeiten (die Beispiele haben nur 3 — du machst immer 4).
Jede Antwort trägt Gewichte m, a, f (ganze Zahlen 0-3), wie stark sie den jeweiligen Vibe signalisiert.
Die Antworten einer Frage müssen sich in ihren Gewichten klar unterscheiden.
Antworte ausschließlich mit reinem JSON — ohne Markdown, ohne Erklärungen.`;

const QUESTION_JSON_SHAPE = `{"text": "...", "answers": [{"text": "...", "m": 0, "a": 0, "f": 0}, ...]}`;

async function requestChatCompletion(model, messages) {
  let response;
  try {
    response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LLM_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.9,
        max_tokens: 2500,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
  } catch (cause) {
    const err = new Error("Die KI hat nicht rechtzeitig geantwortet. Bitte versuch es erneut.");
    err.status = 504;
    err.cause = cause;
    throw err;
  }
  if (response.status === 429) {
    const err = new Error(
      "Die KI ist gerade am Limit (30 Anfragen pro Minute). Warte kurz und versuch es nochmal.",
    );
    err.status = 429;
    throw err;
  }
  if (!response.ok) {
    // Log details server-side only — never forward upstream bodies (or anything
    // that could contain credentials) to the browser
    const body = await response.text().catch(() => "");
    console.error(`LLM request failed with status ${response.status}: ${body.slice(0, 500)}`);
    const err = new Error("Das KI-Backend hat einen Fehler gemeldet. Bitte versuch es erneut.");
    err.status = 502;
    throw err;
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    const err = new Error("Die KI hat eine unerwartete Antwort geliefert.");
    err.status = 502;
    throw err;
  }
  return content;
}

async function callLlm(messages) {
  if (!LLM_BASE_URL || !LLM_SECRET) {
    const err = new Error("Das Quiz ist nicht konfiguriert (LLM_BASE_URL / LLM_SECRET fehlen).");
    err.status = 503;
    throw err;
  }
  try {
    return await requestChatCompletion(LLM_MODEL, messages);
  } catch (err) {
    if (LLM_FALLBACK_MODEL === LLM_MODEL) throw err;
    console.warn(
      `Primary model ${LLM_MODEL} failed (${err.message}) — retrying with ${LLM_FALLBACK_MODEL}`,
    );
    return await requestChatCompletion(LLM_FALLBACK_MODEL, messages);
  }
}

// Models sometimes emit raw newlines/tabs inside JSON string literals,
// which JSON.parse rejects ("Bad control character in string literal")
function escapeControlCharsInStrings(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    const code = ch.codePointAt(0);
    if (code < 0x20) {
      out += code === 10 ? "\\n" : code === 9 ? "\\t" : " ";
      continue;
    }
    out += ch;
  }
  return out;
}

// Models occasionally wrap JSON in code fences or prose despite instructions
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    const err = new Error("Die KI-Antwort enthielt kein JSON.");
    err.status = 502;
    throw err;
  }
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    try {
      return JSON.parse(escapeControlCharsInStrings(slice));
    } catch (cause) {
      console.error("LLM returned unparseable JSON:", slice.slice(0, 500));
      const err = new Error("Die KI hat eine kaputte Antwort geliefert. Bitte versuch es erneut.");
      err.status = 502;
      err.cause = cause;
      throw err;
    }
  }
}

function clampWeight(value) {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(3, Math.round(num)));
}

// Collapse whitespace/newlines and hard-cap the length as a safety net
function clipText(text, max) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function sanitizeQuestion(raw) {
  if (!raw || typeof raw.text !== "string" || !Array.isArray(raw.answers)) return null;
  const answers = raw.answers
    .filter((ans) => ans && typeof ans.text === "string" && ans.text.trim())
    .slice(0, 4)
    .map((ans) => ({
      text: clipText(ans.text, 90),
      m: clampWeight(ans.m),
      a: clampWeight(ans.a),
      f: clampWeight(ans.f),
    }));
  if (answers.length < 3) return null;
  if (answers.every((ans) => ans.m + ans.a + ans.f === 0)) return null;
  return { text: clipText(raw.text, 160), answers };
}

function formatHistory(history) {
  const clip = (text) => text.replace(/\s+/g, " ").trim().slice(0, 160);
  return history
    .map((entry, i) => `${i + 1}. Frage: ${clip(entry.question)}\n   Antwort: ${clip(entry.answer)}`)
    .join("\n");
}

async function generateBatch() {
  // The random seed keeps any gateway-side prompt cache from serving
  // every player the exact same questions
  const content = await callLlm([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Erzeuge ${BATCH_SIZE} abwechslungsreiche Quizfragen. ` +
        `Variations-Seed: ${Math.random().toString(36).slice(2)} (ignorieren, sei einfach kreativ). ` +
        `Antworte mit JSON in dieser Form: {"questions": [${QUESTION_JSON_SHAPE}, ...]}`,
    },
  ]);
  const parsed = extractJson(content);
  const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .map(sanitizeQuestion)
    .filter(Boolean)
    .slice(0, BATCH_SIZE);
  if (questions.length === 0) {
    const err = new Error("Die KI hat keine brauchbaren Fragen geliefert.");
    err.status = 502;
    throw err;
  }
  return questions;
}

// The gateway can be slow under load or on cold starts, so ready-made
// batches are kept in memory and refilled in the background — quiz starts
// then respond instantly
const CACHE_TARGET = 2;
const batchCache = [];
let refilling = false;

async function refillBatchCache() {
  if (refilling || !LLM_BASE_URL || !LLM_SECRET) return;
  refilling = true;
  try {
    while (batchCache.length < CACHE_TARGET) {
      batchCache.push(await generateBatch());
      console.log(`Quiz batch cache refilled (${batchCache.length}/${CACHE_TARGET})`);
    }
  } catch (err) {
    console.warn(`Quiz batch cache refill failed: ${err.message}`);
  } finally {
    refilling = false;
  }
}

// Warm the cache shortly after boot
setTimeout(() => void refillBatchCache(), 3_000).unref();

export const quizRouter = express.Router();

// All batch questions in a single LLM request (served from the pre-generated
// cache when available)
quizRouter.post("/questions", async (req, res, next) => {
  try {
    const cached = batchCache.shift();
    if (cached) {
      res.json({ questions: cached });
      void refillBatchCache();
      return;
    }
    const questions = await generateBatch();
    res.json({ questions });
    void refillBatchCache();
  } catch (err) {
    next(err);
  }
});

// One adaptive follow-up question, based on the answers given so far
quizRouter.post("/next", async (req, res, next) => {
  try {
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const cleanHistory = history
      .filter(
        (entry) =>
          entry && typeof entry.question === "string" && typeof entry.answer === "string",
      )
      .slice(-30);
    if (cleanHistory.length === 0) {
      return res.status(400).json({ error: "history mit bisherigen Antworten ist erforderlich." });
    }
    const content = await callLlm([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Die Person hat bisher so geantwortet:\n${formatHistory(cleanHistory)}\n\n` +
          `Erzeuge genau EINE neue Folgefrage, die gezielt dort nachbohrt, wo das Bild ` +
          `zwischen mausig, atzig und fotzig noch am unklarsten ist. Ein dezentes ` +
          `Augenzwinkern auf eine frühere Antwort ist okay. Keine Frage wiederholen. ` +
          `Die Längenregeln gelten strikt: EIN Satz mit höchstens 12 Wörtern, Antworten ` +
          `höchstens 7 Wörter, keine Zeilenumbrüche. ` +
          `Antworte mit JSON in dieser Form: {"question": ${QUESTION_JSON_SHAPE}}`,
      },
    ]);
    const parsed = extractJson(content);
    const question = sanitizeQuestion(parsed?.question);
    if (!question) {
      const err = new Error("Die KI hat keine brauchbare Frage geliefert.");
      err.status = 502;
      throw err;
    }
    res.json({ question });
  } catch (err) {
    next(err);
  }
});
