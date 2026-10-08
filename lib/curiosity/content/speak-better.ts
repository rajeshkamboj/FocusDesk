import type { SpeakBetterLesson } from '../types';

/**
 * Speak Better — practical spoken English, taught through a situation.
 *
 * Each lesson takes a moment that really happens in a day (a classroom, a
 * staff meeting, a phone call, an interview) and pulls apart three to five
 * words that learners routinely swap for one another. The point is always the
 * *distinction*: an English meaning, a Hindi meaning, one line of nuance, an
 * example sentence, a short dialogue, and a speaking challenge.
 *
 * Content lives here as typed static data, exactly like the rest of the
 * Curiosity corpus: selected by day index, shipped server-side only, and never
 * fetched at runtime.
 */
export const speakBetterLessons: SpeakBetterLesson[] = [
  {
    id: 'teach-learn-study-practise',
    focus: 'You teach a person, you learn a thing, you study a subject, and you practise a skill.',
    situation:
      'A student stops you after class and says, “Sir, will you learn me grammar?” — you want to correct them without embarrassing them, and leave them with the rule.',
    words: [
      {
        word: 'teach',
        englishMeaning: 'to help someone else learn something by explaining or showing it.',
        hindiMeaning: 'सिखाना, पढ़ाना',
        nuance: 'The teacher is the subject: “I teach you”, never “I learn you”. You teach a person (teach + someone) or teach a subject (teach physics).',
        examples: [
          'I teach physics to class ten.',
          'She teaches at a government school in Ludhiana.',
        ],
      },
      {
        word: 'learn',
        englishMeaning: 'to gain knowledge or a skill, usually by study or experience.',
        hindiMeaning: 'सीखना',
        nuance: 'The learner does the learning. In standard English a teacher can never “learn” a student — that is the single most common error in Indian English.',
        examples: [
          'I learned to type without looking at the keyboard.',
          'The children learn faster when they are allowed to make mistakes.',
        ],
      },
      {
        word: 'study',
        englishMeaning: 'to spend time reading, revising or working through a subject on purpose.',
        hindiMeaning: 'पढ़ाई करना, अध्ययन करना',
        nuance: 'Study is about time spent acquiring knowledge, not about ability. You study “for” an exam and you study a subject.',
        examples: [
          'She studies for two hours every morning before school.',
          'I studied physics at university, but I studied Hindi on my own.',
        ],
      },
      {
        word: 'practise',
        englishMeaning: 'to do something again and again in order to become better at it.',
        hindiMeaning: 'अभ्यास करना',
        nuance: 'Practise (British spelling, verb) is about repetition, not understanding. The noun is “practice” with a “c” — “practice makes perfect”.',
        examples: [
          'I practise my English aloud for ten minutes every night.',
          'Practising at the same time each day is easier than finding motivation.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Student', line: 'Sir, will you learn me grammar?' },
      { speaker: 'Teacher', line: 'I’ll teach you grammar. You’ll learn it.' },
      { speaker: 'Student', line: 'And how do I remember it?' },
      { speaker: 'Teacher', line: 'You study the rules once, and then you practise speaking — that is when it stays.' },
    ],
    challenge:
      'Describe your last week at school in four sentences, using teach, learn, study and practise once each — one word per sentence, and nobody else’s role mixed in.',
  },
  {
    id: 'hear-listen-overhear-listen-in',
    focus: 'Hearing happens to you; listening is something you do. Overhearing is an accident; listening in is a choice.',
    situation: 'A parent asks on the phone why their child “hears but does not listen”, and you want to explain the difference in one breath.',
    words: [
      {
        word: 'hear',
        englishMeaning: 'to receive sound with your ears, whether or not you want to.',
        hindiMeaning: 'सुनाई देना, (कानों में) आना',
        nuance: 'Hearing is passive — it is the sense working, not the mind attending. You can hear something without understanding a word of it.',
        examples: [
          'I can hear the ceiling fan while I am teaching.',
          'Did you hear that noise outside?',
        ],
      },
      {
        word: 'listen',
        englishMeaning: 'to pay attention with your ears, deliberately and with effort.',
        hindiMeaning: 'ध्यान से सुनना',
        nuance: 'Listening is active and cannot be done by accident. It always takes “to” something: listen to a person, a recording, advice.',
        examples: [
          'Listen to the whole sentence before you answer.',
          'He listens to one English podcast while walking to work.',
        ],
      },
      {
        word: 'overhear',
        englishMeaning: 'to hear something by accident, when the speakers did not intend it.',
        hindiMeaning: 'संयोग से सुन लेना',
        nuance: 'Overhear has no “to” and no blame — you were simply within earshot. Deliberately staying to hear more changes the word.',
        examples: [
          'I overheard two students planning a surprise for the teacher’s day function.',
          'She overheard the news in the staff room before anyone announced it.',
        ],
      },
      {
        word: 'listen in',
        englishMeaning: 'to listen to a private conversation on purpose, usually without the speakers knowing.',
        hindiMeaning: 'चुपके से सुनना',
        nuance: 'Unlike overhear, this is intentional and carries suspicion or disapproval — you “listen in on” someone.',
        examples: [
          'Someone was listening in on our phone call.',
          'I did not mean to eavesdrop, but the door was open and I listened in.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Parent', line: 'He hears everything, but he never listens to me.' },
      { speaker: 'Teacher', line: 'That is exactly it — hearing costs nothing, listening costs attention.' },
      { speaker: 'Parent', line: 'So what do I do?' },
      { speaker: 'Teacher', line: 'Ask him to repeat your instruction back. Listening shows itself when the words come back.' },
    ],
    challenge:
      'Speak four sentences in a row: something you heard today but did not listen to, something you listen to every day, something you overheard by accident, and something you would never listen in on.',
  },
  {
    id: 'say-tell-speak-talk',
    focus: 'You say words, you tell a person, you speak a language, and you talk with someone.',
    situation: 'A student says, “Sir, I will say you one thing”, and you want to give them the four-word pattern they will use for life.',
    words: [
      {
        word: 'say',
        englishMeaning: 'to produce words; the words themselves are the point.',
        hindiMeaning: 'कहना',
        nuance: 'Say takes the words, not the listener: “say something (to someone)”. You cannot “say me” — that is the classic slip.',
        examples: [
          'She said she would come early.',
          'Say that again slowly, please.',
        ],
      },
      {
        word: 'tell',
        englishMeaning: 'to give information to a particular listener.',
        hindiMeaning: 'बताना',
        nuance: 'Tell needs a person straight after it: “tell me, tell the class”. Tell someone something; tell a story, a lie, the truth.',
        examples: [
          'Tell me one thing you understood today.',
          'He told the class a story about his first day as a teacher.',
        ],
      },
      {
        word: 'speak',
        englishMeaning: 'to use your voice, especially a language, or to address people formally.',
        hindiMeaning: 'बोलना',
        nuance: 'Speak is more often one-way or formal: speak English, speak to an audience, speak at a function. You speak “to” someone, not with them.',
        examples: [
          'I can read French, but I cannot speak it.',
          'She spoke to the parents for ten minutes without notes.',
        ],
      },
      {
        word: 'talk',
        englishMeaning: 'to have a conversation, where both sides speak.',
        hindiMeaning: 'बात करना, बातचीत करना',
        nuance: 'Talk is two-way and less formal: talk to or talk with someone, talk about a topic. “Talk to” is often one-sided advice; “talk with” is more equal.',
        examples: [
          'Can we talk about the syllabus after lunch?',
          'I talked with the principal for half an hour.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Student', line: 'Sir, I will say you one thing about yesterday.' },
      { speaker: 'Teacher', line: 'Tell me. Then we’ll talk about it.' },
      { speaker: 'Student', line: 'I wanted to speak in the assembly but I got nervous.' },
      { speaker: 'Teacher', line: 'Say the first line to me now. That is how the rest comes out.' },
    ],
    challenge:
      'Report one real conversation from today in four sentences, using say, tell, speak and talk once each — and check that “tell” is always followed by a person.',
  },
  {
    id: 'see-look-watch-observe',
    focus: 'You see without trying, you look on purpose, you watch something that changes, and you observe in order to learn.',
    situation: 'You are sitting with family watching a cricket match and someone asks, “Did you see that catch?” — and you realise you had looked away exactly then.',
    words: [
      {
        word: 'see',
        englishMeaning: 'to notice something with your eyes, without deliberately trying.',
        hindiMeaning: 'दिखाई देना, देखना (अनायास)',
        nuance: 'Seeing is not something you can switch on — you can open your eyes and still not see what is in front of you. Never “see at” something.',
        examples: [
          'I saw the message on the notice board by accident.',
          'Did you see who came into the class after me?',
        ],
      },
      {
        word: 'look',
        englishMeaning: 'to turn your eyes towards something deliberately, usually for a short time.',
        hindiMeaning: 'देखना (ध्यान से)',
        nuance: 'Look takes “at”: look at the board. It is a deliberate act, but it says nothing about how long or whether the object moves.',
        examples: [
          'Look at the diagram before you answer.',
          'I looked at my watch and realised the period was over.',
        ],
      },
      {
        word: 'watch',
        englishMeaning: 'to look at something over a period of time, especially something that is moving or changing.',
        hindiMeaning: '(चलती हुई चीज़ को) देखना',
        nuance: 'Watch needs time — you watch a match, a film, a child. It implies you keep your attention there, which look does not.',
        examples: [
          'We watched the last over together.',
          'Watch my hands while I write the formula on the board.',
        ],
      },
      {
        word: 'observe',
        englishMeaning: 'to watch carefully and attentively in order to learn something.',
        hindiMeaning: 'निरीक्षण करना, बारीकी से देखना',
        nuance: 'Observe is deliberate and purposeful — the observation is meant to produce understanding, a record or a conclusion.',
        examples: [
          'A teacher observes how students work in groups.',
          'I observed three classes before I taught my first one.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Cousin', line: 'Did you see that catch? Unbelievable.' },
      { speaker: 'You', line: 'I missed it — I was looking at the score on my phone.' },
      { speaker: 'Cousin', line: 'You did not watch a single ball properly.' },
      { speaker: 'You', line: 'Fair. Next time I’ll watch and observe instead of scrolling.' },
    ],
    challenge:
      'Sit quietly for one minute, then report: one thing you saw without trying, one thing you looked at on purpose, one thing you watched for at least ten seconds, and one thing you observed closely enough to describe a detail.',
  },
  {
    id: 'borrow-lend-loan-return',
    focus: 'You borrow what you take, you lend what you give, and a loan is a formal arrangement — in both directions the thing goes back.',
    situation: 'A colleague asks, “Can you borrow me your calculator for the period?” while a student is standing right there listening.',
    words: [
      {
        word: 'borrow',
        englishMeaning: 'to take something from someone with the intention of giving it back.',
        hindiMeaning: 'उधार लेना',
        nuance: 'The borrower receives. Borrow is almost never followed by a person: you borrow a “thing” (from someone), you do not “borrow someone”.',
        examples: [
          'May I borrow your marker for a minute?',
          'I borrowed three books from the library last week.',
        ],
      },
      {
        word: 'lend',
        englishMeaning: 'to give something to someone for a short time, expecting it back.',
        hindiMeaning: 'उधार देना',
        nuance: 'The lender gives, and lend “does” take a person: lend someone something, or lend something to someone. Zero cost is implied.',
        examples: [
          'Can you lend me your calculator for one period?',
          'He never lends his notes to anyone.',
        ],
      },
      {
        word: 'loan',
        englishMeaning: 'money (or, in formal use, an item) handed over with an agreement to return it.',
        hindiMeaning: 'ऋण, कर्ज़ (औपचारिक)',
        nuance: 'Loan is the formal, institutional word — a bank loan, a housing loan. As a verb it survives mainly in American English: “the bank loaned the money”.',
        examples: [
          'We are repaying a home loan over twenty years.',
          'The bank loaned the society money for the new building.',
        ],
      },
      {
        word: 'return',
        englishMeaning: 'to give back something you borrowed, or to come back.',
        hindiMeaning: 'लौटाना, वापस करना',
        nuance: 'Return closes the circle — and it takes the thing, not the person: return a book (to someone). “Return back” is redundant.',
        examples: [
          'Please return the register before you leave.',
          'I returned her notes the same evening.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Colleague', line: 'Can you borrow me your calculator for the next period?' },
      { speaker: 'You', line: 'I can lend you my calculator — but I need it back by lunch.' },
      { speaker: 'Colleague', line: 'I’ll borrow it only for one period, I promise.' },
      { speaker: 'You', line: 'Then return it before the bell, and we’re even.' },
    ],
    challenge:
      'Say four sentences about something you have recently taken and given back, using borrow, lend, loan and return once each — and make sure the direction of the item is correct in every one.',
  },
  {
    id: 'remember-remind-recall-forget',
    focus: 'Remember is inside your own head; remind is something done to someone else. Recall is the effort to bring it back.',
    situation: 'The Hindi “yaad dilana” becomes “remember me” in English, and a teacher hears it every single day.',
    words: [
      {
        word: 'remember',
        englishMeaning: 'to keep something in your mind, or to bring it back to mind.',
        hindiMeaning: 'याद रखना, याद होना',
        nuance: 'Remember needs no object person — you simply remember a fact, a name, an appointment. It can be involuntary or deliberate.',
        examples: [
          'I remember my first day as a student teacher.',
          'Remember to lock the lab before you go.',
        ],
      },
      {
        word: 'remind',
        englishMeaning: 'to make someone else remember something.',
        hindiMeaning: 'याद दिलाना',
        nuance: 'Remind always takes a person — remind me, remind the class. You remind someone “of” something, or remind them “to” do something.',
        examples: [
          'Remind me to collect the answer sheets.',
          'The bell reminds the students that the period is over.',
        ],
      },
      {
        word: 'recall',
        englishMeaning: 'to bring something back to mind with visible effort, as if searching for it.',
        hindiMeaning: 'स्मरण करना, (प्रयासपूर्वक) याद करना',
        nuance: 'Recall suggests deliberate retrieval, often of a detail you are not sure about — it is a step more effortful than remember.',
        examples: [
          'I cannot recall the exact date of the inspection.',
          'She recalled the poem line by line after thirty years.',
        ],
      },
      {
        word: 'forget',
        englishMeaning: 'to fail to remember something, or to stop keeping it in mind.',
        hindiMeaning: 'भूलना',
        nuance: 'Forget is the absence of remembering. Note the pattern: “I forgot to bring it” (a task) versus “I forgot his name” (a fact).',
        examples: [
          'I forgot to take attendance today.',
          'Never forget what this class achieved together.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Student', line: 'Sir, please remember me tomorrow about the test.' },
      { speaker: 'Teacher', line: 'You mean remind you. I will remind you tomorrow.' },
      { speaker: 'Student', line: 'And what if I forget my admit card?' },
      { speaker: 'Teacher', line: 'Then recall where you kept it last night — it is usually there.' },
    ],
    challenge:
      'Speak four sentences about the coming week, using remember, remind, recall and forget once each, and make sure “remind” always has a person after it.',
  },
  {
    id: 'spend-take-waste-pass',
    focus: 'You spend time on what you choose, time takes what it needs, you waste what has no use, and you pass time while waiting.',
    situation: 'Talking to a student about the two-month summer break, and how the same holiday can be spent, taken, wasted or passed.',
    words: [
      {
        word: 'spend',
        englishMeaning: 'to use time (or money) on an activity of your choosing.',
        hindiMeaning: '(समय) बिताना, खर्च करना',
        nuance: 'Spend is neutral and deliberate: you spend time “on” something or “doing” something. It is the natural verb for how a person uses their hours.',
        examples: [
          'I spend twenty minutes reading before I sleep.',
          'She spent her holidays learning to drive.',
        ],
      },
      {
        word: 'take',
        englishMeaning: 'to require a certain amount of time to happen or be done.',
        hindiMeaning: '(समय) लगना',
        nuance: 'Nothing is spending here — the task is consuming the time. The thing takes time; the person never takes time (except in “take your time”, which means do not hurry).',
        examples: [
          'The staff meeting took two hours.',
          'Checking thirty notebooks takes time.',
        ],
      },
      {
        word: 'waste',
        englishMeaning: 'to use time badly, on something with no value.',
        hindiMeaning: 'बर्बाद करना, व्यर्थ गँवाना',
        nuance: 'Waste carries judgement, so it is strong — say it about your own time if you like, and about someone else’s only with care.',
        examples: [
          'We wasted the whole period arguing about the seating order.',
          'Do not waste the morning scrolling.',
        ],
      },
      {
        word: 'pass',
        englishMeaning: 'to occupy time while you are waiting or have nothing pressing to do.',
        hindiMeaning: '(समय) काटना, बिताना (इंतज़ार में)',
        nuance: 'Pass time is about the waiting, not the value: reading on a bench, chatting at a station. It is lighter than spend.',
        examples: [
          'We passed the two hours at the station talking about old school days.',
          'He passes his free periods reading the newspaper.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Teacher', line: 'How did you pass the two months, Ravi?' },
      { speaker: 'Student', line: 'I spent most of it helping in my uncle’s shop.' },
      { speaker: 'Teacher', line: 'Good. Because a break that is wasted takes away more than it gives.' },
      { speaker: 'Student', line: 'It taught me how much a full day takes when you work.' },
    ],
    challenge:
      'Describe yesterday in four sentences speaking aloud, using spend, take, waste and pass once each — one sentence each, in the correct sense of time.',
  },
  {
    id: 'ask-request-demand-insist',
    focus: 'Ask is neutral, request is formal and polite, demand assumes authority, and insisting refuses to let the matter drop.',
    situation: 'You need one day’s leave, and you want the words to match the people you are speaking to — a colleague, the office, an official, or a clerk who is not moving.',
    words: [
      {
        word: 'ask',
        englishMeaning: 'to say that you want something or want to know something.',
        hindiMeaning: 'पूछना, माँगना (सामान्य)',
        nuance: 'Ask is the everyday, neutral verb — ask for something, ask someone to do something. It makes no claim about how reasonable the want is.',
        examples: [
          'I asked today for a day’s leave.',
          'She asked me to explain the chapter again.',
        ],
      },
      {
        word: 'request',
        englishMeaning: 'to ask for something politely or officially.',
        hindiMeaning: 'निवेदन करना, अनुरोध करना',
        nuance: 'Request is formal and modest — right for letters, applications and strangers, and it always acknowledges that the answer may be no.',
        examples: [
          'I requested a change in the timetable through the office.',
          'Please may I request the file for one afternoon?',
        ],
      },
      {
        word: 'demand',
        englishMeaning: 'to ask for something in a way that assumes it must be given.',
        hindiMeaning: 'माँग करना, दावे के साथ माँगना',
        nuance: 'Demand carries authority or entitlement, and often the anger of a refused right. Use it for rights, and think twice before using it for favours.',
        examples: [
          'The staff demanded an explanation before signing the register.',
          'The union demanded a meeting with the director.',
        ],
      },
      {
        word: 'insist',
        englishMeaning: 'to keep asking firmly for something after it was refused or questioned.',
        hindiMeaning: 'ज़िद करना, आग्रह करना',
        nuance: 'Insist is not loud, it is persistent — it also means refusing to accept a denial, as in “she insisted on paying”.',
        examples: [
          'I insisted on taking the earlier train.',
          'Her mother insisted that we stay for dinner.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'You', line: 'I asked the office for one day’s leave.' },
      { speaker: 'Colleague', line: 'And?' },
      { speaker: 'You', line: 'They said the register is closed. I requested it in writing instead.' },
      { speaker: 'Colleague', line: 'Do not demand it. Just insist politely and come back tomorrow.' },
    ],
    challenge:
      'Think of one thing you want from three different people — a friend, a senior, and an office clerk. Say the same want three times in a row, changing only the strength of the verb, and hear which one sounds right.',
  },
  {
    id: 'argue-debate-quarrel-discuss',
    focus: 'You discuss to understand, debate to win fairly, argue when positions harden, and quarrel when the person becomes the subject.',
    situation: 'The physics and chemistry teachers both want the same period with the same class, and the staff room is getting louder.',
    words: [
      {
        word: 'discuss',
        englishMeaning: 'to talk about something in order to understand it or decide together.',
        hindiMeaning: 'चर्चा करना, विचार-विमर्श करना',
        nuance: 'Discussion has no winner — it is the calm verb, and it always takes a topic (discuss the syllabus), never “discuss about”.',
        examples: [
          'We discussed the timetable over tea.',
          'Let us discuss this after the assembly, not now.',
        ],
      },
      {
        word: 'debate',
        englishMeaning: 'to argue about a subject in an organised way, with sides.',
        hindiMeaning: 'वाद-विवाद करना',
        nuance: 'Debate implies rules, sides and evidence — the point is to test the reasons, and it can end with agreement to disagree.',
        examples: [
          'The two houses debated the question of school timings.',
          'We debated whether homework should be reduced.',
        ],
      },
      {
        word: 'argue',
        englishMeaning: 'to give reasons for one position, usually against someone, with growing heat.',
        hindiMeaning: 'बहस करना, तर्क देना',
        nuance: 'Argue is about positions hardening: argue “with” a person, argue “for” or “against” an idea. It can still be reasonable — until it is not.',
        examples: [
          'They argued for twenty minutes about the same paragraph.',
          'I argued for the earlier slot, and lost.',
        ],
      },
      {
        word: 'quarrel',
        englishMeaning: 'to fight with words, when the anger is about the person, not just the point.',
        hindiMeaning: 'झगड़ना, लड़ना-झगड़ना',
        nuance: 'Quarrel drops the argument and attacks the relationship. It takes “with” a person: quarrel with a colleague, not with a proposal.',
        examples: [
          'They quarrelled over a chair and forgot the timetable entirely.',
          'Do not quarrel with the clerk — you will need her tomorrow.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Physics teacher', line: 'We discussed this in the meeting — Monday fourth period is mine.' },
      { speaker: 'Chemistry teacher', line: 'I am not debating who wants it more.' },
      { speaker: 'Physics teacher', line: 'Then let us not argue in the corridor either.' },
      { speaker: 'Chemistry teacher', line: 'Agreed. Let us sit with the timetable and end this without a quarrel.' },
    ],
    challenge:
      'Recall one disagreement from the last fortnight and describe it four times — once as a discussion, once as a debate, once as an argument, once as a quarrel — and notice how differently the same events sound.',
  },
  {
    id: 'think-feel-believe-suppose',
    focus: 'Think is reasoned, feel is instinctive, believe is settled, and suppose is provisional — the strength of the same opinion, in four sizes.',
    situation: 'A parent-teacher meeting, where you must give an honest opinion about a child’s ability without sounding either certain or careless.',
    words: [
      {
        word: 'think',
        englishMeaning: 'to have an opinion formed by considering the facts.',
        hindiMeaning: 'सोचना, (मत) लगना',
        nuance: 'Think is the safe, general verb for a considered view — and it also means the act of using your mind. It is the standard opener for opinions.',
        examples: [
          'I think she needs more time with written work.',
          'I think the new seating helps him concentrate.',
        ],
      },
      {
        word: 'feel',
        englishMeaning: 'to have an opinion based on instinct or emotion, not on evidence.',
        hindiMeaning: 'लगना, महसूस करना',
        nuance: 'Feel is softer and more personal — it signals that you cannot prove it, and it also names real physical and emotional states.',
        examples: [
          'I feel he is quieter this term than last.',
          'I feel the pressure of the board exam is affecting her sleep.',
        ],
      },
      {
        word: 'believe',
        englishMeaning: 'to accept something as true, usually after thought or over time.',
        hindiMeaning: 'मानना, विश्वास करना',
        nuance: 'Believe is settled and firmer than think. It also carries expectation about another person: “I believe in him” is not the same as “I believe he will pass”.',
        examples: [
          'I believe every child in this class can do mathematics.',
          'I believe the inspection will pass without a remark.',
        ],
      },
      {
        word: 'suppose',
        englishMeaning: 'to assume something is true for now, without being sure.',
        hindiMeaning: 'मान लेना, अनुमान लगाना',
        nuance: 'Suppose is explicitly provisional — the weakest of the four, and the honest word when you are filling a gap in what you know.',
        examples: [
          'I suppose he was absent because of the fever.',
          'Suppose we give him one more week before deciding.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Parent', line: 'Do you think he can improve before the boards?' },
      { speaker: 'Teacher', line: 'I believe he can. I feel the problem is confidence, not ability.' },
      { speaker: 'Parent', line: 'And the syllabus?' },
      { speaker: 'Teacher', line: 'I think we can finish it. I suppose we may need two extra periods a week — I will confirm.' },
    ],
    challenge:
      'Give one opinion about something happening in your school today, then say it four times using think, feel, believe and suppose — and hear exactly how much certainty each version claims.',
  },
  {
    id: 'advice-advise-suggest-recommend',
    focus: 'Advice is the noun, advise the verb; suggest offers an option, recommend puts your name behind it.',
    situation: 'A former student calls to ask which stream to take in class eleven, and you want to help without overselling your own opinion.',
    words: [
      {
        word: 'advice',
        englishMeaning: 'an opinion offered to someone about what they should do — a noun.',
        hindiMeaning: 'सलाह, परामर्श',
        nuance: 'Advice is uncountable: it is “a piece of advice”, never “an advice”. The verb form has a different letter — advise.',
        examples: [
          'That is useful advice, and I will follow it.',
          'He takes advice from everyone and follows none of it.',
        ],
      },
      {
        word: 'advise',
        englishMeaning: 'to give someone your opinion about what they should do — the verb.',
        hindiMeaning: 'सलाह देना',
        nuance: 'Advise takes a person and a clause or action: advise someone to do something. In law and banking it also means to inform formally.',
        examples: [
          'I advised her to take mathematics with physics.',
          'The doctor advised him to rest for a week.',
        ],
      },
      {
        word: 'suggest',
        englishMeaning: 'to put forward an idea or option for consideration.',
        hindiMeaning: 'सुझाव देना, प्रस्ताव रखना',
        nuance: 'Suggest is the most open of the three — it hands over an option and expects the other person to decide. Use “suggest doing” or “suggest that…”.',
        examples: [
          'I suggested that he speak to two seniors first.',
          'She suggested joining the evening batch.',
        ],
      },
      {
        word: 'recommend',
        englishMeaning: 'to suggest something as being good or suitable, from your own experience.',
        hindiMeaning: 'सिफ़ारिश करना, सुझाना (भरोसे के साथ)',
        nuance: 'Recommend puts your judgement behind the option — closer to “this is the one I would choose”, and it is what you write on a reference.',
        examples: [
          'I recommend the biology stream for her.',
          'The principal recommended him for the teachers’ training programme.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'Student', line: 'Sir, can you suggest a stream for me?' },
      { speaker: 'Teacher', line: 'Tell me two things you enjoy doing without being asked.' },
      { speaker: 'Student', line: 'Physics experiments and explaining them to others.' },
      { speaker: 'Teacher', line: 'Then I recommend science with physics. My advice is to speak to three working engineers before you decide.' },
    ],
    challenge:
      'Give one piece of guidance to a friend three times — first as advice, then as a suggestion, then as a recommendation — and notice how much of your own judgement each version carries.',
  },
  {
    id: 'sorry-excuse-me-pardon-apologise',
    focus: 'Excuse me gets attention, sorry is for a fault, pardon invites repetition, and apologise names the fault out loud.',
    situation: 'You step on a colleague’s foot in a crowded staff room, and then arrive late to the principal’s meeting — two different words for two different moments.',
    words: [
      {
        word: 'excuse me',
        englishMeaning: 'a polite way to get attention, or to interrupt or pass someone.',
        hindiMeaning: 'क्षमा करें, सुनिए ज़रा',
        nuance: 'Excuse me is used “before” the trouble — to interrupt, to pass, to leave a table. It apologises for nothing yet.',
        examples: [
          'Excuse me, may I take this chair?',
          'Excuse me — could you repeat the last line?',
        ],
      },
      {
        word: 'sorry',
        englishMeaning: 'an expression of regret for something you did, or sympathy for someone’s trouble.',
        hindiMeaning: 'माफ़ कीजिए, खेद है',
        nuance: 'Sorry is the short, immediate form — used the moment you bump into someone, and also for sympathy (“I am sorry to hear that”) where no fault exists.',
        examples: [
          'Sorry — I did not see your bag.',
          'I am sorry to hear about the transfer.',
        ],
      },
      {
        word: 'pardon',
        englishMeaning: 'a request to repeat what was said, or the formal act of forgiving.',
        hindiMeaning: 'क्षमा, दोबारा कहिए',
        nuance: 'As a question, “Pardon?” simply asks for a repeat — clearer on the phone than “What?”. As a noun, a pardon is granted by authority, not by a colleague.',
        examples: [
          'Pardon? The line broke for a second.',
          'The government granted him a pardon.',
        ],
      },
      {
        word: 'apologise',
        englishMeaning: 'to say clearly that you are sorry for a specific fault (British spelling).',
        hindiMeaning: 'क्षमा माँगना, माफ़ी माँगना',
        nuance: 'Apologise is deliberate and complete: apologise “to” a person “for” something. It takes about ten words, which is exactly why it means more.',
        examples: [
          'I apologised to the class for the delay.',
          'He apologised for the remark in front of everyone.',
        ],
      },
    ],
    dialogue: [
      { speaker: 'You', line: 'Excuse me — may I come through?' },
      { speaker: 'Colleague', line: 'Careful, that was my foot!' },
      { speaker: 'You', line: 'Sorry! That was completely my fault.' },
      { speaker: 'Principal', line: 'You are five minutes late.' },
      { speaker: 'You', line: 'Sir, I apologise for the delay. There was a traffic block on the canal road.' },
    ],
    challenge:
      'Replay three moments from today out loud: interrupting someone politely, bumping into something, and reaching somewhere late — using excuse me, sorry and a full apology with “to” and “for”, in that order.',
  },
];
