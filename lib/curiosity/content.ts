import type {
  BrainSharpener,
  CuriosityBriefing,
  HistoryEvent,
  LiteratureItem,
} from './types';

const books = [
  {
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    description:
      'A practical look at why some products feel obvious and others feel frustrating. It connects psychology, design, and the small decisions that make tools easier to use.',
    why: 'Useful for building calmer, more understandable websites and software.',
    url: 'https://jnd.org/books/the-design-of-everyday-things-revised-and-expanded/',
  },
  {
    title: 'The Information',
    author: 'James Gleick',
    description:
      'A history of ideas about information, from language and code to the digital age. It shows how a scientific concept reshaped communication and computing.',
    why: 'A thoughtful bridge between science, teaching, writing, and technology.',
    url: 'https://www.jamesgleick.com/the-information/',
  },
  {
    title: 'Range',
    author: 'David Epstein',
    description:
      'An exploration of why broad experience can be an advantage in a world that rewards specialization. The book uses research and stories rather than simple productivity slogans.',
    why: 'Relevant to a developer, teacher, and learner with several connected interests.',
    url: 'https://davidepstein.com/the-range/',
  },
];

const oneThings = [
  {
    title: 'Why does an LLM generate text one token at a time?',
    explanation:
      'An LLM does not write a whole answer in one step. It converts the context into numbers, estimates a probability for the next token, selects one, then runs the expanded context through the model again. A token may be a word, part of a word, punctuation, or whitespace. This repeated prediction makes streaming possible and lets each new token depend on everything already written. It also explains why a model can sound coherent locally while still drifting globally: each choice is made from probabilities, not from a guaranteed outline of the finished answer.',
    url: 'https://developers.google.com/machine-learning/crash-course/llm/prompting',
  },
  {
    title: 'Why does a database index make a query faster?',
    explanation:
      'A database index is an additional, organized lookup structure built beside a table. Without one, the database may inspect every row to find matching records. With one, it can navigate a smaller structure—often a B-tree—to locate likely row positions quickly. The trade-off is space and work on writes: every insert, update, or delete may also need to update the index. Indexes help most when they match real filters and sort orders; adding one to every column can make a system slower rather than faster.',
    url: 'https://www.postgresql.org/docs/current/indexes.html',
  },
  {
    title: 'Why can a fast server still produce poor Core Web Vitals?',
    explanation:
      'Server response time is only one part of the journey to a usable page. A page can receive HTML quickly and still feel slow if it sends a large JavaScript bundle, waits for client rendering, shifts content when images load, or blocks the main thread with expensive work. Core Web Vitals measure what the visitor experiences: loading, visual stability, and interaction responsiveness. Improving them often means reducing browser work and reserving layout space, not only upgrading the server.',
    url: 'https://web.dev/articles/vitals',
  },
];

const lessons = [
  {
    topic: 'Bayesian reasoning as an update rule',
    explanation:
      'Bayes’ theorem is a disciplined way to update a belief after seeing evidence. Start with a prior belief, measure how likely the evidence is under competing explanations, then normalize. It is less about complicated arithmetic than about making assumptions visible and revisable.',
    url: 'https://plato.stanford.edu/entries/bayes-theorem/',
  },
  {
    topic: 'The bicycle principle of gradient descent',
    explanation:
      'Imagine standing on a foggy hillside and wanting to reach the lowest point. You can feel the slope beneath your feet, take a small step downhill, and repeat. Gradient descent does the same with a model: the gradient says which direction increases error, and a learning rate controls the step size.',
    url: 'https://developers.google.com/machine-learning/crash-course/linear-regression/gradient-descent',
  },
  {
    topic: 'Why web browsers use the event loop',
    explanation:
      'JavaScript can run one piece of code at a time, but a browser still needs to wait for network and timer work without freezing the page. The event loop places completed callbacks in a queue and runs them when the current stack is clear, keeping the interface responsive while I/O is pending.',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model',
  },
];

/* ------------------------------------------------------------------ */
/* 1. Today in History                                                */
/* ------------------------------------------------------------------ */

const historyEvents: HistoryEvent[] = [
  {
    date: 'October 5',
    year: 1923,
    title: 'Edwin Hubble discovers Cepheid variable star in Andromeda',
    explanation:
      'Using the 100-inch Hooker Telescope at Mount Wilson Observatory, Edwin Hubble identified a Cepheid variable star (V1) in the Andromeda Nebula. Calculating its distance proved Andromeda was an independent galaxy located far outside our Milky Way.',
    significance:
      'Fundamentally expanded humanity’s conception of the cosmos from a single galaxy to a universe containing billions of galaxies.',
    url: 'https://science.nasa.gov/mission/hubble/science/science-highlights/measuring-the-universe/',
  },
  {
    date: 'September 28',
    year: 1928,
    title: 'Alexander Fleming discovers penicillin',
    explanation:
      'Returning to his London laboratory, biologist Alexander Fleming observed a stray mould (Penicillium notatum) contaminating a Staphylococcus culture dish, producing a bacteria-free halo around itself.',
    significance:
      'Inaugurated the modern antibiotic era, turning previously fatal bacterial infections into curable ailments and saving hundreds of millions of lives.',
    url: 'https://en.wikipedia.org/wiki/Discovery_of_penicillin',
  },
  {
    date: 'July 20',
    year: 1969,
    title: 'Apollo 11 lands humans on the Moon',
    explanation:
      'Astronauts Neil Armstrong and Buzz Aldrin piloted the Lunar Module Eagle to a landing in the Sea of Tranquility, stepping onto lunar soil while Michael Collins orbited overhead in Columbia.',
    significance:
      'Represented the first time in history that human beings traveled to and walked upon another celestial body.',
    url: 'https://www.nasa.gov/mission/apollo-11/',
  },
  {
    date: 'October 29',
    year: 1969,
    title: 'First host-to-host message transmitted on ARPANET',
    explanation:
      'Computer scientists at UCLA sent the first packet-switched message to the Stanford Research Institute. The transmission crashed after the first two letters of "LOGIN", but established the viability of digital packet networks.',
    significance:
      'Created the direct architectural and conceptual ancestor of the modern global Internet.',
    url: 'https://en.wikipedia.org/wiki/ARPANET',
  },
  {
    date: 'July 15',
    year: 1799,
    title: 'Discovery of the Rosetta Stone in Egypt',
    explanation:
      'French engineer Pierre-François Bouchard discovered a granodiorite stele near Rashid (Rosetta) containing the same royal decree written in Ancient Egyptian hieroglyphs, Demotic script, and Ancient Greek.',
    significance:
      'Provided the definitive multilingual key that enabled Jean-François Champollion and Thomas Young to unlock ancient Egyptian language and civilization.',
    url: 'https://www.britishmuseum.org/collection/egypt/rosetta-stone',
  },
  {
    date: 'July 5',
    year: 1687,
    title: 'Isaac Newton publishes the Principia',
    explanation:
      'Newton published Philosophiae Naturalis Principia Mathematica, introducing the three universal laws of motion and the law of universal gravitation.',
    significance:
      'Formed the mathematical foundation of classical mechanics and defined scientific physics for over three hundred years.',
    url: 'https://en.wikipedia.org/wiki/Philosophi%C3%A6_Naturalis_Principia_Mathematica',
  },
  {
    date: 'April 25',
    year: 1953,
    title: 'Structure of DNA published in Nature',
    explanation:
      'James Watson and Francis Crick published the molecular structure of deoxyribonucleic acid (DNA), building upon the crucial X-ray diffraction images (Photo 51) captured by Rosalind Franklin and Raymond Gosling.',
    significance:
      'Revealed the physical basis of heredity and biological information, sparking the modern era of molecular genetics.',
    url: 'https://www.nature.com/articles/171737a0',
  },
  {
    date: 'February 23',
    year: 1455,
    title: 'Johannes Gutenberg completes the Gutenberg Bible',
    explanation:
      'In Mainz, Germany, Gutenberg completed printing the 42-line Latin Bible using movable metal type and oil-based ink.',
    significance:
      'Ignited the European printing revolution, making knowledge widely accessible and democratizing literacy and scientific ideas.',
    url: 'https://en.wikipedia.org/wiki/Gutenberg_Bible',
  },
  {
    date: 'April 12',
    year: 1961,
    title: 'Yuri Gagarin completes first human spaceflight',
    explanation:
      'Aboard Vostok 1, Soviet cosmonaut Yuri Gagarin completed a 108-minute orbital flight around the Earth, becoming the first human in outer space.',
    significance:
      'Demonstrated that human beings could survive and operate in space, opening the era of human spaceflight.',
    url: 'https://en.wikipedia.org/wiki/Vostok_1',
  },
];

/* ------------------------------------------------------------------ */
/* 2. A Few Minutes of Literature                                     */
/* ------------------------------------------------------------------ */

const literatureWorks: LiteratureItem[] = [
  {
    title: 'The Road Not Taken',
    author: 'Robert Frost',
    eraOrCountry: 'American Poetry (1916)',
    format: 'poem',
    passage:
      'Two roads diverged in a yellow wood,\nAnd sorry I could not travel both\nAnd be one traveler, long I stood\nAnd looked down one as far as I could\nTo where it bent in the undergrowth;\n\nI took the one less traveled by,\nAnd that has made all the difference.',
    whyItMatters:
      'A timeless reflection on choice, individuality, and the narratives we build around life’s defining paths.',
    url: 'https://www.poetryfoundation.org/poems/44272/the-road-not-taken',
  },
  {
    title: 'Letters to a Young Poet (Letter Eight)',
    author: 'Rainer Maria Rilke',
    eraOrCountry: 'Austrian Literature (1903)',
    format: 'passage',
    passage:
      'Be patient toward all that is unsolved in your heart and try to love the questions themselves, like locked rooms and like books that are now written in a very foreign tongue. Do not now seek the answers, which cannot be given you because you would not be able to live them. And the point is, to live everything. Live the questions now.',
    whyItMatters:
      'Encourages gentle patience with uncertainty and recognizing that maturity is a process of lived experience.',
    url: 'https://www.gutenberg.org/ebooks/70388',
  },
  {
    title: 'Gitanjali (Song 35)',
    author: 'Rabindranath Tagore',
    eraOrCountry: 'Indian Poetry (1910)',
    format: 'poem',
    passage:
      'Where the mind is without fear and the head is held high;\nWhere knowledge is free;\nWhere the world has not been broken up into fragments by narrow domestic walls;\nWhere words come out from the depth of truth;\nWhere tireless striving stretches its arms towards perfection;\nInto that heaven of freedom, my Father, let my country awake.',
    whyItMatters:
      'A luminous prayer for moral integrity, unchained intellect, and freedom from narrow prejudice.',
    url: 'https://www.nobelprize.org/prizes/literature/1913/tagore/poetry/',
  },
  {
    title: 'Meditations (Book IV, 3)',
    author: 'Marcus Aurelius',
    eraOrCountry: 'Stoic Philosophy (c. 175 CE)',
    format: 'passage',
    passage:
      'Men look for retreats for themselves, the country, the sea-shore, the hills; and you yourself, too, are peculiarly accustomed to long for such things. But this is the very commonest mark of ordinary men, for it is possible to retire into yourself at any hour you wish. For nowhere does a person retire into more quiet or more freedom than into his own soul.',
    whyItMatters:
      'Reminds us that genuine calm and composure are cultivated from within, not found in physical flight.',
    url: 'https://classics.mit.edu/Antoninus/meditations.html',
  },
  {
    title: 'The Prophet: On Work',
    author: 'Kahlil Gibran',
    eraOrCountry: 'Lebanese-American Literature (1923)',
    format: 'passage',
    passage:
      'You have been told also that life is darkness, and in your weariness you echo what was said by the weary. And I say that life is indeed darkness save when there is urge, and all urge is blind save when there is knowledge, and all knowledge is vain save when there is work, and all work is empty save when there is love; and when you work with love you bind yourself to yourself, and to one another, and to God.',
    whyItMatters:
      'Transforms the notion of daily effort into an expression of care, connection, and craft.',
    url: 'https://www.gutenberg.org/ebooks/58585',
  },
  {
    title: 'The Narrow Road to the Deep North',
    author: 'Matsuo Basho',
    eraOrCountry: 'Japanese Haibun (1689)',
    format: 'passage',
    passage:
      'The moon and sun are travelers through eternity. Even the years wander on. Those who steer a boat across the sea or drive a horse over the earth until caught by the weight of time, spend every minute on the road. The journey itself is home.',
    whyItMatters:
      'A serene meditation on impermanence, mindful travel, and the poetry of everyday observation.',
    url: 'https://en.wikipedia.org/wiki/Oku_no_Hosomichi',
  },
  {
    title: 'Walden: Where I Lived, and What I Lived For',
    author: 'Henry David Thoreau',
    eraOrCountry: 'American Philosophy (1854)',
    format: 'passage',
    passage:
      'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear.',
    whyItMatters:
      'An inspiring reminder to protect our attention and focus on what genuinely gives life substance.',
    url: 'https://www.gutenberg.org/ebooks/205',
  },
  {
    title: 'Hope is the thing with feathers',
    author: 'Emily Dickinson',
    eraOrCountry: 'American Poetry (1891)',
    format: 'poem',
    passage:
      '“Hope” is the thing with feathers -\nThat perches in the soul -\nAnd sings the tune without the words -\nAnd never stops - at all -\n\nAnd sweetest - in the Gale - is heard -\nAnd sore must be the storm -\nThat could abash the little Bird\nThat kept so many warm -',
    whyItMatters:
      'A tender yet steadfast portrait of hope as an enduring quiet force within the human spirit.',
    url: 'https://www.poetryfoundation.org/poems/42889/hope-is-the-thing-with-feathers-314',
  },
];

/* ------------------------------------------------------------------ */
/* 3. Brain Sharpener                                                 */
/* ------------------------------------------------------------------ */

const brainSharpeners: BrainSharpener[] = [
  {
    id: 'math-crossing-trains',
    subject: 'mathematics',
    topic: 'Algebra & Relative Motion',
    title: 'The Crossing Trains',
    problem:
      'Two train stations, A and B, are 300 km apart on a straight track. At 9:00 AM, Train 1 departs Station A toward B at 60 km/h. At 10:00 AM, Train 2 departs Station B toward A at 90 km/h. At what time will the two trains pass each other?',
    givenInfo: [
      'Distance between stations = 300 km',
      'Train 1: starts at 9:00 AM at 60 km/h',
      'Train 2: starts at 10:00 AM at 90 km/h',
    ],
    hint: 'Determine Train 1’s position at 10:00 AM. After 10:00 AM, both trains are closing the gap at their combined speed of 150 km/h.',
    solution:
      '1. Between 9:00 AM and 10:00 AM (1 hour), Train 1 travels: 60 km/h × 1 h = 60 km.\n2. Remaining distance between the trains at 10:00 AM: 300 km - 60 km = 240 km.\n3. Combined relative closing speed: 60 km/h + 90 km/h = 150 km/h.\n4. Time needed to meet: t = 240 / 150 = 8/5 hours = 1 hour and 36 minutes.\n5. Crossing time: 10:00 AM + 1 hr 36 min = 11:36 AM.',
    answer: '11:36 AM',
  },
  {
    id: 'physics-free-fall',
    subject: 'physics',
    topic: 'Kinematics & Gravity',
    title: 'The Height of the Bridge',
    problem:
      'A stone is dropped from rest from a bridge into the river below. Exactly 3.0 seconds later, you hear the splash of the stone striking the water. Assuming g = 9.8 m/s² and ignoring sound travel delay, calculate the height of the bridge above the water.',
    givenInfo: [
      'Initial velocity u = 0 m/s',
      'Time of flight t = 3.0 s',
      'Acceleration g = 9.8 m/s²',
      'Kinematic equation: h = ut + ½gt²',
    ],
    hint: 'Since the stone was dropped from rest, u = 0. Calculate h = ½ · g · t².',
    solution:
      '1. Kinematic formula for distance from rest: h = ½ · g · t².\n2. Substitute: h = 0.5 × 9.8 m/s² × (3.0 s)².\n3. h = 4.9 × 9.0 = 44.1 meters.',
    answer: '44.1 meters',
  },
  {
    id: 'math-arithmetic-sum',
    subject: 'mathematics',
    topic: 'Sequences & Patterns',
    title: 'Sum of Consecutive Odd Numbers',
    problem:
      'What is the exact sum of the first 50 positive odd integers: 1 + 3 + 5 + ... + 99?',
    givenInfo: [
      'Sequence: 1, 3, 5, ..., (2n - 1)',
      'Number of terms n = 50',
      'Last term = 2(50) - 1 = 99',
    ],
    hint: 'Notice that 1 = 1², 1 + 3 = 4 = 2², 1 + 3 + 5 = 9 = 3². The sum of the first n odd integers equals n².',
    solution:
      '1. Using arithmetic series formula: Sₙ = n/2 × (first + last) = 50/2 × (1 + 99) = 25 × 100 = 2,500.\n2. Or using the identity for odd integers: Sₙ = n² = 50² = 2,500.',
    answer: '2,500',
  },
  {
    id: 'physics-circuit-current',
    subject: 'physics',
    topic: 'Electricity & Ohm’s Law',
    title: 'Resistors in Series and Parallel',
    problem:
      'A 12V DC power source is connected across a network of three identical 6 Ω resistors. Two of the resistors are connected in parallel with each other, and this parallel pair is connected in series with the third resistor. Calculate the total current supplied by the 12V source.',
    givenInfo: [
      'Voltage V = 12 V',
      'Three resistors: R₁ = 6 Ω, R₂ = 6 Ω, R₃ = 6 Ω',
      'R₂ and R₃ are parallel: R_p = (6 × 6) / (6 + 6) = 3 Ω',
      'Total resistance R_total = R₁ + R_p',
    ],
    hint: 'First find the equivalent resistance of the parallel pair (3 Ω), then add the 6 Ω series resistor. Apply Ohm’s Law I = V / R.',
    solution:
      '1. Equivalent resistance of parallel branch: R_p = (6 × 6)/(6 + 6) = 36/12 = 3 Ω.\n2. Total circuit resistance: R_total = 6 Ω + 3 Ω = 9 Ω.\n3. Using Ohm’s Law: I = V / R_total = 12 V / 9 Ω = 4/3 A ≈ 1.33 A.',
    answer: '4/3 A (or approx. 1.33 Amperes)',
  },
  {
    id: 'math-dice-probability',
    subject: 'mathematics',
    topic: 'Probability & Combinatorics',
    title: 'Sum of Two Dice',
    problem:
      'Two standard fair 6-sided dice are rolled simultaneously. What is the exact probability that the sum of the two numbers rolled is either 7 or 11?',
    givenInfo: [
      'Each die has faces {1, 2, 3, 4, 5, 6}',
      'Total possible outcomes = 6 × 6 = 36',
    ],
    hint: 'Count the distinct pairs (d₁, d₂) that add to 7, and the pairs that add to 11. Divide favorable outcomes by 36.',
    solution:
      '1. Total outcomes = 36.\n2. Pairs summing to 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1) → 6 pairs.\n3. Pairs summing to 11: (5,6), (6,5) → 2 pairs.\n4. Total favorable = 6 + 2 = 8.\n5. Probability = 8 / 36 = 2 / 9 ≈ 22.2%.',
    answer: '2/9 (or approx. 22.2%)',
  },
  {
    id: 'physics-stopping-distance',
    subject: 'physics',
    topic: 'Work & Energy',
    title: 'Braking Distance of a Car',
    problem:
      'A 1,000 kg car is traveling at 20 m/s (72 km/h) on a flat road. The driver brakes, exerting a constant total friction braking force of 5,000 N until the car comes to a stop. Using the work-energy theorem, what is the stopping distance?',
    givenInfo: [
      'Mass m = 1,000 kg',
      'Velocity v = 20 m/s',
      'Braking force F = 5,000 N',
      'Work done by friction = Initial kinetic energy: F · d = ½ m v²',
    ],
    hint: 'Equate the braking work F · d to the car’s kinetic energy ½ m v².',
    solution:
      '1. Kinetic energy KE = ½ · m · v² = 0.5 × 1,000 × (20)² = 200,000 J.\n2. Work done by brakes W = F × d.\n3. 5,000 N × d = 200,000 J.\n4. d = 200,000 / 5,000 = 40 meters.',
    answer: '40 meters',
  },
];

/* ------------------------------------------------------------------ */
/* Daily Editorial Aggregation                                        */
/* ------------------------------------------------------------------ */

export function dailyEditorial(date: string): Pick<
  CuriosityBriefing,
  'book' | 'oneThing' | 'learning' | 'history' | 'literature' | 'sharpener'
> {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const safeDay = Number.isFinite(day) ? Math.abs(day) : 0;

  return {
    book: books[safeDay % books.length],
    oneThing: oneThings[safeDay % oneThings.length],
    learning: lessons[safeDay % lessons.length],
    history: historyEvents[safeDay % historyEvents.length],
    literature: literatureWorks[safeDay % literatureWorks.length],
    sharpener: brainSharpeners[safeDay % brainSharpeners.length],
  };
}
