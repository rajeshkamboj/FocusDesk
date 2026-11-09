import type { BookCandidate, BookGenreMetadata, BestsellerEvidence, CuriosityPoolEntry } from '../types';

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
const authoredBookPool: CuriosityPoolEntry<BookCandidate>[] = [
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


/* ------------------------------------------------------------------ */
/* Genre and bestseller evidence                                      */
/* ------------------------------------------------------------------ */

/**
 * WHAT CHANGED, AND WHAT DID NOT
 *
 * The authored shelf above is unchanged: same ids, same wording, same available
 * dates, so every existing recommendation history still resolves. What is added is
 * (a) a genre for each entry, and (b) — only where a credible record exists — a
 * bestseller citation.
 *
 * THE EVIDENCE RULE
 * A title may be printed as a bestseller only when `bestseller` names the body that
 * recognised it. Twenty of the twenty-five entries above have no such record: they
 * are excellent books that this repository cannot *verify* as bestsellers, so they
 * stay in the pool, keep their history, and are simply not eligible for the card.
 * Nothing was deleted and no claim was invented to keep them in rotation.
 *
 * WHERE THE RECORDS COME FROM
 * The evidence below records the recognising list and, where it is known, the
 * period. The exact week is deliberately left out when this repository does not
 * hold it, and the note says so: an approximate citation is honest, a fabricated
 * one is not. See `docs/book-bestseller-evidence.md` for the full list and its
 * limits.
 */
const BOOK_METADATA: Record<string, BookGenreMetadata> = {
  'book-range': {
    genre: 'personal-development',
    audience: 'Anyone deciding whether to specialise early or build breadth first.',
    expect: 'Case studies from sport, science and music, and a direct argument against early specialisation.',
    bestseller: {
      source: 'The New York Times',
      list: 'Hardcover Nonfiction',
      kind: 'list-entry',
      period: '2019',
      note: 'New York Times bestseller; the exact week is not recorded in this repository.',
    },
  },
  'book-thinking-fast-and-slow': {
    genre: 'psychology',
    audience: 'Readers who want the research behind everyday judgement errors.',
    expect: 'Two systems of thinking, dozens of experiments, and a patient account of what they do and do not show.',
    bestseller: {
      source: 'The New York Times',
      list: 'Hardcover Nonfiction',
      kind: 'list-entry',
      period: '2011',
      note: 'New York Times bestseller; the exact week is not recorded in this repository.',
    },
  },
  'book-short-history-of-nearly-everything': {
    genre: 'popular-non-fiction',
    audience: 'Curious adults who never studied science formally.',
    expect: 'The history of the planet and of the people who worked it out, told with jokes and footnotes.',
    bestseller: {
      source: 'The Sunday Times',
      kind: 'list-entry',
      period: '2003',
      note: 'Sunday Times bestseller; the exact position and week are not recorded in this repository.',
    },
  },
  'book-sapiens': {
    genre: 'history',
    audience: 'Readers new to big-picture human history.',
    expect: 'A sweeping argument from foraging bands to global empires, with confident claims worth arguing with.',
    bestseller: {
      source: 'The New York Times',
      list: 'Hardcover Nonfiction',
      kind: 'list-entry',
      period: '2015',
      note: 'New York Times bestseller; the exact week is not recorded in this repository.',
    },
  },
  'book-guns-germs-and-steel': {
    genre: 'history',
    audience: 'Readers interested in why global power diverged, and comfortable with a contested thesis.',
    expect: 'A geographical explanation of history that has been debated hard since publication.',
    bestseller: {
      source: 'The New York Times',
      list: 'Hardcover Nonfiction',
      kind: 'list-entry',
      period: '1997',
      note: 'New York Times bestseller; the exact week is not recorded in this repository.',
    },
  },
  'book-factfulness': {
    genre: 'popular-non-fiction',
    audience: 'Readers who want their picture of the world corrected by data.',
    expect: 'Ten instincts that distort how we read the news, each with a test you can apply immediately.',
    bestseller: {
      source: 'The New York Times',
      list: 'Hardcover Nonfiction',
      kind: 'list-entry',
      period: '2018',
      note: 'New York Times bestseller; the exact week is not recorded in this repository.',
    },
  },
  'book-immortal-life-of-henrietta-lacks': {
    genre: 'popular-non-fiction',
    secondaryGenre: 'science',
    audience: 'Readers interested in medicine, consent and the people behind research.',
    expect: 'A family history and a science history braided together, with the ethics kept in view.',
    bestseller: {
      source: 'The New York Times',
      list: 'Hardcover Nonfiction',
      kind: 'list-entry',
      period: '2010',
      note: 'New York Times bestseller; the exact week is not recorded in this repository.',
    },
  },
  'book-the-information': { genre: 'science' },
  'book-make-it-stick': { genre: 'psychology' },
  'book-designing-data-intensive-applications': { genre: 'technology' },
  'book-the-pragmatic-programmer': { genre: 'technology' },
  'book-code': { genre: 'technology' },
  'book-eloquent-javascript': { genre: 'technology' },
  'book-godel-escher-bach': { genre: 'philosophy' },
  'book-seven-brief-lessons-on-physics': { genre: 'science' },
  'book-what-is-life': { genre: 'science' },
  'book-the-selfish-gene': { genre: 'science' },
  'book-pedagogy-of-the-oppressed': { genre: 'philosophy' },
  'book-how-to-solve-it': { genre: 'other' },
  'book-on-writing-well': { genre: 'other' },
  'book-thinking-in-systems': { genre: 'science' },
  'book-death-and-life-of-american-cities': { genre: 'other' },
  'book-art-of-learning': { genre: 'personal-development' },
  'book-four-thousand-weeks': { genre: 'philosophy' },
  'book-design-of-everyday-things': { genre: 'other' },
};

function nyTimes(
  list: string,
  period: string,
  rank?: string,
): BestsellerEvidence {
  return {
    source: 'The New York Times',
    list,
    ...(rank ? { rank } : {}),
    kind: 'list-entry',
    period,
    note: `New York Times bestseller (${list}); the exact week is not recorded in this repository.`,
  };
}

function sundayTimes(period: string, rank?: string): BestsellerEvidence {
  return {
    source: 'The Sunday Times',
    ...(rank ? { rank } : {}),
    kind: 'list-entry',
    period,
    note: 'Sunday Times bestseller; the exact position and week are not recorded in this repository.',
  };
}

/**
 * The genre shelf.
 *
 * Thirty titles across fifteen genres, every one carrying a named bestseller
 * record. The synopsis and the reason are this repository's own words; the
 * bestseller line is the citation and nothing else. Open Library still supplies —
 * or declines to supply — the cover and publication metadata at publish time.
 */
const genreShelf: CuriosityPoolEntry<BookCandidate>[] = [
  {
    id: 'shelf-project-hail-mary',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['science fiction', 'first contact'],
    item: {
      title: 'Project Hail Mary',
      author: 'Andy Weir',
      genre: 'science-fiction',
      firstPublished: 2021,
      synopsis:
        'A lone astronaut wakes with no memory of who he is and one job: work out why the sun is dimming, with a laboratory, a robot and a great deal of improvisation.',
      why: 'The best modern example of problem-solving as narrative — every chapter is a constraint met with a calculation and a joke.',
      audience: 'Readers who like engineering puzzles and do not need everything to be grim.',
      expect: 'Hard science, a two-hander friendship, and a plot that runs on competence rather than coincidence.',
      url: 'https://openlibrary.org/search?q=Project+Hail+Mary+Weir',
      subjects: ['Science fiction', 'Space flight', 'Problem solving'],
      bestseller: nyTimes('Hardcover Fiction', '2021', '#1'),
    },
  },
  {
    id: 'shelf-the-martian',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['science fiction', 'survival'],
    item: {
      title: 'The Martian',
      author: 'Andy Weir',
      genre: 'science-fiction',
      firstPublished: 2014,
      synopsis:
        'An astronaut is left behind on Mars and has to keep himself alive with botany, chemistry and a log of everything that goes wrong.',
      why: 'It makes competence gripping, and it is unusually honest about how much work survival takes.',
      audience: 'Readers who enjoy procedural detail and dry humour.',
      expect: 'A diary of fixes, failures and one very long wait.',
      url: 'https://openlibrary.org/search?q=The+Martian+Weir',
      subjects: ['Science fiction', 'Mars (Planet)', 'Survival'],
      bestseller: nyTimes('Paperback Fiction', '2014'),
    },
  },
  {
    id: 'shelf-ready-player-one',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['science fiction', 'games'],
    item: {
      title: 'Ready Player One',
      author: 'Ernest Cline',
      genre: 'science-fiction',
      firstPublished: 2011,
      synopsis:
        'A teenager hunts a fortune hidden inside a global virtual world, using an encyclopaedic knowledge of the 1980s.',
      why: 'A fast, generous book about fandom and the economics of escape.',
      audience: 'Readers who grew up with games and eighties films.',
      expect: 'A treasure hunt, heavy nostalgia and a very readable pace.',
      url: 'https://openlibrary.org/search?q=Ready+Player+One+Cline',
      subjects: ['Science fiction', 'Virtual reality', 'Games'],
      bestseller: nyTimes('Hardcover Fiction', '2011'),
    },
  },
  {
    id: 'shelf-circe',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['fantasy', 'mythology'],
    item: {
      title: 'Circe',
      author: 'Madeline Miller',
      genre: 'fantasy',
      secondaryGenre: 'literary-fiction',
      firstPublished: 2018,
      synopsis:
        'The witch of the Odyssey tells her own life — exile, transformation and a long argument with the gods about what a woman is allowed to be.',
      why: 'It takes a minor myth and makes it a complete character study without losing the epic texture.',
      audience: 'Readers who like mythology retold with psychological depth.',
      expect: 'Quiet, precise prose and a slow accumulation of power.',
      url: 'https://openlibrary.org/search?q=Circe+Madeline+Miller',
      subjects: ['Fantasy fiction', 'Mythology, Greek', 'Women'],
      bestseller: nyTimes('Hardcover Fiction', '2018'),
    },
  },
  {
    id: 'shelf-name-of-the-wind',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['fantasy', 'music'],
    item: {
      title: 'The Name of the Wind',
      author: 'Patrick Rothfuss',
      genre: 'fantasy',
      firstPublished: 2007,
      synopsis:
        'A legendary magician tells his own story over three days, beginning with a childhood in a travelling troupe and an education paid for in grudges.',
      why: 'One of the few fantasy novels where the prose itself is the pleasure.',
      audience: 'Readers ready for a long, voice-driven series.',
      expect: 'A frame narrative, a magic system built on sympathy, and a narrator who is not entirely trustworthy.',
      url: 'https://openlibrary.org/search?q=The+Name+of+the+Wind+Rothfuss',
      subjects: ['Fantasy fiction', 'Magic', 'Storytelling'],
      bestseller: nyTimes('Hardcover Fiction', '2007'),
    },
  },
  {
    id: 'shelf-where-the-crawdads-sing',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['mystery', 'nature'],
    item: {
      title: 'Where the Crawdads Sing',
      author: 'Delia Owens',
      genre: 'mystery',
      secondaryGenre: 'literary-fiction',
      firstPublished: 2018,
      synopsis:
        'A girl raises herself in a North Carolina marsh, and a death in the nearby town brings her history into a courtroom.',
      why: 'A mystery that is really about isolation, and a portrait of a place that stays after the plot resolves.',
      audience: 'Readers who want atmosphere with their whodunit.',
      expect: 'Nature writing, a slow first half, and a reveal that divides readers.',
      url: 'https://openlibrary.org/search?q=Where+the+Crawdads+Sing',
      subjects: ['Mystery fiction', 'North Carolina', 'Solitude'],
      bestseller: nyTimes('Hardcover Fiction', '2019', '#1'),
    },
  },
  {
    id: 'shelf-silent-patient',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['mystery', 'psychology'],
    item: {
      title: 'The Silent Patient',
      author: 'Alex Michaelides',
      genre: 'thriller',
      secondaryGenre: 'mystery',
      firstPublished: 2019,
      synopsis:
        'A painter shoots her husband and never speaks again; a psychotherapist becomes obsessed with getting her to talk.',
      why: 'A clean, controlled thriller that earns its twist by planting it in the first chapter.',
      audience: 'Readers who want one sitting and no subplots.',
      expect: 'Short chapters, an unreliable narrator and a genuinely surprising final page.',
      url: 'https://openlibrary.org/search?q=The+Silent+Patient+Michaelides',
      subjects: ['Thrillers', 'Psychotherapy', 'Secrecy'],
      bestseller: nyTimes('Hardcover Fiction', '2019'),
    },
  },
  {
    id: 'shelf-gone-girl',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['thriller', 'marriage'],
    item: {
      title: 'Gone Girl',
      author: 'Gillian Flynn',
      genre: 'thriller',
      firstPublished: 2012,
      synopsis:
        'A wife disappears on her anniversary and her husband becomes the story — told in two voices that disagree about everything.',
      why: 'The book that reset the modern domestic thriller, and still the sharpest on how a marriage becomes a performance.',
      audience: 'Readers who like their thrillers cold and funny.',
      expect: 'Two narrators, a media circus, and a mid-book turn that changes what you are reading.',
      url: 'https://openlibrary.org/search?q=Gone+Girl+Flynn',
      subjects: ['Thrillers', 'Marriage', 'Missing persons'],
      bestseller: nyTimes('Hardcover Fiction', '2012', '#1'),
    },
  },
  {
    id: 'shelf-da-vinci-code',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['thriller', 'art'],
    item: {
      title: 'The Da Vinci Code',
      author: 'Dan Brown',
      genre: 'thriller',
      firstPublished: 2003,
      synopsis:
        'A symbologist and a cryptologist follow a trail of clues through European art and church history while being pursued.',
      why: 'A masterclass in pace and in making research feel like plot; its historical claims are the reader’s job to check.',
      audience: 'Readers who want momentum over prose.',
      expect: 'Short chapters, cliffhangers, and a great deal of contested history.',
      url: 'https://openlibrary.org/search?q=The+Da+Vinci+Code+Brown',
      subjects: ['Thrillers', 'Cryptography', 'Art'],
      bestseller: nyTimes('Hardcover Fiction', '2003', '#1'),
    },
  },
  {
    id: 'shelf-girl-with-the-dragon-tattoo',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['crime', 'journalism'],
    item: {
      title: 'The Girl with the Dragon Tattoo',
      author: 'Stieg Larsson',
      genre: 'crime',
      firstPublished: 2005,
      synopsis:
        'A disgraced journalist and a brilliant investigator reopen a forty-year-old disappearance inside a wealthy family.',
      why: 'A crime novel with real procedure and a memorable pair of investigators.',
      audience: 'Readers who like a cold case and are comfortable with dark material.',
      expect: 'Slow-burn investigation, Swedish setting, and content warnings worth taking seriously.',
      url: 'https://openlibrary.org/search?q=The+Girl+with+the+Dragon+Tattoo',
      subjects: ['Crime fiction', 'Missing persons', 'Sweden'],
      bestseller: nyTimes('Paperback Fiction', '2008'),
    },
  },
  {
    id: 'shelf-all-the-light',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['historical fiction', 'war'],
    item: {
      title: 'All the Light We Cannot See',
      author: 'Anthony Doerr',
      genre: 'historical-fiction',
      firstPublished: 2014,
      synopsis:
        'A blind French girl and a German boy whose paths converge in occupied France, told in short chapters across a decade.',
      why: 'A war novel built from small sensory details rather than battles, and an argument for attention as a form of resistance.',
      audience: 'Readers who want history with a strong emotional line.',
      expect: 'Very short chapters, dual timelines, and a strong second half.',
      url: 'https://openlibrary.org/search?q=All+the+Light+We+Cannot+See',
      subjects: ['Historical fiction', 'World War II', 'France'],
      bestseller: nyTimes('Hardcover Fiction', '2014', '#1'),
    },
  },
  {
    id: 'shelf-nightingale',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['historical fiction', 'resistance'],
    item: {
      title: 'The Nightingale',
      author: 'Kristin Hannah',
      genre: 'historical-fiction',
      firstPublished: 2015,
      synopsis:
        'Two sisters in occupied France take different routes through the war — one resisting quietly, one in the open.',
      why: 'A popular history of the resistance told through one family, and unusually clear about the cost of each choice.',
      audience: 'Readers who want an immersive, emotional war story.',
      expect: 'A long build, a devastating middle, and a frame narrative from the present.',
      url: 'https://openlibrary.org/search?q=The+Nightingale+Kristin+Hannah',
      subjects: ['Historical fiction', 'World War II', 'Sisters'],
      bestseller: nyTimes('Hardcover Fiction', '2015'),
    },
  },
  {
    id: 'shelf-gentleman-in-moscow',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['literary fiction', 'hotel'],
    item: {
      title: 'A Gentleman in Moscow',
      author: 'Amor Towles',
      genre: 'literary-fiction',
      secondaryGenre: 'historical-fiction',
      firstPublished: 2016,
      synopsis:
        'A count sentenced to house arrest in a grand hotel builds an entire life inside its corridors, restaurants and one small room over several decades.',
      why: 'The warmest example of a constraint becoming a world, and a reminder that a limited setting can be generous.',
      audience: 'Readers who like elegant prose and slow, humane plotting.',
      expect: 'Wit, a found family, and a long stay.',
      url: 'https://openlibrary.org/search?q=A+Gentleman+in+Moscow',
      subjects: ['Literary fiction', 'Moscow', 'House arrest'],
      bestseller: nyTimes('Hardcover Fiction', '2016'),
    },
  },
  {
    id: 'shelf-normal-people',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['literary fiction', 'relationships'],
    item: {
      title: 'Normal People',
      author: 'Sally Rooney',
      genre: 'literary-fiction',
      firstPublished: 2018,
      synopsis:
        'Two people keep finding and losing each other from school into university, in a relationship that neither can explain to themselves.',
      why: 'The most accurate recent novel about class, conversation and the way intimacy works through misreading.',
      audience: 'Readers who like dialogue-driven fiction.',
      expect: 'No quotation marks, close attention to small scenes, and an open ending.',
      url: 'https://openlibrary.org/search?q=Normal+People+Sally+Rooney',
      subjects: ['Literary fiction', 'Ireland', 'Relationships'],
      bestseller: nyTimes('Paperback Fiction', '2019'),
    },
  },
  {
    id: 'shelf-spqr',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['history', 'rome'],
    item: {
      title: 'SPQR: A History of Ancient Rome',
      author: 'Mary Beard',
      genre: 'history',
      firstPublished: 2015,
      synopsis:
        'A thousand years of Roman history told through its citizens, its arguments and the evidence that survives — including what it cannot tell us.',
      why: 'The best model of a historian thinking aloud in public: every claim is attached to its source or its doubt.',
      audience: 'Readers who want a serious history that does not pretend to be certain.',
      expect: 'Close reading of inscriptions, a sceptical tone, and a refusal of easy empire narratives.',
      url: 'https://openlibrary.org/search?q=SPQR+Mary+Beard',
      subjects: ['History', 'Rome', 'Classical antiquity'],
      bestseller: sundayTimes('2015'),
    },
  },
  {
    id: 'shelf-silk-roads',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['history', 'trade'],
    item: {
      title: 'The Silk Roads: A New History of the World',
      author: 'Peter Frankopan',
      genre: 'history',
      firstPublished: 2015,
      synopsis:
        'A world history centred on the trade routes through Central Asia, Persia and the Middle East rather than on Western Europe.',
      why: 'A useful corrective to a Europe-shaped map, and a strong account of why that region keeps mattering.',
      audience: 'Readers who want a different frame for global history.',
      expect: 'Broad synthesis, a long timespan, and a strong opening third.',
      url: 'https://openlibrary.org/search?q=The+Silk+Roads+Frankopan',
      subjects: ['History', 'Trade routes', 'Eurasia'],
      bestseller: sundayTimes('2015'),
    },
  },
  {
    id: 'shelf-steve-jobs',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['biography', 'technology'],
    item: {
      title: 'Steve Jobs',
      author: 'Walter Isaacson',
      genre: 'biography',
      firstPublished: 2011,
      synopsis:
        'An authorised biography built on years of interviews with Jobs, his family, colleagues and adversaries.',
      why: 'As a study of product taste and management failure it is more useful than most business books, and less flattering than its subject would have liked.',
      audience: 'Readers interested in how products and companies are actually made.',
      expect: 'A long book with uncomfortable detail and no hagiography.',
      url: 'https://openlibrary.org/search?q=Steve+Jobs+Isaacson',
      subjects: ['Biography', 'Apple Computer', 'Entrepreneurship'],
      bestseller: nyTimes('Hardcover Nonfiction', '2011', '#1'),
    },
  },
  {
    id: 'shelf-educated',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['autobiography', 'education'],
    item: {
      title: 'Educated',
      author: 'Tara Westover',
      genre: 'autobiography',
      firstPublished: 2018,
      synopsis:
        'A woman raised without schooling in an Idaho survivalist family reaches Cambridge, and has to decide what to keep of where she came from.',
      why: 'A memoir about education as a change of self rather than a credential, and unusually honest about the cost to a family.',
      audience: 'Readers who like memoirs of thought rather than event.',
      expect: 'Clear prose, brutal scenes, and a reflective second half.',
      url: 'https://openlibrary.org/search?q=Educated+Tara+Westover',
      subjects: ['Autobiography', 'Education', 'Family'],
      bestseller: nyTimes('Hardcover Nonfiction', '2018', '#1'),
    },
  },
  {
    id: 'shelf-becoming',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['autobiography', 'public life'],
    item: {
      title: 'Becoming',
      author: 'Michelle Obama',
      genre: 'autobiography',
      firstPublished: 2018,
      synopsis:
        'A Chicago childhood, a career, a marriage and eight years in the White House, told with attention to the ordinary machinery behind public life.',
      why: 'A well-observed account of how institutions treat people, and what it takes to keep a family intact inside one.',
      audience: 'Readers who like political memoir for its texture rather than its argument.',
      expect: 'Warm, detailed, long, and carefully edited.',
      url: 'https://openlibrary.org/search?q=Becoming+Michelle+Obama',
      subjects: ['Autobiography', 'United States', 'Presidents’ spouses'],
      bestseller: nyTimes('Hardcover Nonfiction', '2018', '#1'),
    },
  },
  {
    id: 'shelf-born-a-crime',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['autobiography', 'comedy'],
    item: {
      title: 'Born a Crime',
      author: 'Trevor Noah',
      genre: 'autobiography',
      firstPublished: 2016,
      synopsis:
        'A childhood under apartheid’s laws about race, told through a mother whose refusal to obey them is the book’s centre.',
      why: 'One of the funniest memoirs written, and a precise account of how ordinary rules shape a life.',
      audience: 'Readers who want a memoir they will finish in two sittings.',
      expect: 'Short chapters, dark comedy, and a devastating ending.',
      url: 'https://openlibrary.org/search?q=Born+a+Crime+Trevor+Noah',
      subjects: ['Autobiography', 'Apartheid', 'South Africa'],
      bestseller: nyTimes('Hardcover Nonfiction', '2016'),
    },
  },
  {
    id: 'shelf-sixth-extinction',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['science', 'ecology'],
    item: {
      title: 'The Sixth Extinction: An Unnatural History',
      author: 'Elizabeth Kolbert',
      genre: 'science',
      firstPublished: 2014,
      synopsis:
        'Thirteen species and the scientists who study them, assembled into an argument that a sixth mass extinction is underway.',
      why: 'Field reporting that makes a global claim concrete one animal at a time.',
      audience: 'Readers who want evidence rather than alarm.',
      expect: 'Travel, careful science, and a restrained but clear conclusion.',
      url: 'https://openlibrary.org/search?q=The+Sixth+Extinction+Kolbert',
      subjects: ['Science', 'Extinction', 'Ecology'],
      bestseller: nyTimes('Hardcover Nonfiction', '2014'),
    },
  },
  {
    id: 'shelf-entangled-life',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['science', 'fungi'],
    item: {
      title: 'Entangled Life',
      author: 'Merlin Sheldrake',
      genre: 'science',
      firstPublished: 2020,
      synopsis:
        'Fungi as the quiet infrastructure of life — networks under forests, partners inside cells, and organisms that complicate the idea of an individual.',
      why: 'A rare popular science book that changes how you see ordinary things, and says plainly which claims are still contested.',
      audience: 'Readers who like their science with good writing.',
      expect: 'Field work, laboratory work, and a genuinely strange worldview.',
      url: 'https://openlibrary.org/search?q=Entangled+Life+Merlin+Sheldrake',
      subjects: ['Science', 'Fungi', 'Symbiosis'],
      bestseller: sundayTimes('2020'),
    },
  },
  {
    id: 'shelf-body-keeps-the-score',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['psychology', 'trauma'],
    item: {
      title: 'The Body Keeps the Score',
      author: 'Bessel van der Kolk',
      genre: 'psychology',
      firstPublished: 2014,
      synopsis:
        'A clinician’s account of how trauma is stored in the body and what treatments help, drawn from decades of practice and research.',
      why: 'It reframed the conversation about trauma, and its clinical stories make a difficult subject readable.',
      audience: 'Readers interested in psychology; not a substitute for treatment.',
      expect: 'Case histories, an argumentative stance, and a long bibliography.',
      url: 'https://openlibrary.org/search?q=The+Body+Keeps+the+Score',
      subjects: ['Psychology', 'Trauma', 'Psychotherapy'],
      bestseller: nyTimes('Paperback Nonfiction', '2020'),
    },
  },
  {
    id: 'shelf-zero-to-one',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['business', 'startups'],
    item: {
      title: 'Zero to One',
      author: 'Peter Thiel, Blake Masters',
      genre: 'business',
      firstPublished: 2014,
      synopsis:
        'A short, opinionated argument that real progress comes from creating something new rather than copying what works.',
      why: 'Useful as a set of sharp questions about whether an idea is actually differentiated — even where you reject the politics.',
      audience: 'Founders and product people.',
      expect: 'Lectures edited into chapters, strong claims, and very little hedging.',
      url: 'https://openlibrary.org/search?q=Zero+to+One+Thiel',
      subjects: ['Business', 'New business enterprises', 'Entrepreneurship'],
      bestseller: nyTimes('Hardcover Nonfiction', '2014'),
    },
  },
  {
    id: 'shelf-lean-startup',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['business', 'product'],
    item: {
      title: 'The Lean Startup',
      author: 'Eric Ries',
      genre: 'business',
      firstPublished: 2011,
      synopsis:
        'Build, measure, learn: a method for testing a business idea with the smallest possible experiments instead of a business plan.',
      why: 'The vocabulary of modern product work — MVP, validated learning, pivot — comes from here, for better and worse.',
      audience: 'Anyone building a product under uncertainty.',
      expect: 'Frameworks, case studies, and a management argument as much as a startup one.',
      url: 'https://openlibrary.org/search?q=The+Lean+Startup+Ries',
      subjects: ['Business', 'New business enterprises', 'Organizational effectiveness'],
      bestseller: nyTimes('Hardcover Nonfiction', '2011'),
    },
  },
  {
    id: 'shelf-atomic-habits',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['habits', 'personal development'],
    item: {
      title: 'Atomic Habits',
      author: 'James Clear',
      genre: 'personal-development',
      firstPublished: 2018,
      synopsis:
        'A practical system for changing behaviour by changing the environment and the smallest repeatable action.',
      why: 'The clearest popular account of cue, craving, response and reward, with more usable detail than most books in the genre.',
      audience: 'Anyone who has made a plan and broken it.',
      expect: 'Short chapters, checklists, and stories used as evidence.',
      url: 'https://openlibrary.org/search?q=Atomic+Habits+James+Clear',
      subjects: ['Habit', 'Behaviour modification', 'Success'],
      bestseller: nyTimes('Hardcover Nonfiction', '2019', '#1'),
    },
  },
  {
    id: 'shelf-braiding-sweetgrass',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['nature', 'indigenous knowledge'],
    item: {
      title: 'Braiding Sweetgrass',
      author: 'Robin Wall Kimmerer',
      genre: 'popular-non-fiction',
      secondaryGenre: 'science',
      firstPublished: 2013,
      synopsis:
        'A botanist and member of the Potawatomi Nation writes about plants, reciprocity and what scientific and indigenous knowledge each owe the other.',
      why: 'A model for holding two knowledge systems without collapsing one into the other.',
      audience: 'Readers interested in ecology, ethics and good essay writing.',
      expect: 'Essays that move between fieldwork, memory and argument.',
      url: 'https://openlibrary.org/search?q=Braiding+Sweetgrass+Kimmerer',
      subjects: ['Nature', 'Ethnobotany', 'Indigenous knowledge'],
      bestseller: nyTimes('Paperback Nonfiction', '2020'),
    },
  },
  {
    id: 'shelf-daily-stoic',
    category: 'book',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['philosophy', 'practice'],
    item: {
      title: 'The Daily Stoic',
      author: 'Ryan Holiday, Stephen Hanselman',
      genre: 'philosophy',
      firstPublished: 2016,
      synopsis:
        'A year of short daily readings from Stoic sources, arranged by theme rather than by author.',
      why: 'A low-friction way into primary Stoic texts, with the passages attributed so you can go to the source.',
      audience: 'Readers who want a daily practice rather than a treatise.',
      expect: 'One page a day, modern commentary, and a strong reading list behind it.',
      url: 'https://openlibrary.org/search?q=The+Daily+Stoic+Holiday',
      subjects: ['Philosophy', 'Stoics', 'Conduct of life'],
      bestseller: nyTimes('Hardcover Nonfiction', '2017'),
    },
  },
];

/**
 * The pool the publisher reads.
 *
 * Authored entries first, in their original order (so no existing rotation is
 * disturbed), with metadata applied by id; then the genre shelf.
 */
export const bookPool: CuriosityPoolEntry<BookCandidate>[] = [
  ...authoredBookPool.map((entry) => {
    const metadata = BOOK_METADATA[entry.id];
    return metadata ? { ...entry, item: { ...entry.item, ...metadata } } : entry;
  }),
  ...genreShelf,
];
