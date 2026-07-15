export interface Scores {
  /** mausig 🍷 */
  m: number;
  /** atzig 🚬 */
  a: number;
  /** fotzig 🫦 */
  f: number;
}

export interface Person extends Scores {
  id: string;
  name: string;
  createdAt: string;
}

export interface QuizAnswer {
  text: string;
  m: number;
  a: number;
  f: number;
}

export interface QuizQuestion {
  text: string;
  answers: QuizAnswer[];
}

export interface QuizHistoryEntry {
  question: string;
  answer: string;
}
