import { dailyCuriousEditorial } from './content';
import type { CuriousBriefing } from './types';

export async function getDailyBriefing(date: string): Promise<CuriousBriefing> {
  // Returns deterministic daily curated briefing:
  // 1. Today in History
  // 2. Today's Reading (from ~100 world authors pool)
  // 3. Brain Exercise (alternating math & physics with interactive hint & solution)
  return dailyCuriousEditorial(date);
}
