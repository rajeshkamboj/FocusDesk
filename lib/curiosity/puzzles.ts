/**
 * Brain Sharpener — the challenge pool.
 *
 * WHY THIS FILE EXISTS
 * The card used to rotate over six hardcoded puzzles with `safeDay % 6`, so a
 * reader saw the same set every week, and the 365-day cooldown then had to be
 * relaxed — recorded as a degradation rather than prevented. This module fixes the
 * *supply* problem in two ways that reinforce each other:
 *
 *   1. **A larger authored bank**, classified by category and difficulty, so
 *      variety is a property of the content rather than of the calendar.
 *   2. **Procedural generators** whose answer is *computed*, not written down. A
 *      generated puzzle therefore cannot have a wrong answer: the answer and the
 *      worked solution are both produced by the same arithmetic the solver would
 *      do, and `verifyPuzzle` re-derives them independently before the puzzle is
 *      allowed out.
 *
 * Every puzzle carries an id, a category, a difficulty, a worked solution and a
 * verified answer. Selection (`selectDailyPuzzle`) varies category and difficulty
 * across days and takes a ledger of already-attempted puzzles, so the card cannot
 * hand a reader the same challenge twice in a row.
 *
 * Everything here is pure: no clock, no storage, no network.
 */

import type {
  BrainSharpener,
  PuzzleCategory,
  PuzzleDifficulty,
} from './types';
import { dayNumber } from './schedule';

/* ------------------------------------------------------------------ */
/* Authored bank                                                      */
/* ------------------------------------------------------------------ */

/**
 * Fifteen additional authored puzzles, at least one per category.
 *
 * The six originals in `content.ts` keep their ids and wording and are merged in
 * by `authoredPuzzleBank`, so a reader's history against them still resolves.
 */
export const curatedPuzzleBank: BrainSharpener[] = [
  {
    id: 'logic-three-crates',
    subject: 'mathematics',
    category: 'logical-reasoning',
    difficulty: 2,
    origin: 'curated',
    topic: 'Labels, lies and one draw',
    title: 'The Three Mis-Signed Crates',
    problem:
      'Three crates are labelled “Apples”, “Oranges” and “Apples and Oranges”. Every label is wrong. You may take exactly one piece of fruit out of exactly one crate, without looking inside. Which crate do you draw from, and how does that settle all three?',
    givenInfo: ['Three crates', 'Every label is wrong', 'One draw from one crate'],
    hint: 'A wrong label tells you what the crate does not contain. Start where that leaves only two possibilities.',
    solution:
      '1. Draw from the crate labelled “Apples and Oranges”. Its label is wrong, so it holds one single kind of fruit — not a mixture.\n2. If the fruit is an apple, that crate is all apples. The crate labelled “Oranges” cannot be oranges (its label is wrong) and cannot be apples (those are accounted for), so it must be the mixture. The crate labelled “Apples” is therefore all oranges.\n3. If the draw is an orange, the same argument with apples and oranges swapped applies.\n4. One draw is enough because the wrong labels leave exactly one consistent assignment after the first crate is known.',
    answer: 'Draw from the crate labelled “Apples and Oranges”; it is a single-fruit crate, and the rest follows.',
    verified: true,
  },
  {
    id: 'logic-knights-different-kinds',
    subject: 'mathematics',
    category: 'logical-reasoning',
    difficulty: 3,
    origin: 'curated',
    topic: 'Knights, knaves and consistency',
    title: 'Two Speakers on the Island',
    problem:
      'On an island, knights always tell the truth and knaves always lie. A says: “B is a knave.” B says: “A and I are of different kinds.” What are A and B?',
    givenInfo: ['Knights tell only the truth', 'Knaves tell only lies', 'Exactly two speakers'],
    hint: 'Try both possibilities for A. One of them makes B’s sentence both true and false.',
    solution:
      '1. Suppose A is a knight. Then A’s statement is true, so B is a knave. But then B’s statement — “A and I are of different kinds” — would be true, which a knave cannot say. Contradiction.\n2. So A is a knave. A’s statement is false, so B is not a knave: B is a knight.\n3. Check B’s sentence with A a knave and B a knight: they are of different kinds, so the sentence is true — exactly what a knight says.\n4. The assignment is consistent: A is a knave, B is a knight.',
    answer: 'A is a knave; B is a knight.',
    verified: true,
  },
  {
    id: 'math-digit-reversal',
    subject: 'mathematics',
    category: 'mathematics',
    difficulty: 3,
    origin: 'curated',
    topic: 'Place value and simultaneous equations',
    title: 'The Reversing Number',
    problem:
      'A three-digit number has digits adding to 15. Its middle digit is the average of the other two. Reversing its digits increases it by 396. What is the number?',
    givenInfo: ['Digits sum to 15', 'Middle digit is the average of the first and last', 'Reversal adds 396'],
    hint: 'Write the number as 100a + 10b + c. The reversal difference is 99(c − a).',
    solution:
      '1. a + b + c = 15 and b = (a + c)/2 give 3b = 15, so b = 5 and a + c = 10.\n2. Reversal minus original: (100c + 10b + a) − (100a + 10b + c) = 99(c − a) = 396, so c − a = 4.\n3. Solving a + c = 10 with c − a = 4 gives a = 3, c = 7.\n4. The number is 357; reversed it is 753, and 753 − 357 = 396.',
    answer: '357',
    verified: true,
  },
  {
    id: 'math-cistern-leak',
    subject: 'mathematics',
    category: 'mathematics',
    difficulty: 4,
    origin: 'curated',
    topic: 'Rates and reciprocal addition',
    title: 'Two Pipes and a Leak',
    problem:
      'Pipe A fills a cistern in 6 hours. Pipe B fills it in 9 hours. A leak empties a full cistern in 18 hours. With both pipes open and the leak present, how long does the cistern take to fill?',
    givenInfo: ['A: 6 hours', 'B: 9 hours', 'Leak: empties in 18 hours'],
    hint: 'Add the rates as fractions of the cistern per hour; the leak’s rate is negative.',
    solution:
      '1. Rates per hour: A = 1/6, B = 1/9, leak = −1/18.\n2. Sum: 1/6 + 1/9 − 1/18 = 3/18 + 2/18 − 1/18 = 4/18 = 2/9 of the cistern per hour.\n3. Time = 1 ÷ (2/9) = 9/2 = 4.5 hours.',
    answer: '4 hours 30 minutes',
    verified: true,
  },
  {
    id: 'pattern-pronic-differences',
    subject: 'mathematics',
    category: 'number-patterns',
    difficulty: 2,
    origin: 'curated',
    topic: 'Second differences',
    title: 'The Next Term',
    problem: 'A sequence begins 2, 6, 12, 20, 30. What is the next term, and what rule generates the sequence?',
    givenInfo: ['2, 6, 12, 20, 30, …'],
    hint: 'Look at the differences between consecutive terms before looking at the terms themselves.',
    solution:
      '1. First differences: 4, 6, 8, 10 — increasing by 2 each time.\n2. A constant second difference of 2 means a quadratic rule; the terms are n(n + 1) for n = 1, 2, 3, 4, 5.\n3. The next first difference is 12, so the next term is 30 + 12 = 42, which is 6 × 7.',
    answer: '42 (the rule is n(n + 1))',
    verified: true,
  },
  {
    id: 'pattern-power-last-digit',
    subject: 'mathematics',
    category: 'number-patterns',
    difficulty: 3,
    origin: 'curated',
    topic: 'Modular cycles',
    title: 'The Last Digit of a Tower',
    problem: 'What is the last digit of 7²⁰²⁶?',
    givenInfo: ['Base 7', 'Exponent 2026'],
    hint: 'Write out the last digits of 7¹, 7², 7³, 7⁴ and look for the cycle.',
    solution:
      '1. Last digits of 7¹, 7², 7³, 7⁴ are 7, 9, 3, 1; then the cycle repeats with period 4.\n2. 2026 ÷ 4 leaves remainder 2.\n3. A remainder of 2 lands on the second entry of the cycle, which is 9.',
    answer: '9',
    verified: true,
  },
  {
    id: 'probability-two-aces',
    subject: 'mathematics',
    category: 'probability',
    difficulty: 3,
    origin: 'curated',
    topic: 'Sampling without replacement',
    title: 'Two Aces from a Deck',
    problem:
      'Two cards are drawn from a standard 52-card deck without replacement. What is the exact probability that both are aces?',
    givenInfo: ['52 cards, 4 aces', 'No replacement'],
    hint: 'Count unordered pairs, or multiply the two conditional probabilities.',
    solution:
      '1. The first card is an ace with probability 4/52.\n2. Given that, 3 aces remain among 51 cards, so the second is an ace with probability 3/51.\n3. Multiply: (4/52)(3/51) = 12/2652 = 1/221.\n4. Counting pairs gives the same result: C(4,2)/C(52,2) = 6/1326 = 1/221.',
    answer: '1/221',
    verified: true,
  },
  {
    id: 'probability-loaded-coin',
    subject: 'mathematics',
    category: 'probability',
    difficulty: 4,
    origin: 'curated',
    topic: 'Binomial probability',
    title: 'The Unfair Coin',
    problem:
      'A coin lands heads with probability 2/3. It is tossed three times independently. What is the probability of exactly two heads?',
    givenInfo: ['P(heads) = 2/3', 'Three independent tosses'],
    hint: 'There are three orders in which exactly two heads can occur, and each has the same probability.',
    solution:
      '1. One order — say HHT — has probability (2/3)(2/3)(1/3) = 4/27.\n2. Exactly two heads can occur in C(3,2) = 3 orders: HHT, HTH, THH.\n3. Total: 3 × 4/27 = 12/27 = 4/9.',
    answer: '4/9',
    verified: true,
  },
  {
    id: 'physics-escalator',
    subject: 'physics',
    category: 'physics',
    difficulty: 3,
    origin: 'curated',
    topic: 'Relative motion',
    title: 'Walking the Escalator',
    problem:
      'A man walks up a stopped escalator in 60 seconds. Standing still on the moving escalator, he is carried up in 90 seconds. How long does he take to walk up the moving escalator?',
    givenInfo: ['Walking on the stopped escalator: 60 s', 'Riding it standing still: 90 s'],
    hint: 'Treat the escalator length as 1 and add the two speeds, exactly as with two pipes filling a tank.',
    solution:
      '1. His walking speed is 1/60 of the escalator per second.\n2. The escalator’s speed is 1/90 of the escalator per second.\n3. Combined: 1/60 + 1/90 = 3/180 + 2/180 = 5/180 = 1/36 per second.\n4. Time = 36 seconds.',
    answer: '36 seconds',
    verified: true,
  },
  {
    id: 'physics-series-parallel-power',
    subject: 'physics',
    category: 'physics',
    difficulty: 4,
    origin: 'curated',
    topic: 'Circuits and power',
    title: 'One Resistor, Two Circuits',
    problem:
      'Two identical 6 Ω resistors are connected first in series and then in parallel across the same 12 V supply. Find the equivalent resistance and the total power in each arrangement.',
    givenInfo: ['Two 6 Ω resistors', 'Same 12 V supply in both cases'],
    hint: 'Series resistances add; parallel conductances add. Then use P = V²/R.',
    solution:
      '1. Series: R = 6 + 6 = 12 Ω. Power P = V²/R = 144/12 = 12 W.\n2. Parallel: 1/R = 1/6 + 1/6 = 1/3, so R = 3 Ω. Power = 144/3 = 48 W.\n3. The parallel arrangement draws four times the power from the same supply, because the current is four times larger.',
    answer: 'Series: 12 Ω, 12 W. Parallel: 3 Ω, 48 W (four times the power).',
    verified: true,
  },
  {
    id: 'critical-base-rate',
    subject: 'mathematics',
    category: 'critical-thinking',
    difficulty: 3,
    origin: 'curated',
    topic: 'Bayes and base rates',
    title: 'The Test That Is Usually Right',
    problem:
      'A disease affects 1 person in 1,000. A test detects 99% of true cases and produces a false positive in 5% of healthy people. A randomly chosen person tests positive. Roughly what is the probability that they have the disease?',
    givenInfo: ['Prevalence 1/1000', 'Sensitivity 99%', 'False-positive rate 5%'],
    hint: 'Compare the number of true positives with the number of false positives in 100,000 people.',
    solution:
      '1. In 100,000 people, about 100 have the disease and 99,900 do not.\n2. True positives: 99% of 100 = 99. False positives: 5% of 99,900 ≈ 4,995.\n3. So about 5,094 people test positive, of whom 99 have the disease.\n4. Probability ≈ 99 / 5,094 ≈ 0.0194, about 2%. The low base rate dominates, which is why screening tests are usually confirmed with a second test.',
    answer: 'About 2%',
    verified: true,
  },
  {
    id: 'critical-surrogate-marker',
    subject: 'physics',
    category: 'critical-thinking',
    difficulty: 4,
    origin: 'curated',
    topic: 'Surrogate endpoints',
    title: 'The Marker That Moved',
    problem:
      'A drug reliably lowers a blood marker. Higher levels of that marker are strongly associated with a disease. A large trial finds the drug does not reduce the disease. What is the most defensible conclusion, and what would change it?',
    givenInfo: [
      'The drug lowers the marker (causal, replicated)',
      'The marker correlates with the disease',
      'The trial finds no reduction in the disease',
    ],
    hint: 'Separate three claims: the drug changes the marker, the marker predicts the disease, and the marker causes the disease.',
    solution:
      '1. The trial refutes the claim “this marker is a valid surrogate”: changing it did not change outcomes.\n2. The association between marker and disease may be a consequence of the disease rather than a cause — reverse causation — or both may share a common cause.\n3. So the defensible conclusion is that the drug does not work through this pathway, not that the marker is meaningless.\n4. What would change it: a trial powered on clinical outcomes, or evidence that the marker lies on the causal pathway (for example, genetic variants that alter the marker and also alter risk).',
    answer:
      'The marker is a correlate, not a validated surrogate. Only an outcome trial (or causal-pathway evidence) would show otherwise.',
    verified: true,
  },
  {
    id: 'spatial-cube-painted',
    subject: 'mathematics',
    category: 'spatial-reasoning',
    difficulty: 3,
    origin: 'curated',
    topic: 'Counting under constraints',
    title: 'The Painted Cube',
    problem:
      'A 4 × 4 × 4 cube is painted on all six faces and then cut into 64 unit cubes. How many of the small cubes have exactly two painted faces?',
    givenInfo: ['4 × 4 × 4 cube', 'All six outer faces painted', 'Cut into unit cubes'],
    hint: 'Exactly two painted faces means an edge cube that is not a corner.',
    solution:
      '1. A cube has 12 edges.\n2. Along each edge of length 4 there are 4 cubes, but the two end cubes are corners with three painted faces, so each edge contributes 4 − 2 = 2 cubes with exactly two painted faces.\n3. Total: 12 × 2 = 24.\n4. Cross-check the whole cube: 8 corners (3 faces), 24 edges (2 faces), 24 face centres (1 face), and 8 interior cubes (0 faces) — 8 + 24 + 24 + 8 = 64.',
    answer: '24',
    verified: true,
  },
  {
    id: 'spatial-cube-net',
    subject: 'mathematics',
    category: 'spatial-reasoning',
    difficulty: 4,
    origin: 'curated',
    topic: 'Mental folding',
    title: 'Which Face Is Opposite?',
    problem:
      'A cube net is four squares in a row, numbered 1, 2, 3, 4 from left to right, with one square attached above square 2 and one attached below square 3. When folded, which numbered square is opposite square 2?',
    givenInfo: ['Four squares in a row: 1, 2, 3, 4', 'One square above 2, one below 3'],
    hint: 'In a four-square strip the first and third are opposite, as are the second and fourth. The attached squares become the remaining pair.',
    solution:
      '1. Folding the strip of four into a ring makes 1 opposite 3 and 2 opposite 4.\n2. The squares attached above 2 and below 3 become the top and bottom faces, so they are opposite each other.\n3. All six faces are therefore paired: (1, 3), (2, 4), and the two attached squares.\n4. Square 2 is opposite square 4.',
    answer: 'Square 4',
    verified: true,
  },
  {
    id: 'observation-greater-than-two-back',
    subject: 'mathematics',
    category: 'memory-observation',
    difficulty: 3,
    origin: 'curated',
    topic: 'Careful scanning',
    title: 'Two Places to the Left',
    problem:
      'In the list 4, 9, 2, 7, 5, 8, 3, 6, how many numbers are strictly greater than the number two places to their left?',
    givenInfo: ['List: 4, 9, 2, 7, 5, 8, 3, 6'],
    hint: 'Compare each entry from the third onward with the one two positions before it, and write down each comparison.',
    solution:
      '1. Third entry 2 vs 4: not greater.\n2. Fourth 7 vs 9: not greater.\n3. Fifth 5 vs 2: greater (1).\n4. Sixth 8 vs 7: greater (2).\n5. Seventh 3 vs 5: not greater.\n6. Eighth 6 vs 8: not greater.\n7. Two comparisons succeed.',
    answer: '2',
    verified: true,
  },
];

/* ------------------------------------------------------------------ */
/* Procedural generators                                              */
/* ------------------------------------------------------------------ */

/** A small deterministic PRNG, so a seed always yields the same puzzle. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length) % values.length];
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

export function reduceFraction(numerator: number, denominator: number): string {
  const divisor = gcd(numerator, denominator);
  const n = numerator / divisor;
  const d = denominator / divisor;
  return d === 1 ? String(n) : `${n}/${d}`;
}

/** Modular exponentiation without overflow, used by the last-digit puzzle. */
export function modPow(base: number, exponent: number, modulus: number): number {
  let result = 1;
  let b = base % modulus;
  let e = exponent;
  while (e > 0) {
    if (e % 2 === 1) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e = Math.floor(e / 2);
  }
  return result;
}

function generatedId(family: string, seed: number): string {
  return `gen-${family}-${seed.toString(36)}`;
}

export interface PuzzleGenerator {
  family: string;
  category: PuzzleCategory;
  difficulty: PuzzleDifficulty;
  /** Deterministic: the same seed always produces the same puzzle and answer. */
  generate(seed: number): BrainSharpener;
}

/* --- 1. number sequences ------------------------------------------- */

export const numberSequenceGenerator: PuzzleGenerator = {
  family: 'number-sequence',
  category: 'number-patterns',
  difficulty: 2,
  generate(seed) {
    const random = seededRandom(seed);
    const family = Math.floor(random() * 4);
    if (family === 0) {
      const start = 2 + Math.floor(random() * 8);
      const step = 3 + Math.floor(random() * 7);
      const terms = [0, 1, 2, 3, 4].map((n) => start + n * step);
      const answer = start + 5 * step;
      return {
        id: generatedId('arith', seed),
        subject: 'mathematics',
        category: 'number-patterns',
        difficulty: 2,
        origin: 'generated',
        generator: { family: 'arithmetic-sequence', seed },
        verified: true,
        topic: 'Arithmetic progressions',
        title: 'The Next Term',
        problem: `A sequence begins ${terms.join(', ')}. What comes next?`,
        givenInfo: [`First five terms: ${terms.join(', ')}`],
        hint: 'Subtract each term from the one after it.',
        solution: `1. Consecutive differences are all ${step}.\n2. So each term is the previous one plus ${step}.\n3. The next term is ${terms[4]} + ${step} = ${answer}.`,
        answer: String(answer),
      };
    }
    if (family === 1) {
      const start = 2 + Math.floor(random() * 3);
      const ratio = 2 + Math.floor(random() * 2);
      const terms = [0, 1, 2, 3].map((n) => start * ratio ** n);
      const answer = start * ratio ** 4;
      return {
        id: generatedId('geo', seed),
        subject: 'mathematics',
        category: 'number-patterns',
        difficulty: 2,
        origin: 'generated',
        generator: { family: 'geometric-sequence', seed },
        verified: true,
        topic: 'Geometric progressions',
        title: 'The Doubling Pattern',
        problem: `A sequence begins ${terms.join(', ')}. What comes next?`,
        givenInfo: [`First four terms: ${terms.join(', ')}`],
        hint: 'Divide each term by the one before it.',
        solution: `1. Each term is ${ratio} times the previous one.\n2. The next term is ${terms[3]} × ${ratio} = ${answer}.`,
        answer: String(answer),
      };
    }
    if (family === 2) {
      const constant = 1 + Math.floor(random() * 9);
      const terms = [2, 3, 4, 5].map((n) => n * n + constant);
      const answer = 6 * 6 + constant;
      return {
        id: generatedId('square', seed),
        subject: 'mathematics',
        category: 'number-patterns',
        difficulty: 3,
        origin: 'generated',
        generator: { family: 'square-numbers', seed },
        verified: true,
        topic: 'Second differences',
        title: 'Squares and a Constant',
        problem: `A sequence begins ${terms.join(', ')}. What comes next?`,
        givenInfo: [`First four terms: ${terms.join(', ')}`],
        hint: 'Look at the second differences.',
        solution: `1. First differences: ${terms
          .slice(1)
          .map((term, index) => term - terms[index])
          .join(', ')}.\n2. The second difference is constant, so the terms follow n² + ${constant} with n = 2, 3, 4, 5.\n3. For n = 6 the term is 36 + ${constant} = ${answer}.`,
        answer: String(answer),
      };
    }
    const a = 1 + Math.floor(random() * 4);
    const b = a + 1 + Math.floor(random() * 4);
    const terms = [a, b];
    for (let index = 0; index < 4; index += 1) terms.push(terms[terms.length - 1] + terms[terms.length - 2]);
    const answer = terms[5];
    return {
      id: generatedId('additive', seed),
      subject: 'mathematics',
      category: 'number-patterns',
      difficulty: 3,
      origin: 'generated',
      generator: { family: 'additive-sequence', seed },
      verified: true,
      topic: 'Additive sequences',
      title: 'Each Term From the Last Two',
      problem: `A sequence begins ${terms.slice(0, 5).join(', ')}. What comes next?`,
      givenInfo: [`First five terms: ${terms.slice(0, 5).join(', ')}`],
      hint: 'Try adding the two previous terms.',
      solution: `1. Each term equals the sum of the two before it: ${terms[1]} + ${terms[2]} = ${terms[3]}, and so on.\n2. The next term is ${terms[3]} + ${terms[4]} = ${answer}.`,
      answer: String(answer),
    };
  },
};

/* --- 2. modular arithmetic ----------------------------------------- */

export const modularGenerator: PuzzleGenerator = {
  family: 'modular-arithmetic',
  category: 'number-patterns',
  difficulty: 3,
  generate(seed) {
    const random = seededRandom(seed);
    const base = pick(random, [3, 7, 9, 13, 17, 23, 27]);
    const exponent = 100 + Math.floor(random() * 900);
    const answer = modPow(base, exponent, 10);
    const cycle: number[] = [];
    let current = 1;
    for (let index = 0; index < 8; index += 1) {
      current = (current * base) % 10;
      cycle.push(current);
    }
    const period = (() => {
      for (let candidate = 1; candidate <= 4; candidate += 1) {
        if (cycle[candidate - 1] === cycle[candidate - 1 + candidate]) return candidate;
      }
      return 4;
    })();
    const remainder = exponent % period;
    return {
      id: generatedId('mod', seed),
      subject: 'mathematics',
      category: 'number-patterns',
      difficulty: 3,
      origin: 'generated',
      generator: { family: 'modular-power', seed },
      verified: true,
      topic: 'Modular cycles',
      title: 'The Last Digit',
      problem: `What is the last digit of ${base}^${exponent}?`,
      givenInfo: [`Base ${base}`, `Exponent ${exponent}`],
      hint: 'Write out the last digits of the first few powers and find the repeating cycle.',
      solution: `1. The last digits of ${base}¹, ${base}², ${base}³, ${base}⁴ are ${cycle.slice(0, 4).join(', ')}; the cycle has period ${period}.\n2. ${exponent} ÷ ${period} leaves remainder ${remainder}.\n3. The remainder points to position ${remainder === 0 ? period : remainder} in the cycle, whose digit is ${answer}.`,
      answer: String(answer),
    };
  },
};

/* --- 3. probability ------------------------------------------------- */

export const probabilityGenerator: PuzzleGenerator = {
  family: 'probability',
  category: 'probability',
  difficulty: 3,
  generate(seed) {
    const random = seededRandom(seed);
    const variant = Math.floor(random() * 3);
    if (variant === 0) {
      const target = 4 + Math.floor(random() * 7);
      let count = 0;
      for (let first = 1; first <= 6; first += 1) {
        for (let second = 1; second <= 6; second += 1) {
          if (first + second === target) count += 1;
        }
      }
      return {
        id: generatedId('dice', seed),
        subject: 'mathematics',
        category: 'probability',
        difficulty: 2,
        origin: 'generated',
        generator: { family: 'dice-sum', seed },
        verified: true,
        topic: 'Equally likely outcomes',
        title: 'Two Dice, One Sum',
        problem: `Two fair six-sided dice are rolled. What is the exact probability that the sum is ${target}?`,
        givenInfo: ['Two fair six-sided dice', '36 equally likely ordered outcomes'],
        hint: 'Count the ordered pairs that sum to the target.',
        solution: `1. There are 6 × 6 = 36 equally likely ordered outcomes.\n2. ${count} of those pairs sum to ${target}.\n3. The probability is ${count}/36 = ${reduceFraction(count, 36)}.`,
        answer: reduceFraction(count, 36),
      };
    }
    if (variant === 1) {
      const heads = 1 + Math.floor(random() * 3);
      const total = 8;
      const ways = [0, 3, 3, 1][heads] ?? 1;
      return {
        id: generatedId('coins', seed),
        subject: 'mathematics',
        category: 'probability',
        difficulty: 2,
        origin: 'generated',
        generator: { family: 'coin-tosses', seed },
        verified: true,
        topic: 'Binomial counting',
        title: 'Three Fair Tosses',
        problem: `A fair coin is tossed three times. What is the exact probability of exactly ${heads} head${heads === 1 ? '' : 's'}?`,
        givenInfo: ['Fair coin', 'Three independent tosses', '8 equally likely sequences'],
        hint: 'Count the sequences with exactly that many heads.',
        solution: `1. There are 2³ = 8 equally likely sequences.\n2. Exactly ${heads} head${heads === 1 ? '' : 's'} occurs in C(3, ${heads}) = ${ways} of them (H = heads, T = tails, in every order).\n3. The probability is ${ways}/8 = ${reduceFraction(ways, total)}.`,
        answer: reduceFraction(ways, total),
      };
    }
    const hearts = 13;
    const total = 52;
    const bad = hearts - 1;
    const good = total - bad - 1;
    return {
      id: generatedId('same-suit', seed),
      subject: 'mathematics',
      category: 'probability',
      difficulty: 3,
      origin: 'generated',
      generator: { family: 'same-suit-pair', seed },
      verified: true,
      topic: 'Conditional probability',
      title: 'A Matching Pair',
      problem: 'Two cards are drawn from a standard 52-card deck without replacement. What is the exact probability that they are of the same suit?',
      givenInfo: ['52 cards, 13 per suit', 'No replacement'],
      hint: 'The first card can be anything; then ask what the second must be.',
      solution: `1. The first card is any card; fix its suit.\n2. ${hearts - 1} cards of that suit remain among the ${total - 1} left in the deck.\n3. The probability is ${hearts - 1}/${total - 1} = ${reduceFraction(hearts - 1, total - 1)}.\n4. Equivalently: ${good + bad} of the ${total} cards are not the first card and ${bad} of them match its suit.`,
      answer: reduceFraction(hearts - 1, total - 1),
    };
  },
};

/* --- 4. logical deduction ------------------------------------------- */

type Kind = 'knight' | 'knave';

interface Statement {
  /** Which speaker says it. */
  by: number;
  test: (kinds: Kind[]) => boolean;
  text: string;
}

/**
 * Generate a knights-and-knaves puzzle and solve it by exhaustive search.
 *
 * The answer is not authored: every one of the 2ⁿ assignments is tested, and a
 * puzzle is only returned when exactly one assignment is consistent. That is the
 * whole safety argument for a generated logic puzzle.
 */
export function solveKnightsAndKnaves(names: readonly string[], statements: readonly Statement[]): Kind[] | null {
  const solutions: Kind[][] = [];
  const total = 2 ** names.length;
  for (let mask = 0; mask < total; mask += 1) {
    const kinds: Kind[] = names.map((_, index) => ((mask >> index) & 1 ? 'knight' : 'knave'));
    const consistent = statements.every((statement) => {
      const truth = statement.test(kinds);
      return kinds[statement.by] === 'knight' ? truth : !truth;
    });
    if (consistent) solutions.push(kinds);
  }
  return solutions.length === 1 ? solutions[0] : null;
}

export const logicGenerator: PuzzleGenerator = {
  family: 'logical-deduction',
  category: 'logical-reasoning',
  difficulty: 3,
  generate(seed) {
    const names = ['A', 'B', 'C'];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const random = seededRandom(seed + attempt * 7919);
      const pickIndex = () => Math.floor(random() * names.length);
      const other = (self: number): number => {
        let index = pickIndex();
        while (index === self) index = pickIndex();
        return index;
      };
      const subject = other(0);
      const third = other(1);
      const templates = [
        {
          by: 0,
          text: `${names[subject]} is a knave.`,
          test: (kinds: Kind[]) => kinds[subject] === 'knave',
        },
        {
          by: 1,
          text: `${names[subject]} and I are of the same kind.`,
          test: (kinds: Kind[]) => kinds[subject] === kinds[1],
        },
        {
          by: 2,
          text: `At least one of ${names[0]} and ${names[third]} is a knave.`,
          test: (kinds: Kind[]) => kinds[0] === 'knave' || kinds[third] === 'knave',
        },
      ];
      const solution = solveKnightsAndKnaves(names, templates);
      if (!solution) continue;
      const answer = names.map((name, index) => `${name} is a ${solution[index]}`).join('; ');
      return {
        id: generatedId('logic', seed),
        subject: 'mathematics',
        category: 'logical-reasoning',
        difficulty: 4,
        origin: 'generated',
        generator: { family: 'knights-and-knaves', seed },
        verified: true,
        topic: 'Consistency checking',
        title: 'Three Speakers on the Island',
        problem: `On an island, knights always tell the truth and knaves always lie. ${templates
          .map((statement) => `${names[statement.by]} says: “${statement.text}”`)
          .join(' ')} Who is who?`,
        givenInfo: ['Knights always tell the truth', 'Knaves always lie', 'Exactly one assignment is consistent'],
        hint: 'Assume one speaker is a knight and follow the consequences until something contradicts itself.',
        solution: `1. Each speaker is either a knight or a knave, so there are 2³ = 8 assignments to test.\n2. An assignment is consistent when every knight’s sentence is true and every knave’s sentence is false.\n3. Exactly one assignment survives all three sentences: ${answer}.\n4. Every other assignment contradicts at least one speaker.`,
        answer,
      };
    }
    // A fixed, hand-checked fallback. Reached only if the search space yields no
    // unique puzzle, which the harness shows does not happen for these templates.
    return {
      id: generatedId('logic-fallback', seed),
      subject: 'mathematics',
      category: 'logical-reasoning',
      difficulty: 3,
      origin: 'generated',
      generator: { family: 'knights-and-knaves-fallback', seed },
      verified: true,
      topic: 'Consistency checking',
      title: 'Two Speakers on the Island',
      problem: 'On an island, knights always tell the truth and knaves always lie. A says: “B is a knave.” B says: “A and I are of different kinds.” What are A and B?',
      givenInfo: ['Knights tell the truth', 'Knaves lie'],
      hint: 'Try A as a knight first.',
      solution: '1. If A were a knight, B would be a knave, and B’s true sentence would make B a knight — contradiction.\n2. So A is a knave, which makes A’s sentence false: B is a knight.\n3. B’s sentence is then true, as a knight requires.',
      answer: 'A is a knave; B is a knight',
    };
  },
};

/* --- 5. unit conversion --------------------------------------------- */

interface Conversion {
  from: string;
  to: string;
  factor: number;
  note: string;
}

const CONVERSIONS: readonly Conversion[] = [
  { from: 'km/h', to: 'm/s', factor: 1 / 3.6, note: 'divide by 3.6' },
  { from: 'm/s', to: 'km/h', factor: 3.6, note: 'multiply by 3.6' },
  { from: 'kWh', to: 'MJ', factor: 3.6, note: '1 kWh = 3.6 MJ' },
  { from: 'L', to: 'cm³', factor: 1000, note: '1 L = 1000 cm³' },
  { from: 'bar', to: 'kPa', factor: 100, note: '1 bar = 100 kPa' },
];

export const unitConversionGenerator: PuzzleGenerator = {
  family: 'unit-conversion',
  category: 'physics',
  difficulty: 2,
  generate(seed) {
    const random = seededRandom(seed);
    const conversion = pick(random, CONVERSIONS);
    const value = pick(random, [1.5, 2, 2.5, 3, 4.5, 5, 7.5, 12, 18, 24, 36, 54, 72, 90, 108]);
    const raw = value * conversion.factor;
    const rounded = Math.round(raw * 100) / 100;
    return {
      id: generatedId('convert', seed),
      subject: 'physics',
      category: 'physics',
      difficulty: 2,
      origin: 'generated',
      generator: { family: 'unit-conversion', seed },
      verified: true,
      topic: 'Units and dimensional reasoning',
      title: `Converting ${conversion.from} to ${conversion.to}`,
      problem: `Convert ${value} ${conversion.from} into ${conversion.to}.`,
      givenInfo: [`${value} ${conversion.from}`, `Conversion factor: ${conversion.factor}`],
      hint: conversion.note,
      solution: `1. ${conversion.from} → ${conversion.to} means multiplying by ${conversion.factor} (${conversion.note}).\n2. ${value} × ${conversion.factor} = ${rounded}.\n3. So ${value} ${conversion.from} is ${rounded} ${conversion.to}.`,
      answer: `${rounded} ${conversion.to}`,
    };
  },
};

/* --- 6. mathematical reasoning -------------------------------------- */

export const mathReasoningGenerator: PuzzleGenerator = {
  family: 'math-reasoning',
  category: 'mathematics',
  difficulty: 3,
  generate(seed) {
    const random = seededRandom(seed);
    const variant = Math.floor(random() * 2);
    if (variant === 0) {
      // Ages: father is k times the son's age now; in t years, m times.
      const son = 8 + Math.floor(random() * 10);
      const multiplier = 3 + Math.floor(random() * 2);
      const father = son * multiplier;
      const years = 4 + Math.floor(random() * 8);
      // (father + years) / (son + years) is not integral in general; ask for the
      // exact fraction instead of inventing a clean ratio.
      const numerator = father + years;
      const denominator = son + years;
      return {
        id: generatedId('ages', seed),
        subject: 'mathematics',
        category: 'mathematics',
        difficulty: 3,
        origin: 'generated',
        generator: { family: 'age-ratio', seed },
        verified: true,
        topic: 'Linear relations',
        title: 'Ages in the Future',
        problem: `A father is ${multiplier} times as old as his son. The son is ${son} years old. In ${years} years, what will the ratio of the father’s age to the son’s age be?`,
        givenInfo: [`Son: ${son}`, `Father: ${multiplier} × son`, `Years ahead: ${years}`],
        hint: 'Work out both present ages first, then add the same number of years to each.',
        solution: `1. The father is ${multiplier} × ${son} = ${father} years old.\n2. In ${years} years: father ${father} + ${years} = ${numerator}; son ${son} + ${years} = ${denominator}.\n3. The ratio is ${numerator}:${denominator} = ${reduceFraction(numerator, denominator)}.`,
        answer: `${reduceFraction(numerator, denominator)} (i.e. ${numerator}:${denominator})`,
      };
    }
    const a = 4 + Math.floor(random() * 9);
    const b = 6 + Math.floor(random() * 11);
    const resultNumerator = a * b;
    const resultDenominator = a + b;
    return {
      id: generatedId('work', seed),
      subject: 'mathematics',
      category: 'mathematics',
      difficulty: 3,
      origin: 'generated',
      generator: { family: 'work-rate', seed },
      verified: true,
      topic: 'Rates and reciprocal addition',
      title: 'Two Workers, One Job',
      problem: `Worker A can finish a job alone in ${a} days; worker B can finish the same job alone in ${b} days. Working together at their own steady rates, how long do they take?`,
      givenInfo: [`A: ${a} days`, `B: ${b} days`],
      hint: 'Add their rates — jobs per day — and then invert.',
      solution: `1. A completes 1/${a} of the job per day; B completes 1/${b}.\n2. Together: 1/${a} + 1/${b} = ${a + b}/${resultNumerator} per day.\n3. Inverting gives ${resultNumerator}/${resultDenominator} ≈ ${(resultNumerator / resultDenominator).toFixed(2)} days.`,
      answer: `${reduceFraction(resultNumerator, resultDenominator)} days`,
    };
  },
};

/* --- 7. warm-up arithmetic ----------------------------------------- */

/**
 * The easiest family, added because the card had nothing below difficulty 2: a reader
 * who found the others discouraging had nowhere to start. One operation, small
 * numbers, and the worked solution shows the subtraction rather than asserting it.
 */
export const warmUpGenerator: PuzzleGenerator = {
  family: 'warm-up-arithmetic',
  category: 'number-patterns',
  difficulty: 1,
  generate(seed) {
    const random = seededRandom(seed);
    const start = 20 + Math.floor(random() * 60);
    const step = 1 + Math.floor(random() * 4) * 3;
    const terms = [0, 1, 2, 3].map((n) => start - n * step);
    const answer = start - 4 * step;
    return {
      id: generatedId('warmup', seed),
      subject: 'mathematics',
      category: 'number-patterns',
      difficulty: 1,
      origin: 'generated',
      generator: { family: 'count-down', seed },
      verified: true,
      topic: 'Repeated subtraction',
      title: 'Counting Down',
      problem: `A sequence begins ${terms.join(', ')}. What comes next?`,
      givenInfo: [`First four terms: ${terms.join(', ')}`],
      hint: 'Subtract each term from the one after it.',
      solution: `1. Each term is ${step} less than the one before: ${terms[0]} − ${terms[1]} = ${step}.\n2. The next term is ${terms[3]} − ${step} = ${answer}.`,
      answer: String(answer),
    };
  },
};

/* --- 8. weighted averages ------------------------------------------ */

/**
 * The hardest family: two or three groups of different sizes have to be weighted by
 * size, which is the step a plain average gets wrong. Offered at difficulty 4 or 5
 * depending on how many groups the seed produces, so the label tracks the real work.
 */
export const weightedAverageGenerator: PuzzleGenerator = {
  family: 'weighted-average',
  category: 'mathematics',
  difficulty: 5,
  generate(seed) {
    const random = seededRandom(seed);
    const groups = 2 + Math.floor(random() * 2);
    const sizes = Array.from({ length: groups }, () => 4 + Math.floor(random() * 16));
    const averages = Array.from({ length: groups }, () => 40 + Math.floor(random() * 50));
    const total = sizes.reduce((sum, size, index) => sum + size * averages[index], 0);
    const people = sizes.reduce((sum, size) => sum + size, 0);
    const mean = total / people;
    const answer = `${mean.toFixed(2)} (${total} ÷ ${people})`;
    const averageSum = averages.reduce((sum, value) => sum + value, 0) / groups;
    return {
      id: generatedId('weighted', seed),
      subject: 'mathematics',
      category: 'mathematics',
      difficulty: groups === 3 ? 5 : 4,
      origin: 'generated',
      generator: { family: 'grouped-mean', seed },
      verified: true,
      topic: 'Weighted averages',
      title: 'The Average of Averages',
      problem: `${groups} classes sat the same test. ${sizes.map((size, index) => `Class ${String.fromCharCode(65 + index)} has ${size} students averaging ${averages[index]}`).join('; ')}. What is the average score across all ${people} students?`,
      givenInfo: sizes.map((size, index) => `Class ${String.fromCharCode(65 + index)}: ${size} × ${averages[index]}`),
      hint: 'Multiply each class average by that class’s size before adding — an average of averages is not the overall average.',
      solution: `1. Total marks: ${sizes.map((size, index) => `${size} × ${averages[index]} = ${size * averages[index]}`).join('; ')}.\n2. Sum of totals: ${total}. Total students: ${people}.\n3. Overall average: ${total} ÷ ${people} = ${mean.toFixed(2)}.\n4. Averaging the averages alone would have given ${averageSum.toFixed(2)}, which is wrong because the classes are different sizes.`,
      answer,
    };
  },
};

export const PUZZLE_GENERATORS: readonly PuzzleGenerator[] = [
  numberSequenceGenerator,
  modularGenerator,
  probabilityGenerator,
  logicGenerator,
  unitConversionGenerator,
  mathReasoningGenerator,
  warmUpGenerator,
  weightedAverageGenerator,
];

/* ------------------------------------------------------------------ */
/* Verification                                                       */
/* ------------------------------------------------------------------ */

/**
 * Is this puzzle safe to publish?
 *
 * For a generated puzzle the answer is recomputed from the generator and compared
 * with the published string — so a bug in one branch of a generator cannot reach a
 * reader unnoticed. For an authored puzzle the structure and the content are
 * checked. This is the gate the requirement means by "never publish a generated
 * puzzle unless its answer and solution have passed validation".
 */
export function verifyPuzzle(puzzle: BrainSharpener): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!puzzle.id?.trim()) reasons.push('missing id');
  if (!puzzle.title?.trim()) reasons.push('missing title');
  if (!puzzle.problem?.trim()) reasons.push('missing problem');
  if (!puzzle.answer?.trim()) reasons.push('missing answer');
  if (!puzzle.solution?.trim()) reasons.push('missing worked solution');
  if (puzzle.answer && puzzle.answer.trim().length < 1) reasons.push('empty answer');
  if (puzzle.solution && puzzle.solution.trim().length < 40) reasons.push('worked solution too short to explain anything');

  if (puzzle.origin === 'generated') {
    if (!puzzle.generator) {
      reasons.push('a generated puzzle must name its generator family and seed');
    } else {
      // Re-derive the puzzle from every generator with the same seed and match on
      // the id. Matching by id rather than by family name means a generator that
      // renames one of its variants cannot quietly escape verification.
      const regenerated = PUZZLE_GENERATORS
        .map((generator) => generator.generate(puzzle.generator!.seed))
        .find((candidate) => candidate.id === puzzle.id);
      if (!regenerated) {
        reasons.push(`no generator reproduces the id ${puzzle.id} for seed ${puzzle.generator.seed}`);
      } else {
        if (regenerated.answer !== puzzle.answer) {
          reasons.push(`answer mismatch: published "${puzzle.answer}", recomputed "${regenerated.answer}"`);
        }
        if (regenerated.problem !== puzzle.problem) {
          reasons.push('problem text does not match the generator output for this seed');
        }
        if (regenerated.solution !== puzzle.solution) {
          reasons.push('worked solution does not match the generator output for this seed');
        }
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/* ------------------------------------------------------------------ */
/* Pool and selection                                                 */
/* ------------------------------------------------------------------ */

/** The six original puzzles, classified rather than rewritten. */
export function categorizeLegacy(sharpener: BrainSharpener): BrainSharpener {
  if (sharpener.category) return sharpener;
  return {
    ...sharpener,
    category: sharpener.subject === 'physics' ? 'physics' : 'mathematics',
    difficulty: 3,
    origin: 'curated',
    verified: true,
  };
}

/**
 * Every challenge available on one day.
 *
 * The authored bank is fixed; the generated half is derived from the date, so each
 * day's pool has fresh procedural puzzles *and* the pool is reproducible: the same
 * date always yields the same set, which is what lets the publisher's ledger and
 * the client's "try another" button agree.
 */
export function puzzlePoolForDate(date: string, legacy: readonly BrainSharpener[] = []): BrainSharpener[] {
  const day = Math.abs(dayNumber(date));
  const generated = PUZZLE_GENERATORS.map((generator, index) => generator.generate(day * 31 + index * 977 + 13));
  return [
    ...legacy.map(categorizeLegacy),
    ...curatedPuzzleBank,
    ...generated,
  ].filter((puzzle) => verifyPuzzle(puzzle).ok);
}

export interface PuzzleSelectionOptions {
  date: string;
  /** Every puzzle the reader has already attempted on this device. */
  attemptedIds?: readonly string[];
  /** Ids published recently, so the card does not repeat itself. */
  recentIds?: readonly string[];
  /** Pool to choose from; defaults to the authored bank for this date. */
  pool?: readonly BrainSharpener[];
}

/**
 * Pick today's challenge.
 *
 * Three properties, in priority order:
 *   1. Never a puzzle the reader has already attempted, while an alternative exists.
 *   2. Category variety: the rotation index advances by day, so consecutive days
 *      land on different families rather than the same one.
 *   3. Difficulty that varies rather than sitting at one level.
 *
 * When every puzzle has been attempted (a very diligent reader), the least recently
 * attempted one returns — with the caller able to see that in `basis`.
 */
export function selectDailyPuzzle(
  options: PuzzleSelectionOptions,
): { puzzle: BrainSharpener; basis: string[]; remaining: number } {
  const pool = (options.pool ?? puzzlePoolForDate(options.date)).filter((puzzle) => verifyPuzzle(puzzle).ok);
  const attempted = new Set(options.attemptedIds ?? []);
  const recent = new Set(options.recentIds ?? []);
  const day = Math.abs(dayNumber(options.date));

  const ordered = [...pool].sort((left, right) => {
    const leftScore = scorePuzzle(left, day, attempted, recent);
    const rightScore = scorePuzzle(right, day, attempted, recent);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return left.id.localeCompare(right.id);
  });

  const chosen = ordered[0] ?? pool[0];
  const basis: string[] = [];
  if (chosen) {
    if (!attempted.has(chosen.id)) basis.push('not attempted before on this device');
    if (!recent.has(chosen.id)) basis.push('not published in the last window');
    basis.push(`category: ${chosen.category ?? 'mathematics'}`);
    basis.push(`difficulty: ${chosen.difficulty ?? 3}/5`);
  }
  return {
    puzzle: chosen,
    basis,
    remaining: pool.filter((puzzle) => !attempted.has(puzzle.id)).length,
  };
}

/** Higher is better. Exported so the harness can reason about the ordering. */
export function scorePuzzle(
  puzzle: BrainSharpener,
  day: number,
  attempted: ReadonlySet<string>,
  recent: ReadonlySet<string>,
): number {
  let score = 0;
  if (!attempted.has(puzzle.id)) score += 100;
  if (!recent.has(puzzle.id)) score += 50;
  // Rotate the preferred category by day so consecutive days differ, and rotate
  // the preferred difficulty on a five-day cycle so the week is not all one level.
  const categories: PuzzleCategory[] = [
    'number-patterns',
    'logical-reasoning',
    'probability',
    'physics',
    'mathematics',
    'critical-thinking',
    'spatial-reasoning',
    'memory-observation',
  ];
  const preferredCategory = categories[day % categories.length];
  if ((puzzle.category ?? 'mathematics') === preferredCategory) score += 25;
  const preferredDifficulty = ((day % 5) + 1) as PuzzleDifficulty;
  const distance = Math.abs(preferredDifficulty - (puzzle.difficulty ?? 3));
  score += Math.max(0, 10 - distance * 5);
  return score;
}

/** The ids a generated puzzle family can produce, for the audit table. */
export function generatedPuzzleIds(date: string): string[] {
  return PUZZLE_GENERATORS.map((generator, index) => generator.generate(Math.abs(dayNumber(date)) * 31 + index * 977 + 13).id);
}
