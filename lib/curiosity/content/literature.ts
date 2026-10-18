import type { CuriosityPoolEntry, LiteratureItem } from '../types';

/**
 * A Few Minutes of Literature — the daily pool.
 *
 * Twenty-four works, each a short quotation chosen so that it can be read in
 * under a minute and still carry the shape of the thing it comes from.
 *
 * Copyright discipline is the point of this file rather than an afterthought.
 * Every passage is either out of copyright in the source language and in the
 * translation quoted, or is a single line quoted for comment. The two entries
 * that quote a modern translation keep the "brief excerpt for commentary" note
 * that the original card carried. Every entry links to a copy of the full work
 * so a reader who likes the four lines can read the book.
 */
export const literaturePool: CuriosityPoolEntry<LiteratureItem>[] = [
  {
    id: 'lit-frost-road-not-taken',
    category: 'literature',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['poem', 'english'],
    source: { url: 'https://www.poetryfoundation.org/poems/44272/the-road-not-taken', name: 'Poetry Foundation' },
    item: {
      title: 'The Road Not Taken',
      author: 'Robert Frost',
      eraOrCountry: 'American Poetry (1916)',
      format: 'poem',
      passage:
        'Two roads diverged in a yellow wood,\nAnd sorry I could not travel both\nAnd be one traveler, long I stood\nAnd looked down one as far as I could\nTo where it bent in the undergrowth;\n[…]\nI took the one less traveled by,\nAnd that has made all the difference.',
      whyItMatters:
        'A timeless reflection on choice, individuality, and the narratives we build around life’s defining paths.',
      url: 'https://www.poetryfoundation.org/poems/44272/the-road-not-taken',
      sourceName: 'Poetry Foundation',
    },
  },
  {
    id: 'lit-rilke-letter-four',
    category: 'literature',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['letter', 'translation'],
    source: { url: 'https://www.poetryintranslation.com/PITBR/German/RilkeLetters.php', name: 'Poetry in Translation (Ian Johnston)' },
    item: {
      title: 'Letters to a Young Poet (Letter Four)',
      author: 'Rainer Maria Rilke',
      eraOrCountry: 'Austrian Literature (1903)',
      format: 'passage',
      passage: 'Live the questions now.',
      attribution: 'Brief excerpt from Letter IV of 1903, in the translation by Ian Johnston.',
      whyItMatters:
        'Encourages gentle patience with uncertainty and recognizing that maturity is a process of lived experience.',
      url: 'https://www.poetryintranslation.com/PITBR/German/RilkeLetters.php',
      sourceName: 'Poetry in Translation',
    },
  },
  {
    id: 'lit-tagore-gitanjali-35',
    category: 'literature',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['poem', 'india', 'translation'],
    source: { url: 'https://www.gutenberg.org/ebooks/7164', name: 'Project Gutenberg · Gitanjali' },
    item: {
      title: 'Gitanjali (Song 35)',
      author: 'Rabindranath Tagore',
      eraOrCountry: 'Indian Poetry (1910)',
      format: 'poem',
      passage:
        'Where the mind is without fear and the head is held high;\nWhere knowledge is free;\nWhere the world has not been broken up into fragments by narrow domestic walls;\nWhere words come out from the depth of truth;\nWhere tireless striving stretches its arms towards perfection;\n[…]\nInto that heaven of freedom, my Father, let my country awake.',
      whyItMatters:
        'A luminous prayer for moral integrity, unchained intellect, and freedom from narrow prejudice.',
      url: 'https://www.gutenberg.org/ebooks/7164',
      sourceName: 'Nobel Prize',
    },
  },
  {
    id: 'lit-marcus-aurelius-book4',
    category: 'literature',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['philosophy', 'translation'],
    source: { url: 'https://classics.mit.edu/Antoninus/meditations.4.four.html', name: 'MIT Classics' },
    item: {
      title: 'Meditations (Book IV, 3)',
      author: 'Marcus Aurelius',
      eraOrCountry: 'Stoic Philosophy (c. 175 CE)',
      format: 'passage',
      passage:
        'Men seek retreats for themselves, houses in the country, sea-shores, and mountains; and thou too art wont to desire such things very much. But this is altogether a mark of the most common sort of men, for it is in thy power whenever thou shalt choose to retire into thyself.',
      attribution: 'Book IV, section 3; public-domain translation by George Long.',
      whyItMatters:
        'Reminds us that genuine calm and composure are cultivated from within, not found in physical flight.',
      url: 'https://classics.mit.edu/Antoninus/meditations.4.four.html',
      sourceName: 'MIT Classics',
    },
  },
  {
    id: 'lit-gibran-on-work',
    category: 'literature',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['prose-poem', 'translation'],
    source: { url: 'https://www.gutenberg.org/ebooks/58585', name: 'Project Gutenberg' },
    item: {
      title: 'The Prophet: On Work',
      author: 'Kahlil Gibran',
      eraOrCountry: 'Lebanese-American Literature (1923)',
      format: 'passage',
      passage:
        'You have been told also that life is darkness, and in your weariness you echo what was said by the weary. And I say that life is indeed darkness save when there is urge, and all urge is blind save when there is knowledge, and all knowledge is vain save when there is work, and all work is empty save when there is love; and when you work with love you bind yourself to yourself, and to one another, and to God.',
      whyItMatters:
        'Transforms the notion of daily effort into an expression of care, connection, and craft.',
      url: 'https://www.gutenberg.org/ebooks/58585',
      sourceName: 'Project Gutenberg',
    },
  },
  {
    id: 'lit-basho-narrow-road',
    category: 'literature',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['haibun', 'japan', 'translation'],
    source: { url: 'https://en.wikipedia.org/wiki/Oku_no_Hosomichi', name: 'Wikipedia · Oku no Hosomichi', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'The Narrow Road to the Deep North',
      author: 'Matsuo Basho',
      eraOrCountry: 'Japanese Haibun (1689)',
      format: 'passage',
      passage: 'Every day is a journey, and the journey itself is home.',
      attribution: 'Brief excerpt; translated by Sam Hamill.',
      whyItMatters:
        'A serene meditation on impermanence, mindful travel, and the poetry of everyday observation.',
      url: 'https://en.wikipedia.org/wiki/Oku_no_Hosomichi',
      sourceName: 'Wikipedia · Oku no Hosomichi',
    },
  },
  {
    id: 'lit-thoreau-walden',
    category: 'literature',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['essay', 'american-renaissance'],
    source: { url: 'https://www.gutenberg.org/ebooks/205', name: 'Project Gutenberg' },
    item: {
      title: 'Walden: Where I Lived, and What I Lived For',
      author: 'Henry David Thoreau',
      eraOrCountry: 'American Philosophy (1854)',
      format: 'passage',
      passage:
        'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear.',
      whyItMatters:
        'An inspiring reminder to protect our attention and focus on what genuinely gives life substance.',
      url: 'https://www.gutenberg.org/ebooks/205',
      sourceName: 'Project Gutenberg',
    },
  },
  {
    id: 'lit-dickinson-hope-feathers',
    category: 'literature',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['poem', 'american'],
    source: { url: 'https://www.poetryfoundation.org/poems/42889/hope-is-the-thing-with-feathers-314', name: 'Poetry Foundation' },
    item: {
      title: 'Hope is the thing with feathers',
      author: 'Emily Dickinson',
      eraOrCountry: 'American Poetry (1891)',
      format: 'poem',
      passage:
        '“Hope” is the thing with feathers -\nThat perches in the soul -\nAnd sings the tune without the words -\nAnd never stops - at all -\n\nAnd sweetest - in the Gale - is heard -\nAnd sore must be the storm -\nThat could abash the little Bird\nThat kept so many warm -',
      whyItMatters:
        'A tender yet steadfast portrait of hope as an enduring quiet force within the human spirit.',
      url: 'https://www.poetryfoundation.org/poems/42889/hope-is-the-thing-with-feathers-314',
      sourceName: 'Poetry Foundation',
    },
  },
  {
    id: 'lit-shelley-ozymandias',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['poem', 'romantic'],
    source: { url: 'https://en.wikipedia.org/wiki/Ozymandias_(sonnet)', name: 'Wikipedia · Ozymandias (sonnet)', attribution: 'The sonnet itself is public domain.' },
    item: {
      title: 'Ozymandias',
      author: 'Percy Bysshe Shelley',
      eraOrCountry: 'English Romanticism (1818)',
      format: 'poem',
      passage:
        '“My name is Ozymandias, King of Kings;\nLook on my Works, ye Mighty, and despair!”\nNothing beside remains. Round the decay\nOf that colossal Wreck, boundless and bare\nThe lone and level sands stretch far away.',
      attribution: 'Final quatrain; first published in The Examiner, 11 January 1818.',
      whyItMatters:
        'Four lines that undo an empire. It is the shortest argument against taking any monument — including your own work — as permanent.',
      url: 'https://en.wikipedia.org/wiki/Ozymandias_(sonnet)',
      sourceName: 'Wikipedia · Ozymandias (sonnet)',
    },
  },
  {
    id: 'lit-blake-tyger',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['poem', 'romantic'],
    source: { url: 'https://en.wikipedia.org/wiki/The_Tyger', name: 'Wikipedia · The Tyger', attribution: 'The poem itself is public domain.' },
    item: {
      title: 'The Tyger',
      author: 'William Blake',
      eraOrCountry: 'English Romanticism (1794)',
      format: 'poem',
      passage:
        'Tyger Tyger, burning bright,\nIn the forests of the night;\nWhat immortal hand or eye,\nCould frame thy fearful symmetry?',
      attribution: 'Opening stanza, Songs of Innocence and of Experience (1794).',
      whyItMatters:
        'A poem made of questions that never resolve. Its subject is the maker rather than the tiger, and it leaves the accusation standing.',
      url: 'https://en.wikipedia.org/wiki/The_Tyger',
      sourceName: 'Wikipedia · The Tyger',
    },
  },
  {
    id: 'lit-keats-grecian-urn',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['poem', 'romantic'],
    source: { url: 'https://en.wikipedia.org/wiki/Ode_on_a_Grecian_Urn', name: 'Wikipedia · Ode on a Grecian Urn', attribution: 'The ode itself is public domain.' },
    item: {
      title: 'Ode on a Grecian Urn',
      author: 'John Keats',
      eraOrCountry: 'English Romanticism (1819)',
      format: 'poem',
      passage:
        '“Beauty is truth, truth beauty” — that is all\nYe know on earth, and all ye need to know.',
      attribution: 'Closing couplet; first published in Annals of the Fine Arts, 1819.',
      whyItMatters:
        'Keats wrote it at twenty-five and died at twenty-six. The couplet has been argued about for two centuries, which is arguably the point of it.',
      url: 'https://en.wikipedia.org/wiki/Ode_on_a_Grecian_Urn',
      sourceName: 'Wikipedia · Ode on a Grecian Urn',
    },
  },
  {
    id: 'lit-coleridge-kubla-khan',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['poem', 'romantic'],
    source: { url: 'https://en.wikipedia.org/wiki/Kubla_Khan', name: 'Wikipedia · Kubla Khan', attribution: 'The poem itself is public domain.' },
    item: {
      title: 'Kubla Khan',
      author: 'Samuel Taylor Coleridge',
      eraOrCountry: 'English Romanticism (1816)',
      format: 'poem',
      passage:
        'In Xanadu did Kubla Khan\nA stately pleasure-dome decree:\nWhere Alph, the sacred river, ran\nThrough caverns measureless to man\nDown to a sunless sea.',
      attribution: 'Opening lines; Coleridge claimed the poem came to him in an opium dream and was interrupted before it was finished.',
      whyItMatters:
        'A famous fragment about the interruption of making — which is why it still reads as an honest account of how ideas break off.',
      url: 'https://en.wikipedia.org/wiki/Kubla_Khan',
      sourceName: 'Wikipedia · Kubla Khan',
    },
  },
  {
    id: 'lit-henley-invictus',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['poem', 'victorian'],
    source: { url: 'https://en.wikipedia.org/wiki/Invictus', name: 'Wikipedia · Invictus', attribution: 'The poem itself is public domain.' },
    item: {
      title: 'Invictus',
      author: 'William Ernest Henley',
      eraOrCountry: 'Victorian Poetry (1888)',
      format: 'poem',
      passage:
        'It matters not how strait the gate,\nHow charged with punishments the scroll,\nI am the master of my fate:\nI am the captain of my soul.',
      attribution: 'Final stanza; Henley wrote the poem while hospitalised after the amputation of a leg, and it was published in 1888.',
      whyItMatters:
        'Stoicism in a hospital bed rather than a lecture hall. Its force comes from the circumstances, not the rhetoric.',
      url: 'https://en.wikipedia.org/wiki/Invictus',
      sourceName: 'Wikipedia · Invictus',
    },
  },
  {
    id: 'lit-tennyson-ulysses',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['poem', 'victorian'],
    source: { url: 'https://en.wikipedia.org/wiki/Ulysses_(poem)', name: 'Wikipedia · Ulysses (Tennyson poem)', attribution: 'The poem itself is public domain.' },
    item: {
      title: 'Ulysses',
      author: 'Alfred, Lord Tennyson',
      eraOrCountry: 'Victorian Poetry (1842)',
      format: 'poem',
      passage:
        'We are not now that strength which in old days\nMoved earth and heaven, that which we are, we are,\nOne equal temper of heroic hearts,\nMade weak by time and fate, but strong in will\nTo strive, to seek, to find, and not to yield.',
      attribution: 'Closing lines of the dramatic monologue; Tennyson wrote the poem soon after the death of his friend Arthur Hallam.',
      whyItMatters:
        'An old king refusing a comfortable retirement. The final line is quoted on war memorials and on boathouses, and it still works as a plan for the second half of any life.',
      url: 'https://en.wikipedia.org/wiki/Ulysses_(poem)',
      sourceName: 'Wikipedia · Ulysses (poem)',
    },
  },
  {
    id: 'lit-poe-raven',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['poem', 'american'],
    source: { url: 'https://en.wikipedia.org/wiki/The_Raven', name: 'Wikipedia · The Raven', attribution: 'The poem itself is public domain.' },
    item: {
      title: 'The Raven',
      author: 'Edgar Allan Poe',
      eraOrCountry: 'American Gothic (1845)',
      format: 'poem',
      passage:
        'Once upon a midnight dreary, while I pondered, weak and weary,\nOver many a quaint and curious volume of forgotten lore—\nWhile I nodded, nearly napping, suddenly there came a tapping,\nAs of some one gently rapping, rapping at my chamber door.\n“’Tis some visitor,” I muttered, “tapping at my chamber door—\nOnly this and nothing more.”',
      attribution: 'Opening stanza.',
      whyItMatters:
        'Poe published an essay on the poem’s construction claiming it was built methodically for a single effect — an early, instructive argument that craft can be deliberate.',
      url: 'https://en.wikipedia.org/wiki/The_Raven',
      sourceName: 'Wikipedia · The Raven',
    },
  },
  {
    id: 'lit-milton-paradise-lost',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['epic', 'english-civil-war'],
    source: { url: 'https://en.wikipedia.org/wiki/Paradise_Lost', name: 'Wikipedia · Paradise Lost', attribution: 'The poem is public domain.' },
    item: {
      title: 'Paradise Lost (Book I)',
      author: 'John Milton',
      eraOrCountry: 'English Epic (1667)',
      format: 'passage',
      passage:
        'The mind is its own place, and in itself\nCan make a Heav’n of Hell, a Hell of Heav’n.',
      attribution: 'Spoken by Satan, Book I; dictation is how Milton composed after he became blind.',
      whyItMatters:
        'Two lines that make the inside of a head the most consequential setting in English epic poetry.',
      url: 'https://en.wikipedia.org/wiki/Paradise_Lost',
      sourceName: 'Wikipedia · Paradise Lost',
    },
  },
  {
    id: 'lit-shakespeare-hamlet',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['drama', 'elizabethan'],
    source: { url: 'https://en.wikipedia.org/wiki/Hamlet', name: 'Wikipedia · Hamlet', attribution: 'The play is public domain.' },
    item: {
      title: 'Hamlet (Act I, Scene 3)',
      author: 'William Shakespeare',
      eraOrCountry: 'Elizabethan Drama (c. 1600)',
      format: 'passage',
      passage:
        'This above all: to thine own self be true,\nAnd it must follow, as the night the day,\nThou canst not then be false to any man.',
      attribution: 'Polonius to Laertes. The advice is given by one of the play’s less reliable speakers, which is part of its charm.',
      whyItMatters:
        'A slogan about authenticity that Shakespeare put in the mouth of a busybody — an early lesson in reading who says a thing, not only what.',
      url: 'https://en.wikipedia.org/wiki/Hamlet',
      sourceName: 'Wikipedia · Hamlet',
    },
  },
  {
    id: 'lit-whitman-song-of-myself',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['poem', 'american'],
    source: { url: 'https://en.wikipedia.org/wiki/Leaves_of_Grass', name: 'Wikipedia · Leaves of Grass', attribution: 'The poem is public domain.' },
    item: {
      title: 'Song of Myself',
      author: 'Walt Whitman',
      eraOrCountry: 'American Poetry (1855)',
      format: 'poem',
      passage:
        'I celebrate myself, and sing myself,\nAnd what I assume you shall assume,\nFor every atom belonging to me as good belongs to you.',
      attribution: 'Opening lines of the 1855 edition, which Whitman printed and set himself.',
      whyItMatters:
        'A declaration that turns immediately into an invitation — the self only as a way of reaching everyone else.',
      url: 'https://en.wikipedia.org/wiki/Leaves_of_Grass',
      sourceName: 'Wikipedia · Leaves of Grass',
    },
  },
  {
    id: 'lit-austen-pride-prejudice',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['novel', 'regency'],
    source: { url: 'https://www.gutenberg.org/ebooks/1342', name: 'Project Gutenberg · Pride and Prejudice' },
    item: {
      title: 'Pride and Prejudice (Chapter 1)',
      author: 'Jane Austen',
      eraOrCountry: 'English Novel (1813)',
      format: 'passage',
      passage:
        'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
      attribution: 'The novel’s first sentence.',
      whyItMatters:
        'One sentence that tells you the narrator is ironic before a character has spoken. It is the clearest short lesson in voice there is.',
      url: 'https://www.gutenberg.org/ebooks/1342',
      sourceName: 'Project Gutenberg · Pride and Prejudice',
    },
  },
  {
    id: 'lit-dickens-tale-two-cities',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['novel', 'victorian'],
    source: { url: 'https://www.gutenberg.org/ebooks/98', name: 'Project Gutenberg · A Tale of Two Cities' },
    item: {
      title: 'A Tale of Two Cities (Book the First)',
      author: 'Charles Dickens',
      eraOrCountry: 'Victorian Novel (1859)',
      format: 'passage',
      passage:
        'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity…',
      attribution: 'Opening paragraph.',
      whyItMatters:
        'The pair-by-pair structure holds two opposite readings of the same era in one breath — a useful habit when a period feels both excellent and terrible.',
      url: 'https://www.gutenberg.org/ebooks/98',
      sourceName: 'Project Gutenberg · A Tale of Two Cities',
    },
  },
  {
    id: 'lit-shelley-frankenstein',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['novel', 'gothic', 'science'],
    source: { url: 'https://www.gutenberg.org/ebooks/84', name: 'Project Gutenberg · Frankenstein' },
    item: {
      title: 'Frankenstein; or, The Modern Prometheus',
      author: 'Mary Shelley',
      eraOrCountry: 'English Novel (1818)',
      format: 'passage',
      passage: 'Nothing is so painful to the human mind as a great and sudden change.',
      attribution: 'From the 1818 text; Shelley began the story as a teenager at a competition for ghost stories.',
      whyItMatters:
        'The first great novel about a maker who will not take responsibility for what he made — a question any builder of tools still recognises.',
      url: 'https://www.gutenberg.org/ebooks/84',
      sourceName: 'Project Gutenberg · Frankenstein',
    },
  },
  {
    id: 'lit-doyle-scandal-bohemia',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['short story', 'detective'],
    source: { url: 'https://www.gutenberg.org/ebooks/1661', name: 'Project Gutenberg · The Adventures of Sherlock Holmes' },
    item: {
      title: 'A Scandal in Bohemia',
      author: 'Arthur Conan Doyle',
      eraOrCountry: 'English Short Story (1891)',
      format: 'passage',
      passage:
        '“How often have I said to you that when you have eliminated the impossible, whatever remains, however improbable, must be the truth?”',
      attribution: 'Holmes to Watson, in the first short story of the collection.',
      whyItMatters:
        'A rule of evidence that works on a debugging session as well as a murder — and a reminder that the surviving explanation may still be strange.',
      url: 'https://www.gutenberg.org/ebooks/1661',
      sourceName: 'Project Gutenberg · The Adventures of Sherlock Holmes',
    },
  },
  {
    id: 'lit-fitgerald-gatsby',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['novel', 'modernist'],
    source: { url: 'https://www.gutenberg.org/ebooks/64317', name: 'Project Gutenberg · The Great Gatsby' },
    item: {
      title: 'The Great Gatsby (final page)',
      author: 'F. Scott Fitzgerald',
      eraOrCountry: 'American Novel (1925)',
      format: 'passage',
      passage: 'So we beat on, boats against the current, borne back ceaselessly into the past.',
      attribution: 'The novel’s last sentence; public domain in the United States since 2021.',
      whyItMatters:
        'Effort and pull in the same image — a line about the future that is built entirely out of resistance from behind.',
      url: 'https://www.gutenberg.org/ebooks/64317',
      sourceName: 'Project Gutenberg · The Great Gatsby',
    },
  },
  {
    id: 'lit-homer-odyssey-butler',
    category: 'literature',
    availableFrom: '2026-10-18',
    provenance: 'source-checked',
    tags: ['epic', 'greek', 'translation'],
    source: { url: 'https://www.gutenberg.org/ebooks/1727', name: 'Project Gutenberg · The Odyssey (trans. S. H. Butler)' },
    item: {
      title: 'The Odyssey (Book I)',
      author: 'Homer',
      eraOrCountry: 'Ancient Greek Epic (trans. 1900)',
      format: 'passage',
      passage:
        'Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy.',
      attribution: 'Opening line, Samuel Butler’s public-domain translation (1900).',
      whyItMatters:
        'The oldest Western request a story can make: not “tell me what happened”, but “tell me through someone else”.',
      url: 'https://www.gutenberg.org/ebooks/1727',
      sourceName: 'Project Gutenberg · The Odyssey',
    },
  },
];
