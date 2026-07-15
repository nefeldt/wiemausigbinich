import type { Person, Scores } from "./types";

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // response without a JSON body
    }
    throw new Error(message);
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

export function deletePerson(id: string, password: string): Promise<void> {
  return fetch(`/api/people/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-App-Password": password },
  }).then((r) => handle<void>(r));
}
