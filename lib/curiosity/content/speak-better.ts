import type { SpeakBetterLesson } from '../types';

/**
 * Speak Better — A2–B1 (Elementary and Pre-intermediate).
 *
 * One lesson is one primary target word, taught in depth: its part of speech, a
 * pronunciation note, an English definition, a Hindi meaning, nuance, three or four
 * examples, collocations, the mistake learners make, register and tone. Words that
 * are only worth a clarification sit in `relatedWords` as a single line each; they
 * are never lessons of their own.
 *
 * Lesson ids are stable keys for progress and for the publication ledger, so they
 * keep their original spelling even where the primary word is one of several named.
 */

export const speakBetterLessons: SpeakBetterLesson[] = [
  {
    level: 'A2-B1',
    id: 'teach-learn-study-practise',
    focus: 'Practise is the verb: you practise a skill by doing it again and again until it feels natural.',
    situation: 'Your teacher asks how you are preparing for the speaking test in three weeks. You want to explain your routine clearly, and to get the spelling right when you write it down.',
    word: {
      word: 'practise',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'PRAK-tis. The verb and the noun sound the same; only the spelling changes.',
      englishMeaning: 'to do something again and again in order to become better at it.',
      hindiMeaning: 'अभ्यास करना',
      nuance: 'Practise (British spelling, verb) is about repetition, not understanding. The noun is “practice” with a “c” — “practice makes perfect”.',
      examples: [
        'I practise my English aloud for ten minutes every night.',
        'Practising at the same time each day is easier than finding motivation.',
        'We need more practice before the match, so we will practise the set plays again on Saturday.',
      ],
      collocations: [
        'practise a skill',
        'practise speaking',
        'practise for an exam',
        'practise every day',
      ],
      commonMistake: '“I practice English every day” → “I practise English every day.” The verb is “practise”, with an s, in British and Indian English. “Practice” is the noun: “I need more practice.”',
      register: 'Neutral. The spelling follows the English variety: British and Indian English use “practise” for the verb.',
    },
    relatedWords: [
      {
        word: 'teach',
        note: 'the person who helps: you teach someone something.',
      },
      {
        word: 'learn',
        note: 'what the student does. A teacher teaches; a student learns.',
      },
      {
        word: 'study',
        note: 'spending time on a subject on purpose, usually for an exam.',
      },
    ],
    dialogue: [
      {
        speaker: 'Teacher',
        line: 'How are you preparing for the speaking test?',
      },
      {
        speaker: 'You',
        line: 'I practise speaking English for ten minutes every morning.',
      },
      {
        speaker: 'Teacher',
        line: 'And what do you practise most?',
      },
      {
        speaker: 'You',
        line: 'Short answers to the questions I expect, out loud, until they sound natural.',
      },
    ],
    challenge: 'Describe one skill you practise, out loud, in three sentences: what you do, how often, and how you know it is improving.',
  },
  {
    level: 'A2-B1',
    id: 'hear-listen-overhear-listen-in',
    focus: 'Listen means paying attention on purpose: you listen to a person, a voice or a piece of advice.',
    situation: 'On a noisy call, a colleague gives you a date too quickly, and you missed it. You want to ask politely for the detail and show that you were paying attention.',
    word: {
      word: 'listen',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'LIS-en. The “t” is silent.',
      englishMeaning: 'to pay attention with your ears, deliberately and with effort.',
      hindiMeaning: 'ध्यान से सुनना',
      nuance: 'Listening is active and cannot be done by accident. It always takes “to” something: listen to a person, a recording, advice.',
      examples: [
        'Listen to the whole sentence before you answer.',
        'He listens to one English podcast while walking to work.',
        'When the client raised a concern, she listened carefully and wrote down every point.',
      ],
      collocations: [
        'listen to someone',
        'listen carefully',
        'listen to advice',
        'listen attentively',
      ],
      idioms: [
        'listen to reason',
      ],
      commonMistake: '“I listened the music” → “I listened to the music.” Listen needs “to” before the thing you pay attention to.',
      differsFrom: 'Hear is what happens to your ears; listen is what you choose to do with them.',
      register: 'Neutral everywhere. “Are you listening?” can sound sharp; “Did you catch that?” is softer.',
    },
    relatedWords: [
      {
        word: 'hear',
        note: 'to receive sound, whether or not you attend to it.',
      },
      {
        word: 'overhear',
        note: 'to hear something by accident, when it was not meant for you.',
      },
      {
        word: 'listen in',
        note: 'to listen to a private conversation on purpose, often without permission.',
      },
    ],
    dialogue: [
      {
        speaker: 'Colleague',
        line: 'The client wants the review moved, and the call is on Thursday.',
      },
      {
        speaker: 'You',
        line: 'Sorry, I did not listen carefully. Can you say the day again?',
      },
      {
        speaker: 'Colleague',
        line: 'Thursday, at eleven.',
      },
      {
        speaker: 'You',
        line: 'Thank you. I have written that down, and I am listening now.',
      },
    ],
    challenge: 'Play a short voice message or a podcast for two minutes. Then say aloud one thing you heard without listening, and one thing you listened to carefully.',
  },
  {
    level: 'A2-B1',
    id: 'say-tell-speak-talk',
    focus: 'Tell always needs a listener: you tell someone something, and the information, the story or the instruction is what you give them.',
    situation: 'You are the team lead. Tomorrow’s schedule has changed, and the message must reach every person clearly, without the common slip of “say me”.',
    word: {
      word: 'tell',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'TEL. A short vowel, as in “bell”.',
      englishMeaning: 'to give information to a particular listener.',
      hindiMeaning: 'बताना',
      nuance: 'Tell needs a person straight after it: “tell me, tell the class”. Tell someone something; tell a story, a lie, the truth.',
      examples: [
        'Tell me one thing you understood today.',
        'He told the class a story about his first day as a teacher.',
        'Could you tell me the way to the library, please?',
      ],
      collocations: [
        'tell someone something',
        'tell the truth',
        'tell a story',
        'tell me about',
      ],
      idioms: [
        'tell it like it is',
      ],
      commonMistake: '“Say me the time” → “Tell me the time.” Say takes the words (“say something”); tell takes the person (“tell someone”).',
      differsFrom: 'Say is about the words; tell is about the person you give information to.',
      register: 'Neutral. “Tell me” is direct; a polite request is “Could you tell me…?”',
    },
    relatedWords: [
      {
        word: 'say',
        note: 'to produce words; the words themselves are the point.',
      },
      {
        word: 'speak',
        note: 'to use your voice, especially a language, or to address an audience.',
      },
      {
        word: 'talk',
        note: 'a two-way conversation about something.',
      },
    ],
    dialogue: [
      {
        speaker: 'Manager',
        line: 'Did you tell the new joiners about the change?',
      },
      {
        speaker: 'You',
        line: 'Not yet. Can you tell me the new room number first?',
      },
      {
        speaker: 'Manager',
        line: 'Room four, and tell them to arrive ten minutes early.',
      },
      {
        speaker: 'You',
        line: 'I will tell them this afternoon, and I will tell security too.',
      },
    ],
    challenge: 'Tell three different people something today, out loud: one fact, one instruction and one short story. Put a person straight after tell in each sentence.',
  },
  {
    level: 'A2-B1',
    id: 'see-look-watch-observe',
    focus: 'Watch is for something that moves or changes over time: you keep your attention on it until it ends.',
    situation: 'At the sports centre, a friend’s child is learning to swim. You want to tell the parent that you are following the whole lesson, and to ask the coach for one clear correction.',
    word: {
      word: 'watch',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'wotch. The “a” sounds like the “o” in “hot”; it rhymes with “notch”.',
      englishMeaning: 'to look at something over a period of time, especially something that is moving or changing.',
      hindiMeaning: '(चलती हुई चीज़ को) देखना',
      nuance: 'Watch needs time — you watch a match, a film, a child. It implies you keep your attention there, which look does not.',
      examples: [
        'We watched the last over together.',
        'Watch my hands while I write the formula on the board.',
        'Watch the video once without notes, then watch it again with the transcript open.',
      ],
      collocations: [
        'watch a film',
        'watch the match',
        'watch over',
        'watch the children',
      ],
      idioms: [
        'watch your step',
        'watch this space',
      ],
      commonMistake: '“I watched at the match” → “I watched the match.” Watch takes the thing directly. Look needs “at”: “I looked at the match.”',
      differsFrom: 'Look is a deliberate turn of the eyes; watch is sustained attention to something that changes.',
      register: 'Neutral. “Watch out!” is an urgent, informal warning; “Please watch closely” is a neutral request.',
    },
    relatedWords: [
      {
        word: 'see',
        note: 'to notice something without trying.',
      },
      {
        word: 'look',
        note: 'to turn your eyes towards something on purpose, often briefly.',
      },
      {
        word: 'observe',
        note: 'to watch carefully in order to learn or to record.',
      },
    ],
    dialogue: [
      {
        speaker: 'Parent',
        line: 'Are you watching his stroke?',
      },
      {
        speaker: 'You',
        line: 'Yes, I am watching his arms the whole length of the pool.',
      },
      {
        speaker: 'Parent',
        line: 'Good. He gets nervous when people only glance.',
      },
      {
        speaker: 'You',
        line: 'Then I will watch the whole session, not just the start.',
      },
    ],
    challenge: 'Watch something that moves for thirty seconds and describe what changed, out loud, using watch in two sentences. Explain why look would have been too brief.',
  },
  {
    level: 'A2-B1',
    id: 'borrow-lend-loan-return',
    focus: 'Borrow is what you do when you take something on the understanding that you will give it back.',
    situation: 'You forgot your charger before an important client call, and a colleague offers help. You want to ask politely, and make sure you return it before the call ends.',
    word: {
      word: 'borrow',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'BOR-oh. The ending sounds like the “ow” in “sorrow”.',
      englishMeaning: 'to take something from someone with the intention of giving it back.',
      hindiMeaning: 'उधार लेना',
      nuance: 'The borrower receives. Borrow is almost never followed by a person: you borrow a “thing” (from someone), you do not “borrow someone”.',
      examples: [
        'May I borrow your marker for a minute?',
        'I borrowed three books from the library last week.',
        'I borrowed the project file from the shared drive, so I will return it tonight.',
      ],
      collocations: [
        'borrow money',
        'borrow a pen',
        'borrow from a friend',
        'borrow time',
      ],
      idioms: [
        'borrow trouble',
      ],
      commonMistake: '“Can you borrow me your pen?” → “Could I borrow your pen?” or “Can you lend me your pen?” Borrow is what the receiver does; lend is what the giver does.',
      differsFrom: 'Lend is the same action seen from the other side: the lender gives, the borrower takes.',
      register: 'Neutral and everyday. In formal writing: “May I borrow…?”',
    },
    relatedWords: [
      {
        word: 'lend',
        note: 'the other direction: you give something to someone for a while.',
      },
      {
        word: 'loan',
        note: 'a formal arrangement, usually money, such as a bank loan.',
      },
      {
        word: 'return',
        note: 'to give back something you borrowed.',
      },
    ],
    dialogue: [
      {
        speaker: 'You',
        line: 'Could I borrow your charger for twenty minutes?',
      },
      {
        speaker: 'Colleague',
        line: 'Of course. Do you need the adaptor too?',
      },
      {
        speaker: 'You',
        line: 'Yes, please. I will return both before the call ends.',
      },
      {
        speaker: 'Colleague',
        line: 'No hurry. Next week I may need one myself.',
      },
    ],
    challenge: 'Say four sentences about something you borrowed recently: what it was, who it was from, why you needed it, and when you returned it.',
  },
  {
    level: 'A2-B1',
    id: 'remember-remind-recall-forget',
    focus: 'Remind is what you do for someone else: you bring something back into their memory.',
    situation: 'Your flatmate keeps forgetting the electricity bill. You want to help without nagging, and without making it sound like their fault.',
    word: {
      word: 'remind',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'ri-MIND. Stress on the second syllable.',
      englishMeaning: 'to make someone else remember something.',
      hindiMeaning: 'याद दिलाना',
      nuance: 'Remind always takes a person — remind me, remind the class. You remind someone “of” something, or remind them “to” do something.',
      examples: [
        'Remind me to collect the answer sheets.',
        'The bell reminds the students that the period is over.',
        'The calendar app reminds me about the review meeting twenty minutes before it starts.',
      ],
      collocations: [
        'remind someone to do something',
        'remind someone of',
        'remind me later',
        'gently remind',
      ],
      commonMistake: '“Remember me to call him” → “Remind me to call him.” Remember is what you hold yourself; remind is what you do for someone else.',
      differsFrom: 'Remember is internal: you hold the memory. Remind is external: someone or something brings it back.',
      register: 'Neutral. “Could you remind me…?” is polite; “Don’t forget” is firmer.',
    },
    relatedWords: [
      {
        word: 'remember',
        note: 'to keep something in your mind, or to bring it back yourself.',
      },
      {
        word: 'recall',
        note: 'to bring something back to memory, often with effort.',
      },
      {
        word: 'forget',
        note: 'to lose something from memory.',
      },
    ],
    dialogue: [
      {
        speaker: 'You',
        line: 'Could you remind me about the electricity bill on Friday?',
      },
      {
        speaker: 'Flatmate',
        line: 'Sure. Remind me too, if I forget.',
      },
      {
        speaker: 'You',
        line: 'I will. It is due at noon, and the late fee is high.',
      },
      {
        speaker: 'Flatmate',
        line: 'Thanks. I do not want to pay that fee again.',
      },
    ],
    challenge: 'Name two things you need reminding about this week, one task and one date. Use remind in both sentences, and say who will do the reminding.',
  },
  {
    level: 'A2-B1',
    id: 'spend-take-waste-pass',
    focus: 'Spend is about using time or money: you spend money on something, or spend time doing something.',
    situation: 'A friend says you have been working too much and asks how you use your evenings. You want to describe your time honestly, without complaining.',
    word: {
      word: 'spend',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'SPEND. The vowel is short, as in “end”.',
      englishMeaning: 'to use time (or money) on an activity of your choosing.',
      hindiMeaning: '(समय) बिताना, खर्च करना',
      nuance: 'Spend is neutral and deliberate: you spend time “on” something or “doing” something. It is the natural verb for how a person uses their hours.',
      examples: [
        'I spend twenty minutes reading before I sleep.',
        'She spent her holidays learning to drive.',
        'The team spent three weeks rewriting the onboarding guide, and it shows.',
      ],
      collocations: [
        'spend time on',
        'spend money on',
        'spend a weekend',
        'spend the evening',
      ],
      commonMistake: '“I spent two hours to finish the report” → “I spent two hours finishing the report.” After spend, use the -ing form, not the infinitive.',
      differsFrom: 'Waste is spending with a bad result; spend itself is neutral.',
      register: 'Neutral and common. In a professional setting, “allocate time to” is more formal.',
    },
    relatedWords: [
      {
        word: 'take',
        note: 'needs time or a seat: it takes an hour; you take a bus.',
      },
      {
        word: 'waste',
        note: 'to use time or money with no good result.',
      },
      {
        word: 'pass',
        note: 'to get through time, or to succeed in an exam or test.',
      },
    ],
    dialogue: [
      {
        speaker: 'Friend',
        line: 'You never stop working. How do you spend your evenings?',
      },
      {
        speaker: 'You',
        line: 'I spend an hour on English and an hour on the house accounts.',
      },
      {
        speaker: 'Friend',
        line: 'And the rest?',
      },
      {
        speaker: 'You',
        line: 'I spend most of Sunday with my family, and I protect that part.',
      },
    ],
    challenge: 'Describe how you spent yesterday in three sentences, using spend twice: once with time and once with money. Say what you would like to spend more time on.',
  },
  {
    level: 'A2-B1',
    id: 'ask-request-demand-insist',
    focus: 'Request is a polite, formal way of asking for something. It leaves the other person free to say no.',
    situation: 'You need a document from another department, and a casual message last time got no reply. You want to make a clear, polite request that gets an answer.',
    word: {
      word: 'request',
      partOfSpeech: 'verb',
      tone: 'professional',
      pronunciation: 'ri-KWEST. Stress on the second syllable.',
      englishMeaning: 'to ask for something politely or officially.',
      hindiMeaning: 'निवेदन करना, अनुरोध करना',
      nuance: 'Request is formal and modest — right for letters, applications and strangers, and it always acknowledges that the answer may be no.',
      examples: [
        'I requested a change in the timetable through the office.',
        'Please may I request the file for one afternoon?',
        'I would like to request an extension of two working days for the audit response.',
      ],
      collocations: [
        'make a request',
        'request a change',
        'request for information',
        'on request',
      ],
      commonMistake: '“I request you to send the file” sounds stiff in email. Use “Could you send the file?” or “I would be grateful if you could send it.”',
      differsFrom: 'Demand is firm and can sound hostile; request leaves room for a no.',
      register: 'Formal and professional. In a meeting, “Could I request…?” is standard; to a friend, “Can I have…?” is natural.',
    },
    relatedWords: [
      {
        word: 'ask',
        note: 'the everyday word, for any question or favour.',
      },
      {
        word: 'demand',
        note: 'to insist firmly, often with an implied consequence.',
      },
      {
        word: 'insist',
        note: 'to keep saying something is necessary, despite objections.',
      },
    ],
    dialogue: [
      {
        speaker: 'You',
        line: 'I would like to request the signed contract by Friday, if that is possible.',
      },
      {
        speaker: 'Colleague',
        line: 'I can send it, but the signatory is away.',
      },
      {
        speaker: 'You',
        line: 'Thank you. Could you tell me when they are back?',
      },
      {
        speaker: 'Colleague',
        line: 'Monday. I will request their approval today.',
      },
    ],
    challenge: 'Write one request for something you need at work, in two sentences: what you are asking for, and by when. Say it aloud as you would in a meeting.',
  },
  {
    level: 'A2-B1',
    id: 'argue-debate-quarrel-discuss',
    focus: 'Discuss means talking a topic through with others, usually to understand it or to decide. It takes no preposition.',
    situation: 'A change to working hours affects your team, and your manager wants your view by Friday. You want to propose a time to talk it through, without starting a fight.',
    word: {
      word: 'discuss',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'dis-KUSS. Stress on the second syllable.',
      englishMeaning: 'to talk about something in order to understand it or decide together.',
      hindiMeaning: 'चर्चा करना, विचार-विमर्श करना',
      nuance: 'Discussion has no winner — it is the calm verb, and it always takes a topic (discuss the syllabus), never “discuss about”.',
      examples: [
        'We discussed the timetable over tea.',
        'Let us discuss this after the assembly, not now.',
        'The board will discuss the budget at its meeting on Monday.',
      ],
      collocations: [
        'discuss the options',
        'discuss with someone',
        'a point to discuss',
        'open to discussion',
      ],
      commonMistake: '“We discussed about the timetable” → “We discussed the timetable.” Discuss takes no “about”.',
      differsFrom: 'Argue is about winning a disagreement; discuss is about understanding and deciding together.',
      register: 'Neutral and professional. “Can we discuss this?” is a calm way to open a difficult conversation.',
    },
    relatedWords: [
      {
        word: 'argue',
        note: 'to disagree forcefully, each side defending a position.',
      },
      {
        word: 'debate',
        note: 'a structured discussion, often with opposing sides.',
      },
      {
        word: 'quarrel',
        note: 'a petty or bitter argument between people.',
      },
    ],
    dialogue: [
      {
        speaker: 'Manager',
        line: 'What do you think of the new hours?',
      },
      {
        speaker: 'You',
        line: 'I would like to discuss them with the team first.',
      },
      {
        speaker: 'Manager',
        line: 'Fair. When can you discuss it?',
      },
      {
        speaker: 'You',
        line: 'Tomorrow at lunch. We can discuss the pros and cons, and I will send you one summary.',
      },
    ],
    challenge: 'Describe one topic you would like to discuss with someone at work, in three sentences. Say what you hope to decide at the end of the discussion.',
  },
  {
    level: 'A2-B1',
    id: 'think-feel-believe-suppose',
    focus: 'Believe means holding something to be true, with some confidence, even when you cannot prove it.',
    situation: 'A parent asks whether their child can do well in the board exam. You do not have all the evidence yet, so you want to say what you believe without making a promise.',
    word: {
      word: 'believe',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'bi-LEEV. The vowel is long, as in “see”.',
      englishMeaning: 'to accept something as true, usually after thought or over time.',
      hindiMeaning: 'मानना, विश्वास करना',
      nuance: 'Believe is settled and firmer than think. It also carries expectation about another person: “I believe in him” is not the same as “I believe he will pass”.',
      examples: [
        'I believe every child in this class can do mathematics.',
        'I believe the inspection will pass without a remark.',
        'Many analysts believe the market will recover by spring, but the data is still mixed.',
      ],
      collocations: [
        'believe that',
        'believe in someone',
        'strongly believe',
        'I believe so',
      ],
      idioms: [
        'believe it or not',
      ],
      commonMistake: '“I believe in that the plan will work” → “I believe that the plan will work.” “Believe in” is for people or ideas you trust, not for claims.',
      differsFrom: 'Think is reasoning; feel is instinct; believe is holding something true with some confidence.',
      register: 'Neutral. “I believe” softens a claim politely in meetings; “I know” is stronger and needs evidence.',
    },
    relatedWords: [
      {
        word: 'think',
        note: 'to have an opinion, or to reason it through; often less certain.',
      },
      {
        word: 'feel',
        note: 'to have a sense or instinct, sometimes without evidence.',
      },
      {
        word: 'suppose',
        note: 'to assume something is probably true; a light, tentative word.',
      },
    ],
    dialogue: [
      {
        speaker: 'Parent',
        line: 'Do you believe my son can pass the board exam?',
      },
      {
        speaker: 'You',
        line: 'I believe he can, if he keeps practising the weak topics.',
      },
      {
        speaker: 'Parent',
        line: 'And if he does not?',
      },
      {
        speaker: 'You',
        line: 'Then I believe we should change the plan now, not in March.',
      },
    ],
    challenge: 'Say what you believe about one thing in your work or studies, in two sentences: the claim, then the evidence that would change your mind.',
  },
  {
    level: 'A2-B1',
    id: 'advice-advise-suggest-recommend',
    focus: 'Advice is an uncountable noun: you give advice, ask for advice, or take a piece of advice.',
    situation: 'You are starting a new job and want to ask a senior colleague for guidance, without seeming unsure of yourself.',
    word: {
      word: 'advice',
      partOfSpeech: 'noun',
      tone: 'neutral',
      pronunciation: 'ad-VICE. The noun ends in a soft “s”; the verb advise ends in a “z” sound.',
      englishMeaning: 'an opinion offered to someone about what they should do — a noun.',
      hindiMeaning: 'सलाह, परामर्श',
      nuance: 'Advice is uncountable: it is “a piece of advice”, never “an advice”. The verb form has a different letter — advise.',
      examples: [
        'That is useful advice, and I will follow it.',
        'He takes advice from everyone and follows none of it.',
        'Her advice on the budget saved us three weeks of argument.',
      ],
      collocations: [
        'give advice',
        'ask for advice',
        'a piece of advice',
        'take someone’s advice',
      ],
      commonMistake: '“An advice” or “advices” → “a piece of advice” or “some advice”. Advice is uncountable.',
      differsFrom: 'Advice is the noun; advise is the verb. Do not write “advice you”.',
      register: 'Neutral. “My advice is…” is direct; “If I were you…” is more informal.',
    },
    relatedWords: [
      {
        word: 'advise',
        note: 'the verb: to give advice, as in “I advise you to rest.”',
      },
      {
        word: 'suggest',
        note: 'to put an idea forward for someone to consider.',
      },
      {
        word: 'recommend',
        note: 'to say that something is good, or what you think should be done.',
      },
    ],
    dialogue: [
      {
        speaker: 'You',
        line: 'Could I ask you for some advice on the client report?',
      },
      {
        speaker: 'Colleague',
        line: 'Of course. What do you need?',
      },
      {
        speaker: 'You',
        line: 'Your advice on how to structure the summary.',
      },
      {
        speaker: 'Colleague',
        line: 'Keep it short. And take the advice I gave you last month about the charts.',
      },
    ],
    challenge: 'Ask someone for one piece of advice, out loud, using advice in the question. Then repeat the advice you received back, in your own words.',
  },
  {
    level: 'A2-B1',
    id: 'sorry-excuse-me-pardon-apologise',
    focus: 'Apologise is the fuller form of saying sorry: you name what you did, and you mean it.',
    situation: 'You missed a call with a client because of a scheduling error. You need to say sorry clearly, and take responsibility without over-explaining.',
    word: {
      word: 'apologise',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'uh-POL-uh-jize. Stress on the second syllable. (American spelling: “apologize”.)',
      englishMeaning: 'to say clearly that you are sorry for a specific fault (British spelling).',
      hindiMeaning: 'क्षमा माँगना, माफ़ी माँगना',
      nuance: 'Apologise is deliberate and complete: apologise “to” a person “for” something. It takes about ten words, which is exactly why it means more.',
      examples: [
        'I apologised to the class for the delay.',
        'He apologised for the remark in front of everyone.',
        'I apologise for the late reply; the report needed a final check before I could send it.',
      ],
      collocations: [
        'apologise for',
        'apologise to someone',
        'sincerely apologise',
        'owe someone an apology',
      ],
      commonMistake: '“I apologise you” → “I apologise to you.” And “I apologise for the mistake”: the thing you did comes after “for”.',
      differsFrom: 'Sorry is a short expression of regret; apologise is the fuller act of owning something specific.',
      register: 'Neutral to formal. In writing, “I apologise for…” is standard; “Sorry about that” suits everyday talk.',
    },
    relatedWords: [
      {
        word: 'sorry',
        note: 'the everyday word for regret; it can stand on its own.',
      },
      {
        word: 'excuse me',
        note: 'to get attention, or to pass someone. It is not an apology.',
      },
      {
        word: 'pardon',
        note: 'to ask someone to repeat, or to forgive. Polite in conversation.',
      },
    ],
    dialogue: [
      {
        speaker: 'You',
        line: 'I want to apologise for missing our call this morning.',
      },
      {
        speaker: 'Client',
        line: 'It happened. What is the new time?',
      },
      {
        speaker: 'You',
        line: 'Two o’clock. I apologise again for the short notice.',
      },
      {
        speaker: 'Client',
        line: 'Fine. It is the second time this month, though.',
      },
    ],
    challenge: 'Apologise for something small, out loud, in two sentences: say what you did, and what you will do differently. Do not use “sorry” on its own.',
  },
];
