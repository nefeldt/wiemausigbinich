import {
  Alert,
  Button,
  Content,
  Heading,
  Label,
  LoadingSpinner,
  Modal,
  ProgressBar,
  Text,
  TextField,
} from "@mittwald/flow-react-components";
import type { OverlayController } from "@mittwald/flow-react-components";
import { useEffect, useState } from "react";
import { ApiError, getNextQuizQuestion, getQuizQuestions } from "../api";
import { formatPercentages } from "../ternary";
import type { QuizAnswer, QuizQuestion, Scores } from "../types";

const ADAPTIVE_COUNT = 5;
const STORAGE_KEY = "afm-quiz-state";
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Phase = "intro" | "loading" | "question" | "adaptive" | "result" | "error";

interface StoredQuiz {
  questions: QuizQuestion[];
  chosen: QuizAnswer[];
  batchCount: number;
  savedAt: number;
}

interface QuizModalProps {
  controller: OverlayController;
  defaultName: string;
  /** Save the result as a person on the triangle */
  onSave: (name: string, scores: Scores) => Promise<void>;
  /** Discard without saving — the result is only applied to the form sliders */
  onDiscard: (scores: Scores) => void;
}

// An aborted quiz is cached in the browser so it can be resumed later
function loadStored(): StoredQuiz | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredQuiz;
    if (
      !Array.isArray(parsed.questions) ||
      !Array.isArray(parsed.chosen) ||
      typeof parsed.batchCount !== "number" ||
      parsed.questions.length === 0 ||
      Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistStored(state: Omit<StoredQuiz, "savedAt">) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, savedAt: Date.now() }),
    );
  } catch {
    // storage full or unavailable — resuming is best-effort
  }
}

function clearStored() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function computeScores(chosen: QuizAnswer[]): Scores {
  const sums = chosen.reduce(
    (acc, ans) => ({ m: acc.m + ans.m, a: acc.a + ans.a, f: acc.f + ans.f }),
    { m: 0, a: 0, f: 0 },
  );
  const total = sums.m + sums.a + sums.f;
  if (total <= 0) return { m: 3.3, a: 3.3, f: 3.3 };
  const scale = (value: number) => Math.round((value / total) * 100) / 10;
  return { m: scale(sums.m), a: scale(sums.a), f: scale(sums.f) };
}

export function QuizModal({
  controller,
  defaultName,
  onSave,
  onDiscard,
}: QuizModalProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [chosen, setChosen] = useState<QuizAnswer[]>([]);
  const [batchCount, setBatchCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [stored, setStored] = useState<StoredQuiz | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isOpen = controller.useIsOpen();
  useEffect(() => {
    if (isOpen) setStored(loadStored());
  }, [isOpen]);

  const total = batchCount + ADAPTIVE_COUNT;
  // The current question index always equals the number of answers given
  const current = questions[chosen.length];

  const reset = () => {
    setPhase("intro");
    setQuestions([]);
    setChosen([]);
    setBatchCount(0);
    setError(null);
    setRateLimited(false);
    setName("");
    setSaving(false);
    setSaveError(null);
  };

  const close = () => {
    reset();
    controller.close();
  };

  const fail = (err: unknown) => {
    setRateLimited(err instanceof ApiError && err.status === 429);
    setError(
      err instanceof Error ? err.message : "Das Quiz konnte nicht geladen werden.",
    );
    setPhase("error");
  };

  const finish = (answered: QuizAnswer[]) => {
    setName(defaultName);
    setPhase("result");
    // keep the cache until the result is saved or discarded, so closing
    // the popup by accident doesn't lose the run
    persistStored({ questions, chosen: answered, batchCount });
  };

  const start = async () => {
    setPhase("loading");
    setError(null);
    clearStored();
    try {
      const batch = await getQuizQuestions();
      setQuestions(batch);
      setBatchCount(batch.length);
      setChosen([]);
      setPhase("question");
      persistStored({ questions: batch, chosen: [], batchCount: batch.length });
    } catch (err) {
      fail(err);
    }
  };

  // The last questions are generated one by one, based on the answers so far
  const fetchAdaptive = async (
    answered: QuizAnswer[],
    asked: QuizQuestion[],
    count: number,
  ) => {
    setPhase("adaptive");
    setError(null);
    try {
      const history = answered.map((ans, i) => ({
        question: asked[i].text,
        answer: ans.text,
      }));
      const nextQuestion = await getNextQuizQuestion(history);
      const allQuestions = [...asked, nextQuestion];
      setQuestions(allQuestions);
      setPhase("question");
      persistStored({ questions: allQuestions, chosen: answered, batchCount: count });
    } catch (err) {
      fail(err);
    }
  };

  const answer = (ans: QuizAnswer) => {
    const answered = [...chosen, ans];
    setChosen(answered);
    if (answered.length >= total) {
      finish(answered);
    } else if (answered.length >= questions.length) {
      void fetchAdaptive(answered, questions, batchCount);
    } else {
      persistStored({ questions, chosen: answered, batchCount });
    }
  };

  // Continue an aborted quiz from the browser cache
  const resume = () => {
    const saved = stored;
    if (!saved) {
      void start();
      return;
    }
    setQuestions(saved.questions);
    setChosen(saved.chosen);
    setBatchCount(saved.batchCount);
    const savedTotal = saved.batchCount + ADAPTIVE_COUNT;
    if (saved.chosen.length >= savedTotal) {
      setName(defaultName);
      setPhase("result");
    } else if (saved.chosen.length >= saved.questions.length) {
      void fetchAdaptive(saved.chosen, saved.questions, saved.batchCount);
    } else {
      setPhase("question");
    }
  };

  // Retrying resumes where the quiz failed instead of starting over
  const retry = () => {
    if (questions.length === 0) {
      void start();
    } else {
      void fetchAdaptive(chosen, questions, batchCount);
    }
  };

  const scores = phase === "result" ? computeScores(chosen) : null;

  const save = async (result: Scores) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError("Bitte gib einen Namen ein.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(trimmedName, result);
      clearStored();
      close();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      size="m"
      controller={controller}
      onClose={reset}
      isDismissable
      showCloseButton
    >
      <Heading>✨ Das KI-Quiz</Heading>
      <Content>
        {phase === "intro" && (
          <div className="afm-modal-stack afm-quiz__phase">
            <Text>
              Beantworte 15 Fragen und die KI findet heraus, wie mausig 🍷,
              atzig 🚬 und fotzig 🫦 du bist. Die ersten 10 Fragen werden
              vorab generiert — die letzten {ADAPTIVE_COUNT} entstehen live
              aus deinen Antworten.
            </Text>
            {stored && (
              <Alert status="info">
                <Content>
                  Du hast ein unfertiges Quiz ({stored.chosen.length}{" "}
                  beantwortet). Mach weiter oder starte neu.
                </Content>
              </Alert>
            )}
            <div className="afm-quiz__actions">
              {stored && (
                <Button color="primary" onPress={resume}>
                  Quiz fortsetzen
                </Button>
              )}
              <Button
                color={stored ? "secondary" : "primary"}
                variant={stored ? "soft" : "solid"}
                onPress={() => void start()}
              >
                {stored ? "Neu starten" : "Quiz starten"}
              </Button>
            </div>
          </div>
        )}

        {phase === "loading" && (
          <div className="afm-quiz__loading">
            <LoadingSpinner size="l" />
            <Text>Deine Fragen werden generiert…</Text>
          </div>
        )}

        {phase === "adaptive" && (
          <div className="afm-quiz__loading">
            <LoadingSpinner size="l" />
            <Text>Die KI liest deine Antworten und denkt sich eine Folgefrage aus…</Text>
          </div>
        )}

        {phase === "question" && current && (
          <div className="afm-modal-stack afm-quiz__phase">
            <ProgressBar value={chosen.length} minValue={0} maxValue={total}>
              <Label>
                Frage {chosen.length + 1} von {total}
              </Label>
            </ProgressBar>
            <Heading size="s">{current.text}</Heading>
            <div className="afm-quiz__answers">
              {current.answers.map((ans, i) => (
                <Button
                  key={i}
                  variant="outline"
                  color="secondary"
                  className="afm-quiz__answer"
                  onPress={() => answer(ans)}
                >
                  {ans.text}
                </Button>
              ))}
            </div>
          </div>
        )}

        {phase === "result" && scores && (
          <div className="afm-modal-stack afm-quiz__phase">
            <Heading size="s">Dein Ergebnis</Heading>
            <Text className="afm-quiz__result">
              {formatPercentages(scores)}
            </Text>
            <Text>Soll das Ergebnis so ins Dreieck gespeichert werden?</Text>
            {saveError && (
              <Alert status="danger">
                <Content>{saveError}</Content>
              </Alert>
            )}
            <TextField
              value={name}
              onChange={setName}
              maxLength={40}
              isRequired
            >
              <Label>Name</Label>
            </TextField>
            <div className="afm-quiz__actions">
              <Button
                color="primary"
                onPress={() => void save(scores)}
                isPending={saving}
              >
                Ins Dreieck speichern
              </Button>
              <Button
                variant="soft"
                color="secondary"
                onPress={() => {
                  clearStored();
                  onDiscard(scores);
                  close();
                }}
              >
                Nicht speichern
              </Button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="afm-modal-stack afm-quiz__phase">
            {rateLimited ? (
              <Alert status="warning">
                <Heading>Langsam, langsam</Heading>
                <Content>
                  Die KI schafft nur 30 Anfragen pro Minute und holt gerade
                  Luft. Warte ein paar Sekunden und versuch es dann nochmal —
                  dein Fortschritt bleibt erhalten.
                </Content>
              </Alert>
            ) : (
              <Alert status="danger">
                <Heading>Das Quiz hat gehakt</Heading>
                <Content>{error}</Content>
              </Alert>
            )}
            <Button variant="soft" color="secondary" onPress={retry}>
              Nochmal versuchen
            </Button>
          </div>
        )}
      </Content>
    </Modal>
  );
}
