import type { SpeakBetterLesson } from '../types';

/**
 * Speak Better — C1 (Advanced).
 *
 * One lesson is one primary target word, taught in depth, for the precise vocabulary
 * of professional, academic and formal writing. Related words appear as a single
 * clarifying line in `relatedWords`, never as a lesson of their own.
 */

export const speakBetterC1Lessons: SpeakBetterLesson[] = [
  {
    level: 'C1',
    id: 'c1-mitigate-alleviate-attenuate-remedy',
    focus: 'Mitigate means making a risk or a harm less severe. It is about reducing the impact of something you cannot fully remove.',
    situation: 'You are presenting a risk register to a client who wants reassurance. “We will reduce the risk” is true but vague, and you need to say exactly what is being made smaller.',
    word: {
      word: 'mitigate',
      partOfSpeech: 'verb',
      tone: 'formal',
      pronunciation: '/ˈmɪtɪɡeɪt/ — MIT-ih-gate, three syllables, stress on the first; the middle vowel is a short /ɪ/, not “ee”.',
      englishMeaning: 'to make a risk or a bad consequence less severe, usually in advance.',
      hindiMeaning: 'कम करना, जोखिम घटाना',
      nuance: 'Mitigate acts on the risk itself, before the event, and never implies the risk disappears. It is the verb of the risk register, not of the cure.',
      examples: [
        'We can mitigate the migration risk by running both systems for a fortnight.',
        'Nothing mitigates a single-signature process except a second signature.',
        'The bank mitigated the exposure by hedging the currency for the next six months.',
      ],
      collocations: [
        'mitigate the risk',
        'mitigating circumstances',
        'mitigate the impact',
        'mitigate against',
      ],
      commonMistake: '“Mitigate against the risk” is a common tautology in legal and business writing — mitigate already contains “against”. Use “mitigate the risk” or “guard against the risk”.',
      differsFrom: 'Alleviate reduces the suffering a risk causes once it has happened; mitigate reduces the risk before it does.',
      register: 'Formal and expected in risk, legal and governance writing. In conversation, “reduce the risk” is more natural.',
    },
    relatedWords: [
      {
        word: 'alleviate',
        note: 'to ease pain or a burden, usually for people.',
      },
      {
        word: 'attenuate',
        note: 'to weaken a signal, a force or an effect.',
      },
      {
        word: 'remedy',
        note: 'to put right a fault or an injustice.',
      },
    ],
    dialogue: [
      {
        speaker: 'Client',
        line: 'So the risk is reduced.',
      },
      {
        speaker: 'You',
        line: 'The risk is mitigated: we run both systems for a fortnight, so a failure costs hours, not weeks.',
      },
      {
        speaker: 'Client',
        line: 'And my team’s workload during that time?',
      },
      {
        speaker: 'You',
        line: 'The extra reviewer covers that. The underlying fault is replaced in March.',
      },
    ],
    challenge: 'Take one real risk you are managing. Say aloud how you would mitigate it, and what would still remain after your mitigation.',
  },
  {
    level: 'C1',
    id: 'c1-tenable-plausible-credible-viable',
    focus: 'Plausible describes an explanation that fits the known facts and could well be true. It does not mean proven; it means believable so far.',
    situation: 'A board member asks whether the outage explanation is correct. You need the word for an explanation that fits the evidence so far, without claiming it is confirmed.',
    word: {
      word: 'plausible',
      partOfSpeech: 'adjective',
      tone: 'neutral',
      pronunciation: '/ˈplɔːzəbl/ — PLAW-zuh-bul; the “s” is a /z/.',
      englishMeaning: 'seeming reasonable or likely to be true, on the evidence available.',
      hindiMeaning: 'विश्वसनीय, संभाव्य',
      nuance: 'Plausible is about fit, not truth: it says the story is consistent with what we know, and it deliberately stops short of endorsement. That is why it stings when applied to someone’s account.',
      examples: [
        'The most plausible explanation is a timezone bug, not a data loss.',
        'It is plausible, but I want the log before we tell the client.',
        'A plausible reason for the drop is the price change, though the data does not yet prove it.',
      ],
      collocations: [
        'a plausible explanation',
        'perfectly plausible',
        'plausible deniability',
        'sounds plausible',
      ],
      commonMistake: 'Using plausible as a compliment. “A plausible answer” often implies you are not yet convinced — for praise, say convincing.',
      differsFrom: 'Credible is about the source being trustworthy; plausible is about the explanation fitting. A credible witness can give a barely plausible account.',
      register: 'Neutral to formal. “Plausible deniability” is a fixed phrase with a whiff of evasion — do not borrow it casually.',
    },
    relatedWords: [
      {
        word: 'tenable',
        note: 'a position that can be defended against challenge.',
      },
      {
        word: 'credible',
        note: 'worth believing, usually because of who says it or the evidence.',
      },
      {
        word: 'viable',
        note: 'able to work in practice, such as a plan or a business.',
      },
    ],
    dialogue: [
      {
        speaker: 'Board member',
        line: 'Is the outage explanation correct?',
      },
      {
        speaker: 'You',
        line: 'It is plausible: a timezone bug fits every log we have.',
      },
      {
        speaker: 'Board member',
        line: 'Can we be sure?',
      },
      {
        speaker: 'You',
        line: 'Not yet. I want the logs from the second server before we tell the client it is confirmed.',
      },
    ],
    challenge: 'Describe one explanation you have heard recently at work in three sentences. Say why it is plausible, and what evidence would make it proven.',
  },
  {
    level: 'C1',
    id: 'c1-contend-concede-maintain-assert',
    focus: 'Contend means arguing a case firmly, usually against resistance. It is the polished way to say you hold a position.',
    situation: 'You are in a disagreement with a peer in front of a client. You need to state your position firmly, without turning the disagreement into a public contest.',
    word: {
      word: 'contend',
      partOfSpeech: 'verb',
      tone: 'formal',
      pronunciation: '/kənˈtend/ — kun-TEND, stress on the second syllable.',
      englishMeaning: 'to argue a position, especially against opposition.',
      hindiMeaning: 'दावा करना, तर्क करना',
      nuance: 'Contend is public and adversarial: you contend that something is the case, and the word accepts that someone contests it. It is the honest verb when the room is split.',
      examples: [
        'I would contend that the second delay was avoidable.',
        'We are contending with three suppliers and no single owner.',
        'Several economists contend that the policy will raise prices before it lowers them.',
      ],
      collocations: [
        'contend that',
        'contend with',
        'the prosecution contends',
        'hotly contended',
      ],
      commonMistake: 'Confusing “contend” (argue) with “content” (satisfied) and “contend with” (have to deal with) — three different jobs. “We must contend the volume” is wrong; it is “contend with the volume”.',
      differsFrom: 'Maintain is holding a position calmly over time; contend is putting it into a fight. Both can be true at once: you maintain a position you contend for.',
      register: 'Formal, common in legal, academic and boardroom English. “I would contend that…” is the polished opening.',
    },
    relatedWords: [
      {
        word: 'concede',
        note: 'to admit that a point is valid, even while disputing the rest.',
      },
      {
        word: 'maintain',
        note: 'to keep holding a position over time, despite pressure.',
      },
      {
        word: 'assert',
        note: 'to state something firmly, sometimes before you have the evidence.',
      },
    ],
    dialogue: [
      {
        speaker: 'Peer',
        line: 'The delay was our fault.',
      },
      {
        speaker: 'You',
        line: 'I would contend that the second week was the supplier’s.',
      },
      {
        speaker: 'Peer',
        line: 'The client will not see it that way.',
      },
      {
        speaker: 'You',
        line: 'Then I will set out the dates in writing. The argument should rest on the evidence.',
      },
    ],
    challenge: 'Take the last disagreement you had at work. Say aloud, in two sentences, what you would contend, and the evidence that makes your case.',
  },
  {
    level: 'C1',
    id: 'c1-arbitrary-arbitrate-mandate-discretion',
    focus: 'A mandate is the authority to act on behalf of others. Use it to ask whether someone has the right to decide, not only the power to.',
    situation: 'A policy change lands in your inbox with no explanation, and your team asks who decided it and why. You need precise words for the question, not a general complaint.',
    word: {
      word: 'mandate',
      partOfSpeech: 'noun',
      tone: 'professional',
      pronunciation: '/ˈmændeɪt/ — MAN-date, stress on the first syllable.',
      englishMeaning: 'the authority given to someone to act, or an official instruction to do something.',
      hindiMeaning: 'अधिकार, आदेश',
      nuance: 'A mandate is authority plus a defined scope: you have a mandate to negotiate, to hire, to spend. Without a scope it is only a job title, which is why “outside my mandate” is a complete answer.',
      examples: [
        'I have a mandate to agree the price, not the payment terms.',
        'The policy was issued without any mandate behind it.',
        'The committee has a mandate to review fees, but not to change the contract terms.',
      ],
      collocations: [
        'a clear mandate',
        'within my mandate',
        'a mandate to',
        'electoral mandate',
      ],
      commonMistake: 'Using mandate as a synonym for “rule” — a mandate grants authority or requires an action, it does not merely prohibit.',
      differsFrom: 'Discretion is the latitude within the mandate; the mandate is the permission itself. A narrow mandate leaves little discretion.',
      register: 'Formal, common in governance and management. “Whose mandate is this?” is a pointed and effective question.',
    },
    relatedWords: [
      {
        word: 'arbitrary',
        note: 'decided without a stated reason or rule.',
      },
      {
        word: 'arbitrate',
        note: 'to settle a dispute through a neutral judgement.',
      },
      {
        word: 'discretion',
        note: 'the freedom to decide within stated limits.',
      },
    ],
    dialogue: [
      {
        speaker: 'Team member',
        line: 'Who decided the limit?',
      },
      {
        speaker: 'You',
        line: 'Someone with a mandate to set it. I want to know whose, and on what basis.',
      },
      {
        speaker: 'Team member',
        line: 'And if they do not answer?',
      },
      {
        speaker: 'You',
        line: 'Then we ask the policy owner in writing, with the decision date and the reason.',
      },
    ],
    challenge: 'Think of one decision at work. Say aloud who had the mandate for it, and whether that authority was clearly stated.',
  },
  {
    level: 'C1',
    id: 'c1-scrutiny-oversight-accountability-governance',
    focus: 'Accountability is answering for a result. It names the person who must explain what happened, even when many people did the work.',
    situation: 'An auditor is in the building for three days, and your team keeps using “accountability” to mean “responsibility”. Being precise here is the difference between a calm week and a defensive one.',
    word: {
      word: 'accountability',
      partOfSpeech: 'noun',
      tone: 'professional',
      pronunciation: '/əˌkaʊntəˈbɪləti/ — uh-kown-tuh-BIL-uh-tee, five syllables, stress on the fourth.',
      englishMeaning: 'the state of having to answer for a decision or a result.',
      hindiMeaning: 'जवाबदेही, उत्तरदायित्व',
      nuance: 'Accountability is about the answer, not the action: several people can contribute, one person answers. The word is only useful with a name attached — otherwise it is a slogan.',
      examples: [
        'Twelve people were responsible; nobody was accountable, which is how it happened twice.',
        'Accountability sits with the signatory, not the reviewer.',
        'The board made the chief engineer accountable for safety, not only for delivery.',
      ],
      collocations: [
        'clear accountability',
        'accountability for',
        'personal accountability',
        'a line of accountability',
      ],
      commonMistake: 'Using accountability and responsibility interchangeably. Responsibility is the work; accountability is answering for it. One person can be accountable for work many people are responsible for.',
      differsFrom: 'Scrutiny examines; accountability explains. Oversight watches; accountability answers.',
      register: 'Formal, and heavily used in management writing. In a review, “who is accountable?” is the question that closes a discussion.',
    },
    relatedWords: [
      {
        word: 'scrutiny',
        note: 'a close examination of something.',
      },
      {
        word: 'oversight',
        note: 'supervision, sometimes with a duty to intervene.',
      },
      {
        word: 'governance',
        note: 'the systems that decide who may decide.',
      },
    ],
    dialogue: [
      {
        speaker: 'Auditor',
        line: 'Who is accountable for the refund approval?',
      },
      {
        speaker: 'You',
        line: 'The signatory. Twelve people did the steps; one person answers for the result.',
      },
      {
        speaker: 'Auditor',
        line: 'Will the figures survive scrutiny?',
      },
      {
        speaker: 'You',
        line: 'The totals will. The exception log is thin, and I would rather say that now than in your report.',
      },
    ],
    challenge: 'Describe one process you own, in four sentences. Say who is accountable for its result, and who is responsible for each step.',
  },
  {
    level: 'C1',
    id: 'c1-inevitable-contingent-probable-impending',
    focus: 'Contingent means dependent on something else. Use it to show that an outcome will only happen if a condition is met.',
    situation: 'You are briefing a leadership team on a regulatory change. They keep discussing whether it will happen, and you need to say exactly what the outcome depends on.',
    word: {
      word: 'contingent',
      partOfSpeech: 'adjective',
      tone: 'formal',
      pronunciation: '/kənˈtɪndʒənt/ — kun-TIN-junt; the “g” is a soft /dʒ/.',
      englishMeaning: 'depending on something else happening or being agreed.',
      hindiMeaning: 'सशर्त, निर्भर',
      nuance: 'Contingent names its condition: contingent on approval, on funding, on the client’s sign-off. It is the most useful word in this set because it tells people what to watch.',
      examples: [
        'The second hire is contingent on the March renewal.',
        'Approval is contingent on the audit closing cleanly.',
        'Our bonus is contingent on hitting the quarter’s targets, which nobody has promised yet.',
      ],
      collocations: [
        'contingent on',
        'contingent liability',
        'wholly contingent',
        'a contingency plan',
      ],
      commonMistake: 'Writing “contingent to” → “contingent on”. And do not confuse contingent (conditional) with contingency (a reserve for the unexpected).',
      differsFrom: 'Probable is about likelihood; contingent is about dependency. Something contingent can be certain once its condition is met.',
      register: 'Formal, standard in contracts, finance and planning. “Contingent on” is the phrase to get right.',
    },
    relatedWords: [
      {
        word: 'inevitable',
        note: 'certain to happen, whatever anyone does.',
      },
      {
        word: 'probable',
        note: 'likely, judged from the evidence available.',
      },
      {
        word: 'impending',
        note: 'close, and about to happen; often said of a deadline or a difficulty.',
      },
    ],
    dialogue: [
      {
        speaker: 'Executive',
        line: 'Is the change certain for us?',
      },
      {
        speaker: 'You',
        line: 'The rule is certain, but our exposure is contingent on the March renewal.',
      },
      {
        speaker: 'Executive',
        line: 'What happens if the renewal slips?',
      },
      {
        speaker: 'You',
        line: 'Then the exposure is contingent on the audit as well. Each one has an owner.',
      },
    ],
    challenge: 'Take one plan you are making. Say, in three sentences, what it is contingent on, and what you will do if that condition fails.',
  },
];
