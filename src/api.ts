import type {
  Person,
  QuizHistoryEntry,
  QuizQuestion,
  Scores,
} from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // response without a JSON body
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getPeople(): Promise<Person[]> {
  return fetch("/api/people").then((r) => handle<Person[]>(r));
}

export function addPerson(name: string, scores: Scores): Promise<Person> {
  return fetch("/api/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...scores }),
  }).then((r) => handle<Person>(r));
}

export async function getQuizQuestions(): Promise<QuizQuestion[]> {
  const response = await fetch("/api/quiz/questions", { method: "POST" });
  const data = await handle<{ questions: QuizQuestion[] }>(response);
  return data.questions;
}

export async function getNextQuizQuestion(
  history: QuizHistoryEntry[],
): Promise<QuizQuestion> {
  const response = await fetch("/api/quiz/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history }),
  });
  const data = await handle<{ question: QuizQuestion }>(response);
  return data.question;
}

export function deletePerson(id: string, password: string): Promise<void> {
  return fetch(`/api/people/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-App-Password": password },
  }).then((r) => handle<void>(r));
}

export interface AppConfig {
  deleteRequiresPassword: boolean;
}

export function getConfig(): Promise<AppConfig> {
  return fetch("/api/config").then((r) => handle<AppConfig>(r));
}

export function setDeletePassword(
  adminPassword: string,
  newPassword: string,
): Promise<AppConfig> {
  return fetch("/api/admin/delete-password", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Password": adminPassword,
    },
    body: JSON.stringify({ password: newPassword }),
  }).then((r) => handle<AppConfig>(r));
}
