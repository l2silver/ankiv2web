const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/**
 * Deterministic decoy letter: never equals `correct` (single a–z).
 * Used at overlap cells when the perpendicular word is not yet solved correctly.
 */
export function decoyLetter(correct: string, seed: string): string {
  const c = correct.toLowerCase().slice(0, 1);
  const pool = ALPHABET.split("").filter((ch) => ch !== c);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % pool.length;
  return pool[idx]!;
}
