import type {
  BrainExercise,
  CuriousBriefing,
  HistoryEvent,
  ReadingItem,
} from './types';

/* ================================================================== */
/* A. TODAY IN HISTORY                                                */
/* ================================================================== */

export const HISTORY_EVENTS: HistoryEvent[] = [
  {
    date: 'October 5',
    year: 1923,
    title: 'Edwin Hubble identifies Cepheid variable V1 in Andromeda',
    explanation:
      'Using the 100-inch Hooker Telescope at Mount Wilson, astronomer Edwin Hubble photographed the Andromeda Nebula and identified a pulsating Cepheid variable star. By calculating its distance, he proved Andromeda lay far outside our Milky Way.',
    significance:
      'This single discovery established that the universe contains billions of independent galaxies, expanding humanity’s cosmic perspective forever.',
    url: 'https://science.nasa.gov/mission/hubble/science/science-highlights/measuring-the-universe/',
  },
  {
    date: 'September 28',
    year: 1928,
    title: 'Alexander Fleming discovers penicillin',
    explanation:
      'Returning to his laboratory at St Mary’s Hospital, London, Scottish biologist Alexander Fleming noticed that a stray mould (Penicillium notatum) had contaminated a Staphylococcus culture plate, creating a clear zone where bacteria could not grow.',
    significance:
      'It launched the modern antibiotic era, transforming previously lethal bacterial infections into treatable conditions and saving millions of lives worldwide.',
    url: 'https://en.wikipedia.org/wiki/Discovery_of_penicillin',
  },
  {
    date: 'July 20',
    year: 1969,
    title: 'Apollo 11 lands humans on the Moon',
    explanation:
      'Commander Neil Armstrong and Lunar Module Pilot Buzz Aldrin landed the Apollo Lunar Module Eagle on the Moon’s Sea of Tranquility, while Michael Collins orbited above in Columbia.',
    significance:
      'Marked the first time in human history that our species traveled to and walked upon another celestial body.',
    url: 'https://www.nasa.gov/mission/apollo-11/',
  },
  {
    date: 'October 29',
    year: 1969,
    title: 'The first host-to-host message is sent over ARPANET',
    explanation:
      'Student programmer Charley Kline transmitted the word "LOGIN" from UCLA to the Stanford Research Institute. The system crashed after the letters "L" and "O", but the fundamental concept of packet switching was validated.',
    significance:
      'Formed the foundational infrastructure of the modern global Internet and decentralized digital communication.',
    url: 'https://en.wikipedia.org/wiki/ARPANET',
  },
  {
    date: 'July 15',
    year: 1799,
    title: 'French soldiers discover the Rosetta Stone',
    explanation:
      'During Napoleon’s Egyptian expedition, engineer Pierre-François Bouchard uncovered a granodiorite stele inscribed with a decree in three scripts: Ancient Egyptian hieroglyphs, Demotic, and Ancient Greek.',
    significance:
      'Provided the crucial multilingual key that allowed Jean-François Champollion and Thomas Young to decipher ancient Egyptian hieroglyphs after centuries of obscurity.',
    url: 'https://www.britishmuseum.org/collection/egypt/rosetta-stone',
  },
  {
    date: 'July 5',
    year: 1687,
    title: 'Isaac Newton publishes Philosophiae Naturalis Principia Mathematica',
    explanation:
      'Newton laid out the three universal laws of motion and the law of universal gravitation, deriving Kepler’s laws of planetary motion under a unified mathematical framework.',
    significance:
      'Laid the foundation for classical mechanics and fundamentally shaped the scientific method for the next three centuries.',
    url: 'https://en.wikipedia.org/wiki/Philosophi%C3%A6_Naturalis_Principia_Mathematica',
  },
  {
    date: 'April 12',
    year: 1961,
    title: 'Yuri Gagarin completes the first human spaceflight',
    explanation:
      'Soviet cosmonaut Yuri Gagarin launched aboard the Vostok 1 spacecraft, completing a single 108-minute orbit around Earth before safely ejecting and landing in the Saratov region.',
    significance:
      'Proved that humans can survive, navigate, and perform in microgravity beyond Earth’s atmosphere.',
    url: 'https://en.wikipedia.org/wiki/Vostok_1',
  },
  {
    date: 'April 25',
    year: 1953,
    title: 'The double helix structure of DNA is published in Nature',
    explanation:
      'James Watson and Francis Crick published their structural model of deoxyribonucleic acid (DNA), built upon the crucial X-ray diffraction images (Photo 51) taken by Rosalind Franklin and Raymond Gosling.',
    significance:
      'Unraveled the physical mechanism of heredity and biological information storage, initiating the modern molecular biology revolution.',
    url: 'https://www.nature.com/articles/171737a0',
  },
  {
    date: 'February 23',
    year: 1455,
    title: 'Johannes Gutenberg completes printing the Gutenberg Bible',
    explanation:
      'In Mainz, Germany, Johannes Gutenberg used his movable metal type press and oil-based ink to produce printed copies of the Latin Vulgate Bible.',
    significance:
      'Democratized access to written text, triggered the printing revolution across Europe, and accelerated the spread of literacy, the Renaissance, and the Scientific Revolution.',
    url: 'https://en.wikipedia.org/wiki/Gutenberg_Bible',
  },
  {
    date: 'September 15',
    year: 1835,
    title: 'Charles Darwin arrives at the Galápagos Islands aboard HMS Beagle',
    explanation:
      'During his five-week expedition across the archipelago, the 26-year-old naturalist collected specimens of mockingbirds, finches, tortoises, and flora from distinct islands.',
    significance:
      'The subtle geographic variations between island species became the primary empirical inspiration for the theory of evolution by natural selection.',
    url: 'https://en.wikipedia.org/wiki/Second_voyage_of_HMS_Beagle',
  },
  {
    date: 'November 25',
    year: 1915,
    title: 'Albert Einstein presents the field equations of General Relativity',
    explanation:
      'In a presentation to the Prussian Academy of Sciences, Einstein finalized the field equations that describe gravity not as a conventional force, but as the curvature of four-dimensional spacetime caused by mass and energy.',
    significance:
      'Revolutionized modern astrophysics, predicting gravitational lensing, black holes, gravitational waves, and cosmological expansion.',
    url: 'https://en.wikipedia.org/wiki/General_relativity',
  },
  {
    date: 'December 17',
    year: 1903,
    title: 'The Wright brothers achieve the first powered, controlled airplane flight',
    explanation:
      'At Kill Devil Hills near Kitty Hawk, North Carolina, Orville and Wilbur Wright completed four sustained flights with their engine-powered biplane, the Wright Flyer.',
    significance:
      'Proved that controlled, heavier-than-air powered flight was feasible, transforming human travel, geography, and global commerce.',
    url: 'https://airandspace.si.edu/exhibitions/wright-brothers',
  },
  {
    date: 'December 10',
    year: 1948,
    title: 'The UN General Assembly adopts the Universal Declaration of Human Rights',
    explanation:
      'Meeting in Paris, the United Nations General Assembly adopted Resolution 217 A, establishing 30 articles that define fundamental civil, political, economic, and social rights.',
    significance:
      'Created the first global consensus on the inalienable rights of all human beings, serving as the benchmark for international law.',
    url: 'https://www.un.org/en/about-us/universal-declaration-of-human-rights',
  },
  {
    date: 'August 24',
    year: 79,
    title: 'Mount Vesuvius erupts, preserving Pompeii and Herculaneum',
    explanation:
      'A catastrophic Plinian eruption buried the ancient Roman cities of Pompeii, Herculaneum, and Stabiae under meters of volcanic ash and pumice.',
    significance:
      'Provided an extraordinary archaeological snapshot of daily Roman life, architecture, commerce, and art frozen in time.',
    url: 'https://en.wikipedia.org/wiki/Eruption_of_Mount_Vesuvius_in_79_AD',
  },
  {
    date: 'October 4',
    year: 1957,
    title: 'Sputnik 1 enters low Earth orbit',
    explanation:
      'The Soviet Union launched the world’s first artificial Earth satellite, a 58 cm polished metal sphere that transmitted radio pulses as it orbited Earth every 96.2 minutes.',
    significance:
      'Inaugurated the Space Age, leading directly to satellite communications, Earth observation, and the exploration of the Solar System.',
    url: 'https://en.wikipedia.org/wiki/Sputnik_1',
  },
  {
    date: 'May 29',
    year: 1953,
    title: 'Edmund Hillary and Tenzing Norgay reach the summit of Mount Everest',
    explanation:
      'New Zealander Edmund Hillary and Sherpa mountaineer Tenzing Norgay reached the 8,848-metre summit of Mount Everest via the South Col route.',
    significance:
      'Represented a monumental milestone in human endurance, high-altitude exploration, and mountaineering history.',
    url: 'https://en.wikipedia.org/wiki/1953_British_Mount_Everest_expedition',
  },
  {
    date: 'December 2, 1942',
    year: 1942,
    title: 'Chicago Pile-1 achieves the first self-sustaining nuclear chain reaction',
    explanation:
      'Under the leadership of Enrico Fermi, scientists built a graphite and uranium reactor in a squash court beneath Stagg Field at the University of Chicago and achieved criticality.',
    significance:
      'Demonstrated controlled nuclear fission, opening the era of nuclear energy and nuclear physics.',
    url: 'https://en.wikipedia.org/wiki/Chicago_Pile-1',
  },
  {
    date: 'March 14',
    year: 1879,
    title: 'Albert Einstein is born in Ulm, Germany',
    explanation:
      'The theoretical physicist whose work reshaped modern science was born to Hermann and Pauline Einstein. In 1905, his "Annus Mirabilis" papers introduced the photoelectric effect, Brownian motion, special relativity, and mass-energy equivalence.',
    significance:
      'Einstein’s insights restructured our understanding of space, time, light, matter, and gravity.',
    url: 'https://en.wikipedia.org/wiki/Albert_Einstein',
  },
  {
    date: 'August 12',
    year: 1981,
    title: 'IBM introduces the Personal Computer (Model 5150)',
    explanation:
      'Designed by a team led by Don Estridge in Boca Raton, Florida, the IBM 5150 featured an Intel 8088 processor, Microsoft DOS, and an open hardware architecture.',
    significance:
      'Legitimized personal computers for business and home use, establishing the dominant PC standard worldwide.',
    url: 'https://www.ibm.com/history/pc',
  },
  {
    date: 'January 7',
    year: 1610,
    title: 'Galileo Galilei observes the four largest moons of Jupiter',
    explanation:
      'Using an improved 20x magnification refracting telescope, Galileo observed three small stars near Jupiter that shifted position each night, later discovering a fourth.',
    significance:
      'Provided direct observational proof that celestial bodies can orbit a center other than Earth, dealing a decisive blow to geocentrism.',
    url: 'https://en.wikipedia.org/wiki/Galilean_moons',
  },
  {
    date: 'November 7',
    year: 1867,
    title: 'Marie Skłodowska Curie is born in Warsaw, Poland',
    explanation:
      'Curie conducted pioneering research on radioactivity, isolated polonium and radium, and became the first person to win Nobel Prizes in two different scientific fields (Physics and Chemistry).',
    significance:
      'Her discoveries advanced atomic theory and established modern radiation therapies in oncology.',
    url: 'https://www.nobelprize.org/prizes/physics/1903/marie-curie/biographical/',
  },
  {
    date: 'November 9',
    year: 1989,
    title: 'The Berlin Wall falls',
    explanation:
      'Following mass civil protests across East Germany and a confused press announcement by Günter Schabowski, thousands of East Berliners gathered at border checkpoints and peacefully crossed into West Berlin.',
    significance:
      'Signaled the imminent end of the Cold War and the peaceful reunification of Germany and European borders.',
    url: 'https://en.wikipedia.org/wiki/Fall_of_the_Berlin_Wall',
  },
  {
    date: 'June 6',
    year: 1944,
    title: 'Operation Overlord: Allied forces land in Normandy',
    explanation:
      'More than 156,000 Allied soldiers landed across five beach sectors (Utah, Omaha, Gold, Juno, Sword) in Normandy, France, conducting the largest amphibious invasion in military history.',
    significance:
      'Opened the Western Front in Europe, leading to the liberation of Western Europe and the defeat of Nazi Germany.',
    url: 'https://en.wikipedia.org/wiki/Normandy_landings',
  },
  {
    date: 'March 21',
    year: 1804,
    title: 'The Napoleonic Code is enacted in France',
    explanation:
      'Drafted by a commission of jurists, the French Civil Code established equality before the law, freedom of religion, separation of civil and religious authority, and protection of property rights.',
    significance:
      'Became one of the most influential legal frameworks in modern history, forming the basis of civil law systems across Europe and the Americas.',
    url: 'https://en.wikipedia.org/wiki/Napoleonic_Code',
  },
  {
    date: 'June 15',
    year: 1215,
    title: 'King John of England grants the Magna Carta at Runnymede',
    explanation:
      'English barons compelled King John to accept a charter of rights that protected feudal liberties, limited monarchical taxation, and established the principle that no free person could be punished except through the law of the land.',
    significance:
      'Formed the foundational ancestor of modern constitutional law, due process, and the protection of individual liberties against arbitrary power.',
    url: 'https://www.bl.uk/magna-carta',
  },
];

/* ================================================================== */
/* B. TODAY'S READING                                                 */
/* Curated pool of ~100 major authors across world literature         */
/* ================================================================== */

export const READING_SELECTIONS: ReadingItem[] = [
  {
    title: 'The Road Not Taken',
    author: 'Robert Frost',
    eraOrCountry: 'American Poetry (1916)',
    format: 'poem',
    passage:
      'Two roads diverged in a yellow wood,\nAnd sorry I could not travel both\nAnd be one traveler, long I stood\nAnd looked down one as far as I could\nTo where it bent in the undergrowth;\n\nI took the one less traveled by,\nAnd that has made all the difference.',
    whyItMatters:
      'A timeless reflection on the inevitability of choices, personal agency, and the narratives we build around our life decisions.',
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
      'Encourages embracing uncertainty, patience, and internal growth rather than rushing into premature answers.',
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
      'A profound vision of human dignity, universal reason, continuous striving, and freedom from parochial division.',
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
      'Reminds us that inner calm and equilibrium come from within our own thoughts, not from physical escape.',
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
      'Reflects on work not as mere toil, but as love made visible and an expression of craft.',
    url: 'https://www.gutenberg.org/ebooks/58585',
  },
  {
    title: 'The Death of Ivan Ilyich',
    author: 'Leo Tolstoy',
    eraOrCountry: 'Russian Literature (1886)',
    format: 'excerpt',
    passage:
      'Ivan Ilyich’s life had been most simple and most ordinary and therefore most terrible. He was an official who had dedicated his entire energy to maintaining appearance and propriety, only to ask in his final illness: "What if my whole life has been wrong?"',
    whyItMatters:
      'A searching critique of living on autopilot and conforming to superficial societal expectations.',
    url: 'https://www.gutenberg.org/ebooks/24259',
  },
  {
    title: 'The Narrow Road to the Deep North',
    author: 'Matsuo Basho',
    eraOrCountry: 'Japanese Haibun (1689)',
    format: 'passage',
    passage:
      'The moon and sun are travelers through eternity. Even the years wander on. Those who steer a boat across the sea or drive a horse over the earth until caught by the weight of time, spend every minute on the road. The journey itself is home.',
    whyItMatters:
      'A poetic meditation on impermanence, walking, observation, and finding wonder in simple transient moments.',
    url: 'https://en.wikipedia.org/wiki/Oku_no_Hosomichi',
  },
  {
    title: 'The Garden of Forking Paths',
    author: 'Jorge Luis Borges',
    eraOrCountry: 'Argentine Literature (1941)',
    format: 'passage',
    passage:
      'In all fictional works, each time a man is confronted with several alternatives, he chooses one and eliminates the others; in the fiction of Ts’ui Pên, he chooses simultaneously all of them. He creates, in this way, diverse futures, diverse times which themselves also proliferate and fork.',
    whyItMatters:
      'A pioneering literary exploration of labyrinths, parallel time, quantum possibilities, and choice.',
    url: 'https://en.wikipedia.org/wiki/The_Garden_of_Forking_Paths',
  },
  {
    title: 'To the Lighthouse (Time Passes)',
    author: 'Virginia Woolf',
    eraOrCountry: 'British Modernism (1927)',
    format: 'passage',
    passage:
      'Night after night, summer and winter, the winds crept through the house, whispering, stirring the yellowed letters and the folds of curtains. What power could now prevent the wind from blowing, the night from falling, and the seasons from rolling silently on?',
    whyItMatters:
      'A masterclass in capturing the quiet passage of time, human transience, and the resilience of art.',
    url: 'https://www.gutenberg.org/ebooks/67104',
  },
  {
    title: 'Les Misérables (The Bishop’s Candlesticks)',
    author: 'Victor Hugo',
    eraOrCountry: 'French Literature (1862)',
    format: 'excerpt',
    passage:
      'Jean Valjean, my brother, you belong no longer to evil, but to good. It is your soul that I am buying for you. I withdraw it from dark thoughts and from the spirit of perdition, and I give it to God!',
    whyItMatters:
      'Demonstrates the transformative power of unearned mercy and radical forgiveness in breaking cycles of bitterness.',
    url: 'https://www.gutenberg.org/ebooks/135',
  },
  {
    title: 'Self-Reliance',
    author: 'Ralph Waldo Emerson',
    eraOrCountry: 'American Transcendentalism (1841)',
    format: 'passage',
    passage:
      'Trust thyself: every heart vibrates to that iron string. Accept the place the divine providence has found for you, the society of your contemporaries, the connection of events. Great men have always done so, and confided themselves childlike to the genius of their age.',
    whyItMatters:
      'An enduring call to original thinking, integrity of mind, and resistance to mindless social conformity.',
    url: 'https://www.gutenberg.org/ebooks/16643',
  },
  {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    eraOrCountry: 'English Literature (1813)',
    format: 'excerpt',
    passage:
      'There is a stubbornness about me that never can bear to be frightened at the will of others. My courage always rises with every attempt to intimidate me.',
    whyItMatters:
      'Celebrates moral independence, clear-eyed self-examination, and the courage to think for oneself.',
    url: 'https://www.gutenberg.org/ebooks/1342',
  },
  {
    title: 'Walden: Where I Lived, and What I Lived For',
    author: 'Henry David Thoreau',
    eraOrCountry: 'American Philosophy (1854)',
    format: 'passage',
    passage:
      'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear.',
    whyItMatters:
      'A foundational statement on deliberate living, simplicity, and reclaiming one’s attention from superficial busyness.',
    url: 'https://www.gutenberg.org/ebooks/205',
  },
  {
    title: 'The Myth of Sisyphus',
    author: 'Albert Camus',
    eraOrCountry: 'French Philosophy (1942)',
    format: 'passage',
    passage:
      'The struggle itself toward the heights is enough to fill a man’s heart. One must imagine Sisyphus happy. He knows himself to be the master of his days, pushing the rock with full consciousness of the task.',
    whyItMatters:
      'Finds profound dignity and meaning in deliberate effort and commitment even in an uncertain universe.',
    url: 'https://en.wikipedia.org/wiki/The_Myth_of_Sisyphus',
  },
  {
    title: 'The Nightingale and the Rose',
    author: 'Oscar Wilde',
    eraOrCountry: 'Irish Literature (1888)',
    format: 'excerpt',
    passage:
      'Love is a wonderful thing. It is more precious than emeralds, and dearer than fine opals. Pearls and pomegranates cannot buy it, nor is it set forth in the market-place. It may not be purchased of the merchants, nor can it be weighed out in the balance for gold.',
    whyItMatters:
      'A lyrical fairy tale exploring the tension between genuine idealism, sacrifice, and utilitarian cynicism.',
    url: 'https://www.gutenberg.org/ebooks/773',
  },
  {
    title: 'Song of Myself (Section 1)',
    author: 'Walt Whitman',
    eraOrCountry: 'American Poetry (1855)',
    format: 'poem',
    passage:
      'I celebrate myself, and sing myself,\nAnd what I assume you shall assume,\nFor every atom belonging to me as good belongs to you.\n\nI loafe and invite my soul,\nI lean and loafe at my ease observing a spear of summer grass.',
    whyItMatters:
      'An exuberant celebration of democratic equality, shared humanity, and wonder in everyday nature.',
    url: 'https://www.poetryfoundation.org/poems/45477/song-of-myself-1892-version',
  },
  {
    title: 'Hope is the thing with feathers',
    author: 'Emily Dickinson',
    eraOrCountry: 'American Poetry (1891)',
    format: 'poem',
    passage:
      '“Hope” is the thing with feathers -\nThat perches in the soul -\nAnd sings the tune without the words -\nAnd never stops - at all -\n\nAnd sweetest - in the Gale - is heard -\nAnd sore must be the storm -\nThat could abash the little Bird\nThat kept so many warm -',
    whyItMatters:
      'A gentle yet resilient portrait of hope as an enduring inner quiet strength that demands nothing in return.',
    url: 'https://www.poetryfoundation.org/poems/42889/hope-is-the-thing-with-feathers-314',
  },
  {
    title: 'The Bet',
    author: 'Anton Chekhov',
    eraOrCountry: 'Russian Literature (1889)',
    format: 'excerpt',
    passage:
      'During fifteen years of solitary confinement, the lawyer read books of history, philosophy, science, and languages. In his final note, he wrote: "Your books gave me wisdom. All that the unresting thought of man has created through the ages is compressed into my brain."',
    whyItMatters:
      'A psychological exploration of values, intellectual freedom, and the relative worth of material wealth versus wisdom.',
    url: 'https://www.gutenberg.org/ebooks/13415',
  },
  {
    title: 'The Masque of the Red Death',
    author: 'Edgar Allan Poe',
    eraOrCountry: 'American Gothic (1842)',
    format: 'excerpt',
    passage:
      'And the life of the ebony clock went out with that of the last of the gay. And the flames of the tripods expired. And Darkness and Decay and the Red Death held illimitable dominion over all.',
    whyItMatters:
      'A haunting allegory on the futility of using wealth and walls to insulate oneself from shared human vulnerability.',
    url: 'https://www.gutenberg.org/ebooks/1064',
  },
  {
    title: 'The Odyssey (Book IX: The Wanderings)',
    author: 'Homer',
    eraOrCountry: 'Ancient Greek Epic (c. 8th Century BCE)',
    format: 'passage',
    passage:
      'Endure, my heart; you have endured worse than this. There is a time for many words, and there is also a time for sleep. But let our minds be fixed on home.',
    whyItMatters:
      'The foundational epic of homecoming, resilience, cunning, and perseverance through long trials.',
    url: 'https://classics.mit.edu/Homer/odyssey.html',
  },
  {
    title: 'The Republic: Allegory of the Cave',
    author: 'Plato',
    eraOrCountry: 'Ancient Greek Philosophy (c. 375 BCE)',
    format: 'passage',
    passage:
      'The prisoners in the cave see only the shadows cast on the wall by the fire behind them, and they take these shadows for reality. But when one is freed and climbs into the sunlight, his eyes are at first dazzled; then he sees the true sources of light and forms.',
    whyItMatters:
      'A timeless parable illustrating the journey of education from comfortable illusion to genuine understanding.',
    url: 'https://classics.mit.edu/Plato/republic.html',
  },
  {
    title: 'Divine Comedy: Inferno (Canto XXVI)',
    author: 'Dante Alighieri',
    eraOrCountry: 'Italian Epic Poetry (c. 1320)',
    format: 'passage',
    passage:
      'Consider your origin: you were not made that you might live as brutes, but to pursue virtue and knowledge. (Fatti non foste a viver come bruti, ma per seguir virtute e canoscenza.)',
    whyItMatters:
      'Ulixes’ passionate exhortation reminds us of humanity’s noble calling to seek understanding and moral purpose.',
    url: 'https://www.gutenberg.org/ebooks/8800',
  },
  {
    title: 'The Masnavi (The Guest House)',
    author: 'Rumi',
    eraOrCountry: 'Persian Poetry (13th Century)',
    format: 'poem',
    passage:
      'This being human is a guest house.\nEvery morning a new arrival.\nA joy, a depression, a meanness,\nsome momentary awareness comes\nas an unexpected visitor.\nWelcome and entertain them all!',
    whyItMatters:
      'An exquisite spiritual poem teaching hospitality toward all emotions and life circumstances.',
    url: 'https://en.wikipedia.org/wiki/Masnavi',
  },
  {
    title: 'Essays (On Experience)',
    author: 'Michel de Montaigne',
    eraOrCountry: 'French Renaissance Philosophy (1580)',
    format: 'passage',
    passage:
      'It is an absolute perfection, and as it were divine for a man to know how to enjoy his being loyally. We seek other conditions because we do not understand the use of our own, and go out of ourselves because we know not what it is within.',
    whyItMatters:
      'Pioneered the personal essay as an honest, compassionate inquiry into human nature and the art of living.',
    url: 'https://www.gutenberg.org/ebooks/3600',
  },
  {
    title: 'Faust: Part One',
    author: 'Johann Wolfgang von Goethe',
    eraOrCountry: 'German Literature (1808)',
    format: 'passage',
    passage:
      'He who strives with all his power, we can redeem and save. Whatever you can do, or dream you can, begin it. Boldness has genius, power and magic in it.',
    whyItMatters:
      'Celebrates active striving, continuous intellectual seeking, and decisive initiative.',
    url: 'https://www.gutenberg.org/ebooks/14591',
  },
];

/* ================================================================== */
/* C. BRAIN EXERCISES                                                 */
/* Alternating naturally between Mathematics and Physics              */
/* ================================================================== */

export const BRAIN_EXERCISES: BrainExercise[] = [
  {
    id: 'math-crossing-trains',
    subject: 'mathematics',
    topic: 'Algebra & Relative Speed',
    title: 'The Two Crossing Trains',
    problem:
      'Two train stations, A and B, are 300 km apart on a straight track. At 9:00 AM, Train 1 departs Station A heading toward B at a constant speed of 60 km/h. At 10:00 AM, Train 2 departs Station B heading toward A at a constant speed of 90 km/h. At what time will the two trains cross each other?',
    givenInfo: [
      'Total distance = 300 km',
      'Train 1: starts at 9:00 AM at 60 km/h',
      'Train 2: starts at 10:00 AM at 90 km/h',
    ],
    hint: 'Calculate where Train 1 is at 10:00 AM. After 10:00 AM, both trains are closing the remaining distance at their combined relative speed (60 + 90 = 150 km/h).',
    solution:
      '1. In the first hour (9:00 AM to 10:00 AM), Train 1 travels: 60 km/h × 1 h = 60 km.\n2. Remaining distance between the trains at 10:00 AM = 300 km - 60 km = 240 km.\n3. After 10:00 AM, their relative closing speed is: 60 km/h + 90 km/h = 150 km/h.\n4. Time to meet after 10:00 AM: t = 240 / 150 = 8 / 5 hours = 1 hour and 36 minutes.\n5. Meeting time: 10:00 AM + 1 hr 36 min = 11:36 AM.',
    answer: '11:36 AM (or 2 hours and 36 minutes after Station A departure)',
  },
  {
    id: 'physics-free-fall',
    subject: 'physics',
    topic: 'Kinematics & Gravity',
    title: 'The Stone Dropped from the Bridge',
    problem:
      'A stone is dropped from rest from the top of a high suspension bridge into the river below. Exactly 3.0 seconds later, you hear the splash of the stone hitting the water. Assuming acceleration due to gravity is g = 9.8 m/s² and neglecting the travel time of sound, calculate the height of the bridge above the water.',
    givenInfo: [
      'Initial velocity u = 0 m/s',
      'Time of fall t = 3.0 s',
      'Acceleration g = 9.8 m/s²',
      'Kinematic formula: h = ut + ½gt²',
    ],
    hint: 'Since the stone was dropped from rest, the initial velocity is zero. Substitute t = 3.0 s directly into h = ½ g t².',
    solution:
      '1. Using the displacement equation for free fall: h = u·t + ½·g·t².\n2. Since the stone is dropped from rest, u = 0.\n3. h = ½ × 9.8 m/s² × (3.0 s)².\n4. h = 4.9 × 9.0 = 44.1 meters.',
    answer: '44.1 meters',
  },
  {
    id: 'math-arithmetic-sequence',
    subject: 'mathematics',
    topic: 'Sequences & Sums',
    title: 'Sum of Consecutive Odd Numbers',
    problem:
      'What is the sum of the first 50 positive odd integers (1 + 3 + 5 + ... + 99)? Can you derive the general formula for the sum of the first n odd numbers using a geometric visualization or algebraic identity?',
    givenInfo: [
      'First term a₁ = 1',
      'Common difference d = 2',
      'Number of terms n = 50',
      'nth term a₅₀ = 2(50) - 1 = 99',
    ],
    hint: 'Notice that 1 = 1², 1 + 3 = 4 = 2², 1 + 3 + 5 = 9 = 3². The sum of the first n odd integers forms a square of dimension n × n.',
    solution:
      '1. Using the arithmetic series sum formula: Sₙ = n/2 × (first_term + last_term).\n2. S₅₀ = 50/2 × (1 + 99) = 25 × 100 = 2,500.\n3. General identity: The sum of the first n odd integers is always exactly n².\n4. For n = 50: 50² = 2,500.',
    answer: '2,500 (Formula: Sₙ = n²)',
  },
  {
    id: 'physics-circuit-power',
    subject: 'physics',
    topic: 'Electricity & Circuits',
    title: 'Resistors in Series and Parallel',
    problem:
      'A 12V DC power supply is connected across a network of three identical resistors, each with resistance R = 6 Ω. Two of the resistors are connected in parallel with each other, and this combination is connected in series with the third resistor. Calculate the total current drawn from the 12V power supply.',
    givenInfo: [
      'Voltage V = 12 V',
      'R₁ = 6 Ω, R₂ = 6 Ω, R₃ = 6 Ω',
      'R₂ and R₃ are in parallel: R_parallel = (R × R) / (R + R)',
      'Total equivalent resistance R_total = R₁ + R_parallel',
      'Ohm’s Law: I = V / R_total',
    ],
    hint: 'First find the equivalent resistance of the two 6 Ω resistors in parallel (which equals 3 Ω). Then add the third 6 Ω series resistor.',
    solution:
      '1. Parallel branch: R_parallel = (6 × 6) / (6 + 6) = 36 / 12 = 3 Ω.\n2. Total equivalent resistance: R_total = 6 Ω + 3 Ω = 9 Ω.\n3. Using Ohm’s Law: I = V / R_total = 12 V / 9 Ω = 4/3 A ≈ 1.33 A.',
    answer: '4/3 A (or 1.33 Amperes)',
  },
  {
    id: 'math-probability-dice',
    subject: 'mathematics',
    topic: 'Probability & Combinatorics',
    title: 'Rolling a Sum of 7 or 11',
    problem:
      'Two standard fair 6-sided dice are rolled simultaneously. What is the exact probability that the sum of the numbers showing on top is either 7 or 11?',
    givenInfo: [
      'Each die has faces {1, 2, 3, 4, 5, 6}',
      'Total possible outcomes = 6 × 6 = 36 equally likely pairs',
    ],
    hint: 'List all distinct pairs (d₁, d₂) that sum to 7 and all pairs that sum to 11. Count the favorable pairs and divide by 36.',
    solution:
      '1. Total outcomes = 6 × 6 = 36.\n2. Pairs summing to 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1) → 6 pairs.\n3. Pairs summing to 11: (5,6), (6,5) → 2 pairs.\n4. Total favorable outcomes = 6 + 2 = 8.\n5. Probability = 8 / 36 = 2 / 9 ≈ 0.222 (22.2%).',
    answer: '2/9 (or approx. 22.2%)',
  },
  {
    id: 'physics-work-energy',
    subject: 'physics',
    topic: 'Work & Kinetic Energy',
    title: 'Stopping Distance of a Car',
    problem:
      'A car of mass 1,000 kg is traveling on a level road at 20 m/s (72 km/h). The driver applies the brakes, creating a constant total braking friction force of 5,000 N until the car comes to a complete stop. Using the work-energy theorem (or kinematics), calculate the stopping distance.',
    givenInfo: [
      'Mass m = 1,000 kg',
      'Initial velocity v = 20 m/s',
      'Final velocity = 0 m/s',
      'Braking force F = 5,000 N',
      'Work-Energy Theorem: Work done by friction = ΔKE = ½ m v²',
    ],
    hint: 'The kinetic energy of the car is completely dissipated as work done by the braking force: F × d = ½ m v².',
    solution:
      '1. Initial kinetic energy: KE = ½ × m × v² = 0.5 × 1,000 kg × (20 m/s)² = 200,000 J (200 kJ).\n2. Work done by braking friction: W = F × d.\n3. Equating work to kinetic energy: 5,000 N × d = 200,000 J.\n4. d = 200,000 / 5,000 = 40 meters.',
    answer: '40 meters',
  },
  {
    id: 'math-geometry-hypotenuse',
    subject: 'mathematics',
    topic: 'Geometry & Right Triangles',
    title: 'The Inscribed Circle in a Right Triangle',
    problem:
      'A right-angled triangle has side lengths of a = 6 cm and b = 8 cm. What is the radius of the circle inscribed inside this triangle (the incircle)?',
    givenInfo: [
      'Side a = 6 cm, Side b = 8 cm',
      'Hypotenuse c = √(a² + b²) = √(36 + 64) = 10 cm',
      'Inradius formula for right triangle: r = (a + b - c) / 2',
      'Or using area & semiperimeter: r = Area / s, where s = (a + b + c)/2',
    ],
    hint: 'First find the hypotenuse c using the Pythagorean theorem (6-8-10). Then use the inradius formula r = (a + b - c)/2.',
    solution:
      '1. Hypotenuse c = √(6² + 8²) = 10 cm.\n2. Area of triangle = ½ × 6 × 8 = 24 cm².\n3. Semiperimeter s = (6 + 8 + 10) / 2 = 12 cm.\n4. Inradius r = Area / s = 24 / 12 = 2 cm.\n5. (Direct formula: r = (6 + 8 - 10)/2 = 4/2 = 2 cm).',
    answer: '2 cm',
  },
  {
    id: 'physics-pendulum-period',
    subject: 'physics',
    topic: 'Harmonic Motion',
    title: 'The Period of a Simple Pendulum',
    problem:
      'A grandfather clock relies on a simple pendulum. If you want the pendulum to have a period of exactly T = 2.0 seconds (taking 1.0 second to swing from one extreme to the other), what length L must the pendulum string be? Use g = 9.80 m/s² and π ≈ 3.1416.',
    givenInfo: [
      'Period T = 2.0 s',
      'Formula for simple pendulum: T = 2π √(L / g)',
      'g = 9.80 m/s²',
    ],
    hint: 'Rearrange T = 2π √(L/g) for L: L = g × (T / 2π)² = g × T² / (4π²).',
    solution:
      '1. T = 2π √(L/g)  =>  T / (2π) = √(L/g).\n2. (T / 2π)² = L / g  =>  L = g · T² / (4π²).\n3. Substitute values: L = 9.80 × (2.0)² / (4 × 3.14159²).\n4. L = 9.80 × 4 / (4 × 9.8696) = 9.80 / 9.8696 ≈ 0.993 meters (99.3 cm).',
    answer: '0.993 meters (or 99.3 cm)',
  },
];

/* ================================================================== */
/* Deterministic Briefing Selector                                    */
/* ================================================================== */

export function dailyCuriousEditorial(date: string): CuriousBriefing {
  const [year, month, day] = date.split('-').map(Number);
  const epochDays = Math.floor(
    Date.UTC(year || 2026, (month || 1) - 1, day || 1) / 86_400_000,
  );

  const historyIndex =
    ((epochDays % HISTORY_EVENTS.length) + HISTORY_EVENTS.length) %
    HISTORY_EVENTS.length;
  const readingIndex =
    ((epochDays % READING_SELECTIONS.length) + READING_SELECTIONS.length) %
    READING_SELECTIONS.length;
  const exerciseIndex =
    ((epochDays % BRAIN_EXERCISES.length) + BRAIN_EXERCISES.length) %
    BRAIN_EXERCISES.length;

  return {
    date,
    history: HISTORY_EVENTS[historyIndex],
    reading: READING_SELECTIONS[readingIndex],
    exercise: BRAIN_EXERCISES[exerciseIndex],
  };
}
