import type { SpeakBetterLesson } from '../types';

/**
 * Speak Better — C2 (Proficiency).
 *
 * One lesson is one primary target word, taught in depth, for the words that
 * separate a fluent speaker from one who sounds native in careful argument. A C2
 * lesson appears on one day in five. Related words are a single clarifying line in
 * `relatedWords`, never a second lesson.
 */

export const speakBetterC2Lessons: SpeakBetterLesson[] = [
  {
    level: 'C2',
    id: 'c2-suggestive-inconclusive-tendentious-specious',
    focus: 'Specious describes an argument that looks sound but is not. Use it when you can show the flaw precisely.',
    situation: 'You are reviewing a research summary before it goes to a client. One argument looks convincing but rests on a weak link, and you need to say so precisely enough that the author thanks you.',
    word: {
      word: 'specious',
      partOfSpeech: 'adjective',
      tone: 'formal',
      pronunciation: '/ˈspiːʃəs/ — SPEE-shus; the “e” before “ous” is a schwa.',
      englishMeaning: 'appearing convincing or sound at first glance, but actually false.',
      hindiMeaning: 'भ्रामक, देखने में ठीक पर वास्तव में गलत',
      nuance: 'Specious is the sharpest word here: it accuses an argument of being dressed up to survive a quick look. Use it on reasoning, never on people.',
      examples: [
        'The argument is specious: a fall in complaints can just as easily mean a fall in reporting.',
        '“Specious precision” is the phrase for a figure given to two decimal places with no source.',
        'The forecast is specious: it assumes the price stays flat for three years without giving a reason.',
      ],
      collocations: [
        'a specious argument',
        'specious reasoning',
        'a specious distinction',
        'specious precision',
      ],
      commonMistake: 'Confusing specious with spacious — they share a look and nothing else. Specious reasoning is false; a spacious room is large.',
      differsFrom: 'Tendentious is about bias in framing; specious is about the reasoning itself not holding. A specious argument can be entirely unbiased and still wrong.',
      register: 'Formal, literary and adversarial. In a professional review, use it once and then show the flaw in plain words.',
    },
    relatedWords: [
      {
        word: 'suggestive',
        note: 'pointing somewhere without proving it.',
      },
      {
        word: 'inconclusive',
        note: 'not settling the question either way.',
      },
      {
        word: 'tendentious',
        note: 'arguing a case while claiming to report neutrally.',
      },
    ],
    dialogue: [
      {
        speaker: 'Author',
        line: 'Complaints fell after the change, so the change worked.',
      },
      {
        speaker: 'You',
        line: 'That argument is specious: fewer complaints can also mean fewer people reporting them.',
      },
      {
        speaker: 'Author',
        line: 'Then what would prove it?',
      },
      {
        speaker: 'You',
        line: 'Complaints per thousand customers, counted the same way before and after.',
      },
    ],
    challenge: 'Take one argument you have read this week. Say in two sentences why it sounds convincing, and what makes it specious, without insulting the author.',
  },
  {
    level: 'C2',
    id: 'c2-qualify-hedge-concede-dissemble',
    focus: 'To qualify a claim is to limit it precisely, so that it survives scrutiny. It is a sign of care, not of weakness.',
    situation: 'You are drafting a summary for a regulator, and every sentence must be defensible. You need to bound a claim about a regional drop, without overstating it or hiding behind vague words.',
    word: {
      word: 'qualify',
      partOfSpeech: 'verb',
      tone: 'formal',
      pronunciation: '/ˈkwɒlɪfaɪ/ — KWOL-ih-fye; two forms of the “i” — a short /ɪ/ then a long /aɪ/.',
      englishMeaning: 'to limit or bound a statement so that it is accurate rather than sweeping.',
      hindiMeaning: 'सीमित करना, शर्त लगाना',
      nuance: 'Qualifying is a discipline, not a weakness: it states the conditions under which the claim holds. A qualified claim is stronger than an unqualified one, because it survives challenge.',
      examples: [
        'I would qualify that: the drop is real, but only in the two northern regions.',
        'The report qualifies every projection with the assumption behind it.',
        'We qualified the forecast: it holds if interest rates stay where they are for the year.',
      ],
      collocations: [
        'qualify a statement',
        'heavily qualified',
        'qualify that by saying',
        'a qualified yes',
      ],
      commonMistake: 'Confusing “to qualify” (limit a claim) with “to be qualified” (have credentials). A qualified accountant and a qualified claim have nothing to do with each other.',
      differsFrom: 'Hedge reduces commitment; qualify states its boundaries. Good writing qualifies and does not hedge.',
      register: 'Formal, standard in legal, academic and regulatory English.',
    },
    relatedWords: [
      {
        word: 'hedge',
        note: 'to avoid committing to a claim, often to stay safe.',
      },
      {
        word: 'concede',
        note: 'to admit a point that goes against your argument.',
      },
      {
        word: 'dissemble',
        note: 'to hide what you know or think behind a false appearance.',
      },
    ],
    dialogue: [
      {
        speaker: 'Colleague',
        line: 'Can we just say the drop is regional?',
      },
      {
        speaker: 'You',
        line: 'We can qualify it: regional, over two quarters, with the sample size noted.',
      },
      {
        speaker: 'Colleague',
        line: 'That sounds like hedging.',
      },
      {
        speaker: 'You',
        line: 'It is the opposite. Qualifying bounds the claim, so it can be defended.',
      },
    ],
    challenge: 'Rewrite one sentence you wrote recently by qualifying it. Name the condition, the scope or the period that limits it.',
  },
  {
    level: 'C2',
    id: 'c2-erode-undermine-enfeeble-entrench',
    focus: 'To undermine something is to weaken it from below, often quietly. The word implies that someone or something is doing the damage.',
    situation: 'You are explaining why a healthy-looking team lost two senior people in one quarter. “The culture got worse” will not satisfy anyone who has to fix it.',
    word: {
      word: 'undermine',
      partOfSpeech: 'verb',
      tone: 'formal',
      pronunciation: '/ˌʌndəˈmaɪn/ — un-duh-MINE, stress on the last syllable.',
      englishMeaning: 'to weaken something from below, often deliberately and out of sight.',
      hindiMeaning: 'कमज़ोर करना, अंदर से खोखला करना',
      nuance: 'Undermine implies a hidden mechanism: the damage is done at the foundation while the surface still looks intact. It carries at least a hint of intent, which erode does not.',
      examples: [
        'Approving an exception for one team undermined the rule for all of them.',
        'The second memo undermined the first without ever mentioning it.',
        'Last-minute changes to the brief undermine the trust the team has built with the client.',
      ],
      collocations: [
        'undermine confidence',
        'undermine an argument',
        'seriously undermine',
        'undermine from within',
      ],
      commonMistake: 'Using undermine for accidental weakening — the word suggests agency. If nobody did it, use weaken.',
      differsFrom: 'Enfeeble is about draining strength; undermine is about damaging the support. Undermining makes collapse possible; enfeebling makes effort impossible.',
      register: 'Formal, and pointed. “This undermines the process” is a serious professional accusation.',
    },
    relatedWords: [
      {
        word: 'erode',
        note: 'to wear away gradually, by small losses.',
      },
      {
        word: 'enfeeble',
        note: 'to make weak, usually over a long period.',
      },
      {
        word: 'entrench',
        note: 'to fix something so firmly that it is hard to change.',
      },
    ],
    dialogue: [
      {
        speaker: 'Director',
        line: 'Why did two senior people leave in one quarter?',
      },
      {
        speaker: 'You',
        line: 'Nothing broke suddenly. Trust weakened over about eighteen months, through unpaid overtime and decisions made without them.',
      },
      {
        speaker: 'Director',
        line: 'Did someone deliberately undermine them?',
      },
      {
        speaker: 'You',
        line: 'Nobody did it on purpose. But the escalation route made their judgement optional, and that undermined their role.',
      },
    ],
    challenge: 'Describe one thing at work that has been weakened over time, in three sentences. Use undermine once, and say who or what is doing the damage.',
  },
  {
    level: 'C2',
    id: 'c2-equivocate-precipitate-prevaricate-propitiate',
    focus: 'To equivocate is to use deliberately vague or ambiguous language so that you do not have to commit. It is a choice, and listeners notice it.',
    situation: 'A negotiation has stalled. Everyone is using long, careful sentences to avoid a decision, and you have to name what is happening without insulting anyone in the room.',
    word: {
      word: 'equivocate',
      partOfSpeech: 'verb',
      tone: 'formal',
      pronunciation: '/ɪˈkwɪvəkeɪt/ — ih-KWIV-uh-kate, four syllables, stress on the second.',
      englishMeaning: 'to use ambiguous language so as to avoid committing to a position.',
      hindiMeaning: 'दो-अर्थी बात करना, गोलमोल जवाब देना',
      nuance: 'Equivocate is not quite lying: every word can be defended, and the effect is that nothing has been decided. In a negotiation it is often rational and always corrosive.',
      examples: [
        'The reply equivocated on the date: “as soon as practicable” appears twice and a date not once.',
        'Let me not equivocate — we can do the work, and not by December.',
        'The minister equivocated on the budget, promising a review without saying when it would report.',
      ],
      collocations: [
        'refuse to equivocate',
        'equivocate on',
        'without equivocation',
        'an equivocal answer',
      ],
      commonMistake: 'Confusing equivocate (be deliberately ambiguous) with equate (treat as equal). An equivocal answer is not an equivalent one.',
      differsFrom: 'Prevaricate delays and misleads; equivocate commits to nothing while staying accurate. Equivocation survives a transcript; prevarication does not.',
      register: 'Formal and accusatory. “I will not equivocate” is a strong opening, and it has to be true for the rest of the meeting.',
    },
    relatedWords: [
      {
        word: 'prevaricate',
        note: 'to stall or evade the truth, often with a deliberate untruth.',
      },
      {
        word: 'precipitate',
        note: 'to cause something to happen suddenly, often before it is ready.',
      },
      {
        word: 'propitiate',
        note: 'to calm someone with a concession, usually to avoid conflict.',
      },
    ],
    dialogue: [
      {
        speaker: 'Counterpart',
        line: 'We would like to move as soon as practicable.',
      },
      {
        speaker: 'You',
        line: 'That is vague for a date. Does practicable mean this quarter or next?',
      },
      {
        speaker: 'Counterpart',
        line: 'It depends on your team.',
      },
      {
        speaker: 'You',
        line: 'Then let us decide: two of you want December and two want March. I would rather not equivocate on the date.',
      },
    ],
    challenge: 'Listen to your next meeting and notice one place where someone equivocates. Then ask one plain question that asks for a commitment, without accusing anyone.',
  },
  {
    level: 'C2',
    id: 'c2-nuance-shade-subtlety-inflection',
    focus: 'A nuance is a small, meaningful difference in meaning or tone. Noticing nuance is what separates a correct sentence from a well-judged one.',
    situation: 'You are coaching someone whose English is fluent but who keeps losing arguments in English that they would win in Hindi. The gap is not grammar; it is the small words that carry disagreement politely.',
    word: {
      word: 'nuance',
      partOfSpeech: 'noun',
      tone: 'neutral',
      pronunciation: '/ˈnjuːɑːns/ — NYOO-ahns; two syllables in careful British speech, and the final sound is a plain /s/, not a /z/',
      englishMeaning: 'a very small difference in meaning or feeling that matters.',
      hindiMeaning: 'सूक्ष्म अंतर, बारीकी',
      nuance: 'A nuance is small and consequential: losing it changes what is understood, not just how it sounds. The plural is common — “the nuances of the word” — and the adjective, nuanced, means carefully balanced.',
      examples: [
        'The nuance between “we will consider it” and “we will decide” is the whole negotiation.',
        'Her summary is nuanced: it says what is agreed, what is not, and who decides.',
        'The report is correct, but it misses the nuance in the regional data, which varies sharply by district.',
      ],
      collocations: [
        'a subtle nuance',
        'the nuances of',
        'a nuanced view',
        'lose the nuance',
      ],
      commonMistake: '“A slight nuance” — nuance already means slight, so this is redundant. And note that “nuance” is not a synonym for “detail”.',
      differsFrom: 'A shade is a difference in degree; a nuance is a difference in meaning. Two shades of blue, two nuances of “concern”.',
      register: 'Neutral to formal and universal in professional English; a little abstract for casual speech.',
    },
    relatedWords: [
      {
        word: 'shade',
        note: 'a small difference in degree or tone.',
      },
      {
        word: 'subtlety',
        note: 'a detail that rewards close attention.',
      },
      {
        word: 'inflection',
        note: 'a change in the pitch or direction of the voice, or in a trend.',
      },
    ],
    dialogue: [
      {
        speaker: 'Coachee',
        line: 'In Hindi I can disagree without offending. In English I sound rude or vague.',
      },
      {
        speaker: 'You',
        line: 'The nuance is in the softeners, not in the grammar.',
      },
      {
        speaker: 'Coachee',
        line: 'Give me an example.',
      },
      {
        speaker: 'You',
        line: '“I am not sure that holds” is gentler than “that is wrong”, and it invites a reply instead of ending the exchange.',
      },
    ],
    challenge: 'Record thirty seconds of yourself giving an opinion. Listen back, and name one place where a nuance would have made you more precise, and one place a softer phrase would have helped.',
  },
];
