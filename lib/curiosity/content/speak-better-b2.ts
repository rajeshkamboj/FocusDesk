import type { SpeakBetterLesson } from '../types';

/**
 * Speak Better — B2 (Upper Intermediate).
 *
 * One lesson is one primary target word, taught in depth: the word a reader needs
 * in a meeting, an email or an interview, with the mistake learners at this level
 * actually make and the register it belongs to. Related words are a single
 * clarifying line in `relatedWords`, never a second lesson.
 */

export const speakBetterB2Lessons: SpeakBetterLesson[] = [
  {
    level: 'B2',
    id: 'b2-suggest-imply-infer-insinuate',
    focus: 'Imply is what the speaker does: you say one thing and mean something else, so the listener has to work it out.',
    situation: 'A colleague reads a short email from your manager and says, “He is implying I am slow.” You want to understand what the email actually says, without dismissing her worry.',
    word: {
      word: 'imply',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'im-PLY — rhymes with “reply”.',
      englishMeaning: 'to say something without stating it directly, so the listener has to work it out.',
      hindiMeaning: 'अप्रत्यक्ष रूप से कहना, इंगित करना',
      nuance: 'The speaker implies; the listener infers. Only a person (or a sentence) can imply — the meaning sits in what was said.',
      examples: [
        'She did not say the deadline would slip, but the timeline implies it.',
        'Are you implying the test results were rushed?',
        'Her email implies that the decision is already made, so the meeting may be a formality.',
      ],
      collocations: [
        'imply that',
        'strongly imply',
        'what is implied',
        'implied meaning',
      ],
      commonMistake: 'Using imply and infer interchangeably. “He inferred that I was late” means he concluded it from something — if he hinted it, he implied it.',
      differsFrom: 'Insinuate is imply with a sting: it always carries disapproval or a personal attack.',
      register: 'Neutral and useful in any work conversation. “Are you implying…?” is a direct challenge; soften it to “Is that what you meant?” unless you want the confrontation.',
    },
    relatedWords: [
      {
        word: 'suggest',
        note: 'to put an idea forward, or to hint at something.',
      },
      {
        word: 'infer',
        note: 'to reach a conclusion from evidence. The listener or reader does this.',
      },
      {
        word: 'insinuate',
        note: 'to suggest something unpleasant indirectly. Always negative.',
      },
    ],
    dialogue: [
      {
        speaker: 'Colleague',
        line: 'He is implying I am slow.',
      },
      {
        speaker: 'You',
        line: 'The email implies the review took longer than planned, which is all it says.',
      },
      {
        speaker: 'Colleague',
        line: 'So you think he is unhappy with me?',
      },
      {
        speaker: 'You',
        line: 'I do not know yet. I will ask him: “Do you mean the process, or my part in it?”',
      },
    ],
    challenge: 'Take one message you received today and say, out loud, what it states and what it might imply. Then name the question that would show you which is true.',
  },
  {
    level: 'B2',
    id: 'b2-assume-presume-suppose-expect',
    focus: 'Assume means accepting something as true without checking it. Say so openly and it is useful; leave it unsaid and it is risky.',
    situation: 'A client has not replied for four days. You need to tell your team what you think is happening, and be honest that nobody has confirmed it.',
    word: {
      word: 'assume',
      partOfSpeech: 'verb',
      tone: 'neutral',
      pronunciation: 'uh-SOOM — the “a” is a schwa, not “ah”.',
      englishMeaning: 'to accept something as true without checking it.',
      hindiMeaning: 'मान लेना, बिना जाँचे मान लेना',
      nuance: 'An assumption is a working belief, and it is the word that lets you be honest about not knowing. Saying “I am assuming X” invites correction; saying “X” does not.',
      examples: [
        'I am assuming the client is waiting for their internal sign-off.',
        'Let us not assume the renewal is safe just because last year went well.',
        'I assume you have seen the revised timeline, so I will not repeat it in the meeting.',
      ],
      collocations: [
        'safely assume',
        'assume responsibility',
        'under the assumption that',
        'working assumption',
      ],
      idioms: [
        'assume the worst',
      ],
      commonMistake: '“I assume you are agree.” — assume takes a clause, not an “are”: “I assume you agree.”',
      differsFrom: 'Presume adds a sense of entitlement or probability built on how things usually go; assume is simply the default belief before checking.',
      register: 'Neutral everywhere, and a useful softener: “I am assuming the budget is unchanged — correct me if not.”',
    },
    relatedWords: [
      {
        word: 'presume',
        note: 'to take something as true on reasonable grounds, often with a hint of overreach.',
      },
      {
        word: 'suppose',
        note: 'to think something is probably true; a light, tentative word.',
      },
      {
        word: 'expect',
        note: 'to think something will happen, based on what you know.',
      },
    ],
    dialogue: [
      {
        speaker: 'You',
        line: 'I am assuming the client is waiting for their own sign-off.',
      },
      {
        speaker: 'Manager',
        line: 'Be careful. You are assuming a lot from four silent days.',
      },
      {
        speaker: 'You',
        line: 'Fair. It may just be leave, but I have not checked.',
      },
      {
        speaker: 'Manager',
        line: 'Then tell the team that, and ask the client directly.',
      },
    ],
    challenge: 'Describe one thing you are waiting for, in three sentences. Use assume once, and say out loud what you have actually checked.',
  },
  {
    level: 'B2',
    id: 'b2-effortless-efficient-effective-adequate',
    focus: 'Effective describes something that produces the result you wanted. It says nothing yet about cost or effort.',
    situation: 'You are reviewing a colleague’s project summary, and the phrase “very efficient solution” appears in the first line. You want to ask what has actually been shown to work.',
    word: {
      word: 'effective',
      partOfSpeech: 'adjective',
      tone: 'professional',
      pronunciation: 'ih-FEK-tiv',
      englishMeaning: 'producing the result you wanted.',
      hindiMeaning: 'प्रभावी, कारगर',
      nuance: 'Effective says nothing about cost, speed or elegance — only that it works. A slow, expensive method can be perfectly effective.',
      examples: [
        'The reminder email was effective — attendance went from 60 to 85 per cent.',
        'It works, but calling it efficient would be generous: it takes two people a full day.',
        'The new onboarding checklist is effective for managers, though new hires still find it long.',
      ],
      collocations: [
        'highly effective',
        'cost-effective',
        'effective immediately',
        'an effective solution',
      ],
      commonMistake: 'Writing “effective” when you mean “efficient”, which claims a saving you have not measured.',
      differsFrom: 'Efficient means the result comes without wasted time, money or effort. The pair is the classic B2 confusion: effective = does it work, efficient = how little it wasted getting there.',
      register: 'Neutral and safe in any report. “Cost-effective” is the business collocation; use it only when you have the numbers.',
    },
    relatedWords: [
      {
        word: 'efficient',
        note: 'gets the result without waste of time, money or effort.',
      },
      {
        word: 'adequate',
        note: 'good enough for its purpose, and nothing more.',
      },
      {
        word: 'effortless',
        note: 'looks easy, hiding the work behind it.',
      },
    ],
    dialogue: [
      {
        speaker: 'You',
        line: 'The pilot was effective, but effective at what, exactly?',
      },
      {
        speaker: 'Colleague',
        line: 'Attendance went from sixty to eighty-five per cent.',
      },
      {
        speaker: 'You',
        line: 'Effective for attendance, then. Was it cost-effective too?',
      },
      {
        speaker: 'Colleague',
        line: 'Not yet. The cost has not been checked.',
      },
    ],
    challenge: 'Describe a change at work that produced a result, in three sentences. Use effective for the result, and say what you would need to measure before you call it efficient.',
  },
  {
    level: 'B2',
    id: 'b2-deadline-due-date-timeline-milestone',
    focus: 'A deadline is a fixed last moment for finishing something. Use the word when the line truly cannot move.',
    situation: 'A supplier says the work will be “done by the timeline”. Your manager asks whether you can promise the launch date, and you need to separate what is committed from what is only planned.',
    word: {
      word: 'deadline',
      partOfSpeech: 'noun',
      tone: 'professional',
      pronunciation: 'DED-line — the first syllable rhymes with “bed”.',
      englishMeaning: 'the latest time by which something must be finished, after which it has failed.',
      hindiMeaning: 'अंतिम तिथि, समय-सीमा',
      nuance: 'A deadline is binary: you meet it or you miss it. It belongs to a commitment someone has made, which is why “the deadline moved” always means someone renegotiated, not that time changed.',
      examples: [
        'The filing deadline is fixed by the regulator; the internal review deadline is ours to set.',
        'We can miss our own deadline more easily than theirs.',
        'The auditors will not accept the report after the statutory deadline, however good it is.',
      ],
      collocations: [
        'meet a deadline',
        'miss a deadline',
        'a hard deadline',
        'extend the deadline',
      ],
      commonMistake: '“I will do it in the deadline.” → “before the deadline” or “by the deadline”. “In” suggests you are inside it.',
      differsFrom: 'A due date is when something is owed and can be moved by agreement; a deadline is the point at which the result stops counting.',
      register: 'Neutral, and it carries weight — using it in an email signals a real commitment.',
    },
    relatedWords: [
      {
        word: 'due date',
        note: 'the date something is owed; it can sometimes move.',
      },
      {
        word: 'timeline',
        note: 'the planned order and dates of the work.',
      },
      {
        word: 'milestone',
        note: 'a checkpoint you can see and measure along the way.',
      },
    ],
    dialogue: [
      {
        speaker: 'Manager',
        line: 'Can you promise the launch date?',
      },
      {
        speaker: 'You',
        line: 'I can promise a working build by the twentieth. That is the commitment.',
      },
      {
        speaker: 'Manager',
        line: 'And the deadline?',
      },
      {
        speaker: 'You',
        line: 'The regulator’s deadline is fixed. Everything else can move, and I will say so in writing.',
      },
    ],
    challenge: 'Explain the next two weeks of your work out loud in one minute. Name the one deadline that cannot move, and say why.',
  },
  {
    level: 'B2',
    id: 'b2-raise-ascend-climb-nudge',
    focus: 'Raise means putting something in front of people for their attention: a concern, a question or a price. It is the standard professional verb in a meeting.',
    situation: 'In a review meeting, a colleague says the team “needs to raise the price”. You think there are two questions in that: whether to change it, and when. You want to say so clearly.',
    word: {
      word: 'raise',
      partOfSpeech: 'verb',
      tone: 'professional',
      pronunciation: 'RAYZ — the “ai” is a long /eɪ/, as in “rain”.',
      englishMeaning: 'to bring something up for discussion, or to move something to a higher level.',
      hindiMeaning: 'उठाना, बढ़ाना',
      nuance: 'Raise takes an object and implies a deliberate move: raise a concern, raise a price, raise a question. It is the verb for putting something in front of people.',
      examples: [
        'Let me raise one thing before we close: the support queue is not in this plan.',
        'They raised the annual fee without telling existing customers.',
        'Before the vote, two members raised concerns about the cost of the new contract.',
      ],
      collocations: [
        'raise a concern',
        'raise a question',
        'raise prices',
        'raise the issue with',
      ],
      idioms: [
        'raise the bar',
        'raise eyebrows',
      ],
      commonMistake: '“I want to raise up this point.” → “raise this point”. Raise already means “up”; “raise up” is redundant.',
      differsFrom: 'Increase applies to numbers and amounts; raise is also used for anything you put in front of a room.',
      register: 'Neutral. “Can I raise something?” is the standard polite opener in a meeting.',
    },
    relatedWords: [
      {
        word: 'increase',
        note: 'to become larger, usually in number or amount.',
      },
      {
        word: 'ascend',
        note: 'to go up, in a formal or literary sense.',
      },
      {
        word: 'nudge',
        note: 'to push gently towards a decision, a small amount at a time.',
      },
    ],
    dialogue: [
      {
        speaker: 'Colleague',
        line: 'We need to raise the price.',
      },
      {
        speaker: 'You',
        line: 'I want to raise one question first: by how much, and when?',
      },
      {
        speaker: 'Colleague',
        line: 'Costs keep rising, so the answer is soon.',
      },
      {
        speaker: 'You',
        line: 'Then let us raise it in January, with notice, not in December.',
      },
    ],
    challenge: 'Take one thing at work that you want to bring up in a meeting. Say aloud the sentence you would use to raise it, and the sentence you would use if someone pushed back.',
  },
  {
    level: 'B2',
    id: 'b2-cope-manage-handle-deal-with',
    focus: 'Manage means being in charge of something over time: a team, a budget, a workload. It says that you are the one steering.',
    situation: 'In your appraisal, your manager says you “cope well”. You want to know whether that is praise, and whether you are being given work to manage or only pressure to survive.',
    word: {
      word: 'manage',
      partOfSpeech: 'verb',
      tone: 'professional',
      pronunciation: 'MAN-ij — the “a” is a short /æ/, as in “cat”.',
      englishMeaning: 'to be in charge of something — people, a budget, a workload — and to make it work.',
      hindiMeaning: 'प्रबंधन करना, सँभालना',
      nuance: 'Manage asserts agency: you decide how the load is distributed. “I managed to finish” is different again — that means it nearly did not happen.',
      examples: [
        'She manages the budget and the two junior hires.',
        'I managed the volume by pushing two projects to next month, with agreement.',
        'She manages a team of twelve across two offices, which takes most of her week.',
      ],
      collocations: [
        'manage a team',
        'manage expectations',
        'manage a workload',
        'manage to do',
      ],
      commonMistake: 'Confusing “manage” with “manage to”: “I managed the deadline” (I was in charge of it) vs “I managed to meet the deadline” (I just about did it).',
      differsFrom: 'Cope is endurance; manage is control. Handle is about a specific situation rather than a continuing load.',
      register: 'Neutral and strong. “Manage expectations” is the standard professional phrase — and often a warning.',
    },
    relatedWords: [
      {
        word: 'cope',
        note: 'to get through something difficult, often only just.',
      },
      {
        word: 'handle',
        note: 'to deal with a situation or a person, sometimes in one moment.',
      },
      {
        word: 'deal with',
        note: 'to take action on a problem until it is resolved.',
      },
    ],
    dialogue: [
      {
        speaker: 'Manager',
        line: 'You cope well under pressure.',
      },
      {
        speaker: 'You',
        line: 'Thank you. I would rather manage the workload than just get through it.',
      },
      {
        speaker: 'Manager',
        line: 'Fair. You handled the outage well too.',
      },
      {
        speaker: 'You',
        line: 'I want to manage the next one, so we fix the cause, not just the symptom.',
      },
    ],
    challenge: 'Describe the workload you carry this month in four sentences, using manage once. Say what you control, and what you would like to hand over.',
  },
  {
    level: 'B2',
    id: 'b2-clarify-confirm-verify-acknowledge',
    focus: 'Clarify means making something unclear easier to understand. Use it when the meaning, rather than the decision, is the problem.',
    situation: 'On a call, three people leave with three different understandings of the same decision. You have ninety seconds at the end to make sure there is only one.',
    word: {
      word: 'clarify',
      partOfSpeech: 'verb',
      tone: 'professional',
      pronunciation: 'KLA-ruh-fy — three syllables, stress on the first.',
      englishMeaning: 'to make something clearer, usually after a misunderstanding.',
      hindiMeaning: 'स्पष्ट करना',
      nuance: 'Clarify assumes the other person was unclear, not wrong — which is why it is the diplomatic choice when you are unsure what was meant.',
      examples: [
        'Just to clarify: the discount applies to the annual plan only.',
        'Could you clarify who signs off the final version?',
        'The supplier clarified the warranty terms in writing after our call.',
      ],
      collocations: [
        'clarify a point',
        'just to clarify',
        'clarify the scope',
        'seek clarification',
      ],
      commonMistake: '“Clarify me” → “clarify something for me”. And “clarification about” is usually “clarification on”.',
      differsFrom: 'Confirm checks something you already believe; clarify repairs something you do not understand.',
      register: 'Polite in any setting. “Can I clarify one thing?” is softer than “That was unclear”.',
    },
    relatedWords: [
      {
        word: 'confirm',
        note: 'to make certain that a fact or an arrangement is settled.',
      },
      {
        word: 'verify',
        note: 'to check that something is true, usually against evidence.',
      },
      {
        word: 'acknowledge',
        note: 'to accept that you received or understood something.',
      },
    ],
    dialogue: [
      {
        speaker: 'You',
        line: 'Can I clarify one thing before we finish?',
      },
      {
        speaker: 'Client',
        line: 'Go ahead.',
      },
      {
        speaker: 'You',
        line: 'Just to clarify: the scope is the first phase only. Is that what you agreed?',
      },
      {
        speaker: 'Client',
        line: 'Yes. The second phase is a separate quote.',
      },
    ],
    challenge: 'At the end of your next meeting, say one sentence that clarifies the decision. Then ask whether anyone would describe it differently.',
  },
  {
    level: 'B2',
    id: 'b2-reliable-consistent-steady-robust',
    focus: 'Reliable describes something that does what it should, every time you depend on it. The evidence is a track record.',
    situation: 'You are choosing a supplier on the strength of three testimonials that each say “very reliable”. You need one precise question: reliable at what?',
    word: {
      word: 'reliable',
      partOfSpeech: 'adjective',
      tone: 'professional',
      pronunciation: 'ri-LY-uh-bul',
      englishMeaning: 'able to be trusted to do what is expected, every time.',
      hindiMeaning: 'भरोसेमंद, विश्वसनीय',
      nuance: 'Reliable is about keeping promises over time. It says nothing about speed or quality — a slow supplier can be entirely reliable.',
      examples: [
        'They are reliable: nine years, never a missed delivery window.',
        'I need a reliable source before I put that number in the report.',
        'The reporting system is reliable, but it has never been tested under the year-end load.',
      ],
      collocations: [
        'highly reliable',
        'a reliable source',
        'reliable delivery',
        'reliable data',
      ],
      commonMistake: '“He is reliable for the report” → “He is reliable” or “He is responsible for the report”. Reliable does not take a task.',
      differsFrom: 'Consistent is about sameness between runs; reliable is about whether the run happens at all.',
      register: 'Neutral and a genuine compliment in work contexts.',
    },
    relatedWords: [
      {
        word: 'consistent',
        note: 'the same every time, in the way it is done.',
      },
      {
        word: 'steady',
        note: 'even and unchanging in pace or level over time.',
      },
      {
        word: 'robust',
        note: 'strong enough to keep working when something goes wrong.',
      },
    ],
    dialogue: [
      {
        speaker: 'You',
        line: 'Three testimonials say “very reliable”. Reliable at what, exactly?',
      },
      {
        speaker: 'Supplier',
        line: 'Delivery. Nine years, and no missed window.',
      },
      {
        speaker: 'You',
        line: 'And the evidence for the last year?',
      },
      {
        speaker: 'Supplier',
        line: 'The delivery log. I can send it to you today.',
      },
    ],
    challenge: 'Choose something you rely on, such as a tool, a colleague or a supplier. Say aloud why it is reliable, and name the evidence behind it.',
  },
  {
    level: 'B2',
    id: 'b2-decline-refuse-reject-turn-down',
    focus: 'Decline is the polite way to say no. It is firm but not cold, and it does not need a dramatic reason.',
    situation: 'A senior colleague asks you to take on another audit this quarter. You have to say no without damaging the relationship, and your first draft is either too soft or too blunt.',
    word: {
      word: 'decline',
      partOfSpeech: 'verb',
      tone: 'formal',
      pronunciation: 'di-KLINE — stress on the second syllable.',
      englishMeaning: 'to say no politely, especially to an invitation or an offer.',
      hindiMeaning: 'विनम्रता से मना करना',
      nuance: 'Decline is the courteous no. It is a complete sentence in professional email — “I will decline” needs no apology — but it usually wants a reason attached in the same breath.',
      examples: [
        'Thank you for the invitation — I will have to decline this time.',
        'She declined to comment on the delay.',
        'The committee declined the proposal, citing the cost and the missing risk assessment.',
      ],
      collocations: [
        'politely decline',
        'decline an invitation',
        'decline to comment',
        'a decline in',
      ],
      commonMistake: 'Mixing the verb with the noun: “a decline in sales” is the noun; “sales declined” is the verb. Do not write “decline of sales” for a fall.',
      differsFrom: 'Refuse is firmer and needs no politeness; reject is formal and usually about something submitted.',
      register: 'Polite and formal but not cold. “I am afraid I have to decline” is the standard soft form.',
    },
    relatedWords: [
      {
        word: 'refuse',
        note: 'to say no firmly, often to a demand or an instruction.',
      },
      {
        word: 'reject',
        note: 'to turn something down formally, such as a proposal or an application.',
      },
      {
        word: 'turn down',
        note: 'to say no to an offer made to you personally.',
      },
    ],
    dialogue: [
      {
        speaker: 'Senior colleague',
        line: 'Can you take on the audit as well this quarter?',
      },
      {
        speaker: 'You',
        line: 'I have to decline. The launch is in the same three weeks.',
      },
      {
        speaker: 'Senior colleague',
        line: 'The board will ask why.',
      },
      {
        speaker: 'You',
        line: 'I am not refusing to help. I am declining this one scope so the launch holds, and I can name who could take it.',
      },
    ],
    challenge: 'Decline one invitation or request out loud, in two sentences: one honest reason and one alternative. Keep the tone warm.',
  },
];
