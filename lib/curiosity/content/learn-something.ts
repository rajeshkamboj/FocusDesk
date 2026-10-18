import type { CuriosityPoolEntry, LearningItem } from '../types';

/**
 * Learn Something — the daily pool.
 *
 * Twenty-four entries, weighted towards ideas a person who teaches and builds
 * software can actually use: how memory works, how data behaves, and the
 * statistical habits that keep a chart or an experiment honest. Each item is a
 * concept in one paragraph plus a place to read further; none of them is a
 * summary of somebody's article, and every source is a reference a reader can
 * check.
 */
export const learnSomethingPool: CuriosityPoolEntry<LearningItem>[] = [
  {
    id: 'learn-bayes-theorem',
    category: 'learn-something',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['statistics', 'reasoning'],
    source: { url: 'https://plato.stanford.edu/entries/bayes-theorem/', name: 'Stanford Encyclopedia of Philosophy' },
    item: {
      topic: 'Bayesian reasoning as an update rule',
      explanation:
        'Bayes’ theorem is a disciplined way to update a belief after seeing evidence. Start with a prior belief, measure how likely the evidence is under competing explanations, then normalize. It is less about complicated arithmetic than about making assumptions visible and revisable.',
      url: 'https://plato.stanford.edu/entries/bayes-theorem/',
      sourceName: 'Stanford Encyclopedia of Philosophy',
    },
  },
  {
    id: 'learn-gradient-descent',
    category: 'learn-something',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['machine-learning', 'optimisation'],
    source: { url: 'https://en.wikipedia.org/wiki/Gradient_descent', name: 'Wikipedia · Gradient descent', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'The bicycle principle of gradient descent',
      explanation:
        'Imagine standing on a foggy hillside and wanting to reach the lowest point. You can feel the slope beneath your feet, take a small step downhill, and repeat. Gradient descent does the same with a model: the gradient says which direction increases error, and a learning rate controls the step size.',
      url: 'https://en.wikipedia.org/wiki/Gradient_descent',
      sourceName: 'Wikipedia',
    },
  },
  {
    id: 'learn-browser-event-loop',
    category: 'learn-something',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['web', 'programming'],
    source: { url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model', name: 'MDN Web Docs', attribution: 'MDN content is CC BY-SA 2.5.' },
    item: {
      topic: 'Why web browsers use the event loop',
      explanation:
        'JavaScript can run one piece of code at a time, but a browser still needs to wait for network and timer work without freezing the page. The event loop places completed callbacks in a queue and runs them when the current stack is clear, keeping the interface responsive while I/O is pending.',
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model',
      sourceName: 'MDN Web Docs',
    },
  },
  {
    id: 'learn-spaced-repetition',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['learning', 'memory'],
    source: { url: 'https://en.wikipedia.org/wiki/Spacing_effect', name: 'Wikipedia · Spacing effect', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'The spacing effect: why four short sessions beat one long one',
      explanation:
        'Memory strengthens between study sessions as well as during them, and material met again after a delay has partly faded, which is precisely what makes the second meeting useful. The same hour spent as four encounters across a fortnight produces more durable recall than one sitting before an exam, even though the massed version feels more fluent at the time. The practical consequence is uncomfortable and simple: the difficulty you feel when recalling something after a gap is the mechanism, not an obstacle to it.',
      url: 'https://en.wikipedia.org/wiki/Spacing_effect',
      sourceName: 'Wikipedia · Spacing effect',
    },
  },
  {
    id: 'learn-testing-effect',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['learning', 'teaching'],
    source: { url: 'https://en.wikipedia.org/wiki/Testing_effect', name: 'Wikipedia · Testing effect', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Retrieval practice: reading a text again is worth less than recalling it',
      explanation:
        'Re-reading feels productive because the material seems familiar, and familiarity is easily mistaken for knowledge. Trying to produce the answer from memory — a question, a blank page, explaining it to a class without notes — strengthens what can be recalled later far more than reviewing the same passage does. The habit that follows is to convert notes into prompts before the study session rather than during it, and to accept that a session where little comes easily is often the one that worked.',
      url: 'https://en.wikipedia.org/wiki/Testing_effect',
      sourceName: 'Wikipedia · Testing effect',
    },
  },
  {
    id: 'learn-desirable-difficulties',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['learning', 'teaching'],
    source: { url: 'https://en.wikipedia.org/wiki/Desirable_difficulty', name: 'Wikipedia · Desirable difficulty', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Desirable difficulty, and mixing problem types on purpose',
      explanation:
        'Some conditions slow practice down and still improve later performance; the term names that trade. Interleaving — practising several kinds of problem in one session rather than many of one kind — is the clearest example in learning. Blocked practice makes the tenth problem feel easy; interleaving forces the harder task of deciding which approach applies, which is the part an exam, a client, or a debugging session actually demands of you.',
      url: 'https://en.wikipedia.org/wiki/Desirable_difficulty',
      sourceName: 'Wikipedia · Desirable difficulty',
    },
  },
  {
    id: 'learn-cognitive-load',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['teaching', 'design'],
    source: { url: 'https://en.wikipedia.org/wiki/Cognitive_load', name: 'Wikipedia · Cognitive load', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Cognitive load: the cost your learner pays that you cannot see',
      explanation:
        'Working memory holds few items at once, so a lesson that asks a student to hold a procedure, a notation and a new vocabulary together can exceed the capacity regardless of how clearly each part is explained. Instructional design that works usually reduces that burden rather than the difficulty of the idea: a worked example before a problem, one notation change at a time, and removing decoration that competes for attention. The same reasoning applies to a user interface — a screen asking for six unrelated decisions is not neutral.',
      url: 'https://en.wikipedia.org/wiki/Cognitive_load',
      sourceName: 'Wikipedia · Cognitive load',
    },
  },
  {
    id: 'learn-zpd',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['teaching', 'learning'],
    source: { url: 'https://en.wikipedia.org/wiki/Zone_of_proximal_development', name: 'Wikipedia · Zone of proximal development', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'The zone where help is the lesson',
      explanation:
        'Vygotsky’s idea is the gap between what a learner can do alone and what they can do with support, and the claim is that teaching reaches that gap rather than the already-mastered part. The supporting scaffolding matters as much as the task: it is meant to be removed as ability appears, which is why a tutor who keeps solving the problem is not teaching the zone. For self-study the version is to pick the task you can finish with notes, a search or a peer — and to drop the notes once they are no longer needed.',
      url: 'https://en.wikipedia.org/wiki/Zone_of_proximal_development',
      sourceName: 'Wikipedia · Zone of proximal development',
    },
  },
  {
    id: 'learn-metacognition',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['learning', 'psychology'],
    source: { url: 'https://en.wikipedia.org/wiki/Metacognition', name: 'Wikipedia · Metacognition', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Metacognition: why confidence is a poor measure of learning',
      explanation:
        'Judging how well you know something is its own skill, and it is systematically unreliable: people who perform worst tend to rate themselves highest, a pattern measured in the Dunning-Kruger work, while fluent re-reading inflates confidence without improving recall. The correction is external evidence rather than introspection — a practice test, a blank-page summary, teaching the idea to someone else. The same habit shortens debugging: writing down what you believe is happening makes an incorrect belief visible faster than thinking about it does.',
      url: 'https://en.wikipedia.org/wiki/Metacognition',
      sourceName: 'Wikipedia · Metacognition',
    },
  },
  {
    id: 'learn-explanatory-depth',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['reasoning', 'learning'],
    source: { url: 'https://en.wikipedia.org/wiki/Illusion_of_explanatory_depth', name: 'Wikipedia · Illusion of explanatory depth', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'The illusion of explanatory depth',
      explanation:
        'People report understanding how a zipper, a bicycle or a democracy works until they are asked to explain the steps, at which point the feeling of knowing collapses. The finding is not that people are shallow but that much of what we know is distributed — held in tools, institutions and other people — and we rarely test our own share of it. Explaining something in sequence is the cheap test that does the testing, which is why “explain it to a twelve-year-old” survives as advice even though it is humbling every time it is used.',
      url: 'https://en.wikipedia.org/wiki/Illusion_of_explanatory_depth',
      sourceName: 'Wikipedia · Illusion of explanatory depth',
    },
  },
  {
    id: 'learn-big-o',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['computer-science', 'engineering'],
    source: { url: 'https://en.wikipedia.org/wiki/Time_complexity', name: 'Wikipedia · Time complexity', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'What Big-O is actually claiming',
      explanation:
        'Big-O describes how a cost grows as the input grows, ignoring the constant you measured on your own machine today. An algorithm that is linear with an awkward constant can beat a logarithmic one at a thousand rows and lose at a million, so the notation is a statement about scale rather than speed. Its practical use is the question it lets you ask before benchmarking: which line of this code multiplies itself with the data, and does anyone have data that big yet?',
      url: 'https://en.wikipedia.org/wiki/Time_complexity',
      sourceName: 'Wikipedia · Time complexity',
    },
  },
  {
    id: 'learn-hash-table',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['computer-science', 'data'],
    source: { url: 'https://en.wikipedia.org/wiki/Hash_table', name: 'Wikipedia · Hash table', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Why a hash table is fast, and what it costs',
      explanation:
        'A hash function turns a key into a position in an array, so lookup is a jump rather than a scan — average case near constant time. That speed buys you several losses: no ordering, no range queries, and a dependence on the bucket count that forces occasional rehashing. Two keys hashing to the same slot must be resolved somehow, and the quality of the whole structure depends on the function spreading keys evenly. It is a good example of a trade that stays hidden until the day you need the items sorted.',
      url: 'https://en.wikipedia.org/wiki/Hash_table',
      sourceName: 'Wikipedia · Hash table',
    },
  },
  {
    id: 'learn-normalization',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['databases', 'modelling'],
    source: { url: 'https://en.wikipedia.org/wiki/Database_normalization', name: 'Wikipedia · Database normalization', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Normalisation is about who is allowed to be wrong',
      explanation:
        'Storing the same fact in several places means an update can leave them disagreeing, so normalisation splits data so that each fact has one home and joins are used to rebuild the view. The textbook forms describe how much redundancy remains; the practical benefit is that an inconsistency becomes impossible rather than merely unlikely. Denormalising for read performance is a legitimate reversal, but it should be a decision you can name — a specific query, a measured cost, and a plan for keeping the copies in step.',
      url: 'https://en.wikipedia.org/wiki/Database_normalization',
      sourceName: 'Wikipedia · Database normalization',
    },
  },
  {
    id: 'learn-cap-theorem',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['distributed-systems', 'architecture'],
    source: { url: 'https://en.wikipedia.org/wiki/CAP_theorem', name: 'Wikipedia · CAP theorem', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'What the CAP theorem does and does not say',
      explanation:
        'When a network partition splits a distributed system, it cannot both keep every replica agreeing and keep answering every request; something must give. It is not a menu of three options to choose two from in normal operation — partitions are a rare condition, not a constant, and latency is the trade you actually live with. The useful reading is narrower and more honest: decide in advance which behaviour you want the moment the network misbehaves, because that decision cannot be deferred to the incident.',
      url: 'https://en.wikipedia.org/wiki/CAP_theorem',
      sourceName: 'Wikipedia · CAP theorem',
    },
  },
  {
    id: 'learn-idempotence',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['engineering', 'design'],
    source: { url: 'https://en.wikipedia.org/wiki/Idempotence', name: 'Wikipedia · Idempotence', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Idempotence: designing for the retry you cannot prevent',
      explanation:
        'A network that times out tells you nothing about whether the request it swallowed was applied, so a client that behaves sensibly will send it again. An operation is idempotent when applying it twice has the same effect as applying it once: setting a value is, adding to a balance is not. The usual fix is a client-generated key the server remembers, so the second attempt is answered with the first result. This is why payment APIs, task schedulers and content publishers all carry a notion of “already done”, and why an endpoint without one is a bug waiting for a bad afternoon.',
      url: 'https://en.wikipedia.org/wiki/Idempotence',
      sourceName: 'Wikipedia · Idempotence',
    },
  },
  {
    id: 'learn-race-condition',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['programming', 'concurrency'],
    source: { url: 'https://en.wikipedia.org/wiki/Race_condition', name: 'Wikipedia · Race condition', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'A race condition is about ordering, not speed',
      explanation:
        'Two operations that each look correct alone can produce a wrong result when they interleave: read-modify-write by two processes loses one of the updates. The name is slightly misleading — the problem is not that anything is fast but that the outcome depends on timing no one controls. Defences range from a lock, to an atomic update the database performs for you, to a compare-and-swap that fails loudly instead of overwriting. Choosing among them is a decision about what should happen when the assumption of solitude breaks.',
      url: 'https://en.wikipedia.org/wiki/Race_condition',
      sourceName: 'Wikipedia · Race condition',
    },
  },
  {
    id: 'learn-bloom-filter',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['algorithms', 'trade-offs'],
    source: { url: 'https://en.wikipedia.org/wiki/Bloom_filter', name: 'Wikipedia · Bloom filter', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'What a Bloom filter buys for one bit per item',
      explanation:
        'A Bloom filter tests membership using a small bit array and several hash positions. If any position is unset the item is definitely absent; if all are set it is probably present, because another item may have set those bits. Absence is certain, presence is only likely, and you cannot remove entries or read the set back. That asymmetry is worth a great deal — cache guards, crawler frontiers, spell-checkers — whenever “almost never waste a lookup” beats “never be wrong”, and it is a compact illustration of designing a data structure around the errors you can live with.',
      url: 'https://en.wikipedia.org/wiki/Bloom_filter',
      sourceName: 'Wikipedia · Bloom filter',
    },
  },
  {
    id: 'learn-regression-to-mean',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['statistics', 'reading-data'],
    source: { url: 'https://en.wikipedia.org/wiki/Regression_to_the_mean', name: 'Wikipedia · Regression to the mean', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Regression to the mean: the effect that steals credit and blame',
      explanation:
        'An extreme measurement usually contains an unusual amount of luck, so the next measurement of the same thing tends to be closer to the average with no intervention at all. That single fact explains why an after-the-fall improvement looks caused by whatever was tried — the pilot programme at the worst-performing schools, the new trainer after a losing streak, the remedy taken at the peak of an illness. The way out is a comparison group measured over the same period, because nothing you can compute from the extreme cases alone separates the effect from the drift.',
      url: 'https://en.wikipedia.org/wiki/Regression_to_the_mean',
      sourceName: 'Wikipedia · Regression to the mean',
    },
  },
  {
    id: 'learn-p-value',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['statistics', 'experiments'],
    source: { url: 'https://en.wikipedia.org/wiki/P-value', name: 'Wikipedia · P-value', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'What a p-value is — and the claim it never supports',
      explanation:
        'A p-value is the probability of seeing data at least as extreme as yours if the null hypothesis were true. It is not the probability that the null hypothesis is true, and it is not a measure of how large or how important an effect is; with enough measurements a trivial difference can be “significant”. The 0.05 threshold is a convention, not a law of nature, and a result just above it is not a result just below it in any physical sense — which is part of why the emphasis in applied statistics has moved toward effect sizes, intervals and pre-registration.',
      url: 'https://en.wikipedia.org/wiki/P-value',
      sourceName: 'Wikipedia · P-value',
    },
  },
  {
    id: 'learn-confidence-interval',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['statistics', 'reading-data'],
    source: { url: 'https://en.wikipedia.org/wiki/Confidence_interval', name: 'Wikipedia · Confidence interval', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'A range is the honest version of an estimate',
      explanation:
        'A confidence interval reports the estimates that the data cannot rule out, so its width is information about the measurement rather than about the world. The standard reading is about the procedure: intervals built the same way from repeated samples would contain the true value as often as the level claims. Two studies whose intervals overlap are not thereby in conflict, and a narrow interval from a biased sample says nothing about the bias. A single “average” quoted without one is usually a rhetorical choice more than a statistical one.',
      url: 'https://en.wikipedia.org/wiki/Confidence_interval',
      sourceName: 'Wikipedia · Confidence interval',
    },
  },
  {
    id: 'learn-base-rate',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['statistics', 'reasoning'],
    source: { url: 'https://en.wikipedia.org/wiki/Base_rate_fallacy', name: 'Wikipedia · Base rate fallacy', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Base rates: why a good test can still mostly be wrong',
      explanation:
        'A screening test for a condition affecting one person in ten thousand can be highly accurate and still produce far more false positives than true ones, because the healthy majority is so much larger than the group being sought. Ignoring that prior is the base rate fallacy, and it is why a positive result usually needs confirmation. The same arithmetic governs an alert from a monitoring system at three in the morning: the value of a signal depends heavily on how many chances there were to be wrong.',
      url: 'https://en.wikipedia.org/wiki/Base_rate_fallacy',
      sourceName: 'Wikipedia · Base rate fallacy',
    },
  },
  {
    id: 'learn-comparative-advantage',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['economics', 'decisions'],
    source: { url: 'https://en.wikipedia.org/wiki/Comparative_advantage', name: 'Wikipedia · Comparative advantage', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Comparative advantage, in economics and in your week',
      explanation:
        'Two people or two countries both better at everything can still gain from specialising, because the relevant cost is not what you do badly but what you give up to do it. The reasoning is the clearest example of opportunity cost doing real work: the best use of your most capable hour is decided against the alternatives it closes, not against someone else’s standard. Applied to a week, it argues for delegating the task you would do well and would rather not pay for — and it explains why a to-do list with no ordering is really a list of undecided trades.',
      url: 'https://en.wikipedia.org/wiki/Comparative_advantage',
      sourceName: 'Wikipedia · Comparative advantage',
    },
  },
  {
    id: 'learn-rubber-duck',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['programming', 'teaching'],
    source: { url: 'https://en.wikipedia.org/wiki/Rubber_duck_debugging', name: 'Wikipedia · Rubber duck debugging', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Why explaining a problem to a patient listener solves it',
      explanation:
        'Rubber duck debugging works for a reason that has nothing to do with ducks: narrating your own system forces you from recognition into recall, and the two differ. While reading code you recognise each line and assume the sequence is right; while saying it aloud you have to state each step, which is where the missing step appears. The same is true of a question asked to a class, and of the paragraph you only notice is wrong once you have read it out. The listener’s role is to stay silent and to be exactly as unknowledgeable as possible.',
      url: 'https://en.wikipedia.org/wiki/Rubber_duck_debugging',
      sourceName: 'Wikipedia · Rubber duck debugging',
    },
  },
  {
    id: 'learn-power-law',
    category: 'learn-something',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['statistics', 'modelling'],
    source: { url: 'https://en.wikipedia.org/wiki/Power_law', name: 'Wikipedia · Power law', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      topic: 'Heavy tails: when the average is not a useful number',
      explanation:
        'Height has a bell curve; city population, income, book sales and the size of earthquakes follow distributions with long tails, where the largest example dwarfs the typical one and the mean moves as the sample grows. In such data an “average” case is rare and extreme cases dominate the total, which is why tail risk is planned for separately from the ordinary case. The habit worth acquiring is to ask of any confident average whether the underlying distribution has a tail — and to remember that a model tuned on the middle of one may fail at the edge of the next.',
      url: 'https://en.wikipedia.org/wiki/Power_law',
      sourceName: 'Wikipedia · Power law',
    },
  },
];
