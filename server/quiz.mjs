import express from "express";

const LLM_BASE_URL = (process.env.LLM_BASE_URL ?? "").replace(/\/$/, "");
const LLM_SECRET = process.env.LLM_SECRET ?? "";
const LLM_MODEL = process.env.LLM_MODEL || "Qwen3.6-35B-A3B-FP8";
const LLM_FALLBACK_MODEL = process.env.LLM_FALLBACK_MODEL || "Mistral-Medium-3.5-128B";
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 120_000);

const BATCH_SIZE = 10;

const SYSTEM_PROMPT = `You write questions for a humorous personality quiz in the style of atzigfotzigmausig.de.
The quiz places people in a triangle between three vibes:
- mausig (🍷): cozy, reserved, red-wine-and-blanket energy
- atzig (🚬): loud, blunt, corner-store chaos, zero manners but a big heart
- fotzig (🫦): dramatic, extra, lives loudly and aesthetically on the edge

Questions are in English, casual and funny, about everyday situations (parties, dating, vacation, conflict)
mixed with light office-life moments (standups, Slack messages, the office kitchen, team events).
A slight corporate flavor is fine, but never stiff HR speak — it stays playful and a little unhinged.
Each question has exactly 4 answer options. Each answer carries weights m, a, f (integers 0-3) for how strongly
it signals each vibe. The answers of a question must differ clearly in their weights.
Reply with raw JSON only — no markdown, no explanations.`;

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
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
  } catch (cause) {
    const err = new Error("The AI did not answer in time. Please try again.");
    err.status = 504;
    err.cause = cause;
    throw err;
  }
  if (response.status === 429) {
    const err = new Error(
      "The AI is rate limited right now (30 requests per minute). Wait a moment and try again.",
    );
    err.status = 429;
    throw err;
  }
  if (!response.ok) {
    // Log details server-side only — never forward upstream bodies (or anything
    // that could contain credentials) to the browser
    const body = await response.text().catch(() => "");
    console.error(`LLM request failed with status ${response.status}: ${body.slice(0, 500)}`);
    const err = new Error("The AI backend returned an error. Please try again.");
    err.status = 502;
    throw err;
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    const err = new Error("LLM returned an unexpected response shape.");
    err.status = 502;
    throw err;
  }
  return content;
}

async function callLlm(messages) {
  if (!LLM_BASE_URL || !LLM_SECRET) {
    const err = new Error("The quiz is not configured (LLM_BASE_URL / LLM_SECRET missing).");
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

// Models occasionally wrap JSON in code fences or prose despite instructions
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    const err = new Error("LLM response contained no JSON object.");
    err.status = 502;
    throw err;
  }
  return JSON.parse(text.slice(start, end + 1));
}

function clampWeight(value) {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(3, Math.round(num)));
}

function sanitizeQuestion(raw) {
  if (!raw || typeof raw.text !== "string" || !Array.isArray(raw.answers)) return null;
  const answers = raw.answers
    .filter((ans) => ans && typeof ans.text === "string" && ans.text.trim())
    .slice(0, 4)
    .map((ans) => ({
      text: ans.text.trim(),
      m: clampWeight(ans.m),
      a: clampWeight(ans.a),
      f: clampWeight(ans.f),
    }));
  if (answers.length < 3) return null;
  if (answers.every((ans) => ans.m + ans.a + ans.f === 0)) return null;
  return { text: raw.text.trim(), answers };
}

function formatHistory(history) {
  return history
    .map((entry, i) => `${i + 1}. Question: ${entry.question}\n   Answer: ${entry.answer}`)
    .join("\n");
}

export const quizRouter = express.Router();

// All batch questions in a single LLM request
quizRouter.post("/questions", async (req, res, next) => {
  try {
    const content = await callLlm([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Generate ${BATCH_SIZE} varied quiz questions. ` +
          `Reply with JSON in this shape: {"questions": [${QUESTION_JSON_SHAPE}, ...]}`,
      },
    ]);
    const parsed = extractJson(content);
    const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
      .map(sanitizeQuestion)
      .filter(Boolean)
      .slice(0, BATCH_SIZE);
    if (questions.length === 0) {
      const err = new Error("LLM returned no usable questions.");
      err.status = 502;
      throw err;
    }
    res.json({ questions });
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
      return res.status(400).json({ error: "history with previous answers is required." });
    }
    const content = await callLlm([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `The player has answered like this so far:\n${formatHistory(cleanHistory)}\n\n` +
          `Generate exactly ONE new follow-up question that digs into where the picture ` +
          `between mausig, atzig, and fotzig is still the most unclear. Feel free to wink ` +
          `at earlier answers. Do not repeat a question. ` +
          `Reply with JSON in this shape: {"question": ${QUESTION_JSON_SHAPE}}`,
      },
    ]);
    const parsed = extractJson(content);
    const question = sanitizeQuestion(parsed?.question);
    if (!question) {
      const err = new Error("LLM returned no usable question.");
      err.status = 502;
      throw err;
    }
    res.json({ question });
  } catch (err) {
    next(err);
  }
});
