/**
 * Mythology + Historical — the historical, religious and legendary figures.
 *
 * WHY A SEPARATE FILE, AND WHY THESE RULES
 * The section is no longer only mythology. A Sikh Guru, a Mauryan emperor and a
 * Greek god now share one card, which puts three different kinds of claim next to
 * each other. The type system separates them (`classification`, `historicity`) and
 * every entry here follows the same discipline:
 *
 *   - **A historical person is never described as a fictional character.** Guru
 *     Nanak and Guru Gobind Singh are recorded here as historical figures of the
 *     Sikh tradition, venerated as Gurus; the sources for their lives are named and
 *     their limits are stated.
 *   - **A religious account is not retold as independently established fact.**
 *     Where a tradition says something the historical record cannot confirm, the
 *     sentence says so, or it lives in `lesserKnown` under the `traditional` layer.
 *   - **Contested dates and contested historicity are stated, not smoothed.** A
 *     reader is told which century is conventional and which is argued.
 *   - **References are real works**, not a link to a single encyclopedia article.
 *     Where this repository cannot verify a detail, the detail is left out.
 *
 * The existing 24 authored characters are untouched; this array is appended to
 * them, and the classification map in `mythology-catalog.ts` labels both halves.
 */

import type { MythCharacter } from '../types';

export const historicalCharacters: MythCharacter[] = [
  {
    id: 'guru-nanak',
    name: 'Guru Nanak',
    aliases: ['Guru Nanak Dev Ji', 'Nanak', 'Baba Nanak'],
    classification: 'historical',
    historicity: 'documented',
    traditionKey: 'sikh',
    tradition: 'Sikh — the first Guru',
    period: '1469–1539 CE',
    sources: [
      'Sri Guru Granth Sahib — the hymns (shabads) attributed to Guru Nanak, the primary source in his own words',
      'Bhai Gurdas, Vaaran (early 17th-century), the earliest extended account of the Gurus',
      'Janamsakhi traditions (Bhai Bala, Puratan and Miharban versions), which differ from one another',
      'Mughal-era and Persian chronicles that mention the period',
    ],
    relationships: [
      { with: 'Baba Budha', note: 'A companion from youth; later the first custodian of the Harmandir Sahib site.' },
      { with: 'Bhai Mardana', note: 'Muslim companion and rabab player; the hymns were sung, not only written.' },
      { with: 'Guru Angad', note: 'Named as successor; the Guruship passes in a line, not by inheritance.' },
    ],
    family: [
      { relation: 'Father', name: 'Mehta Kalu' },
      { relation: 'Mother', name: 'Mata Tripta' },
      { relation: 'Sister', name: 'Bebe Nanaki', note: 'Among the first to recognise his vocation.' },
      { relation: 'Wife', name: 'Mata Sulakhni' },
      { relation: 'Sons', name: 'Sri Chand, Lakhmi Das' },
    ],
    timeline: [
      { when: '1469', event: 'Born at Talwandi (Nankana Sahib), in present-day Pakistan.' },
      { when: 'c. 1496', event: 'The experience at the Kali Bein at Sultanpur, after which, the tradition records, he taught that there is no Hindu and no Muslim.' },
      { when: 'c. 1500–1520', event: 'Four long journeys (udasis) to centres of Hindu, Muslim, Buddhist and Sufi learning.' },
      { when: 'c. 1520s', event: 'Settles at Kartarpur and establishes a working community — shared labour, shared meals, shared worship.' },
      { when: '1539', event: 'Names Guru Angad as successor and dies at Kartarpur.' },
    ],
    story:
      'Guru Nanak was born in 1469 at Talwandi, in the Punjab of the Delhi Sultanate, into a family of the Khatri merchant caste. The Janamsakhis — biographies written decades or centuries later — describe a child who asked uncomfortable questions of the local teachers, and a young man who failed at the family trade because he gave away the goods he was sent to sell. In about 1496, at Sultanpur, he is said to have gone to bathe in the Kali Bein and returned after three days changed: the first words the tradition gives him are that there is no Hindu and no Muslim, a claim about the single divine reality behind the labels rather than a proposal about religious affiliation.\n\nWhat followed, according to the same biographies, were four long journeys in four directions — to Hindu pilgrimage centres, to Sufi shrines, to Tibet and to Mecca — in which he debated with theologians and consistently refused the rituals that separated people: caste, pilgrimage as a transaction, fasting as a performance, the pollution of food and of women. These journeys cannot be independently dated or mapped, and the Janamsakhis disagree with one another about them. What does not depend on the biographies is the body of hymns in the Guru Granth Sahib carrying his name — roughly 970 shabads — and their content: the divine is one, cannot be described, and is known through remembrance of the Name; a person is measured by conduct and humility, not by birth; and the honest householder’s life is as valid a path as the renunciate’s.\n\nIn his last two decades he settled at Kartarpur, founded a village, farmed, and built a community around three practices that later Sikh institutions have never abandoned: kirat karni (earning by one’s own work), naan chhakna (sharing with others), and naam japna (remembrance of the Name). He appointed Guru Angad, a disciple rather than a son, and this became the pattern for the next nine Gurus. The Guru Granth Sahib opens with his composition, the Japji Sahib, and his hymns are the largest single contribution to it.',
    background:
      'Fifteenth-century Punjab sat between the Delhi Sultanate and the Mongol and Timurid raids beyond it. Devotional (bhakti) movements in the vernacular and Sufi orders in Persian were both, in different ways, loosening the hold of ritual and priestly mediation on religious life. Guru Nanak belongs to that moment, but his response was distinct: a strict monotheism without an image, a rejection of caste and of the authority of the Vedas, and a stated refusal to choose between the religious communities of his surroundings — while insisting that both had lost the point.',
    keyEvents: [
      { when: '1496', event: 'The Sultanpur experience, as recorded in the Janamsakhis.' },
      { when: 'c. 1500–1520', event: 'The four udasis: the long teaching journeys of the hagiographies.' },
      { when: 'c. 1520s', event: 'Kartarpur founded; the practices of work, sharing and remembrance codified in a lived community.' },
      { when: '1539', event: 'Succession of Guru Angad; the line of Gurus begins.' },
    ],
    contributions: [
      'The Japji Sahib and some 970 hymns in the Guru Granth Sahib, the foundational text of Sikh scripture.',
      'The doctrine that the divine is one, without image or incarnation, and that caste cannot determine spiritual standing.',
      'The three practices — honest work, sharing, remembrance — that remain the core of Sikh daily obligation.',
      'The principle of succession by merit rather than inheritance.',
    ],
    significance:
      'Guru Nanak is the founder of a tradition with roughly twenty-five million adherents, but his historical importance is wider than the community: he is one of the clearest early voices of vernacular, anti-caste monotheism in South Asia, and the community he built is the prototype for the institutions — the langar, the sangat, the gurdwara — that later Gurus developed. For Sikhs he is not a subject of historical interest but a Guru; the historical account and the devotional one are both true on their own terms, which is exactly why this entry separates them.',
    references: [
      { citation: 'Singh, Khushwant. A History of the Sikhs, Vol. 1: 1469–1839. Oxford University Press, 2nd ed., 2004.', note: 'Standard narrative history in English.' },
      { citation: 'Shackle, Christopher, and Arvind-Pal Singh Mandair, eds. Teachings of the Sikh Gurus: Selections from the Sikh Scriptures. Routledge, 2005.', note: 'Translation and discussion of the scripture itself.' },
      { citation: 'Grewal, J. S. The Sikhs of the Punjab. Cambridge University Press, 1990.', note: 'Scholarly account of the period, with attention to source problems.' },
      { citation: 'Sri Guru Granth Sahib. The Guru Nanak Dev University or any critical edition; online at srigranth.org.', note: 'Primary text.' },
    ],
    interestingFacts: [
      'The Janamsakhi biographies are not contemporary, and scholars use them as evidence for how the community remembered the Guru rather than as a record of his life. Their disagreements are visible and are not hidden here.',
      'His birthplace at Nankana Sahib is today in Pakistan; it is a major Gurdwara and a destination for Sikh pilgrims.',
      'Guru Nanak’s hymns are among the most translated South Asian texts, and the Guru Granth Sahib as a whole includes the writings of other saints, including Kabir and Namdev.',
    ],
    contestedNote:
      'The four journeys are traditional as recorded, not independently documented; some 19th- and 20th-century accounts elaborate them far beyond the earliest sources. The years of his birth and death are settled only to the extent that early tradition is settled, and modern biographies differ on several episodes.',
    lesserKnown: [
      { layer: 'textual', text: 'The Japji Sahib, the opening composition of the Guru Granth Sahib, is attributed to Guru Nanak and is recited — or read — every day by observant Sikhs.' },
      { layer: 'traditional', text: 'The Sultanpur episode, including the words about “no Hindu and no Muslim”, comes from the Janamsakhis rather than from any contemporary record.' },
      { layer: 'analysis', text: 'Historians of religion generally treat Nanak’s central move as the rejection of mediation: the divine is accessible without priest, image or pilgrimage, which is why the ethics — work, sharing, remembrance — carry the weight.' },
      { layer: 'inference', text: 'The four-direction framing of the journeys probably reflects later devotion as much as itinerary: four directions, four great traditions, one teaching.' },
    ],
    variants: [
      { tradition: 'Bhai Bala Janamsakhi', difference: 'Place-shifting the authorship of the first biography to a companion; used by many devotional accounts.' },
      { tradition: 'Puratan and Miharban Janamsakhi traditions', difference: 'Different chronologies and different sets of journeys; only the broad shape is common to all of them.' },
      { tradition: 'Academic historiography', difference: 'Relies primarily on the scripture and on later, verifiable sources, and treats most biographical detail as tradition.' },
    ],
    analysis:
      'The temptation for a modern reader is to make Nanak a proto-reformer in a modern sense: social justice, religious tolerance, equality. The actual teaching is more demanding and less programmatic. Its root is metaphysical — one reality, beyond description — and its expression is local and practical: how you earn, how you eat, how you remember, who you eat with. The anti-caste and anti-ritual consequences follow from that, rather than being the point on their own.',
  },
  {
    id: 'guru-gobind-singh',
    name: 'Guru Gobind Singh',
    aliases: ['Guru Gobind Singh Ji', 'Gobind Rai', 'Dashmesh Pita'],
    classification: 'historical',
    historicity: 'documented',
    traditionKey: 'sikh',
    tradition: 'Sikh — the tenth Guru',
    period: '1666–1708 CE',
    sources: [
      'Sri Guru Granth Sahib, to which the Guruship was formally transferred in 1708',
      'the Zafarnama (a Persian-letter in verse addressed to Aurangzeb, attributed to the Guru)',
      'Bachittar Natak and the corpus traditionally called Dasam Granth — devotional and heroic compositions, with contested authorship of parts',
      'Khafi Khan’s Muntakhab-ul-Lubab and other Mughal-era Persian chronicles',
      'Bhai Gurdas, Vaaran; later Sikh chronicles (Gur-bilas traditions)',
    ],
    relationships: [
      { with: 'Guru Tegh Bahadur', note: 'Father, the ninth Guru, executed in Delhi in 1675.' },
      { with: 'Mata Gujri', note: 'Mother; died in captivity during the rout of December 1704.' },
      { with: 'the Sahibzadas', note: 'Four sons; two died in battle at Chamkaur, two were executed by the Mughal governor of Sirhind.' },
      { with: 'Banda Singh Bahadur', note: 'Ascetic whom the Guru sent into the Punjab to continue the struggle in 1708.' },
      { with: 'Bhai Kanhaiya', note: 'Associated with the Red Cross legend of serving wounded from both sides — remembered as a teaching about compassion in war.' },
    ],
    family: [
      { relation: 'Father', name: 'Guru Tegh Bahadur' },
      { relation: 'Mother', name: 'Mata Gujri' },
      { relation: 'Consorts', name: 'Mata Jito, Mata Sundari, Mata Sahib Kaur' },
      { relation: 'Sons', name: 'Ajit Singh, Jujhar Singh, Zorawar Singh, Fateh Singh' },
    ],
    timeline: [
      { when: '1666', event: 'Born at Patna.' },
      { when: '1675', event: 'Becomes Guru at the age of nine after his father’s execution.' },
      { when: '1699', event: 'Vaisakhi at Anandpur: the Khalsa is instituted, with the panj piare initiating the Guru himself.' },
      { when: '1700–1704', event: 'The siege of Anandpur and the retreat; his mother and younger sons are captured, and the two boys are executed.' },
      { when: '1705', event: 'Battle of Chamkaur: two of his sons and most of the Sikh force die; the Guru escapes disguised.' },
      { when: '1708', event: 'In Nanded, he declares the Guru Granth Sahib to be the eternal Guru, and dies shortly afterwards.' },
    ],
    story:
      'Guru Gobind Singh was born in 1666 at Patna and became Guru in 1675, at nine years old, after his father Guru Tegh Bahadur was executed in Delhi. The story of the execution, preserved in Sikh tradition, is that the Guru had interceded on behalf of Kashmiri Pandits facing forced conversion — an account that illustrates how the community understood the event, and which appears in early Sikh rather than contemporary Mughal sources.\n\nThe defining act of his Guruship came on Vaisakhi in 1699 at Anandpur. He called for volunteers willing to give their lives; five stepped forward, and the Guru instituted the Khalsa — a community bound by initiation (the amrit of the double-edged sword), the discipline of the five Ks, and the rejection of caste distinctions in its ranks. The most discussed detail is what happens at the centre of that story: the five initiate the Guru. Authority is henceforth shared, and it is this, not merely a new military posture, that the ceremony is remembered for.\n\nFrom 1700 to 1705 he was almost continuously at war with the Mughal governors of the Punjab and the hill rajas. The siege of Anandpur, the December 1704 retreat during which his mother and two younger sons were captured, the battle at Chamkaur in which two older sons died, and the death of the two youngest at Sirhind are the core of the Sikh narrative of martyrdom, and the reason the Sahibzadas are remembered in the daily prayer of the community. He survived, wrote the Zafarnama — a Persian letter in verse to Aurangzeb accusing him of breaking his oath — and continued the campaign until he reached Nanded in the Deccan, where in 1708 he ended the line of personal Guruship by vesting it in the scripture, and in the community. He sent Banda Singh Bahadur into the Punjab, and died shortly after, of a wound or an assassination depending on the account.',
    background:
      'The Sikh community had been in conflict with the Mughal state since the execution of Guru Arjan in 1606, and the conflict deepened under Aurangzeb, whose policies of temple destruction and of jizya reimposition created the conditions the tenth Guru faced. The Sikh response — a disciplined, initiated community with military capacity and a declared refusal of caste — has to be read inside that pressure rather than as a plan formed in advance.',
    keyEvents: [
      { when: '1675', event: 'The execution of Guru Tegh Bahadur; the Guruship passes to a nine-year-old.' },
      { when: '1699', event: 'Institution of the Khalsa at Anandpur.' },
      { when: '1704', event: 'Siege of Anandpur and the winter retreat; capture of the Guru’s family.' },
      { when: '1704–05', event: 'Chamkaur; the deaths of Ajit Singh and Jujhar Singh; execution of Zorawar Singh and Fateh Singh at Sirhind.' },
      { when: '1708', event: 'The Guru Granth Sahib declared eternal Guru; death at Nanded.' },
    ],
    contributions: [
      'Institution of the Khalsa, with initiation open regardless of caste, and authority shared between Guru and initiated community.',
      'The end of personal Guruship, and the transfer of authority to the Guru Granth Sahib — the move that defines Sikh scripture as the Guru.',
      'The Zafarnama, a Persian poem of moral rebuke addressed to an emperor.',
      'The compilation and promotion of the Dasam Granth tradition, whose authorship of individual compositions remains debated.',
    ],
    significance:
      'Guru Gobind Singh completed a transition the community had begun under earlier Gurus: from a devotional movement with a spiritual master to a community with its own sovereignty claims, its own martial institution, and its authority located in a text rather than in a person. The Khalsa remains the defining institution of Sikhism and the point at which the tradition’s ethics of equality became, for better and worse, a matter of governance and war.',
    references: [
      { citation: 'Fenech, Louis E. The Sikh Zafar-namah of Guru Gobind Singh: A Discursive Blade in the Heart of the Mughal Empire. Oxford University Press, 2013.' },
      { citation: 'Singh, Khushwant. A History of the Sikhs, Vol. 1: 1469–1839. Oxford University Press, 2nd ed., 2004.' },
      { citation: 'Grewal, J. S. The Sikhs of the Punjab. Cambridge University Press, 1990.' },
      { citation: 'McLeod, W. H. Sikhism. Penguin, 1997.', note: 'A short critical introduction; useful on the source problem of the Janamsakhis and the Dasam Granth.' },
    ],
    interestingFacts: [
      'In the Khalsa initiation, the panj piare — five ordinary initiates — administer amrit to the Guru as well as to everyone else. The Guru is made a member of the community he is creating.',
      'The Zafarnama is a Sikh scripture in Persian, addressed to the emperor, and it does not ask for mercy; it berates him for breaking his word.',
      'The daily Sikh prayer, the ardas, remembers the four Sahibzadas by name, and the “Sirhind” martyrdom is one of the most widely commemorated events in the tradition.',
      'Disputes over which compositions belong to the Dasam Granth remain live among scholars and within the tradition; this entry does not settle them.',
    ],
    contestedNote:
      'Mughal accounts and Sikh accounts of 1704–05 differ substantially, and the details of the retreat from Anandpur — including the exact role of the hill rajas — are contested. The authorship and status of parts of the Dasam Granth are disputed within the tradition itself. The narrative above follows the Sikh textual record and says when it is doing so.',
    lesserKnown: [
      { layer: 'textual', text: 'The Zafarnama survives, in Persian verse, and is one of the few documents in which the Guru speaks in the first person to his adversary.' },
      { layer: 'traditional', text: 'The story of the five heads at Vaisakhi 1699 is transmitted in later accounts; its theological point — that authority is shared — is not in dispute within the tradition, even if the staging of the story is.' },
      { layer: 'analysis', text: 'Historians generally read 1699 as the formalisation of a process begun under Guru Hargobind, rather than as a novelty created from nothing.' },
      { layer: 'inference', text: 'The decision to vest Guruship in the scripture may have been intended, in part, to make the community impossible to decapitate — which is what the following decades required.' },
    ],
    variants: [
      { tradition: 'Sikh tradition', difference: 'The Khalsa is a divine institution announced by the Guru, not a pragmatic decision; the narrative is devotional and is remembered liturgically.' },
      { tradition: 'Mughal chronicles', difference: 'Describe a rebellious regional noble and a military campaign; say nothing about the religious content of 1699.' },
      { tradition: 'Modern scholarship', difference: 'Emphasises institutional continuity with earlier Gurus and the social composition of the Khalsa.' },
    ],
    analysis:
      'The tenth Guru’s significance for a modern reader is institutional. He solved a problem every movement faces: what happens when the founder dies. His answer was to write the authority into a book and into a community, which is why a Sikh can be a Sikh without any living intermediary — and why the book is opened, in the physical sense, as the Guru.',
  },
  {
    id: 'ashoka',
    name: 'Ashoka',
    aliases: ['Ashoka Maurya', 'Aśoka', 'Devanampiya Piyadasi'],
    classification: 'historical',
    historicity: 'documented',
    traditionKey: 'indian',
    tradition: 'India — Mauryan empire, patron of Buddhism',
    period: 'c. 304–232 BCE',
    sources: [
      'The Major and Minor Rock Edicts and Pillar Edicts, inscribed in Prakrit (Brahmi and Kharosthi) and Greek and Aramaic — contemporary, self-authored evidence',
      'The Divyavadana and the Ashokavadana, later Buddhist biographical traditions',
      'The Mahavamsa and Dipavamsa, Sri Lankan chronicles',
      'Megasthenes and later Greek sources for the earlier Mauryan period',
    ],
    relationships: [
      { with: 'Chandragupta Maurya', note: 'Grandfather, founder of the Mauryan empire.' },
      { with: 'Bindusara', note: 'Father.' },
      { with: 'Kalinga', note: 'The kingdom whose conquest, by Ashoka’s own account, changed his policy.' },
      { with: 'the Buddhist sangha', note: 'Patron and reformer; the edicts regulate and support it.' },
    ],
    family: [
      { relation: 'Grandfather', name: 'Chandragupta Maurya' },
      { relation: 'Father', name: 'Bindusara' },
      { relation: 'Son', name: 'Mahendra', note: 'Traditionally credited with carrying Buddhism to Sri Lanka.' },
      { relation: 'Daughter', name: 'Sanghamitta', note: 'Traditionally associated with the Sri Lankan mission.' },
    ],
    timeline: [
      { when: 'c. 268 BCE', event: 'Accession, according to the Buddhist chronicles after a disputed succession.' },
      { when: 'c. 261 BCE', event: 'The Kalinga war, recorded in the Thirteenth Major Rock Edict.' },
      { when: 'c. 260s BCE', event: 'The policy of dhamma-vijaya (“conquest by dhamma”) is announced in the edicts.' },
      { when: 'c. 250 BCE', event: 'The Third Buddhist Council, traditionally held at Pataliputra under his patronage.' },
      { when: 'c. 232 BCE', event: 'Death; the empire begins a long decline.' },
    ],
    story:
      'Ashoka was the third Mauryan emperor, ruling from Pataliputra over an empire that stretched from the Hindu Kush to the Bay of Bengal. The empire had been built by his grandfather Chandragupta and consolidated by his father Bindusara; Ashoka inherited it and, in about 261 BCE, completed its expansion by conquering Kalinga, on the eastern coast of India.\n\nThe war is known to us not from a court chronicle but from Ashoka’s own words. In the Thirteenth Major Rock Edict he states that a hundred and fifty thousand people were deported and a hundred thousand killed, and that the slaughter turned his mind. He declares that he has given up conquest by force for conquest by dhamma — a word that here means something like “righteousness” or “the moral law”, and which his edicts define in practice: respect for parents and elders, generosity to friends and relatives and to ascetics and brahmins, restraint in expenditure, and non-injury to living beings. The edicts are engraved on rock faces in places travellers would meet them, and on pillars along roads.\n\nWhat exactly to make of the change has been argued for two centuries. He did not abdicate or disband the army; he did not make Buddhism the state religion in the modern sense; he patronised the Buddhist sangha while also supporting brahmins and other groups and, in one edict, urging tolerance towards all sects. Later Buddhist texts, principally the Ashokavadana, turn him into a saint and add stories — the conversion of his own brother, the distribution of relics, the missions abroad — that the edicts do not corroborate. He is remembered most widely for three things: the shift from conquest to a stated moral policy, the use of public inscription as a way of speaking directly to his subjects, and the missions he describes as sending to Hellenic kingdoms and to Sri Lanka, which are the historical root of Buddhism’s passage out of India.',
    background:
      'The Mauryan empire was the first state to unify most of the Indian subcontinent, and its administration — a standing army, a network of roads, a bureaucracy described by Megasthenes — was unusually elaborate for its time. Ashoka ruled a country of many religions, languages and degrees of autonomy. His edicts, written in local scripts and dialects and sometimes translated into Greek and Aramaic in the frontier provinces, are best read as an attempt to govern a plural society through a shared moral vocabulary rather than through uniformity.',
    keyEvents: [
      { when: '268 BCE', event: 'Accession.' },
      { when: '261 BCE', event: 'The Kalinga campaign: the event he names as the turning point.' },
      { when: 'c. 258–250 BCE', event: 'The great series of rock and pillar edicts inscribed across the empire.' },
      { when: 'c. 250 BCE', event: 'The Third Buddhist Council and the missions described in Sri Lankan chronicles and hinted at in the edicts.' },
      { when: '232 BCE', event: 'Death; the empire’s slow fragmentation.' },
    ],
    contributions: [
      'The edicts themselves: the earliest extensive corpus of a ruler speaking directly to his subjects about moral conduct, in local languages.',
      'The policy of dhamma-vijaya, a self-conscious alternative to conquest by force, announced and argued in public.',
      'Patronage of Buddhism at the moment it became a missionary religion beyond South Asia.',
      'The emblem of his Lion Capital at Sarnath, adapted as the state emblem of India and the national flag’s Ashoka Chakra.',
    ],
    significance:
      'Ashoka is the most-cited ancient example of a ruler who publicly changed his policy and explained why. The edicts are unusual in world history as first-person statements of policy from an ancient ruler, and the Kalinga passage is probably the oldest surviving statement in which a conqueror describes the cost of a conquest with regret. His afterlife matters too: the Buddhist chronicles made him a model king, and 20th-century Indian nationalism made him a symbol of a plural, non-sectarian state.',
    references: [
      { citation: 'Thapar, Romila. Aśoka and the Decline of the Mauryas. Oxford University Press, 3rd ed., 2012.', note: 'The standard scholarly study; treats the Buddhist biographies critically.' },
      { citation: 'Olivelle, Patrick, ed. and trans. King, Governance, and Law in Ancient India: Kautilya’s Arthasastra. Oxford University Press, 2013.', note: 'For the administrative context, with caveats about its date.' },
      { citation: 'The Major Rock Edicts and Pillar Edicts, as translated in Thapar (above) and in Hultzsch’s Corpus Inscriptionum Indicarum, Vol. 1.', note: 'Primary inscriptions.' },
      { citation: 'Strong, John S. The Legend of King Aśoka: A Study and Translation of the Aśokāvadāna. Princeton University Press, 1983.', note: 'For the saintly biography and its limits.' },
    ],
    interestingFacts: [
      'The Lion Capital at Sarnath, erected by Ashoka, is the model for the State Emblem of India; the wheel on the flag is the Ashoka Chakra.',
      'The edicts were not written in a single language or script: Prakrit in Brahmi in most of the empire, Kharosthi in the northwest, Greek and Aramaic in the frontier provinces.',
      'No ancient Indian source names the Kalinga war except Ashoka’s own inscription; the empire did not leave a narrative history.',
      'The name “Ashoka” was almost lost to history in India until the 19th century, when the edicts were deciphered and connected with the Buddhist texts’ King Piyadasi.',
    ],
    contestedNote:
      'How deep the policy of dhamma actually ran is debated: Thapar and others read it as a serious political theory; sceptics read it as propaganda over an unchanged administration. The Kalinga casualty figures are Ashoka’s own claim and cannot be checked. The conversion story is found in later Buddhist texts, not in the edicts, which never call him a Buddhist convert in so many words.',
    lesserKnown: [
      { layer: 'textual', text: 'The Thirteenth Rock Edict says the king felt remorse after Kalinga and that this is the reason for his change of policy — a first-person claim, in his own inscription.' },
      { layer: 'analysis', text: 'Scholars have noted that the edicts address brahmins, ascetics and all sects equally, which complicates the older picture of a Buddhist state church.' },
      { layer: 'traditional', text: 'The Ashokavadana adds the story that he gave away the empire and even himself in charity; it is a saint’s life, not a chronicle.' },
      { layer: 'inference', text: 'The choice to publish on rock and pillar rather than on impermanent materials suggests an intended audience of the population at large, not only officials — a deliberate public-relations strategy.' },
    ],
    variants: [
      { tradition: 'Buddhist tradition', difference: 'A model dharmaraja, saintly patron, distributor of relics and sender of missionaries.' },
      { tradition: 'Indian nationalist historiography', difference: 'A secular emblem of pluralism and non-violence, often minimalising his Buddhist commitment.' },
      { tradition: 'Modern scholarship', difference: 'Reads the edicts as the primary evidence and the biographies as later literature.' },
    ],
    analysis:
      'Ashoka is the best case study in ancient history of the difference between a ruler’s self-presentation and the record that survives. Almost everything we know comes from him, which makes the inscription both the richest source and the least neutral one. That is not a reason to doubt the change of policy; it is a reason to read it as a statement the king wanted made, and to ask what it cost to enforce.',
  },
  {
    id: 'mahavira',
    name: 'Mahavira',
    aliases: ['Vardhamana', 'Mahavira Vardhamana', 'Nigantha Nataputta (in Buddhist texts)'],
    classification: 'religious',
    historicity: 'documented',
    traditionKey: 'jain',
    tradition: 'Jain — the twenty-fourth tirthankara',
    period: 'Traditionally 599–527 BCE; many historians place him in the 6th–5th centuries BCE',
    datingNote:
      'His existence is not in serious doubt; the years are. Jain tradition gives 599–527 BCE; most historians work with a 6th–5th-century BCE setting and argue between a death date near 527 and one near 468 BCE. The dates above are the tradition’s, and the card says so.',
    sources: [
      'the Acaranga and Sutrakritanga, the oldest strata of the Jain canon (in Ardhamagadhi Prakrit)',
      'the Kalpa Sutra, the most widely read legendary biography',
      'Buddhist canonical texts, which refer to the Jina as Nigantha Nataputta',
    ],
    relationships: [
      { with: 'Parshvanatha', note: 'The twenty-third tirthankara; the tradition sees Mahavira as reviving and extending his teaching.' },
      { with: 'Gosala', note: 'Leader of the Ajivikas and, in the Jain accounts, a former companion and later rival.' },
      { with: 'Indrabhuti Gautama', note: 'Chief disciple (Ganadhara); the dialogues in the canon are often attributed to him.' },
    ],
    family: [
      { relation: 'Father', name: 'Siddhartha', note: 'A chief of the Nata or Kundala clan.' },
      { relation: 'Mother', name: 'Trishala' },
      { relation: 'Wife', name: 'Yashoda' },
      { relation: 'Daughter', name: 'Anojja or Priyadarshana', note: 'Name varies by source.' },
    ],
    timeline: [
      { when: 'Traditional 599 BCE', event: 'Born at Kundagrama, near Vaishali (modern Bihar).' },
      { when: 'c. 30s', event: 'Leaves home and becomes an ascetic, after his parents’ death.' },
      { when: 'after 12 years', event: 'Attains kevala jnana, omniscience, and becomes the Jina.' },
      { when: 'c. 490s BCE (traditional)', event: 'Dies at Pavapuri; the festival of Diwali is associated in the tradition with this event.' },
    ],
    story:
      'Mahavira was born, by the account of the Jain tradition, into a wealthy clan near Vaishali and lived a privileged life until the age of about thirty. After his parents’ deaths he abandoned it — the Kalpa Sutra describes him leaving his ornaments and possessions, tearing out his hair, and wandering. He practised the most extreme form of the ascetic discipline the tradition had already developed: complete non-violence, truthfulness, non-stealing, chastity and non-attachment, with long fasts and silence, and after twelve years he is said to have attained omniscience on the bank of the river Rijupalika under a sal tree.\n\nHe spent the rest of his life teaching and organising. The doctrine he is remembered for is not mainly new — Jains hold that he revived a teaching already set out by earlier tirthankaras — but it was in his teaching that it received its most rigorous formulation. The central claim is that every living being is an individual soul (jiva) weighted down by karmic matter, and that liberation consists in shedding it. The most distinctive doctrine is ahimsa, non-violence, understood more strictly than anywhere else in Indian thought: it is not only an ethic of action but a metaphysics, because every act of harm binds the soul further. He also insisted on anekantavada — that reality is many-sided and that any single assertion is partial — and on syadvada, the careful “in some respect” form of predication that follows from it.\n\nThe tradition also records that he organised his teaching into a monastic order and a lay community, and that he appointed eleven chief disciples. The dates are a genuine problem. The Jain tradition’s own dates (599–527 BCE) make him a near-contemporary of the Buddha; Western and many Indian scholars, following references in Buddhist texts and the chronology of the rulers involved, prefer a somewhat later range. The teaching survives in the earliest levels of the Jain canon and in the later literature of the Svetambara and Digambara traditions, which differ on a number of points, including whether he lived as a householder before his renunciation.',
    background:
      'Mahavira lived in the same period and region of the Gangetic plain as the Buddha, in the world of competing ascetic teachers that early Buddhist texts describe as the shramana movements. That world was defined by a refusal of brahminical ritual and of the authority of the Vedas, and by experiments with asceticism and with philosophical analysis. Jainism was one of its routes, and it has outlasted nearly all the others.',
    keyEvents: [
      { when: 'Traditionally 599 BCE', event: 'Birth near Vaishali.' },
      { when: 'c. 569 BCE', event: 'Renunciation as a wandering ascetic.' },
      { when: 'c. 557 BCE', event: 'Attainment of kevala jnana and the beginning of teaching.' },
      { when: 'c. 527 BCE', event: 'Death at Pavapuri, by the traditional chronology.' },
    ],
    contributions: [
      'The rigorous formulation of ahimsa, extended from action to intention and to all living beings.',
      'The doctrine of anekantavada — many-sidedness — and the disciplined language of syadvada that follows from it.',
      'The organisation of the Jain monastic and lay communities.', 
      'The oldest surviving Jain canonical texts, transmitted in Ardhamagadhi.',
    ],
    significance:
      'Jainism is a small tradition numerically and a large one intellectually: historian of religions regularly note that its non-violence shaped Gandhi’s thinking, and its many-sided logic anticipated debates that were taken up in Indian philosophy more broadly. Mahavira is the tradition’s decisive figure: whatever earlier tirthankaras are credited with, the doctrine, the community and the record that survive are his. He is also an important historical witness for the diversity of the shramana period — the ascetic, non-Vedic religion of the Gangetic plain alongside Buddhism, Ajivikism and others.',
    references: [
      { citation: 'Dundas, Paul. The Jains. 2nd ed., Routledge, 2002.', note: 'The standard academic introduction; excellent on source problems and differences.' },
      { citation: 'Jaini, Padmanabh S. The Jaina Path of Purification. University of California Press, 1979.', note: 'The philosophical and doctrinal account.' },
      { citation: 'Jacobi, Hermann, trans. The Kalpa Sutra and the Acaranga Sutra. Sacred Books of the East, Vol. 22, 1884.', note: 'The classic English translations of the key texts.' },
      { citation: 'Caillat, Colette, et al. “The Jaina Canon.” In the Encyclopaedia of Jainism, or in Jain literature overviews.', note: 'For the composition history of the canon.' },
    ],
    interestingFacts: [
      'The Jain festival of Diwali coincides with the day the tradition records Mahavira’s death at Pavapuri; the lamp festival is, for Jains, primarily a commemoration of the Jina’s liberation.',
      'The Digambara and Svetambara traditions disagree on whether Mahavira wore clothes, married, and which canon is authoritative. Both are Jain and neither is a footnote to the other.',
      'The earliest stratum of the Jain canon, the Acaranga, is largely composed of rules for the ascetic — one of the oldest surviving monastic codes of any religion.',
      'Anekantavada, the many-sidedness doctrine, is frequently cited as a philosophical basis for tolerance, though historians caution that the two are not the same idea.',
    ],
    contestedNote:
      'The details of his biography come from a later tradition; the doctrine is attested in the earliest canonical texts, but those texts also have a long transmission history. Buddhist sources, which mention him as Nigantha Nataputta, are hostile witnesses and cannot be used as a neutral record.',
    lesserKnown: [
      { layer: 'textual', text: 'The Acaranga includes detailed rules about how an ascetic must walk, eat, sit and breathe in order to minimise harm to living things — the doctrine applied to the body.' },
      { layer: 'traditional', text: 'The Kalpa Sutra gives the numbered lists of his fasts and the names of those who joined the order; it is the source most devotional accounts follow.' },
      { layer: 'analysis', text: 'Scholars distinguish between the historical core of the teaching and the later biographical elaboration, and regard the doctrine as better evidenced than the life.' },
      { layer: 'inference', text: 'The emphasis on harm as a karmic mechanism rather than as a social rule may explain why Jain ethics could be so strict without being legalistic.' },
    ],
    variants: [
      { tradition: 'Svetambara', difference: 'Mahavira was married and wore clothes; the canon as transmitted by the Svetambaras is authoritative.' },
      { tradition: 'Digambara', difference: 'He was unmarried and lived sky-clad; the older canonical texts are lost and the later literature takes their place.' },
      { tradition: 'Modern scholarship', difference: 'A historical teacher of the 6th–5th century BCE, whose teaching is accessible mainly through a canon long transmitted orally.' },
    ],
    analysis:
      'Jain ethics can look like the maximisation of a constraint — never harm, ever, to anything. The doctrine behind it is subtler: action, intention and the actor’s understanding are bound together, and progress is measured by the gradual reduction of what one’s own existence costs others. It is the only Indian tradition in which that question became the whole of the system, and it is why a reader from a different background will find it both alien and immediately relevant to any argument about what we owe to animals and to the living world.',
  },
  {
    id: 'socrates',
    name: 'Socrates',
    aliases: ['Sōkrátēs'],
    classification: 'historical',
    historicity: 'documented',
    traditionKey: 'greek',
    tradition: 'Ancient Greek — classical Athens',
    period: '469–399 BCE',
    sources: [
      'Plato, the early dialogues (Apology, Crito, Euthyphro and others) — the main source, but a philosophical writer with his own purposes',
      'Xenophon, Memorabilia and Apology — a second contemporary witness, with a different accent',
      'Aristophanes, Clouds (423 BCE) — a hostile comic portrait, contemporaneous',
      'Aristotle and later doxographers, writing after his death',
    ],
    relationships: [
      { with: 'Plato', note: 'Student; the main literary source, which is both the reason Socrates is known and the reason he is hard to know.' },
      { with: 'Xenophon', note: 'Student and second biographer; returns a more conventional, less philosophical Sokrates.' },
      { with: 'Alcibiades', note: 'Notorious pupil and associate, cited by his accusers.' },
      { with: 'Aristophanes', note: 'Comic poet whose caricature put the philosopher on the wrong side of public suspicion.' },
    ],
    family: [
      { relation: 'Father', name: 'Sophroniscus', note: 'A stonemason.' },
      { relation: 'Mother', name: 'Phaenarete', note: 'A midwife — an image Plato uses for Sokrates’ method.' },
      { relation: 'Wife', name: 'Xanthippe' },
      { relation: 'Sons', name: 'Lamprocles, Sophroniscus, Menexenus', note: 'Still young at his death.' },
    ],
    timeline: [
      { when: '469 BCE', event: 'Born in Athens, of a craftsman family.' },
      { when: '431–404 BCE', event: 'Serves in the Peloponnesian War, including at Potidaea, Delium and Amphipolis, by Plato’s account.' },
      { when: '404 BCE', event: 'Athens loses the war; the Thirty Tyrants rule for a year, with Sokrates named as an associate of some of them.' },
      { when: '399 BCE', event: 'Tried, condemned by a jury of 501, and executed by hemlock.' },
    ],
    story:
      'Sokrates wrote nothing. Everything we have is someone else’s account of him, and those accounts disagree. He was born in Athens in 469 BCE, the son of a stonemason and a midwife, and he spent his life in public places asking questions of anyone who would stand still: a general about courage, a priest about piety, a politician about justice. The result was usually the collapse of the other person’s confident definition and no replacement — what is now called the Socratic method, though the historical Sokrates may have intended the aporia itself as the lesson.\n\nHe served as an infantryman in the Peloponnesian War, and in public life he twice acted against the political current: as a councillor he refused to put an illegal mass condemnation to the vote, and he declined to arrest a man on the orders of the Thirty Tyrants. Neither act saved him from suspicion. Athens lost the war, was humiliated, and the associates around Sokrates included men who had been prominent on the losing side and among the tyrants. In 399 he was accused of failing to acknowledge the city’s gods, introducing new divinities, and corrupting the young. He was convicted by a narrow margin and, after his own proposal for a penalty (maintenance in the prytaneum, a civic honour) offended the court, sentenced to death.\n\nThe scenes of the last day are the ones Europe has never stopped re-reading: refusing to escape when his friend Crito arranges it, arguing that a citizen who has lived by the laws of a city may not evade them when they turn against him, drinking the hemlock in the company of his students. The historical Sokrates is behind those scenes and the literary figure is in front of them. Plato wrote dialogues, not transcripts, and the “Socratic” voice in the middle and late dialogues is often Plato’s own. What a careful reader can say with confidence is narrower than the picture everyone knows: he asked for definitions, he refused payment and claimed no doctrine of his own, he was executed under a democratic Athens, and his friends wrote about him because they thought the city had done something wrong.',
    background:
      'The Athens of Sokrates had just lost a thirty-year war, had been ruled by a Spartan-backed oligarchy, and had restored a democracy that needed to claim it had not been the problem. The charge of impiety and of corrupting the young has to be read with that in view: a philosophical gadfly who had taught several men who turned out to be traitors was a convenient symbol. His refusal of payment distinguished him sharply from the sophists, who taught rhetoric for money, and his refusal of written doctrine distinguished him from every philosopher who followed.',
    keyEvents: [
      { when: '431–422 BCE', event: 'Military service in the Peloponnesian War.' },
      { when: '406 BCE', event: 'As a councillor, refuses to permit an illegal collective trial of the generals after Arginusae (as reported by Plato and Xenophon).' },
      { when: '404 BCE', event: 'Refuses the Thirty Tyrants’ order to arrest Leon of Salamis.' },
      { when: '399 BCE', event: 'Trial, condemnation and execution.' },
    ],
    contributions: [
      'The practice of philosophy as a public, adversarial questioning of definitions and assumptions.',
      'The idea that the examined life is the point of the exercise — his clearest surviving claim.',
      'A model of civil disobedience and of a refusal to cooperate with injustice, which later political thought has used repeatedly.',
      'Indirectly, the founding of an entire tradition: Plato and Aristotle both stand downstream of him, and Western philosophy is often described as a series of footnotes to that line.',
    ],
    significance:
      'Whether or not one accepts the picture in the Apology, Sokrates is the figure at which Western ethics turns from instruction to argument. The trial and execution are also a permanent case study of the relationship between the state and the questioner, and the reason “the unexamined life” and “the hemlock” have become shorthand for two different positions on that relationship.',
    references: [
      { citation: 'Plato. Apology, Crito, Euthyphro. Any modern translation; Brill’s 2002 edition of the Apology includes a useful commentary.', note: 'Primary text — read with the awareness that it is Plato writing.' },
      { citation: 'Xenophon. Memorabilia. Trans. E. C. Marchant, Loeb Classical Library. Harvard University Press.', note: 'The second contemporary source.' },
      { citation: 'Brickhouse, Thomas C., and Nicholas D. Smith. The Trial and Execution of Socrates: Sources and Controversies. Oxford University Press, 2002.', note: 'Collects the evidence and surveys the debates.' },
      { citation: 'Vlastos, Gregory. Socrates: Ironist and Moral Philosopher. Cambridge University Press, 1991.', note: 'The classic modern reconstruction; disputed but essential.' },
    ],
    interestingFacts: [
      'Aristophanes’ Clouds, a comedy performed when Sokrates was alive, accuses him of charging fees and of natural philosophy — both of which the philosophical sources deny. The caricature had a long life.',
      'The death penalty was carried out by a state officer giving him a cup of hemlock rather than by executioner, a form reserved for some classes of citizen.',
      'The “Socratic method” as used in modern law schools — question, answer, contradiction — takes the name; whether the historical method was intended to produce teaching rather than intellectual modesty is disputed.',
      'He is one of very few ancient philosophers whose death date and the year of his trial are securely attested.',
    ],
    contestedNote:
      'The Socrates of Plato, Xenophon, and Aristophanes cannot be fully reconciled; the “problem of Socrates” in scholarship is precisely which of them preserves the historical man. Serious scholars differ between a reconstruction that takes the early Platonic dialogues as closest to the truth and one that treats almost everything as literary invention.',
    lesserKnown: [
      { layer: 'textual', text: 'In the Apology he says his own wisdom consists in knowing that he does not know, and disclaims any doctrine of his own — a claim that makes every later attribution of a “Socratic philosophy” awkward.' },
      { layer: 'traditional', text: 'The story that his last words were “we owe a cock to Asclepius” comes from the Phaedo and is one of the most discussed fragments in philosophy; Plato’s dialogue is not a transcript.' },
      { layer: 'analysis', text: 'Historians of philosophy generally treat the historical Socrates as recoverable only as a shape: a method and a moral attitude, not a system.' },
      { layer: 'inference', text: 'His refusal to write may have been a deliberate refusal of philosophical authority, which would make the tradition that wrote him down a contested fulfilment of his own intent.' },
    ],
    variants: [
      { tradition: 'Platonic', difference: 'A philosopher whose questioning leads towards substantive truth, the teacher of the theory of forms.' },
      { tradition: 'Xenophontic', difference: 'A moral and practical adviser, more conventional in religion and politics.' },
      { tradition: 'Aristophanic', difference: 'A comic intellectual, a teacher of sophistry and of no good.' },
    ],
    analysis:
      'The useful Sokrates for a modern reader is not the dead martyr but the method: not the patient listener who discovers hidden truth in a naive speaker, but the questioner who exposes that a confident answer was a glib one. The hemlock is part of the story because it shows what that method costs when the people being questioned hold the power — which is why the trial is a permanent case study for anyone who asks inconvenient questions in an organisation.',
  },
  {
    id: 'hatshepsut',
    name: 'Hatshepsut',
    aliases: ['Hatchepsut', 'Maat-ka-Ra Hatshepsut'],
    classification: 'historical',
    historicity: 'documented',
    traditionKey: 'egyptian',
    tradition: 'Ancient Egypt — eighteenth dynasty',
    period: 'c. 1479–1458 BCE',
    sources: [
      'Inscriptions and reliefs at her mortuary temple at Deir el-Bahri',
      'The Karnak obelisks and the inscriptions describing their transport',
      'Official records and grave goods of her court officials, notably Senenmut',
      'Later king-lists and Manetho’s chronology, which omit or distort her reign',
    ],
    relationships: [
      { with: 'Thutmose II', note: 'Her husband and half-brother; pharaoh until his death.' },
      { with: 'Thutmose III', note: 'Son of Thutmose II by another wife; nominal king during her reign, and sole ruler after it.' },
      { with: 'Senenmut', note: 'One of her highest officials; his career and tomb are among the main sources for the court.' },
      { with: 'Ahmose', note: 'A powerful court figure and probably her mother, who held the title God’s Wife of Amun.' },
    ],
    family: [
      { relation: 'Father', name: 'Thutmose I' },
      { relation: 'Mother', name: 'Ahmose' },
      { relation: 'Husband', name: 'Thutmose II' },
      { relation: 'Daughter', name: 'Neferure' },
      { relation: 'Stepson', name: 'Thutmose III' },
    ],
    timeline: [
      { when: 'c. 1479 BCE', event: 'Thutmose II dies; Hatshepsut becomes regent for the young Thutmose III.' },
      { when: 'c. 1473 BCE', event: 'Assumes the full royal titulary and the role of pharaoh.' },
      { when: 'c. 1470s', event: 'The trading expedition to Punt is recorded on the walls of Deir el-Bahri.' },
      { when: 'c. 1460s', event: 'Two obelisks raised at Karnak; the transport is described in her own inscription.' },
      { when: 'c. 1458 BCE', event: 'Death; Thutmose III rules alone.' },
      { when: 'c. 1425 BCE', event: 'Late in his reign, her images and cartouches are defaced or replaced.' },
    ],
    story:
      'Hatshepsut was the daughter of Thutmose I and became the wife of her half-brother Thutmose II. When he died, the heir was a child, Thutmose III, born to another wife, and Hatshepsut became regent. Within a few years she had taken the full titles of a pharaoh and was ruling as one, in a country that had no word for a female king and no precedent for what to do with one.\n\nHer solution was visual and theological at once. The reliefs show her in the male royal kilt and false beard; her inscriptions adopt the language of the king and, at Deir el-Bahri, a birth story in which the god Amun is her actual father. None of that was necessarily an attempt to deceive: Egyptian kingship was a role whose depiction had conventions, and the legitimation of a ruler by divine parentage was standard. What is unusual is that the conventions were applied to a woman and left visible — the inscriptions often use both masculine and feminine grammatical forms, sometimes in the same text.\n\nHer reign was, by the standards of the evidence, successful and mostly peaceful. The most famous episode is the expedition to Punt, probably on the Red Sea coast or the Horn of Africa, which brought back myrrh trees, ebony, ivory and live baboons, and which she recorded in detail on the walls of her temple. She built extensively: the terraced temple at Deir el-Bahri, works at Karnak including two obelisks, and restorations of monuments damaged in earlier wars. Thutmose III, who had been nominal co-ruler throughout, succeeded her and became one of Egypt’s great military kings. Late in his reign her images and cartouches were attacked across Egypt — the damnatio memoriae that, when the inscriptions were first read in the nineteenth century, led to her being described as a usurper. Modern scholarship is more cautious: the erasure happened decades after her death, its motive is not recorded, and it may have been dynastic rather than personal.',
    background:
      'The eighteenth dynasty had only recently reunified Egypt after the Hyksos period, and royal women of the early dynasty held unusually prominent religious roles — the title God’s Wife of Amun carried real authority. Hatshepsut’s reign therefore did not appear from nowhere: it came from a court in which a queen could already hold a priestly office of state importance, and from a theology in which the king’s legitimacy was made, not simply inherited.',
    keyEvents: [
      { when: 'c. 1479 BCE', event: 'Regency begins.' },
      { when: 'c. 1473 BCE', event: 'Assumption of royal titles and full pharaonic role.' },
      { when: 'c. 1470s', event: 'Punt expedition; temple construction at Deir el-Bahri begins.' },
      { when: 'c. 1458 BCE', event: 'Death and burial in the Valley of the Kings (KV20).' },
    ],
    contributions: [
      'The mortuary temple at Deir el-Bahri, one of the most distinctive buildings of ancient Egypt and the site of the Punt reliefs.',
      'Major works at Karnak, including obelisks whose transport she documented.',
      'A long period of domestic stability and trade in a dynasty otherwise known for war.',
      'The fullest surviving case of a woman ruling Egypt as pharaoh with the full royal titulary.',
    ],
    significance:
      'Hatshepsut is the clearest documented example of a woman exercising pharaonic power in ancient Egypt, and the evidence is rich enough to show how the role was adapted rather than merely borrowed. The later erasure of her name is equally instructive: it shows that Egyptian memory of a reign could be edited, which is why the king-lists are not a neutral record.',
    references: [
      { citation: 'Tyldesley, Joyce. Hatchepsut: The Female Pharaoh. Penguin, 1996.', note: 'Accessible biography with a clear discussion of the evidence.' },
      { citation: 'Roehrig, Catharine H., ed. Hatshepsut: From Queen to Pharaoh. Metropolitan Museum of Art / Yale University Press, 2005.', note: 'Exhibition catalogue; the best single collection of object-level evidence.' },
      { citation: 'Robins, Gay. Women in Ancient Egypt. Harvard University Press, 1993.', note: 'For the conventions of royal female depiction.' },
      { citation: 'The Deir el-Bahri inscriptions, as translated in Lichtheim, Miriam. Ancient Egyptian Literature, Vol. 2. University of California Press, 1976.', note: 'Primary texts in translation.' },
    ],
    interestingFacts: [
      'Her temple at Deir el-Bahri is aligned with the temple of Amun at Karnak across the Nile, and its colonnades were designed as a processional route.',
      'The Punt reliefs show the queen of Punt, whose depiction has been discussed for over a century — a reminder that Egyptian art is not a photograph.',
      'Her mummy was identified in 2007 in KV60 by matching a tooth to a canopic jar; the identification is widely accepted but not beyond all doubt.',
      'The attack on her monuments appears to have happened near the end of Thutmose III’s reign, roughly twenty years after her death — not immediately, as a usurper’s punishment would be.',
    ],
    contestedNote:
      'Why her images were defaced is not recorded, and the older “jealous usurper” story has largely been abandoned. The exact length of her reign, the identity of her mummy, and the extent of her personal as opposed to official authorship of the building programme are all matters of argument.',
    lesserKnown: [
      { layer: 'textual', text: 'Her Punt inscription describes the expedition’s cargo and says the god Amun commanded it — a claim of divine mandate from the same reign as the temple’s birth reliefs.' },
      { layer: 'analysis', text: 'Most Egyptologists now read her kingship as accepted by the court and the priesthood for two decades, not as a regency that quietly overreached.' },
      { layer: 'traditional', text: 'The “female king” framing is modern; Egyptian texts call her king and adjust grammar rather than label her a queen regnant.' },
      { layer: 'inference', text: 'The later erasure may have been aimed at the legitimacy of a female king as such, or at a dynastic rival’s line — the record does not say.' },
    ],
    variants: [
      { tradition: '19th-century Egyptology', difference: 'Read the defacement as evidence of a usurpation, and her as an ambitious interloper.' },
      { tradition: 'Modern Egyptology', difference: 'A legitimate pharaoh whose reign was accepted; the erasure is a later, unexplained act.' },
      { tradition: 'Popular history', difference: 'Often compresses the reign into a “woman disguised as a man” story that the evidence only partly supports.' },
    ],
    analysis:
      'The interesting question about Hatshepsut is not whether a woman could rule Egypt — she did — but how a system with rigid forms absorbed an occupant they were not built for. The answer was not disguise in any simple sense: the forms were modified, and the modification was left in the record. That is a more useful model for institutions than the story of a successful impostor.',
  },
  {
    id: 'mirabai',
    name: 'Mirabai',
    aliases: ['Meera', 'Mira Bai', 'Mīrābāī'],
    classification: 'religious',
    historicity: 'documented',
    traditionKey: 'hindu',
    tradition: 'Hindu — Bhakti movement, Rajasthan',
    period: 'traditionally c. 1498–1547 CE',
    datingNote:
      'That a woman saint-poet of this name sang in Rajasthan is not in serious scholarly doubt; almost every particular of her life is. The 1498–1547 CE dates are conventional, drawn from later hagiography, and modern studies place her anywhere between the late 15th and the late 16th century. The identity of her husband varies by source.',
    sources: [
      'the padas (devotional songs) attributed to her, transmitted orally and in manuscripts from the 16th–17th centuries',
      'Nabhadas, Bhaktamal (c. 1600), an early hagiographic catalogue of devotees',
      'later Rajasthani and Gujarati chronicles and hagiographies, which disagree with each other',
      'colonial-era and modern editions, which shaped the popular image considerably',
    ],
    relationships: [
      { with: 'Krishna', note: 'Her chosen deity and, in the songs, her true husband.' },
      { with: 'Rana Kumbha / Bhoj Raj', note: 'The Mewar royal family into which the tradition says she married; the identification of her husband varies by source.' },
      { with: 'Raidas', note: 'The saint-poet and cobbler, named in some traditions as her guru.' },
      { with: 'Akbar', note: 'Later legends bring the emperor to her; the story is not in the earliest sources.' },
    ],
    family: [
      { relation: 'Father', name: 'Ratan Singh', note: 'Of the Rathore clan of Merta, by the traditional account.' },
      { relation: 'Husband', name: 'Bhoj Raj', note: 'Crown prince of Mewar, in most versions; the identification is not secure.' },
      { relation: 'Father-in-law', name: 'Rana Sanga', note: 'In the traditional account.' },
    ],
    timeline: [
      { when: 'c. 1498', event: 'Birth at Kurki, near Merta, by the traditional account.' },
      { when: 'c. 1516', event: 'Marriage into the Mewar royal family, in the standard hagiography.' },
      { when: 'c. 1520s–30s', event: 'The persecutions and the departure from Mewar, as the legends describe them.' },
      { when: 'c. 1547', event: 'Death at Dwarka, according to tradition.' },
    ],
    story:
      'Mirabai is the most famous woman saint of the North Indian bhakti movement, and the least securely documented. The tradition places her birth around 1498 in a Rajput family at Kurki, near Merta, and her marriage into the ruling family of Mewar. From childhood, the songs say, she was devoted to Krishna: she treated him as her husband, sang to him in public, and refused the conduct expected of a Rajput princess. The hagiographies describe poison sent to her, a bed of nails, and repeated attempts by her husband’s family to have her killed; she survives each by divine intervention, leaves the palace, and travels as a wandering singer to Vrindavan and finally to Dwarka, where — in the best-known version — she disappears into the image of Krishna in the temple.\n\nAlmost none of that is contemporary. The earliest reference to her is in Nabhadas’s Bhaktamal, written some fifty years after her death, and the detailed biographies are later still and mutually inconsistent about her husband, her parentage, her guru and her travels. What is much better evidenced is the corpus of songs: several hundred padas in Rajasthani and Braj that carry her name, transmitted orally for centuries and printed in many editions. Their voice is distinctive — feminine, defiant, addressed to a beloved who is a god — and their central situation is the conflict between the claims of the world (family, marriage, reputation) and the claim of devotion. “I have sold my body to Hari,” one of the most quoted lines runs; the metaphor is of a transaction that cannot be undone.\n\nModern scholars differ on how much of the biography can be recovered. Some treat the songs as the primary evidence and the life as a later construction; others argue for a historical woman behind the hagiography, dated to the early sixteenth century, whose social situation — a Rajput noblewoman who would not conform — explains why the tradition remembered her as it did. Both positions agree on the essentials: a real devotional poet existed, the songs are the reason she matters, and the story of persecution is a tradition rather than a record.',
    background:
      'The bhakti movement of the fifteenth and sixteenth centuries produced a series of low-status and female voices that challenged both caste and gender norms by claiming direct access to the divine. Mirabai belongs to the Rajput strand of that movement, but the social pressure on her was different from that on a male saint: a noblewoman who sang in public, refused widowhood conventions, and treated a god as her husband was a scandal in a way that a male ascetic was not.',
    keyEvents: [
      { when: 'c. 1498', event: 'Birth, by tradition.' },
      { when: 'c. 1516', event: 'Marriage into Mewar, by tradition.' },
      { when: 'c. 1520s', event: 'Departure from Mewar, according to the hagiographies.' },
      { when: 'c. 1547', event: 'Death at Dwarka, by tradition.' },
    ],
    contributions: [
      'One of the largest and most widely sung bodies of devotional poetry by a woman in North India.',
      'A public challenge to the conventions of Rajput widowhood, caste and family authority, expressed through devotion rather than argument.',
      'A model of female sainthood that later devotional and nationalist movements used in very different ways.',
      'Songs that remain part of the living repertoire of Hindustani devotional music.',
    ],
    significance:
      'Mirabai is important on two levels. As literature, her padas are among the clearest expressions of the bhakti idiom of longing and defiance. As social history, the centuries of retelling show what a tradition does with a woman who refused its rules: it makes her a saint, softens the defiance into piety, and in the modern period turns her into a nationalist symbol. The songs are the part that resists all three.',
    references: [
      { citation: 'Hawley, John Stratton. Songs of the Saints of India. Oxford University Press, 1988 (with Mark Juergensmeyer), and Hawley’s Three Bhakti Voices, OUP, 2005.', note: 'The standard scholarly treatment in English, with translations.' },
      { citation: 'Mukta, Parita. Upholding the Common Life: The Community of Mirabai. Oxford University Press, 1994.', note: 'A social history of the Mirabai tradition and its communities.' },
      { citation: 'Nabhadas. Bhaktamal, with the commentary of Priyadas. Multiple editions.', note: 'The earliest reference to her, in a hagiographic catalogue.' },
      { citation: 'Martin, Nancy M., trans. Mirabai: The Making of a Saint. Oxford University Press, 2023.', note: 'A recent study of how the biography was constructed.' },
    ],
    interestingFacts: [
      'The name “Mirabai” and the details of her life vary across regions; the Rajasthani, Gujarati and Braj traditions do not tell the same story.',
      'Colonial-era and nationalist writers found her useful for very different arguments — a saint, a proto-feminist, a symbol of Indian womanhood — and each version selected different songs.',
      'Her poetry was transmitted orally for generations; there is no autograph manuscript, and the printed canon is an editorial construction.',
      'The story of her disappearance into the temple image at Dwarka is a devotional ending, not a historical report, and is told as such here.',
    ],
    contestedNote:
      'The identity of her husband, the persecutions, the travels, and the extent of the corpus attributed to her are all contested. This entry deliberately gives the tradition’s account and marks it as tradition, because presenting the hagiography as biography would be the exact error this section exists to avoid.',
    lesserKnown: [
      { layer: 'textual', text: 'The earliest datable reference is Nabhadas’s Bhaktamal (c. 1600), which gives her a short entry; nearly all the famous episodes are later.' },
      { layer: 'traditional', text: 'The poison, the bed of nails and the final disappearance are hagiographic motifs, and similar stories attach to other saints.' },
      { layer: 'analysis', text: 'Scholars read the corpus as the work of a tradition as much as of an individual: the songs were sung, amended and re-sung for centuries.' },
      { layer: 'inference', text: 'The intensity of the later biographical elaboration is itself evidence of how unusual her position was — the tradition needed a story to explain a woman who would not be explained away.' },
    ],
    variants: [
      { tradition: 'Rajasthani hagiography', difference: 'A Mewar princess persecuted by her in-laws, saved by Krishna, and a pilgrim to Dwarka.' },
      { tradition: 'Braj and devotional literature', difference: 'Emphasises the songs and the theology of longing, with less interest in the Rajput court.' },
      { tradition: 'Modern scholarship', difference: 'A sixteenth-century devotional poet behind a heavily elaborated later biography; the songs are the evidence.' },
    ],
    analysis:
      'The reason Mirabai still works as a figure — for singers, for readers, for anyone who has been told what they are allowed to want — is that the songs do not argue. They state a belonging and let the consequences fall. That is a different kind of courage from Socrates’ question or Ashoka’s edict, and it is the one available to people with no institutional power at all.',
  },
  {
    id: 'enheduanna',
    name: 'Enheduanna',
    aliases: ['En-hedu-ana', 'Enheduana'],
    classification: 'historical',
    historicity: 'documented',
    traditionKey: 'mesopotamian',
    tradition: 'Mesopotamia — Sumerian, Akkadian empire',
    period: 'c. 2285–2250 BCE',
    sources: [
      'the Sumerian Temple Hymns, a collection attributed to her and preserved in later copies',
      'the two Exaltation of Inanna compositions (nin-me-sar-ra), with their narrative of her expulsion',
      'inscriptions and a disk bearing her name from the giparu at Ur',
      'later Mesopotamian catalogues and copies, which preserve the attribution',
    ],
    relationships: [
      { with: 'Sargon of Akkad', note: 'Her father, according to the traditional identification; founder of the Akkadian empire.' },
      { with: 'Naram-Sin', note: 'Her nephew, under whom she may have continued in office.' },
      { with: 'Inanna', note: 'The goddess she served as high priestess and to whom the Exaltation is addressed.' },
      { with: 'Lugal-Ane', note: 'The rebel who, in her own account, expelled her from the temple.' },
    ],
    family: [
      { relation: 'Father', name: 'Sargon of Akkad', note: 'Traditional identification; the relationship is generally accepted but rests on later tradition.' },
      { relation: 'Nephew', name: 'Naram-Sin' },
    ],
    timeline: [
      { when: 'c. 2300 BCE', event: 'Born, by the conventional chronology; daughter of Sargon, according to tradition.' },
      { when: 'c. 2285 BCE', event: 'Appointed high priestess of Nanna at Ur and of Inanna at Uruk.' },
      { when: 'c. 2260 BCE', event: 'Expelled from the temple during a rebellion, according to the Exaltation of Inanna.' },
      { when: 'c. 2250 BCE', event: 'Death, by conventional estimate.' },
    ],
    story:
      'Enheduanna is the first author in world literature whose name we know. She was a Sumerian princess, appointed by the Akkadian empire to the most important priestly office in Ur, and she wrote — or the tradition attributes to her — a substantial body of hymns, including a set of temple hymns covering the sanctuaries of the land and two long poems about the goddess Inanna.\n\nHer position was political as well as religious. Sargon of Akkad had built an empire out of the Sumerian city-states, and the appointment of a daughter to the temple of Nanna at Ur was a way of binding the old southern religious capital to the new northern dynasty. The hymns she is credited with do the same work in literary form: they survey the temples of the whole territory, name them, and describe them in a single unified voice, which is both a religious act and an imperial one.\n\nThe most personal text is the Exaltation of Inanna. In it the poet describes being driven out of the temple by a usurper, appeal after appeal to the goddess going unanswered, and her eventual restoration. Whether the events are literal or a literary framework is debated; what is not in doubt is that the text is written in the first person by a woman in a very high office, and that it names its author. The Temple Hymns are ascribed to her in later Mesopotamian catalogues, and the copies that survive were made centuries after her death — which is both the evidence for her authorship and the reason it cannot be taken as a modern autograph.',
    background:
      'Sumerian literature was largely anonymous: the great poems of Gilgamesh, the creation stories, the laments were transmitted without an author’s name. Enheduanna’s name survives because her office gave her a place in the record, and because later scribes treated the Exaltation as a text with an author — the goddess’s own priestess, speaking in the first person. It is the combination of a named author and a high state office that makes her unique, not the mere existence of written poetry by women in the ancient world.',
    keyEvents: [
      { when: 'c. 2285 BCE', event: 'Appointment as high priestess at Ur, under Sargon.' },
      { when: 'c. 2260 BCE', event: 'The rebellion and expulsion described in the Exaltation of Inanna.' },
      { when: 'c. 2250 BCE', event: 'Death, by conventional chronology.' },
      { when: 'c. 1800 BCE', event: 'The surviving copies of her hymns are made — several centuries after her lifetime.' },
    ],
    contributions: [
      'The Temple Hymns, a unified literary survey of the sanctuaries of Sumer.',
      'The Exaltation of Inanna, a first-person poem of expulsion and restoration addressed to a goddess.',
      'The earliest known named authorship in world literature.',
      'A model of religious poetry as imperial statecraft — the two are not separable in her work.',
    ],
    significance:
      'Enheduanna sits at the beginning of two histories at once: the history of authorship and the history of religious poetry in a named voice. Her work also documents, more clearly than almost any other source, how the Akkadian empire used religion to integrate conquered Sumerian cities — and how a woman in a priestly office could exercise political and literary authority in the third millennium BCE.',
    references: [
      { citation: 'Hallo, William W., and J. J. A. van Dijk. The Exaltation of Inanna. Yale University Press, 1968.', note: 'The standard edition and translation of the nin-me-sar-ra.' },
      { citation: 'Sjöberg, Åke W., and E. Bergmann. The Collection of the Sumerian Temple Hymns. Locust Valley, 1969.', note: 'Edition of the temple hymn collection.' },
      { citation: 'Black, Jeremy, et al. The Literature of Ancient Sumer. Oxford University Press, 2004.', note: 'Accessible translations of the wider corpus.' },
      { citation: 'Meador, Betty De Shong. Inanna, Lady of Largest Heart: Poems of the Sumerian High Priestess Enheduanna. University of Texas Press, 2000.', note: 'A literary translation and study; useful, with the caveats of any reconstruction.' },
    ],
    interestingFacts: [
      'The “Disk of Enheduanna”, found at Ur, shows her in a procession with priests; it is one of the few contemporary images associated with her.',
      'Her hymns were copied by scribes for more than a thousand years, which is why they survive at all.',
      'The Exaltation of Inanna was used in Mesopotamian schools as a set text.',
      'The claim that she is “the world’s first author” depends on defining authorship as a named individual with a surviving work — a definition that excludes most of the literature of the ancient world, and should be read with that caveat.',
    ],
    contestedNote:
      'The authorship of the Temple Hymns is attested mainly by later catalogues, and the dates of her life are conventional rather than fixed. Whether the Exaltation describes a real expulsion or a ritual/literary situation is debated. Her relationship to Sargon rests on later tradition.',
    lesserKnown: [
      { layer: 'textual', text: 'The Exaltation of Inanna ends with a direct address to the goddess and a claim that the poem itself will be remembered — a self-conscious statement about authorship.' },
      { layer: 'analysis', text: 'Scholars read the Temple Hymns as a political as well as a devotional text, mapping the empire onto a single liturgical geography.' },
      { layer: 'traditional', text: 'Later Mesopotamian tradition preserves her as a figure of authority, and the poems continued to be copied long after her dynasty fell.' },
      { layer: 'inference', text: 'Her survival in the record may owe as much to her office and to the scribal tradition as to the poems themselves — which is a useful reminder about whose names reach us.' },
    ],
    variants: [
      { tradition: 'Later Mesopotamian tradition', difference: 'A venerated priestess and author, whose text is copied and catalogued.' },
      { tradition: 'Modern Assyriology', difference: 'A historically attested high priestess with a partly recoverable corpus; cautious about the exact composition of the collection.' },
      { tradition: 'Popular accounts', difference: 'Often present her as a straightforward “first author” and a proto-feminist, which the evidence supports only in a more limited way.' },
    ],
    analysis:
      'Enheduanna is worth knowing not because she was first — priority is a modern obsession — but because her work shows what literary authority looked like when it was inseparable from political and religious office. The poems are not private expressions; they are state liturgy with a named author, and that combination is why they survived when thousands of other Sumerian compositions did not.',
  },
  {
    id: 'marcus-aurelius',
    name: 'Marcus Aurelius',
    aliases: ['Marcus Aurelius Antoninus', 'Marcus Annius Verus'],
    classification: 'historical',
    historicity: 'documented',
    traditionKey: 'roman',
    tradition: 'Ancient Rome — Stoic philosophy',
    period: '121–180 CE',
    sources: [
      'the Meditations (Ta eis heauton), his private notebook, preserved in a manuscript tradition with some gaps',
      'Cassius Dio, Roman History, and the Historia Augusta — a late and unreliable biographical collection',
      'coins, inscriptions, and the Column of Marcus Aurelius in Rome',
      'the correspondence with his tutor Fronto, which survives',
    ],
    relationships: [
      { with: 'Antoninus Pius', note: 'Adoptive father and predecessor.' },
      { with: 'Lucius Verus', note: 'Co-emperor until his death in 169 CE.' },
      { with: 'Commodus', note: 'Son and successor, whose reign undid much of what Marcus had held together.' },
      { with: 'Fronto', note: 'Tutor and correspondent; the letters show the education of an emperor.' },
      { with: 'Epictetus', note: 'The Stoic teacher whose lectures, through Arrian’s record, shaped the Meditations.' },
    ],
    family: [
      { relation: 'Adoptive father', name: 'Antoninus Pius' },
      { relation: 'Wife', name: 'Faustina the Younger' },
      { relation: 'Son', name: 'Commodus' },
      { relation: 'Co-emperor', name: 'Lucius Verus' },
    ],
    timeline: [
      { when: '121 CE', event: 'Born in Rome.' },
      { when: '138 CE', event: 'Adopted by Antoninus Pius as heir.' },
      { when: '161 CE', event: 'Becomes emperor with Lucius Verus as co-emperor.' },
      { when: 'mid-160s CE', event: 'The Antonine Plague and the northern wars; much of the Meditations is written on campaign.' },
      { when: '180 CE', event: 'Dies, probably at Vindobona (Vienna); Commodus succeeds him.' },
    ],
    story:
      'Marcus Aurelius was born in Rome in 121 CE, into a wealthy senatorial family, and was adopted by the emperor Antoninus Pius as his heir. He was educated by the best tutors the empire could supply — Fronto for rhetoric, and, more consequentially, teachers who introduced him to Stoicism through the lectures of Epictetus. He became emperor in 161, insisted on sharing the office with his adoptive brother Lucius Verus, and spent most of the next nineteen years either in Rome dealing with plague and famine or on the Danube frontier fighting the Marcomanni and other peoples.\n\nThe Meditations were not written for publication. They are notes to himself, in Greek, in the second person or the first plural, repeating reminders: that the opinion of others is not in your control, that the obstacle is worked on by the action, that fame is brief, that the work of a human being is to act justly and to bear what happens. Much of the book was probably written in the last decade of his life, in army camps. Its literary quality is uneven by design — it is a workbook, and the repetitions are the point.\n\nHis reign was hard and is usually judged well, with one large exception. The Antonine Plague killed a substantial fraction of the population of the empire; the northern wars consumed the last decade; and the decision to let his own son Commodus succeed him, breaking the adoptive succession that had produced four good emperors, is the choice later historians have found hardest to defend — the more so because Commodus’s reign was a disaster. Marcus died in 180, probably at Vindobona on the Danube. The Stoic emperor and the failing dynasty are the same story, which is part of why the book has lasted: it is a manual for doing one’s work under conditions that keep getting worse, written by someone whose work did not, in the end, save the thing he was working for.',
    background:
      'The second century is often described as the height of the Roman peace, but it was also the century in which the empire’s structural problems became visible: the cost of the army, the pressure on the frontiers, and the arrival of epidemics along trade routes. Stoicism, as Marcus received it, was a practical philosophy of what is and is not under one’s control, developed in a world where political power was uncertain and death was normal. It was well suited to his position, and his position is why it was tested.',
    keyEvents: [
      { when: '121 CE', event: 'Birth.' },
      { when: '161 CE', event: 'Accession, with Lucius Verus as co-emperor.' },
      { when: '165–180 CE', event: 'The Antonine Plague.' },
      { when: '166–180 CE', event: 'The Marcomannic wars; the Meditations are largely composed during this period.' },
      { when: '180 CE', event: 'Death and the accession of Commodus.' },
    ],
    contributions: [
      'The Meditations, one of the few surviving first-person philosophical works from antiquity and the most widely read Stoic text.',
      'A reign conducted, by the standards of the sources, with restraint and administrative care in a period of crisis.',
      'The final major statement of Stoicism as a practical discipline rather than a theory.',
      'A documented example of a ruler whose private ethical practice is available to us and can be compared with his public decisions.',
    ],
    significance:
      'The Meditations have been read continuously since the Renaissance and are now the most popular ancient philosophical text in the world. Their importance is not doctrinal originality — Marcus is not an original philosopher — but the demonstration of a philosophy being used, daily, by someone with real power and real trouble. That is also the reason to read them sceptically: the gap between the notebook and the reign is where the interesting questions are.',
    references: [
      { citation: 'Marcus Aurelius. Meditations. Trans. Gregory Hays, Modern Library, 2002; or the Loeb edition, trans. C. R. Haines.', note: 'Primary text; the Hays translation is the most readable modern one.' },
      { citation: 'Birley, Anthony R. Marcus Aurelius: A Biography. Routledge, rev. ed., 2000.', note: 'The standard modern biography.' },
      { citation: 'Hadot, Pierre. The Inner Citadel: The Meditations of Marcus Aurelius. Harvard University Press, 1998.', note: 'The best philosophical reading of the book as a spiritual exercise.' },
      { citation: 'Cassius Dio. Roman History, Books 71–72. Loeb Classical Library.', note: 'The main narrative source, written a generation later.' },
    ],
    interestingFacts: [
      'The Meditations has no title in the manuscript tradition; “Ta eis heauton” (“to himself”) is a later description, and the book has been called a notebook, a commonplace book and a spiritual diary.',
      'Book I is a list of debts to teachers and family, one paragraph each — an unusual opening for a work of philosophy.',
      'He sold imperial furnishings to fund the war effort, according to the Historia Augusta — a late source, so the detail is traditional rather than secure.',
      'The equestrian statue of Marcus on the Capitoline survived because it was mistaken for Constantine, which is why we have it and not the others.',
    ],
    contestedNote:
      'The Historia Augusta is unreliable and much of the biographical detail about Marcus rests on it; the Meditations and Dio are the firmer sources, and both need care. The judgement on Commodus’s succession is historical hindsight: Marcus could not know what his son would become, though he knew him better than anyone.',
    lesserKnown: [
      { layer: 'textual', text: 'The Meditations repeatedly addresses itself in the second person — “you” — which is a technique of self-exhortation, not a rhetorical address to a reader.' },
      { layer: 'traditional', text: 'The story of the “rain miracle” in the Marcomannic wars, credited to the prayers of Christian soldiers or to Marcus’s own prayers, appears in several sources and is claimed by more than one tradition.' },
      { layer: 'analysis', text: 'Hadot reads the book as a set of spiritual exercises rather than a treatise, which changes what counts as repetition or inconsistency in it.' },
      { layer: 'inference', text: 'The book’s therapeutic tone suggests it was written for use under pressure rather than for an audience, which is also why it has aged better than most ancient philosophy.' },
    ],
    variants: [
      { tradition: 'Stoic tradition', difference: 'A practitioner of the discipline, not a scholarch; the book is a workbook, not a system.' },
      { tradition: 'Later reception', difference: 'From a Renaissance mirror for princes to a modern self-help text — two very different uses of the same notebook.' },
      { tradition: 'Historical scholarship', difference: 'Reads the Meditations alongside the reign, and asks what the philosophy did and did not change.' },
    ],
    analysis:
      'The Meditations is popular now because it addresses a specific modern problem — how to keep working when the conditions are bad and no one is coming to fix them. Its limitation is equally modern: it offers a discipline for the self and almost nothing about changing the structures that make the discipline necessary. Marcus ruled an empire; his book is about the part of the job he could control. That is honest, and it is also a choice.',
  },
  {
    id: 'milarepa',
    name: 'Milarepa',
    aliases: ['Mila Thöpaga', 'Shepa Dorje', 'Jetsun Milarepa', 'Mi la ras pa'],
    classification: 'religious',
    historicity: 'documented',
    traditionKey: 'buddhist',
    tradition: 'Buddhist — Tibetan, Kagyu lineage',
    period: '1040–1123 CE (the tradition’s chronology)',
    datingNote:
      'The century is secure; the years are not. Tibetan tradition gives 1040–1123, while some reference works give 1052–1135. The Life was written more than three and a half centuries after his death, so its chronology is schematic.',
    classificationNote:
      'A Tibetan yogi and teacher venerated as a saint across the Kagyu lineages, not a mythological figure. The dramatic episodes below come from a 15th-century biography, which is why the card marks what is record and what is hagiography.',
    sources: [
      'The Life of Milarepa (Tsangnyön Heruka, c. 1488), the best-known biography; translated by Andrew Quintman (Penguin Classics, 2010)',
      'The Hundred Thousand Songs of Milarepa — the collected mgur, transmitted alongside the Life; translated by Christopher Stagg (Shambhala, 2016)',
      'Gö Lotsawa Zhönnu Pel, Blue Annals (1476–78), translated by George Roerich (1949), the Kagyu lineage history',
      'Marpa’s transmission material and later Kagyu histories, which frame the teacher–disciple account',
    ],
    relationships: [
      { with: 'Marpa', note: 'His teacher; Milarepa is the “heart-disciple”, and the trials Marpa imposed are the centre of the biography.' },
      { with: 'Gampopa', note: 'Chief successor in the monastic line; most of the surviving Kagyu schools descend through him.' },
      { with: 'Rechungpa', note: 'The closest disciple in the biography and the recipient of its most personal teaching.' },
      { with: 'Tsangnyön Heruka', note: 'The 15th-century author of the Life and compiler of the Songs; the Milarepa we read is substantially his construction.' },
    ],
    family: [
      { relation: 'Father', name: 'Mila Sherab Gyaltsen', note: 'Dies when Milarepa is a child, in the biography’s account.' },
      { relation: 'Mother', name: 'Nyangtsa Kargyen', note: 'Her treatment at the hands of the uncle and aunt, and her demand for revenge, set the story in motion.' },
      { relation: 'Sister', name: 'Peta Paldron', note: 'Also given as Peta Gönkyi; shares the family’s hardship, and later accounts differ on what became of her.' },
      { relation: 'Paternal uncle and aunt', name: 'Unnamed in the English translations', note: 'They take the family estate and, in the Life, reduce mother and children to servants.' },
    ],
    timeline: [
      { when: '1040 CE', event: 'Born at Kya Ngatsa in Gungthang, western Tibet, by the tradition’s chronology.' },
      { when: 'c. 1043', event: 'His father dies; the estate is taken by his uncle and aunt, and the family is reduced to poverty — as the Life tells it.' },
      { when: 'c. 1060s', event: 'At his mother’s urging he learns black magic and, the tradition says, kills thirty-seven people; remorse turns him towards the dharma.' },
      { when: 'c. 1078', event: 'Aged thirty-eight, he finds Marpa at Lhodrak and enters years of trials, including the building of towers.' },
      { when: 'c. 1084', event: 'Receives initiation and the secret name Shepa Dorje, then leaves for solitary practice.' },
      { when: 'c. 1084–1096', event: 'Twelve years in cave retreat, chiefly at Drakar Taso (White Rock Horse Tooth), living on nettles.' },
      { when: 'c. 1100–1123', event: 'Wanders and teaches in song; his disciples include Rechungpa and Gampopa. Dies in 1123, by the tradition’s reckoning.' },
    ],
    story:
      'Milarepa is the best-known saint in Tibetan Buddhism, and almost everything memorable about him comes from a biography written nearly four centuries after his death. In that account he is born into a comfortable family in Gungthang, in western Tibet; his father dies, the estate is seized by an uncle and aunt, and he grows up with his mother and sister in servitude. His mother sends him to learn sorcery, and he uses it: a spell destroys the house of his relatives during a wedding, killing thirty-seven people. The triumph turns to dread, and he goes looking for a teacher who can undo what he has done.\n\nHe finds Marpa, a married lay master who has travelled to India and brought back the tantric transmissions of Naropa and Maitripa. Marpa does not comfort him. He sets him to building towers and then demolishing them, year after year, in what the tradition reads as a deliberate burning-away of the sorcerer’s self-importance; the nine-storey tower at Lhodrak is still shown as his work. When the trials end, Marpa gives him the initiation and the name Shepa Dorje, and sends him away to practise alone.\n\nThat solitude is the part of the story Tibet kept: years in caves, in a thin cotton robe, living on nettles until, the Life jokes, his body turned green — and, in the songs, a mind that had become transparent to itself. What survives in the Hundred Thousand Songs is a vernacular voice, by turns defiant, funny, tender and bleak, addressed to patrons, to a departing disciple, to a sister he could not save, and to the death he met without fuss. He refused monastic ordination. The model he left behind is not the monk but the yogi whose realisation is tested in retreat, and the Kagyu lineage that descends through Gampopa carries his name as its origin story.',
    background:
      'Eleventh-century Tibet was a country of local lordships and monasteries, a century and a half into the “later diffusion” of Buddhism after the collapse of the old empire. The most prized Buddhist knowledge was still arriving from India, carried by translators and pilgrims; Marpa, Milarepa’s teacher, was one of the great travellers of that generation. The Kagyu (“whispered lineage”) tradition that grew from this circle emphasised direct oral transmission from teacher to disciple and intensive retreat practice rather than scholastic curriculum — an emphasis that made a lay yogi with no monastic office a plausible lineage holder, and made his songs, rather than his institutions, the thing that carried him.',
    keyEvents: [
      { when: 'c. 1043', event: 'Father’s death and the seizure of the estate — the biography’s turn towards revenge.' },
      { when: 'c. 1078', event: 'Meets Marpa; the years of trials begin.' },
      { when: 'c. 1084', event: 'Initiation and the name Shepa Dorje; departure into retreat.' },
      { when: 'c. 1096', event: 'Emerges from twelve years of practice and begins to teach.' },
      { when: '1123', event: 'Death, in the tradition’s chronology; the songs and the lineage carry on without him.' },
    ],
    contributions: [
      'The mgur (song-poems) collected as the Hundred Thousand Songs, the most widely read body of Tibetan religious poetry and one of the few major Tibetan works written for lay listeners.',
      'The transmission from Marpa through Milarepa to Gampopa, from which the major Kagyu schools descend.',
      'A durable model of the “cotton-clad” yogi: realisation demonstrated in austerity and retreat rather than in monastic rank.',
      'A biography that became a literary form — Tsangnyön Heruka’s Life shaped how Tibetan saints’ lives were written afterwards.',
    ],
    significance:
      'Milarepa matters to Tibetan Buddhism as a saint, to Tibetan literature as a poet, and to the study of religion as a case where the boundary between the two is unusually visible. The songs are the part most likely to preserve something of his own voice; the Life is a 15th-century religious reformer’s portrait of him, and reading it as a chronicle would mislead. Both are read here with that difference on the surface.',
    references: [
      { citation: 'Tsangnyön Heruka. The Life of Milarepa. Trans. Andrew Quintman. New York: Penguin Classics, 2010.', note: 'The standard English translation of the biography; the introduction sets out what is record and what is hagiography.' },
      { citation: 'Quintman, Andrew. The Yogin and the Madman: Reading the Biographical Corpus of Tibet’s Great Saint Milarepa. New York: Columbia University Press, 2014.', note: 'A study of the several lives of Milarepa and of how they differ from one another.' },
      { citation: 'Tsangnyön Heruka. The Hundred Thousand Songs of Milarepa. Trans. Christopher Stagg. Boulder: Shambhala, 2016.', note: 'The song collection, the part of the corpus closest to the yogi’s own voice.' },
      { citation: 'Gö Lotsawa Zhönnu Pel. The Blue Annals. Trans. George N. Roerich. Calcutta: Royal Asiatic Society of Bengal, 1949.', note: 'The 15th-century lineage history; used for the Kagyu succession rather than for biography.' },
    ],
    interestingFacts: [
      '“Milarepa” is a nickname: Mila is the family name, and repa (“cotton-clad”) refers to the thin cotton robe worn in Himalayan cold, taken as evidence of inner heat (tummo).',
      'The nettle diet is a joke in the Life as well as an austerity: his body is said to have turned green, which is why some of the oldest paintings show a green-skinned yogi.',
      'He never took monastic ordination, and remained a lay yogi — one reason the Kagyu tradition can present him as proof that realisation does not require a monastery.',
      'The Life was written in 1488, more than three and a half centuries after his death, by an author with a reformer’s agenda.',
    ],
    contestedNote:
      'How much of the biography is historical is genuinely unsettled. The earliest references to Milarepa are thin; the songs have a long editorial history; and the vivid episodes — the sorcery, the towers, the green skin — come from a 15th-century Life written for a lineage purpose. Scholars treat the existence and the teaching lineage as secure and the biography as literature, while devotional tradition reads the Life as scripture. The card keeps both readings visible rather than choosing for the reader.',
    lesserKnown: [
      { layer: 'textual', text: 'The Hundred Thousand Songs is a compilation with a long history of editing and expansion; individual songs cannot be dated to the yogi’s lifetime with confidence, which is why the collection is cited here as a transmitted corpus rather than as a contemporary record.' },
      { layer: 'traditional', text: 'The sorcery episode, the killing of thirty-seven people and the tower-building under Marpa are all reported by the 15th-century Life, not by any contemporary source.' },
      { layer: 'analysis', text: 'Scholars read the Life through its author: Tsangnyön Heruka (1452–1507) wrote it while reforming his own lineage, and the Milarepa of perseverance and obedience is shaped by that aim.' },
      { layer: 'inference', text: 'The songs’ popularity may owe as much to their vernacular directness as to their doctrine — they were composed to be heard and remembered, which is not how most Tibetan philosophical literature works.' },
    ],
    variants: [
      { tradition: 'Kagyu tradition', difference: 'Reads the Life as scripture and as a teaching text on perseverance; the saints’ biography is the doctrine in narrative form.' },
      { tradition: 'Modern scholarship', difference: 'Treats the Life as a 15th-century literary work and reconstructs the historical yogi from the songs and early lineage references, where he is much thinner.' },
      { tradition: 'Dating conventions', difference: '1040–1123 is the tradition’s chronology; some reference works give 1052–1135. The century, not the years, is what is secure.' },
    ],
    analysis:
      'Milarepa is popular for a reason that is not quite devotional: his story is about a person who does something unforgivable, is not let off, and spends the rest of his life working it out in the cold. The Life makes the labour visible — the pointless towers, the years of nettles — and the songs give it a voice without piety. That combination is rare in hagiography and it is why the figure travels outside Buddhism. The caution is the one this whole section is built on: the vividness of the story is evidence of its literary power, not of its factual detail, and the two should not be quietly swapped.',
  },
];
