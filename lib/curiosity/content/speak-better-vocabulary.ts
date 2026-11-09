import type { SpeakBetterLevel, SpeakBetterTone } from '../types';

/**
 * The authored glosses behind live vocabulary discovery.
 *
 * WHY THIS FILE EXISTS
 * Speak Better used to be a fixed curriculum: a finite list of lessons, rotated.
 * The expansion asks for continuous discovery from live lexical resources — but
 * also for lessons that contain a *natural Hindi meaning*, a **nuance note**, a
 * **learner mistake** and **adult examples**, none of which a dictionary API can
 * supply. Publishing raw dictionary output would satisfy the first requirement and
 * destroy the second.
 *
 * So the system is a hybrid, and this file is the half that cannot be automated:
 *
 *   - a **gloss** here is an editor's judgement about *why the word matters and
 *     how an adult misuses it*;
 *   - the **scheduled pipeline** (`lib/discovery/vocabulary/pipeline.ts`) discovers
 *     candidate words from Datamuse, verifies each one against Wiktionary and the
 *     Free Dictionary API, estimates its difficulty from corpus frequency, and
 *     refuses to approve it without this gloss.
 *
 * A word the pipeline finds that has no gloss is stored as `needs-review` — visible
 * to an operator, never shown to a reader. That is the honest boundary: discovery
 * is automated, editorial judgement is not, and no API key or language model is
 * pretended to exist.
 *
 * WHAT THE PIPELINE MAY AND MAY NOT REPLACE
 * Dictionary material (definition, part of speech, pronunciation, examples) is
 * attached as clearly-attributed `dictionary` content beside the gloss. The
 * authored fields below are never overwritten by a source response.
 */
export interface VocabularyGloss {
  /** The single target word. Lower-case; the lesson teaches this form. */
  word: string;
  /** The band the editor believes this word belongs to, before frequency is known. */
  level: Exclude<SpeakBetterLevel, 'A2-B1'>;
  partOfSpeech: string;
  tone: SpeakBetterTone;
  /** One sentence a reader can use as the definition. */
  englishMeaning: string;
  /** Natural Hindi, not a transliteration and not a word-for-word gloss. */
  hindiMeaning: string;
  /** Why the word exists when a near-synonym already does. */
  nuance: string;
  /** At least two examples, in the register an adult actually uses. */
  examples: string[];
  pronunciation?: string;
  collocations: string[];
  commonMistake: string;
  differsFrom?: string;
  register: string;
  /** The one-line takeaway of the lesson. */
  focus: string;
  /** A concrete moment where this word is the natural choice. */
  situation: string;
  dialogue: { speaker: string; line: string }[];
  challenge: string;
  /** Bumped when the editorial text changes, so an approved lesson is re-verified. */
  revision: string;
  /**
   * Seeds the pipeline is allowed to grow candidates from. `true` means the word is
   * itself a discovery anchor: Datamuse is asked for words *like* it, which is how
   * the candidate reservoir grows beyond this list.
   */
  anchor?: boolean;
}

const REV = '2026-11-v1';

export const VOCABULARY_GLOSSES: readonly VocabularyGloss[] = [
  {
    word: 'articulate',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Able to put an idea into clear, well-structured words that hold a listener’s attention.',
    hindiMeaning: 'स्पष्ट और प्रभावी ढंग से अपनी बात कहने वाला',
    nuance:
      'It praises clarity of thought, not fluency or accent. A slow speaker with a precise sentence is articulate; a fast speaker who never lands a point is not.',
    examples: [
      'She is unusually articulate about trade policy for someone who has never worked in government.',
      'The report is technically correct but not articulate — I finished it without knowing what we should do.',
    ],
    pronunciation: 'ar-TIK-yuh-luht',
    collocations: ['an articulate speaker', 'articulate about', 'highly articulate'],
    commonMistake:
      'Using it for fluent-but-empty speech. “He is very articulate” implies the ideas are organised; for speed or accent, say “fluent”.',
    differsFrom: 'eloquent — eloquent adds emotional force and beauty; articulate only promises clarity.',
    register: 'Professional and neutral. Rarely used about oneself, which would sound boastful.',
    focus: 'Articulate praises organised thought, not a polished accent.',
    situation: 'Giving feedback on a colleague’s presentation, or describing a writer you trust.',
    dialogue: [
      { speaker: 'Meera', line: 'How was the client call?' },
      { speaker: 'Arjun', line: 'Better than I expected. He is articulate about what he does not want, which saves a week of guessing.' },
    ],
    challenge: 'Describe one person you work with as articulate, then say exactly what they do that earns the word.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'nuanced',
    level: 'C1',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Showing attention to small but important differences, rather than treating a complex matter as simple.',
    hindiMeaning: 'सूक्ष्म भेदों को ध्यान में रखने वाला',
    nuance:
      'A nuanced view still takes a position; it simply refuses to flatten the exceptions. It is a compliment in serious writing and a criticism in politics, where it is used for “unwilling to be blunt”.',
    examples: [
      'Her account of the strike is nuanced: it names the management’s failures without turning the union into heroes.',
      'We need a more nuanced answer than “hire faster” — the last three hires were the right people in the wrong roles.',
    ],
    pronunciation: 'NYOO-ahnst',
    collocations: ['a nuanced understanding', 'more nuanced than', 'nuanced view'],
    commonMistake:
      'Treating nuanced as a synonym for “complicated”. Complicated means hard to follow; nuanced means the distinctions are real and worth keeping.',
    differsFrom: 'subtle — subtle can mean “barely noticeable”; nuanced always means “several real distinctions”.',
    register: 'Neutral to professional. Common in analysis, reviews and management writing.',
    focus: 'Nuanced means the distinctions are doing work.',
    situation: 'Explaining why a simple answer fails without sounding evasive.',
    dialogue: [
      { speaker: 'Ritu', line: 'So is the new policy good or bad?' },
      { speaker: 'Kabir', line: 'It is nuanced. It solves the queue problem and quietly moves the cost onto the smaller clinics.' },
    ],
    challenge: 'Take a decision you disagree with and give the most nuanced version of the other side in two sentences.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'pragmatic',
    level: 'C1',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Dealing with a situation on the basis of what actually works, rather than what is theoretically ideal.',
    hindiMeaning: 'व्यावहारिक; जो वास्तव में काम करे उसी पर आधारित',
    nuance:
      'It often describes a compromise accepted with open eyes. A pragmatic decision is not necessarily the right one; it is the one that can be made with the time, money and people available.',
    examples: [
      'A pragmatic first release: one store, one payment method, and a promise we can keep.',
      'Her position on the merger is pragmatic rather than enthusiastic — the alternative was closing two offices.',
    ],
    pronunciation: 'prag-MAT-ik',
    collocations: ['a pragmatic approach', 'pragmatic decision', 'pragmatic about'],
    commonMistake:
      'Using pragmatic to mean “practical” about objects. A pragmatic person, plan or decision is fine; a pragmatic phone is not.',
    differsFrom: 'practical — practical describes usefulness; pragmatic describes choosing usefulness over principle.',
    register: 'Professional; slightly managerial. Neutral in tone, occasionally faintly critical.',
    focus: 'Pragmatic is a compromise you can defend, not an ideal you achieved.',
    situation: 'Defending a smaller plan when someone asks for the ambitious version.',
    dialogue: [
      { speaker: 'Neha', line: 'Why not build the whole dashboard now?' },
      { speaker: 'Sameer', line: 'Pragmatic reasons. We have six weeks and two of those are the festival freeze.' },
    ],
    challenge: 'Name one thing you are doing this month for pragmatic reasons, and state what you gave up.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'tentative',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'neutral',
    englishMeaning: 'Not yet fixed or certain; done as a first attempt that may change.',
    hindiMeaning: 'अनिश्चित; अस्थायी, जिसमें बदलाव हो सकता है',
    nuance:
      'It signals that the plan exists but the commitment does not. In scheduling it is a courtesy; in an agreement it is a warning that nothing is agreed.',
    examples: [
      'We have a tentative date of the fourteenth, pending the venue’s confirmation.',
      'His first steps back at work were tentative, and the team wisely did not hand him a crisis on day one.',
    ],
    pronunciation: 'TEN-tuh-tiv',
    collocations: ['a tentative date', 'tentative agreement', 'tentative steps'],
    commonMistake:
      'Writing “tentative” when you mean “temporary”. Temporary means it will end; tentative means it is not settled yet.',
    differsFrom: 'provisional — provisional is an official arrangement made in advance; tentative is simply not confirmed.',
    register: 'Neutral. Standard in scheduling, negotiations and first attempts.',
    focus: 'Tentative says “this is not agreed yet” without cancelling it.',
    situation: 'Locking a meeting without pretending the date is final.',
    dialogue: [
      { speaker: 'Ishaan', line: 'Can I put Thursday in the calendar?' },
      { speaker: 'Priya', line: 'Tentative, yes. The client has not confirmed and I do not want the team blocking the day.' },
    ],
    challenge: 'Write one message that sets a tentative plan and names exactly what would make it firm.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'reluctant',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'neutral',
    englishMeaning: 'Unwilling to do something, usually for a reason you can understand.',
    hindiMeaning: 'अनिच्छुक; मन से तैयार न होना',
    nuance:
      'It carries sympathy: the reluctant person is not lazy or defiant, they are holding back. “I am reluctant to promise a date” is a considered position; “I can’t be bothered” is not.',
    examples: [
      'I am reluctant to approve the spend until the pilot has produced one number we trust.',
      'She was reluctant to take credit, which is exactly why the team insisted she present it.',
    ],
    pronunciation: 'ri-LUK-tuhnt',
    collocations: ['reluctant to commit', 'reluctant agreement', 'understandably reluctant'],
    commonMistake:
      'Saying “I am reluctant about it”. The adjective takes “to” plus a verb, or “reluctant agreement”.',
    differsFrom: 'hesitant — hesitant is about timing and confidence; reluctant is about willingness.',
    register: 'Neutral and professional. Softer than “unwilling”, which sounds like a refusal.',
    focus: 'Reluctant names the misgiving, not the refusal.',
    situation: 'Pushing back on a request while keeping the relationship intact.',
    dialogue: [
      { speaker: 'Anil', line: 'Can you own the migration?' },
      { speaker: 'Sara', line: 'I am reluctant to say yes until I know who covers support that week. I am not refusing — I need one answer first.' },
    ],
    challenge: 'Rewrite one “no” you have sent as a reluctant-but-specific position.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'compelling',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Strong enough to convince you, hold your attention, or make action difficult to refuse.',
    hindiMeaning: 'प्रभावशाली; जो अपनी ओर खींचे और मन बदल दे',
    nuance:
      'The word is deliberately dual: a compelling argument persuades, a compelling story fascinates. Neither means “true”. A compelling case can still be wrong, which is why the word is worth noticing in someone else’s pitch.',
    examples: [
      'The case for moving the launch is compelling: two of the three dependencies are not in production.',
      'There is a compelling reason the older engineers keep the printed diagrams — they work when everything else is down.',
    ],
    pronunciation: 'kuhm-PEL-ing',
    collocations: ['a compelling argument', 'compelling evidence', 'a compelling reason'],
    commonMistake:
      'Treating compelling as proof. Say “a compelling but thin case” when the evidence is persuasive rather than sufficient.',
    differsFrom: 'convincing — convincing means it changed your mind; compelling means it almost must, whether or not it should.',
    register: 'Professional, neutral to persuasive. Frequent in pitches and analysis.',
    focus: 'Compelling is persuasive force, not proof.',
    situation: 'Weighing a proposal that is better argued than it is evidenced.',
    dialogue: [
      { speaker: 'Deepa', line: 'So we are going with it?' },
      { speaker: 'Rahul', line: 'The argument is compelling. The evidence is two interviews. I want a third before we sign.' },
    ],
    challenge: 'Write the most compelling one-sentence case against something you actually want.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'inevitable',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'neutral',
    englishMeaning: 'Certain to happen and impossible to avoid, given the circumstances.',
    hindiMeaning: 'अपरिहार्य; जो टल न सके',
    nuance:
      'It describes consequences, not fate. Saying a delay was inevitable admits the causes; “we had no choice” avoids them. The word is stronger used with the condition made explicit — inevitable *given* what.',
    examples: [
      'With one maintainer and no tests, a rollback like that was inevitable.',
      'The meeting was short and the disagreement was inevitable, but it stayed polite and ended with an owner.',
    ],
    pronunciation: 'in-EV-uh-tuh-buhl',
    collocations: ['seemingly inevitable', 'inevitable consequence', 'all but inevitable'],
    commonMistake:
      'Using inevitable about a decision someone made. Decisions are not inevitable; their consequences may be.',
    differsFrom: 'unavoidable — nearly the same, but unavoidable is about obstacles and inevitable is about outcomes.',
    register: 'Neutral, common in analysis and post-mortems.',
    focus: 'Inevitable belongs to outcomes, not to choices.',
    situation: 'Explaining a failure without excusing it.',
    dialogue: [
      { speaker: 'Farah', line: 'Should we have seen the outage coming?' },
      { speaker: 'Vikram', line: 'The outage was not inevitable. The fact that nobody could restore it in under an hour was — we had never practised.' },
    ],
    challenge: 'Take a recent setback and separate what was inevitable from what was chosen.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'feasible',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Possible to do with the time, money and people available.',
    hindiMeaning: 'व्यावहारिक रूप से संभव; जो किया जा सके',
    nuance:
      'It answers “can this be done”, not “should it be”. A feasible plan can still be a bad one, and the useful sentence usually pairs the two judgements.',
    examples: [
      'A two-week discovery phase is feasible; a two-week build is not.',
      'It is technically feasible to run the import nightly, but we would be waking up to broken reports every Monday.',
    ],
    pronunciation: 'FEE-zuh-buhl',
    collocations: ['technically feasible', 'a feasible plan', 'feasible within'],
    commonMistake:
      'Writing “feasible for us to do it” without naming a constraint. The word only means something next to time, cost or capacity.',
    differsFrom: 'viable — viable asks whether something can survive and succeed, not merely whether it can be done.',
    register: 'Professional. Neutral and precise; preferred over “doable” in writing.',
    focus: 'Feasible means it can be done with what you actually have.',
    situation: 'Separating a technical possibility from a realistic plan.',
    dialogue: [
      { speaker: 'Karan', line: 'Can we migrate in one cutover?' },
      { speaker: 'Meera', line: 'Feasible, with four engineers and a weekend. Not with the two we have.' },
    ],
    challenge: 'State one plan as feasible and attach the exact constraint that makes it so.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'resilient',
    level: 'C1',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Able to recover quickly after a shock, setback or period of pressure.',
    hindiMeaning: 'लचीला; झटके के बाद जल्दी सँभलने वाला',
    nuance:
      'It is about recovery, not immunity. A resilient system still fails; what distinguishes it is how fast it returns. Used about people, it can quietly become an expectation that they absorb unlimited pressure, which is worth noticing.',
    examples: [
      'The team was resilient after the outage, but resilience is not a reason to keep them on call alone.',
      'Regional supply chains proved more resilient than the single-vendor plan everyone had approved.',
    ],
    pronunciation: 'ri-ZIL-yuhnt',
    collocations: ['a resilient system', 'remarkably resilient', 'resilient to shocks'],
    commonMistake:
      'Using resilient about something that simply never failed. Resilience is only demonstrated after a shock.',
    differsFrom: 'robust — robust resists damage; resilient recovers from it.',
    register: 'Neutral and professional. Increasingly used in operations and management.',
    focus: 'Resilience is measured in recovery, not in never falling.',
    situation: 'Reviewing how a system or a team behaved after an incident.',
    dialogue: [
      { speaker: 'Ritu', line: 'The site stayed up?' },
      { speaker: 'Arjun', line: 'It went down for nine minutes and came back without a human touching it. That is the resilient part.' },
    ],
    challenge: 'Describe one thing you rely on and say what it recovered from, not just that it survived.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'mitigate',
    level: 'C1',
    partOfSpeech: 'verb',
    tone: 'professional',
    englishMeaning: 'To make a bad situation, risk or effect less severe.',
    hindiMeaning: 'कम करना; जोखिम या नुकसान हल्का करना',
    nuance:
      'It reduces impact; it does not remove the cause. A mitigated risk is still a risk, and reports that blur the two are the reason the distinction matters.',
    examples: [
      'We can mitigate the outage risk with a staged rollout, but we cannot eliminate it.',
      'The new reviews mitigated the worst of the errors without fixing the process that produced them.',
    ],
    pronunciation: 'MIT-i-gayt',
    collocations: ['mitigate the risk', 'mitigate the impact', 'steps to mitigate'],
    commonMistake:
      'Writing “mitigate against”. Mitigate takes a direct object — you mitigate a risk, you do not mitigate against one.',
    differsFrom: 'alleviate — alleviate is used for suffering and symptoms; mitigate for risk and harm.',
    register: 'Professional. Standard in risk, engineering and policy writing.',
    focus: 'Mitigate lowers the damage; it does not remove the danger.',
    situation: 'Describing a risk plan honestly.',
    dialogue: [
      { speaker: 'Sameer', line: 'So the migration is safe?' },
      { speaker: 'Neha', line: 'Safer. Staging mitigates the blast radius. Nothing removes the risk of a bad schema change at 2 a.m.' },
    ],
    challenge: 'Write one sentence that names a risk and the mitigation, without implying the risk is gone.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'scrutinize',
    level: 'C1',
    partOfSpeech: 'verb',
    tone: 'professional',
    englishMeaning: 'To examine something very closely and critically.',
    hindiMeaning: 'बारीकी से जाँचना; कड़ी नज़र से परखना',
    nuance:
      'It implies suspicion or at least serious doubt. You scrutinize a claim, an invoice or a record — not a sunset. The scrutiny is of detail, and it assumes something may be wrong.',
    examples: [
      'Before signing, scrutinize the renewal clause — the price rises on the anniversary, not the calendar year.',
      'The auditors scrutinized the vendor invoices and found three that had been paid twice.',
    ],
    pronunciation: 'SKROO-tuh-nyz',
    collocations: ['scrutinize the details', 'closely scrutinized', 'scrutinize a claim'],
    commonMistake:
      'Using it for a quick look. Say “skimmed” or “reviewed” when no one is checking for errors.',
    differsFrom: 'inspect — inspect checks condition; scrutinize checks truthfulness and detail.',
    register: 'Formal and professional. “Scrutiny” as a noun is common in policy and audit.',
    focus: 'To scrutinize is to look for what is wrong.',
    situation: 'Warning a colleague to read a contract properly.',
    dialogue: [
      { speaker: 'Priya', line: 'The quote looks fine.' },
      { speaker: 'Ishaan', line: 'Scrutinize the last page. The support hours are half of what we assumed.' },
    ],
    challenge: 'Pick one document you signed recently and write the sentence you should have scrutinized.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'substantiate',
    level: 'C1',
    partOfSpeech: 'verb',
    tone: 'professional',
    englishMeaning: 'To support a claim with evidence or proof.',
    hindiMeaning: 'प्रमाण से सिद्ध करना; आधार देना',
    nuance:
      'It is about evidence for an assertion already made. You do not substantiate a decision; you substantiate the claim that the decision worked.',
    examples: [
      'The report makes a strong claim about retention that it never substantiates with cohort data.',
      'Before we repeat the number in a proposal, someone has to substantiate it from the source system.',
    ],
    pronunciation: 'sub-STAN-shee-ayt',
    collocations: ['substantiate a claim', 'substantiated by evidence', 'unable to substantiate'],
    commonMistake:
      'Confusing it with “substitute”. Substantiate means to prove; substitute means to replace.',
    differsFrom: 'corroborate — corroborate is independent confirmation; substantiate is providing the evidence yourself.',
    register: 'Formal: audits, research, legal and compliance writing.',
    focus: 'Substantiate turns an assertion into a supported one.',
    situation: 'Pushing back on an unsourced number in a deck.',
    dialogue: [
      { speaker: 'Kabir', line: 'Where does “40% faster” come from?' },
      { speaker: 'Deepa', line: 'A vendor blog. If we want to keep it, we need to substantiate it ourselves.' },
    ],
    challenge: 'Take one number you have repeated this month and write what would substantiate it.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'reconcile',
    level: 'C1',
    partOfSpeech: 'verb',
    tone: 'professional',
    englishMeaning: 'To make two things that disagree agree — accounts, figures, statements or people.',
    hindiMeaning: 'मेल बिठाना; दो अलग बातों में सामंजस्य बनाना',
    nuance:
      'In finance it is literal: two records must be made to match. In argument it means finding a version that honours both claims, and sometimes the honest outcome is that they cannot be reconciled. It is not the same as ignoring the difference.',
    examples: [
      'The two reports differ by eleven units, and nobody has reconciled them before the board meeting.',
      'It is hard to reconcile “we value deep work” with a calendar that has no two-hour gaps.',
    ],
    pronunciation: 'REK-uhn-syl',
    collocations: ['reconcile the accounts', 'reconcile two views', 'hard to reconcile'],
    commonMistake:
      'Using it to mean “resolve” in general. You reconcile figures or positions; you resolve a dispute.',
    differsFrom: 'resolve — resolve ends a problem; reconcile makes two accounts consistent.',
    register: 'Professional, especially finance and management.',
    focus: 'Reconcile makes two disagreeing things consistent — or shows they cannot be.',
    situation: 'Explaining a mismatch between two systems.',
    dialogue: [
      { speaker: 'Anil', line: 'The dashboard says 210, the invoices say 199.' },
      { speaker: 'Farah', line: 'Then we reconcile them before anyone reports either number.' },
    ],
    challenge: 'Name two beliefs you hold that are hard to reconcile, and say which one you would revise.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'ambiguity',
    level: 'C1',
    partOfSpeech: 'noun',
    tone: 'professional',
    englishMeaning: 'The quality of having more than one possible meaning, so that it can be read in different ways.',
    hindiMeaning: 'अस्पष्टता; जिसके एक से अधिक अर्थ निकल सकें',
    nuance:
      'Not all ambiguity is a defect: a poem can earn it. In contracts, instructions and dashboards it is a defect, because two readers will act differently. Naming the ambiguity is usually the first step to removing it.',
    examples: [
      'There is real ambiguity in “deliver by Friday” — Friday morning or end of day, and in whose time zone?',
      'The brief’s ambiguity cost us a week: half the team designed for mobile first and half for desktop.',
    ],
    pronunciation: 'am-big-YOO-i-tee',
    collocations: ['remove ambiguity', 'deliberate ambiguity', 'ambiguity in the brief'],
    commonMistake:
      'Confusing ambiguity with vagueness. A vague statement says little; an ambiguous one says two things at once.',
    differsFrom: 'uncertainty — uncertainty is not knowing the outcome; ambiguity is not knowing the meaning.',
    register: 'Formal and neutral, common in contracts, design and writing.',
    focus: 'Ambiguity is two meanings where one was needed.',
    situation: 'Slowing a project down to fix a brief before it costs more.',
    dialogue: [
      { speaker: 'Sara', line: 'Should we just start?' },
      { speaker: 'Vikram', line: 'Not with that ambiguity in the brief. Two interpretations, two builds, one deadline.' },
    ],
    challenge: 'Find one ambiguous sentence in a document you use and rewrite it with a single meaning.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'delegate',
    level: 'B2',
    partOfSpeech: 'verb',
    tone: 'professional',
    englishMeaning: 'To give a task or a decision to someone else, with the authority to do it.',
    hindiMeaning: 'ज़िम्मेदारी सौंपना; किसी और को काम और अधिकार देना',
    nuance:
      'Delegation transfers authority, not just work. Handing over the task while keeping every decision is not delegating, and the distinction is the most common management complaint in the language.',
    examples: [
      'She delegates the pricing conversation but keeps the final signature — and says so at the start.',
      'If you delegate the audit, delegate the access it needs, or you have only delegated the waiting.',
    ],
    pronunciation: 'DEL-i-gayt',
    collocations: ['delegate authority', 'delegate a task', 'delegate to someone'],
    commonMistake:
      'Using “delegate” as a noun for a person. In English a person is a delegate only in a conference or political sense; in management you delegate to a colleague.',
    differsFrom: 'assign — assign gives work; delegate gives work plus the authority to finish it.',
    register: 'Professional. Neutral, common in management writing.',
    focus: 'Delegate transfers authority, not just the task.',
    situation: 'Planning a week when you are the bottleneck.',
    dialogue: [
      { speaker: 'Neha', line: 'I will handle all the vendor calls.' },
      { speaker: 'Rahul', line: 'Then delegate the scheduling too, or you will spend the week in a calendar instead of on the calls.' },
    ],
    challenge: 'Write one task you will delegate this week, and the exact decision that goes with it.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'leverage',
    level: 'C1',
    partOfSpeech: 'verb',
    tone: 'professional',
    englishMeaning: 'To use something you already have to gain a larger advantage.',
    hindiMeaning: 'लाभ उठाना; मौजूद संसाधन से बड़ा फ़ायदा लेना',
    nuance:
      'In finance it means borrowing to increase exposure, with real risk attached. In business writing it has become a euphemism for “use”; keep it for cases where the advantage genuinely multiplies, otherwise plain “use” is stronger.',
    examples: [
      'We can leverage the existing patient database to test the new form without recruiting anyone.',
      'The group leveraged its buying power to get the same hardware at two-thirds of the price.',
    ],
    pronunciation: 'LEV-uh-rij',
    collocations: ['leverage existing assets', 'leverage expertise', 'financial leverage'],
    commonMistake:
      'Using leverage for a single, ordinary use. “Leverage your login” is just “use your login”, and readers notice.',
    differsFrom: 'exploit — exploit is stronger and often negative; leverage is neutral-business.',
    register: 'Business jargon. Fine in internal strategy, thin in customer-facing writing.',
    focus: 'Leverage multiplies an advantage you already hold.',
    situation: 'Proposing to reuse existing work instead of building from scratch.',
    dialogue: [
      { speaker: 'Arjun', line: 'Do we need new content for the launch?' },
      { speaker: 'Meera', line: 'We can leverage the Gurpurab archive — forty pieces nobody has linked properly.' },
    ],
    challenge: 'Rewrite one sentence that uses “leverage” with the plain verb, then decide which is more honest.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'coherent',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Clear, logical and consistent as a whole, with the parts fitting together.',
    hindiMeaning: 'सुसंगत; जिसके सब हिस्से मिलकर एक तर्क बनाएँ',
    nuance:
      'It judges the whole, not the sentences. Each paragraph can be clear and the document still incoherent if the argument shifts halfway. It is also used about systems and strategies that hold together under pressure.',
    examples: [
      'Each slide is fine; the deck is not coherent, because slides four and nine recommend opposite things.',
      'The team finally has a coherent story for the next quarter, and it fits the capacity we actually have.',
    ],
    pronunciation: 'koh-HEER-uhnt',
    collocations: ['a coherent argument', 'coherent strategy', 'coherent whole'],
    commonMistake:
      'Confusing coherent with clear. Clear sentences can add up to an incoherent argument.',
    differsFrom: 'consistent — consistent means it does not contradict itself over time; coherent means the parts form a whole.',
    register: 'Formal and professional. Also standard in physics, with a different technical sense.',
    focus: 'Coherent is about the whole holding together.',
    situation: 'Reviewing whether a plan adds up before presenting it.',
    dialogue: [
      { speaker: 'Priya', line: 'The sections read well.' },
      { speaker: 'Karan', line: 'Individually. Together they are not coherent — one promises growth, the other cuts the budget that would produce it.' },
    ],
    challenge: 'Look at your last three priorities and say in one sentence whether they are coherent.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'discrepancy',
    level: 'C1',
    partOfSpeech: 'noun',
    tone: 'professional',
    englishMeaning: 'A difference between two things that should have matched.',
    hindiMeaning: 'असंगति; दो मिलती चीज़ों में अंतर',
    nuance:
      'It implies an expectation of agreement, and therefore often an error or a concealed fact. A discrepancy is reported; an explanation is demanded. It is a colder, more serious word than “difference”.',
    examples: [
      'There is a discrepancy between the stock report and the warehouse count of about thirty units.',
      'The panel noticed a discrepancy in the timeline: the approval is dated before the request.',
    ],
    pronunciation: 'dis-KREP-uhn-see',
    collocations: ['a discrepancy between', 'minor discrepancy', 'explain the discrepancy'],
    commonMistake:
      'Using discrepancy for any difference of opinion. Opinions differ; figures have discrepancies.',
    differsFrom: 'disparity — disparity is a gap in size or level; discrepancy is a mismatch in what should match.',
    register: 'Formal: audit, accounting, investigation.',
    focus: 'A discrepancy is a mismatch that needs explaining.',
    situation: 'Reporting that two records do not agree.',
    dialogue: [
      { speaker: 'Farah', line: 'Payments show 42, the sheet shows 45.' },
      { speaker: 'Anil', line: 'Three-payment discrepancy. Let us find it before month-end, not after.' },
    ],
    challenge: 'Write the sentence you would use to report a discrepancy without accusing anyone.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'sustain',
    level: 'B2',
    partOfSpeech: 'verb',
    tone: 'neutral',
    englishMeaning: 'To keep something going at the same level over time, or to bear its weight.',
    hindiMeaning: 'बनाए रखना; लंबे समय तक जारी रखना',
    nuance:
      'It carries a question about capacity. A pace, a claim or a system can be sustained only if there is something underneath it. “Sustainable” has become a slogan, but the verb still asks what pays for it.',
    examples: [
      'We can sustain this publishing pace for a quarter, not for a year, at the current team size.',
      'The argument is easy to make once; it is hard to sustain when the second client asks for the same discount.',
    ],
    pronunciation: 'suh-STAYN',
    collocations: ['sustain growth', 'sustain attention', 'hard to sustain'],
    commonMistake:
      'Using sustain to mean “start” or “support emotionally”. Sustain is duration and load — it does not mean to encourage.',
    differsFrom: 'maintain — maintain keeps something in its current state; sustain keeps it going under load.',
    register: 'Neutral, common in business, science and music.',
    focus: 'Sustain asks what will carry the weight over time.',
    situation: 'Testing whether a plan survives its second month.',
    dialogue: [
      { speaker: 'Neha', line: 'We are publishing five pieces a week.' },
      { speaker: 'Sameer', line: 'Can we sustain five? Last time we managed three for six weeks before quality fell.' },
    ],
    challenge: 'Take one commitment and name what has to be true for you to sustain it for a year.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'elaborate',
    level: 'B2',
    partOfSpeech: 'verb',
    tone: 'neutral',
    englishMeaning: 'To explain something in more detail, adding the parts that were left out.',
    hindiMeaning: 'विस्तार से बताना; और जानकारी देना',
    nuance:
      'As a verb it is neutral; as an adjective (“an elaborate plan”) it means complicated and often suspiciously so. The pronunciation differs: e-LAB-uh-rayt for the verb, e-LAB-uh-ruht for the adjective.',
    examples: [
      'Could you elaborate on the second point — specifically who signs off on the change?',
      'The elaborate approval flow was built to prevent a mistake that had happened once in five years.',
    ],
    pronunciation: 'verb: e-LAB-uh-rayt; adjective: e-LAB-uh-ruht',
    collocations: ['elaborate on a point', 'an elaborate process', 'declined to elaborate'],
    commonMistake:
      'Writing “elaborate about”. The verb takes “on” or a direct object: elaborate on the plan, or elaborate the plan.',
    differsFrom: 'expand — expand makes something longer; elaborate adds the missing detail.',
    register: 'Neutral and professional; the adjective can sound faintly critical.',
    focus: 'Elaborate adds the detail that was missing, not just more words.',
    situation: 'Asking a colleague to go one level deeper in a meeting.',
    dialogue: [
      { speaker: 'Ritu', line: 'The scope is clear.' },
      { speaker: 'Ishaan', line: 'Elaborate on “clear”. Does it include the Punjabi pages or only English?' },
    ],
    challenge: 'In your next meeting, elaborate on one answer with a specific detail instead of a longer sentence.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'superficial',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'neutral',
    englishMeaning: 'Existing only on the surface; not deep, thorough or genuinely felt.',
    hindiMeaning: 'ऊपरी; सतही, गहराई तक न जाने वाला',
    nuance:
      'About people it is an insult; about a change or a review it is a diagnosis. It often appears where a serious problem was treated cosmetically, which is the sense worth keeping sharp.',
    examples: [
      'The redesign was superficial — the same navigation, a new palette and the same support queue.',
      'His knowledge of the domain is real but superficial at the edges, and clients notice within two questions.',
    ],
    pronunciation: 'soo-pur-FISH-uhl',
    collocations: ['superficial understanding', 'superficial change', 'at least on a superficial level'],
    commonMistake:
      'Using superficial to mean “not important”. A superficial wound is minor; a superficial analysis is shallow and serious.',
    differsFrom: 'shallow — nearly identical, but shallow is plainer and more direct criticism.',
    register: 'Neutral, often critical. Common in reviews and post-mortems.',
    focus: 'Superficial means the change never reached the cause.',
    situation: 'Calling a fix cosmetic while staying fair about it.',
    dialogue: [
      { speaker: 'Kabir', line: 'The bounce rate improved after the redesign.' },
      { speaker: 'Deepa', line: 'Because we moved the form up. That is real. But the support complaints are identical, so the fix was superficial.' },
    ],
    challenge: 'Name one “fix” in your work that was superficial, and what the deeper fix would be.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'hindsight',
    level: 'C1',
    partOfSpeech: 'noun',
    tone: 'neutral',
    englishMeaning: 'Understanding of an event that comes only after it has happened.',
    hindiMeaning: 'पश्चातबुद्धि; घटना के बाद मिली समझ',
    nuance:
      'Almost always used to excuse or contextualise: “in hindsight” marks a judgement as unfair to the people who had to decide without the information. It is a noun, not an adverb, so “in hindsight” is the phrase.',
    examples: [
      'In hindsight, the second launch should have waited a week; at the time nobody could have known the payment provider would freeze.',
      'Hindsight is comfortable. The useful question is what we could have known then.',
    ],
    pronunciation: 'HYND-syt',
    collocations: ['in hindsight', 'with the benefit of hindsight', 'hindsight is 20/20'],
    commonMistake:
      'Writing “hindsightly” or “on hindsight”. The idiom is “in hindsight”, and it is never an adverb.',
    differsFrom: 'retrospect — same meaning, more formal: “in retrospect”.',
    register: 'Neutral, used in reviews, post-mortems and conversation.',
    focus: 'Hindsight names what only the outcome taught you.',
    situation: 'Reviewing a decision without pretending it was obvious.',
    dialogue: [
      { speaker: 'Meera', line: 'So we chose wrong.' },
      { speaker: 'Arjun', line: 'In hindsight, yes. With the information available on the Monday, I would choose the same way again.' },
    ],
    challenge: 'Write a post-mortem sentence that uses hindsight honestly rather than as an excuse.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'impromptu',
    level: 'C1',
    partOfSpeech: 'adjective',
    tone: 'neutral',
    englishMeaning: 'Done without preparation or planning, usually in response to the moment.',
    hindiMeaning: 'बिना तैयारी का; तुरंत किया गया',
    nuance:
      'It is mildly approving: the impromptu remark or speech worked. It describes the occasion, not the quality — an impromptu speech can still be dreadful, but the word suggests nobody minded.',
    examples: [
      'After the demo, an impromptu discussion with the two clinic managers produced better feedback than the survey.',
      'He gave an impromptu five minutes on cost control and, unusually, it was the clearest part of the day.',
    ],
    pronunciation: 'im-PROMP-tyoo',
    collocations: ['an impromptu speech', 'impromptu meeting', 'impromptu performance'],
    commonMistake:
      'Using impromptu for something badly planned. It describes the absence of preparation, not the absence of quality.',
    differsFrom: 'spontaneous — spontaneous is about impulse; impromptu is specifically about a gathering or performance without rehearsal.',
    register: 'Neutral to slightly warm. Common in the arts and in meeting notes.',
    focus: 'Impromptu means no rehearsal, and it is not a criticism.',
    situation: 'Describing a useful conversation that was not on the agenda.',
    dialogue: [
      { speaker: 'Sara', line: 'Was the offsite planned?' },
      { speaker: 'Vikram', line: 'Only the morning. The afternoon turned into an impromptu workshop and that is where the decision happened.' },
    ],
    challenge: 'Speak for sixty seconds without notes on something you know well, then note what changed.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'apprehensive',
    level: 'C1',
    partOfSpeech: 'adjective',
    tone: 'neutral',
    englishMeaning: 'Worried that something you are about to do or face will go badly.',
    hindiMeaning: 'आशंकित; आने वाली बात को लेकर चिंतित',
    nuance:
      'It is forward-looking and specific: you are apprehensive about a meeting, not about life in general. It is honest and not shameful, unlike “afraid”, which sounds stronger.',
    examples: [
      'I am apprehensive about the migration; the last one looked exactly this calm.',
      'She was apprehensive about returning to client work and said so in the first minute, which made the rest easier.',
    ],
    pronunciation: 'ap-ri-HEN-siv',
    collocations: ['apprehensive about', 'quietly apprehensive', 'understandably apprehensive'],
    commonMistake:
      'Writing “apprehensive of”. It takes “about” (a situation) or “that” plus a clause.',
    differsFrom: 'anxious — anxious is broader and can be a general state; apprehensive has a specific coming event.',
    register: 'Neutral. Perfectly appropriate at work; not a weakness.',
    focus: 'Apprehensive names a specific worry about what comes next.',
    situation: 'Telling a team you are nervous, before it becomes a problem.',
    dialogue: [
      { speaker: 'Neha', line: 'Ready for the audit?' },
      { speaker: 'Rahul', line: 'Apprehensive about the access logs. Everything else we have rehearsed.' },
    ],
    challenge: 'Say out loud what you are apprehensive about this week, and the one thing that would reduce it.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'diligent',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Showing steady, careful effort over time, especially in routine work.',
    hindiMeaning: 'मेहनती और लगन से काम करने वाला',
    nuance:
      'It praises consistency rather than brilliance. Diligent work is checked, kept up and not skipped — the quality that makes a handover possible. It can sound faintly like damning with faint praise if the role demanded more than care.',
    examples: [
      'Her notes are diligent: every call logged, every promise dated, and nothing left for the next person to guess.',
      'The diligence behind the audit was obvious in the footnotes, where the exceptions actually were.',
    ],
    pronunciation: 'DIL-i-juhnt',
    collocations: ['diligent work', 'diligent about', 'a diligent researcher'],
    commonMistake:
      'Using diligent for a single burst of effort. Diligence is sustained care, not one long night.',
    differsFrom: 'hardworking — hardworking is effort; diligent adds care and consistency in detail.',
    register: 'Professional, slightly formal. Often used in references.',
    focus: 'Diligent means the care did not lapse.',
    situation: 'Describing reliable work in a reference or review.',
    dialogue: [
      { speaker: 'Priya', line: 'How was the handover?' },
      { speaker: 'Karan', line: 'Diligent. I did not have to ask a single question about the vendor contacts.' },
    ],
    challenge: 'Name one routine you keep diligently, and what it prevents.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'candid',
    level: 'C1',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Honest and direct, especially about something uncomfortable.',
    hindiMeaning: 'स्पष्टवादी; खुलकर सच कहने वाला',
    nuance:
      'Candid is frank without hostility, and usually invited. A candid conversation is one where the polite version is set aside deliberately; “candid feedback” is the phrase that opens the door.',
    examples: [
      'To be candid, the first version of the proposal was unreadable, and I said so on the call.',
      'The most useful hour of the week was a candid conversation with the person who had left.',
    ],
    pronunciation: 'KAN-did',
    collocations: ['to be candid', 'candid feedback', 'a candid conversation'],
    commonMistake:
      'Confusing candid with blunt. Blunt describes the delivery; candid describes the honesty. You can be candid and kind.',
    differsFrom: 'frank — frank is nearly identical, slightly firmer; candid is more often invited.',
    register: 'Professional, warm. “To be candid” softens a hard sentence.',
    focus: 'Candid is honesty with the door already open.',
    situation: 'Giving feedback someone has asked for.',
    dialogue: [
      { speaker: 'Anil', line: 'Be candid — is the portfolio ready?' },
      { speaker: 'Farah', line: 'Candidly, two case studies are strong and the rest are descriptions of work we did not do.' },
    ],
    challenge: 'Give one piece of candid feedback you have been softening, and keep it under three sentences.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'meticulous',
    level: 'C1',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Extremely careful about small details, so that nothing is left to chance.',
    hindiMeaning: 'अत्यंत सावधान; बारीकी तक ध्यान रखने वाला',
    nuance:
      'Stronger than careful and more specific than organised. It implies the small details are checked deliberately, and it is a genuine compliment where mistakes are expensive — and faintly comic where speed mattered more.',
    examples: [
      'The migration plan was meticulous: every rollback step had an owner and a time.',
      'He is meticulous about naming, which is why nobody has ever deployed the wrong file.',
    ],
    pronunciation: 'muh-TIK-yuh-luhs',
    collocations: ['meticulous planning', 'meticulous attention to detail', 'meticulous about'],
    commonMistake:
      'Using meticulous for volume of work. It describes precision, not effort or speed.',
    differsFrom: 'thorough — thorough covers everything; meticulous is precise about the small parts of everything.',
    register: 'Professional. Strong, sincere praise.',
    focus: 'Meticulous means the small details were checked on purpose.',
    situation: 'Praising work where a small error would have been costly.',
    dialogue: [
      { speaker: 'Ritu', line: 'The cutover was boring.' },
      { speaker: 'Sameer', line: 'Boring is the compliment. Meticulous planning is why nobody was on a call at 3 a.m.' },
    ],
    challenge: 'Describe one task that deserves meticulous handling, and the detail you usually skip.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'trivial',
    level: 'B2',
    partOfSpeech: 'adjective',
    tone: 'neutral',
    englishMeaning: 'Of little importance or value; not worth serious attention.',
    hindiMeaning: 'मामूली; तुच्छ, जिसका अधिक महत्व न हो',
    nuance:
      'It judges importance, not difficulty: a trivial task can take an hour, and a trivial objection can hide a real problem. In technical writing it can mean mathematically simple, which is a different sense.',
    examples: [
      'The cost is trivial compared with the support burden of not fixing it.',
      'What looked like a trivial objection about the invoice format turned out to be the only question the client cared about.',
    ],
    pronunciation: 'TRIV-ee-uhl',
    collocations: ['trivial matter', 'far from trivial', 'trivial compared with'],
    commonMistake:
      'Confusing trivial (unimportant) with simple (easy). A security check can be simple and not trivial at all.',
    differsFrom: 'minor — minor is small in size or rank; trivial is small in importance.',
    register: 'Neutral to formal. Careful: calling someone’s concern trivial is a strong insult.',
    focus: 'Trivial is about importance, not effort.',
    situation: 'Choosing what to fix when time is short.',
    dialogue: [
      { speaker: 'Deepa', line: 'Should we fix the date format?' },
      { speaker: 'Ishaan', line: 'Not trivial — two clients read it as month-first and both have been late.' },
    ],
    challenge: 'List three “trivial” tasks from this week and re-rank them by real cost.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'volatile',
    level: 'C1',
    partOfSpeech: 'adjective',
    tone: 'professional',
    englishMeaning: 'Likely to change suddenly and unpredictably, often for the worse.',
    hindiMeaning: 'अस्थिर; जल्दी और अप्रत्याशित रूप से बदलने वाला',
    nuance:
      'Neutral in science (a volatile liquid evaporates easily) and anxious in markets and moods. In business it describes conditions, not people: “a volatile market”, rarely “a volatile colleague”.',
    examples: [
      'Pricing has been volatile since the tariff change, so we are quoting in two-week windows.',
      'The early weeks of a launch are volatile; one bad review can move a small site by half.',
    ],
    pronunciation: 'VOL-uh-tyl',
    collocations: ['volatile market', 'highly volatile', 'volatile conditions'],
    commonMistake:
      'Using volatile for something merely uncertain. Uncertainty is not knowing; volatility is repeated sharp movement.',
    differsFrom: 'unstable — unstable implies something may break; volatile implies it keeps swinging without breaking.',
    register: 'Professional, finance and science. Avoid for people in writing.',
    focus: 'Volatile means the swings keep coming, not that you lack information.',
    situation: 'Explaining why a forecast is a range and not a number.',
    dialogue: [
      { speaker: 'Neha', line: 'Can you give me a single figure for next quarter?' },
      { speaker: 'Arjun', line: 'The market is volatile. I will give you a range and the assumption behind it.' },
    ],
    challenge: 'Take one volatile number in your work and write the range plus the trigger that moves it.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'deteriorate',
    level: 'C1',
    partOfSpeech: 'verb',
    tone: 'neutral',
    englishMeaning: 'To become progressively worse in quality or condition.',
    hindiMeaning: 'बिगड़ना; धीरे-धीरे हालत खराब होना',
    nuance:
      'It implies a trend, not an event, and usually something that was previously acceptable. Health, relationships, infrastructure and standards deteriorate; a single failure does not.',
    examples: [
      'Search performance deteriorated quietly over three months, one slow template at a time.',
      'The relationship with the vendor deteriorated after the second missed deadline, and nobody documented why.',
    ],
    pronunciation: 'di-TEER-ee-uh-rayt',
    collocations: ['conditions deteriorated', 'deteriorate rapidly', 'begin to deteriorate'],
    commonMistake:
      'Using deteriorate for a sudden break. It is gradual, and the gradual part is often the warning.',
    differsFrom: 'decline — decline can be neutral or chosen (to decline an offer is different); deteriorate is always for the worse.',
    register: 'Neutral and formal. Common in reports and health writing.',
    focus: 'Deteriorate is slow damage that nobody stopped.',
    situation: 'Describing a trend that was invisible day to day.',
    dialogue: [
      { speaker: 'Priya', line: 'The site felt slower this week.' },
      { speaker: 'Karan', line: 'It did not get slower this week. It deteriorated since the June release and we only noticed now.' },
    ],
    challenge: 'Find one slowly deteriorating metric and write the sentence that would have caught it a month earlier.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'anticipate',
    level: 'B2',
    partOfSpeech: 'verb',
    tone: 'professional',
    englishMeaning: 'To expect something and prepare for it in advance.',
    hindiMeaning: 'पहले से अनुमान लगाकर तैयार रहना',
    nuance:
      'The preparation is the point. “I anticipate a delay” is a warning with a plan behind it; “I expect a delay” is a prediction. It also means to look forward to, but in professional writing it is usually the first sense.',
    examples: [
      'We anticipated the traffic spike and moved the campaign a week earlier.',
      'Nobody anticipated that the clinic staff would use the form on paper first.',
    ],
    pronunciation: 'an-TIS-i-payt',
    collocations: ['anticipate a problem', 'widely anticipated', 'anticipate demand'],
    commonMistake:
      'Writing “anticipate for”. It takes a direct object: anticipate a delay, not anticipate for a delay.',
    differsFrom: 'expect — expect is belief about the future; anticipate adds preparation.',
    register: 'Professional and neutral, very common in planning.',
    focus: 'Anticipate means you prepared, not merely that you guessed.',
    situation: 'Reporting on a risk you already handled.',
    dialogue: [
      { speaker: 'Sara', line: 'Why is the release still on time?' },
      { speaker: 'Vikram', line: 'We anticipated the review queue and put two people on it from Monday.' },
    ],
    challenge: 'Write one sentence naming something you anticipate this week and the preparation already done.',
    revision: REV,
    anchor: true,
  },
  {
    word: 'adamant',
    level: 'C1',
    partOfSpeech: 'adjective',
    tone: 'neutral',
    englishMeaning: 'Refusing to change a position, however much pressure is applied.',
    hindiMeaning: 'अडिग; अपनी बात पर अटल',
    nuance:
      'It describes the refusal, not the reason. An adamant person may be right or wrong; the word only records that persuasion failed. Saying someone was adamant is often a neutral report of a deadlock.',
    examples: [
      'The client is adamant that the launch cannot move, so the scope has to.',
      'She was adamant about not shipping on a Friday, and after two rollbacks nobody argued.',
    ],
    pronunciation: 'AD-uh-muhnt',
    collocations: ['adamant that', 'adamant about', 'remained adamant'],
    commonMistake:
      'Writing “adamant to do”. It takes “that” plus a clause, or “about” plus a noun.',
    differsFrom: 'stubborn — stubborn is a criticism; adamant can be a neutral or even admiring report.',
    register: 'Neutral. Often used to explain why a plan changed around a fixed point.',
    focus: 'Adamant records a position that will not move.',
    situation: 'Explaining a constraint that is not negotiable.',
    dialogue: [
      { speaker: 'Rahul', line: 'Can we push the date?' },
      { speaker: 'Meera', line: 'The founder is adamant. The announcement is tied to the anniversary, so we cut scope instead.' },
    ],
    challenge: 'Name one position you are adamant about, and the evidence that would change it.',
    revision: REV,
    anchor: true,
  },
];

/** Quick lookup the pipeline uses; built once, never mutated. */
export const VOCABULARY_GLOSS_BY_WORD: ReadonlyMap<string, VocabularyGloss> = new Map(
  VOCABULARY_GLOSSES.map((gloss) => [gloss.word.toLowerCase(), gloss]),
);

/** The words discovery may grow candidates from. */
export const VOCABULARY_ANCHORS: readonly string[] = VOCABULARY_GLOSSES
  .filter((gloss) => gloss.anchor)
  .map((gloss) => gloss.word);
