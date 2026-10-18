import type { CuriosityNewsItem } from '../types';

/**
 * AI World — the curated background library.
 *
 * This is what the card shows when none of the live feeds produced anything usable,
 * so that a network problem on a vendor's side cannot leave the reader with an empty
 * box. The distinction is kept in the data rather than hidden: every item here has
 * `origin: 'background'` and an empty `publishedAt`, because these are not news and
 * must never be rendered as if they were. The card label says "curated background"
 * while they are on screen, and the dates disappear.
 *
 * Twelve entries, three a day, chosen by the day number so consecutive days never
 * overlap and the library cycles in four days. Each links to the reference article a
 * reader can check the claim against — no citation, no entry.
 *
 * Written for this app. Nothing here is copied from the linked articles.
 */
export interface AiBackgroundEntry {
  id: string;
  item: CuriosityNewsItem;
}

const background = (
  id: string,
  title: string,
  summary: string,
  source: string,
  url: string,
): AiBackgroundEntry => ({
  id,
  item: { title, summary, source, url, publishedAt: '', origin: 'background' as const },
});

export const aiBackgroundLibrary: AiBackgroundEntry[] = [
  background(
    'ai-bg-tokens',
    'A model reads tokens, not words — and that is where several surprises come from',
    'Text is cut into subword units before a model sees it, so "unbelievable" may arrive as three pieces while a common word is one. Spelling, rare names, code identifiers and long numbers therefore cost more attention than plain prose, and a tokenizer trained mostly on English degrades fastest everywhere else.',
    'Wikipedia · Byte-pair encoding',
    'https://en.wikipedia.org/wiki/Byte-pair_encoding',
  ),
  background(
    'ai-bg-attention',
    'What “attention” adds to a sequence model is a lookup, not a memory',
    'Each position in the input builds a query, and the architecture scores that query against the keys of every other position to decide what to read. The result is that distance costs little — a word at the start of a page can be as available as the word before it — while the number of comparisons grows with the square of the length, which is what makes long context expensive.',
    'Wikipedia · Transformer (deep learning architecture)',
    'https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)',
  ),
  background(
    'ai-bg-probability',
    'A model outputs a distribution; “creativity” is what it does with it',
    'The final layer scores every possible next token and turns the scores into probabilities. Sampling then chooses from that distribution, so the same prompt can take different paths, and a flatter distribution produces more varied — and more easily wrong — continuations. Greedy selection removes variety without removing the possibility of being confidently wrong.',
    'Wikipedia · Softmax function',
    'https://en.wikipedia.org/wiki/Softmax_function',
  ),
  background(
    'ai-bg-hallucination',
    'A generated citation looks real because plausibility is what it was trained for',
    'The objective is a likely continuation of the text in front of it, not a verified fact, so a fabricated reference can be the statistically best answer available. That is why the failure is not fixed by telling the model to be careful, and why retrieval, citations you can open, and checks against a source you control do more than prompting does.',
    'Wikipedia · Hallucination (artificial intelligence)',
    'https://en.wikipedia.org/wiki/Hallucination_(artificial_intelligence)',
  ),
  background(
    'ai-bg-rag',
    'Retrieval changes what the model has to look at, not what it knows',
    'A retrieval step finds passages that seem relevant, and they are placed in the context so the answer can be grounded in them. It improves recall of specific facts and gives you something to cite, while leaving the underlying weakness intact: if the retrieved passage is wrong, or the model ignores it, the answer still reads smoothly.',
    'Wikipedia · Retrieval-augmented generation',
    'https://en.wikipedia.org/wiki/Retrieval-augmented_generation',
  ),
  background(
    'ai-bg-embeddings',
    'Embeddings put meaning into geometry, which is useful and easy to overread',
    'A trained model maps words, sentences or documents to points such that similar things land nearby. That makes search, clustering and deduplication cheap — but the axes are not human concepts, so a distance tells you the model considered two things alike, not why, and not whether they are alike in the way you meant.',
    'Wikipedia · Word embedding',
    'https://en.wikipedia.org/wiki/Word_embedding',
  ),
  background(
    'ai-bg-rlhf',
    'Preference tuning teaches a model what a reviewer likes to read',
    'Humans compare two answers to the same prompt, a model learns to predict those preferences, and the generator is then pushed toward the preferred shape of response. It is why assistants ask clarifying questions, hedge, and refuse in a familiar voice — and it is a reason to treat a fluent “I checked” as a style, not evidence.',
    'Wikipedia · Reinforcement learning from human feedback',
    'https://en.wikipedia.org/wiki/Reinforcement_learning_from_human_feedback',
  ),
  background(
    'ai-bg-transfer',
    'Fine-tuning is a shift in behaviour, not an insertion of facts',
    'Training a pretrained model further on a smaller corpus teaches it a format, a tone or a repeated pattern faster than training from scratch, because most of what it learned earlier stays. What it reliably does not do is memorise a knowledge base you can query later — for that, the data belongs next to the prompt, or in a store the model is forced to consult.',
    'Wikipedia · Transfer learning',
    'https://en.wikipedia.org/wiki/Transfer_learning',
  ),
  background(
    'ai-bg-evals',
    'A benchmark you optimise against stops measuring what it measured first',
    'When a leaderboard is the target, effort goes into the distribution the test samples from: formats it rewards, phrasings it tolerates, and the items themselves if they leak into training data. The fix is boring and effective — keep a private set the model never saw, write a rubric a human can apply, and report failures rather than a single score.',
    'Wikipedia · Overfitting',
    'https://en.wikipedia.org/wiki/Overfitting',
  ),
  background(
    'ai-bg-moe',
    'Mixture of experts buys capacity without buying the same compute per token',
    'A router sends each token to a few of many smaller networks, so the model holds more parameters than it uses on any one step. Serving becomes the hard part: the experts must be resident somewhere, an unbalanced router overloads one of them, and the total memory bill does not shrink with the compute.',
    'Wikipedia · Mixture of experts',
    'https://en.wikipedia.org/wiki/Mixture_of_experts',
  ),
  background(
    'ai-bg-distillation',
    'A small model that imitates a large one inherits its mistakes too',
    'Training on the larger model’s outputs — often its probability distributions rather than its hard answers — transfers soft structure, so the student is cheaper to run and still coherent. What transfers is behaviour, including confident errors, which is why a distilled model needs its own evaluation rather than trust by lineage.',
    'Wikipedia · Knowledge distillation',
    'https://en.wikipedia.org/wiki/Knowledge_distillation',
  ),
  background(
    'ai-bg-context',
    'A longer window is not the same as remembering',
    'Everything the model “knows” about the current conversation is what sits in the context it is given, and a longer window raises the ceiling without changing how reliably a given line inside it is used. Notes, summaries and retrieval that put the right sentences near the end still outperform a transcript the model may skim past.',
    'Wikipedia · Large language model',
    'https://en.wikipedia.org/wiki/Large_language_model',
  ),
];

/** Ids, for the published record: a day says which background items it showed. */
export const aiBackgroundIds = aiBackgroundLibrary.map((entry) => entry.id);
