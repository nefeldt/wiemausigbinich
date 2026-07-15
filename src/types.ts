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
