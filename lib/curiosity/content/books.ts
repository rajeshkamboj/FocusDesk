import type { BookCandidate, CuriosityPoolEntry } from '../types';

/**
 * One Book — the pool of candidates the recommendation rotates through.
 *
 * Twenty-five entries, published every third day, so the same book comes
 * round again after roughly two and a half months.
 *
 * What this file asserts, and what it does not:
 *
 *  - It asserts a title, an author, and two paragraphs of our own — a synopsis
 *    and a reason it may be worth your time. That is the whole of our claim
 *    about the book.
 *  - It asserts nothing about covers, publication years, publishers, editions,
 *    ratings, reviews or whether a copy can be borrowed today. All of that is
 *    catalogue data, fetched from the Open Library record when the card is
 *    published (see `../openlibrary.ts`), and simply left off the card when the
 *    catalogue does not supply it.
 *  - A candidate whose title the catalogue does not recognise degrades to the
 *    curated card. It is never padded with invented metadata, and the card
 *    says which source it came from.
 *
 * `url` is an optional page we chose ourselves (an author’s own site). Once
 * Open Library resolves a record, its work page replaces it as the primary
 * link, because a reader should land on the catalogue entry the card’s
 * publication data came from.
 */
export const bookPool: CuriosityPoolEntry<BookCandidate>[] = [
  {
    id: 'book-design-of-everyday-things',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['design', 'engineering'],
    source: { url: 'https://openlibrary.org/works/OL1879162W', name: 'Open Library' },
    item: {
      title: 'The Design of Everyday Things',
      author: 'Don Norman',
      synopsis:
        'A practical look at why some products feel obvious and others feel frustrating. It connects psychology, design, and the small decisions that make tools easier to use.',
      why: 'Useful for building calmer, more understandable websites and software.',
      url: 'https://openlibrary.org/works/OL1879162W',
      subjects: ['Design', 'Human-computer interaction'],
    },
  },
  {
    id: 'book-the-information',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['history', 'science'],
    source: { url: 'https://openlibrary.org/search?q=The+Information+Gleick', name: 'Open Library' },
    item: {
      title: 'The Information: A History, a Theory, a Flood',
      author: 'James Gleick',
      synopsis:
        'A history of ideas about information, from language and code to the digital age. It shows how a scientific concept reshaped communication and computing.',
      why: 'A thoughtful bridge between science, teaching, writing, and technology.',
      url: 'https://openlibrary.org/search?q=The+Information+Gleick',
      subjects: ['Information theory', 'History'],
    },
  },
  {
    id: 'book-range',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['learning', 'psychology'],
    source: { url: 'https://openlibrary.org/search?q=The+Range+Epstein', name: 'Open Library' },
    item: {
      title: 'Range: Why Generalists Triumph in a Specialized World',
      author: 'David Epstein',
      synopsis:
        'An exploration of why broad experience can be an advantage in a world that rewards specialization. The book uses research and stories rather than simple productivity slogans.',
      why: 'Relevant to a developer, teacher, and learner with several connected interests.',
      url: 'https://openlibrary.org/search?q=The+Range+Epstein',
      subjects: ['Ability', 'Success'],
    },
  },
  {
    id: 'book-make-it-stick',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['learning', 'teaching', 'psychology'],
    item: {
      title: 'Make It Stick',
      author: 'Peter C. Brown, Henry L. Roediger III, Mark A. McDaniel',
      synopsis:
        'A survey of what the research on learning actually shows, written for people who have to study or teach: rereading and highlighting feel effective and are weak, while retrieval, spacing and interleaving feel harder and are strong.',
      why: 'It changes how you prepare a lesson or an exam, and how you read a technical book — the notes become prompts instead of a second copy of the text.',
      subjects: ['Study methods', 'Memory', 'Cognition'],
    },
  },
  {
    id: 'book-thinking-fast-and-slow',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['psychology', 'decisions'],
    item: {
      title: 'Thinking, Fast and Slow',
      author: 'Daniel Kahneman',
      synopsis:
        'A Nobel laureate’s account of two modes of thought — quick, associative judgement and slower, deliberate calculation — and of the biases that follow when the first answers a question the second was asked.',
      why: 'It gives vocabulary for the mistakes that are cheapest to make in a design review or an estimate, and it is careful about what the evidence does and does not show.',
      subjects: ['Judgment', 'Cognitive biases', 'Behavioral economics'],
    },
  },
  {
    id: 'book-designing-data-intensive-applications',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['engineering', 'databases'],
    item: {
      title: 'Designing Data-Intensive Applications',
      author: 'Martin Kleppmann',
      synopsis:
        'A structured tour of how storage, replication, partitioning and consistency actually work, with the trade-offs of the systems you can buy laid out beside the reasons they exist.',
      why: 'It explains the decisions behind a database rather than the marketing around one, which is the difference between choosing well and choosing repeatedly.',
      subjects: ['Database management', 'Computer networks', 'Data storage systems'],
    },
  },
  {
    id: 'book-the-pragmatic-programmer',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['engineering', 'practice'],
    item: {
      title: 'The Pragmatic Programmer',
      author: 'Andrew Hunt, David Thomas',
      synopsis:
        'Two decades of short, concrete essays on the habits that keep software changeable: orthogonal design, tracer bullets, deliberate duplication, and knowing when to drop a broken approach.',
      why: 'Read in short pieces, it works as a weekly audit of your own practice rather than a book to finish.',
      subjects: ['Computer programming', 'Software development'],
    },
  },
  {
    id: 'book-code',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['computer-science', 'teaching'],
    item: {
      title: 'Code: The Hidden Language of Computer Hardware and Software',
      author: 'Charles Petzold',
      synopsis:
        'From flashlights and Morse code to gates, binary and a working processor, Petzold builds the whole machine out of things a reader can picture, with no assumption of prior training.',
      why: 'The clearest available answer to “what is actually happening when I run this?” — and a good model of patient explanation to imitate in a classroom.',
      subjects: ['Electronic digital computers', 'Computer programming'],
    },
  },
  {
    id: 'book-eloquent-javascript',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['programming', 'web'],
    item: {
      title: 'Eloquent JavaScript',
      author: 'Marijn Haverbeke',
      synopsis:
        'A modern introduction to programming through JavaScript, with each chapter ending in exercises and the whole text published online by its author under an open licence.',
      why: 'A genuine example of a technical book that is free, editable and better for it — useful both to read and to hand to a student.',
      subjects: ['JavaScript (Computer program language)', 'Web sites', 'Programming'],
    },
  },
  {
    id: 'book-godel-escher-bach',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['mathematics', 'mind'],
    item: {
      title: 'Gödel, Escher, Bach',
      author: 'Douglas Hofstadter',
      synopsis:
        'A long, playful meditation on formal systems, self-reference and meaning, built out of dialogues, puzzles and the work of three men who kept strange company with one another.',
      why: 'It rewards slow reading and it changes how you think about symbols standing for something — the core of both programming and teaching.',
      subjects: ['Mathematical logic', 'Cognition', 'Self-reference'],
    },
  },
  {
    id: 'book-short-history-of-nearly-everything',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['science', 'history'],
    item: {
      title: 'A Short History of Nearly Everything',
      author: 'Bill Bryson',
      synopsis:
        'How we came to know what we know about the Earth, the age of things and the small number of measurements that settled large arguments, told with an outsider’s impatience with jargon.',
      why: 'It restores the human anecdote to science history, which is the part most textbooks strip out and most students need.',
      subjects: ['Science', 'History of science', 'Astronomy'],
    },
  },
  {
    id: 'book-seven-brief-lessons-on-physics',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['physics'],
    item: {
      title: 'Seven Brief Lessons on Physics',
      author: 'Carlo Rovelli',
      synopsis:
        'Seven short essays on relativity, quanta, gravity, the structure of matter, probability and time, each under a few pages and written as wonder rather than as syllabus.',
      why: 'It can be read in an evening and it leaves a reader with the shape of modern physics rather than a list of things they did not understand.',
      subjects: ['Physics', 'Relativity (Physics)', 'Quantum theory'],
    },
  },
  {
    id: 'book-what-is-life',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['physics', 'biology'],
    item: {
      title: 'What Is Life?',
      author: 'Erwin Schrödinger',
      synopsis:
        'A physicist’s 1944 lecture series asking what the order of living matter could mean in thermodynamic terms, and speculating about the stable molecule that inheritance would require.',
      why: 'A short, honest example of reasoning from first principles into a field you were not trained in — and it influenced the people who went on to find the answer.',
      subjects: ['Biology', 'Physics', 'Genetics'],
    },
  },
  {
    id: 'book-the-selfish-gene',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['biology', 'evolution'],
    item: {
      title: 'The Selfish Gene',
      author: 'Richard Dawkins',
      synopsis:
        'An argument for reading evolution at the level of replicators rather than individuals or species, with the language of memes introduced almost as an aside in the final chapter.',
      why: 'Even where you disagree, it is a masterclass in how one change of vantage point reorganises an entire field of explanation.',
      subjects: ['Evolution (Biology)', 'Genetics', 'Sociobiology'],
    },
  },
  {
    id: 'book-sapiens',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['history', 'big-questions'],
    item: {
      title: 'Sapiens',
      author: 'Yuval Noah Harari',
      synopsis:
        'A broad history of our species organized around three revolutions — cognitive, agricultural and scientific — and an argument that shared fictions are what let large numbers of strangers cooperate.',
      why: 'Worth reading for the framing rather than the certainty; it is a good exercise in noticing which claims a sweeping narrative is leaning on.',
      subjects: ['Human beings', 'History', 'Civilization'],
    },
  },
  {
    id: 'book-guns-germs-and-steel',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['history', 'geography'],
    item: {
      title: 'Guns, Germs, and Steel',
      author: 'Jared Diamond',
      synopsis:
        'An attempt to explain the uneven distribution of wealth and power across continents through geography, domesticable species and the axis along which a landmass runs, rather than through the peoples living on it.',
      why: 'A strong case for environmental explanation, and a useful one to read alongside its critics — the argument is worth following past its own confidence.',
      subjects: ['Civilization, Modern', 'Human ecology', 'Geography'],
    },
  },
  {
    id: 'book-factfulness',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['statistics', 'data', 'world'],
    item: {
      title: 'Factfulness',
      author: 'Hans Rosling, Ola Rosling, Anna Rosling Rönnlund',
      synopsis:
        'A statistician’s case that most people hold a picture of the world decades out of date, and that the instinctive errors — straight lines, single numbers, dramatic anecdotes — are correctable with a few habits of comparison.',
      why: 'It is the best short introduction to reading a chart skeptically that also manages to be optimistic on evidence rather than on mood.',
      subjects: ['Social indicators', 'Statistical methods', 'World population'],
    },
  },
  {
    id: 'book-immortal-life-of-henrietta-lacks',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['science', 'ethics'],
    item: {
      title: 'The Immortal Life of Henrietta Lacks',
      author: 'Rebecca Skloot',
      synopsis:
        'The story of the cells taken from a Black patient in 1951 that went on to be used in research without her family’s knowledge, and of the family who learned about them decades later.',
      why: 'Science is never only science. It is the most readable account of consent, ownership and benefit in biological research, and it stays with you while you use a cell line or read a paper.',
      subjects: ['Lacks, Henrietta', 'Cytology', 'Medical ethics'],
    },
  },
  {
    id: 'book-pedagogy-of-the-oppressed',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['teaching', 'philosophy'],
    item: {
      title: 'Pedagogy of the Oppressed',
      author: 'Paulo Freire',
      synopsis:
        'An argument that education is never neutral: the “banking” model deposits information into passive students, while problem-posing education treats teacher and learner as jointly investigating the world.',
      why: 'Short, demanding and hard to unread. It puts language to something any teacher has felt — that explaining well is not the same as the student having thought.',
      subjects: ['Education', 'Critical pedagogy', 'Teaching'],
    },
  },
  {
    id: 'book-how-to-solve-it',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['mathematics', 'teaching'],
    item: {
      title: 'How to Solve It',
      author: 'George Pólya',
      synopsis:
        'A mathematician’s short grammar of problem solving: understand the problem, devise a plan, carry it out, look back — with lists of the questions that actually help at each stage.',
      why: 'The fourth step, looking back, is the one almost nobody does, and it is worth the price of the book on its own. It transfers from proofs to production incidents.',
      subjects: ['Problem solving', 'Mathematics', 'Heuristic'],
    },
  },
  {
    id: 'book-on-writing-well',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['writing'],
    item: {
      title: 'On Writing Well',
      author: 'William Zinsser',
      synopsis:
        'Thirty short chapters on non-fiction as craft: cut the clutter, prefer the short word, write with the ear, and treat every subject — science, travel, business, memoir — as a chance to be clear.',
      why: 'The cleanest case that good technical writing is a matter of removal, and a book you can keep open on the desk while editing documentation.',
      subjects: ['Authorship', 'English language', 'Writing'],
    },
  },
  {
    id: 'book-thinking-in-systems',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['systems', 'modelling'],
    item: {
      title: 'Thinking in Systems',
      author: 'Donella H. Meadows, Diana Wright',
      synopsis:
        'A primer on stocks, flows, feedback loops, delays and leverage points, written by the analyst behind The Limits to Growth and completed after her death from notes for a course.',
      why: 'It gives you the few diagrams that explain why a well-intended fix keeps failing — which is most of what maintaining a system, or a habit, consists of.',
      subjects: ['Systems analysis', 'Feedback', 'Complexity'],
    },
  },
  {
    id: 'book-death-and-life-of-american-cities',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['cities', 'design'],
    item: {
      title: 'The Death and Life of Great American Cities',
      author: 'Jane Jacobs',
      synopsis:
        'A neighbourhood-by-neighbourhood argument that cities work through density, short blocks, mixed uses and old buildings, and that the planning orthodoxy of her day destroyed exactly those mechanisms.',
      why: 'The best model of reasoning about a complex system by watching it closely instead of applying a plan — a habit worth stealing whether you build streets or software.',
      subjects: ['Cities and towns', 'Urban renewal', 'City planning'],
    },
  },
  {
    id: 'book-art-of-learning',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['learning', 'practice'],
    item: {
      title: 'The Art of Learning',
      author: 'Josh Waitzkin',
      synopsis:
        'A chess prodigy and martial-arts world champion describes building skill in layers: chunking the fundamentals so deeply they become invisible, then recovering the ability to learn by becoming a beginner again on purpose.',
      why: 'It is a practical account of deliberate practice from the inside, and far better on recovery from a bad day than most performance books.',
      subjects: ['Learning', 'Chess', 'Mental concentration'],
    },
  },
  {
    id: 'book-four-thousand-weeks',
    category: 'book',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['time', 'philosophy'],
    item: {
      title: 'Four Thousand Weeks',
      author: 'Oliver Burkeman',
      synopsis:
        'A finite-years figure for an ordinary life, and an argument that productivity culture is mostly an attempt to escape that limit — so the useful moves are choosing less, tolerating the backlog, and paying attention now.',
      why: 'The most honest book about time management in print, because its central advice is to stop trying to get everything done. A useful counterweight to any planning app, including this one.',
      subjects: ['Time management', 'Philosophy of life', 'Success'],
    },
  },
];
