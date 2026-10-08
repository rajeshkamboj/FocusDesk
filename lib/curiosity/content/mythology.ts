import type { MythCharacter } from '../types';

/**
 * Mythology — Character of the Day.
 *
 * Two rules govern this file, and both are structural rather than stylistic:
 *
 * 1. Nothing here silently mixes scripture with interpretation. Every
 *    lesser-known point carries an evidence layer (`textual`, `traditional`,
 *    `analysis`, `inference`), and the page prints that label next to the
 *    claim. Where traditions disagree, `variants` states the disagreement
 *    instead of blending it into one smooth story.
 * 2. The array is deliberately interleaved — subcontinental character, then a
 *    world tradition, and so on — so the daily rotation alternates instead of
 *    spending a week in one mythology.
 *
 * Authored as typed static data, like the rest of the Curiosity corpus:
 * deterministic day-index selection, shipped server-side only.
 */
export const mythCharacters: MythCharacter[] = [
  {
    id: 'arjuna',
    name: 'Arjuna',
    tradition: 'Hindu — Mahabharata epic',
    sources: [
      'The Mahabharata, attributed to Vyasa (the “Jaya”, “Bharata”, “Mahabharata” layers)',
      'The Bhagavad Gita, embedded as a dialogue inside the Bhishma Parva',
      'Later classical retellings such as Bharavi’s Kiratarjuniya (c. 6th century CE)',
      'Puranic genealogies that expand the Pandava lineage',
    ],
    relationships: [
      { with: 'Krishna', note: 'Charioteer and guide on the first day of the war; the Gita is their conversation.' },
      { with: 'Drona', note: 'Teacher of archery; Drona later fights on the opposing side.' },
      { with: 'Karna', note: 'Life-long rival, revealed only at the end to be his eldest brother.' },
      { with: 'Duryodhana', note: 'Cousin and antagonist across the whole epic.' },
    ],
    family: [
      { relation: 'Father (divine)', name: 'Indra', note: 'By the epic’s divine-father device.' },
      { relation: 'Mother', name: 'Kunti' },
      { relation: 'Brothers', name: 'Yudhishthira, Bhima, Nakula, Sahadeva' },
      { relation: 'Wife', name: 'Draupadi', note: 'Shared with all five Pandavas in the epic’s own telling.' },
      { relation: 'Wife', name: 'Subhadra', note: 'Krishna’s sister; mother of Abhimanyu.' },
      { relation: 'Son', name: 'Abhimanyu', note: 'Killed in the chakravyuha at sixteen.' },
      { relation: 'Son', name: 'Iravan', note: 'Born to the Naga princess Ulupi.' },
    ],
    timeline: [
      { when: 'Childhood', event: 'Raised at Hastinapura with his cousins; trained in archery by Drona.' },
      { when: 'Young man', event: 'Wins Draupadi at her swayamvara; later exiled for the terms of that marriage.' },
      { when: 'Year 13 of exile', event: 'Lives incognito as Brihannala, a dance teacher, in Virata’s court.' },
      { when: 'Before the war', event: 'The Gita: he refuses to fight, argues with Krishna, and re-enters the war.' },
      { when: 'Year 18 of the war', event: 'Survives all eighteen days while his sons and brothers’ sons do not.' },
      { when: 'After the war', event: 'Rules at Hastinapura, performs the ashvamedha, and dies on the final journey to the mountains.' },
    ],
    story:
      'Arjuna is the third Pandava: born to Kunti, unshakeably focused, and unmatched with the bow. He wins Draupadi, loses his kingdom to a rigged dice game, and spends thirteen years in exile — part of it disguised as a dance teacher in another king’s court. On the morning the great war begins, he looks at the men he has grown up with on the opposing side and puts down his bow. The long argument that follows, and the answer he receives, become the Bhagavad Gita. He wins the war, and in the end the epic does not let him keep much else.',
    lesserKnown: [
      { layer: 'textual', text: 'The epic piles names on him — Phalguna, from the month of his birth; Jishnu, “the unvanquishable”; Savyasachin, “ambidextrous”, for his bow hand; and Kiritin, after the crown Indra gives him.' },
      { layer: 'traditional', text: 'Krishna is traditionally said to have bowed to Arjuna rather than the other way round — the teacher taking the seat of the servant.' },
      { layer: 'analysis', text: 'Scholars read the Gita’s placement — a battlefield pause — as a deliberate psychological device: the argument for action is made at the moment action is most horrifying.' },
      { layer: 'inference', text: 'Arjuna’s panic before the war is sometimes read as the epic’s own anxiety about a catastrophe (the Kurukshetra war) that its listeners had inherited in living memory. The epic never says this.' },
    ],
    variants: [
      { tradition: 'Sanskrit epic (Vyasa)', difference: 'Arjuna is a warrior and a person of extraordinary but human inconsistency; he boasts, and the epic records it.' },
      { tradition: 'Tamil retellings', difference: 'Bharavi’s Kiratarjuniya and later Tamil works make the Shiva-versus-Arjuna hunt the epic’s central set-piece of devotion and humility.' },
      { tradition: 'Regional devotional retellings', difference: 'Many tellings foreground Arjuna’s surrender to Krishna until his panic disappears altogether, which the Sanskrit text never quite does.' },
    ],
    analysis:
      'Arjuna is the epic’s portrait of exceptional competence without inner steadiness — a man who can do the thing and still cannot decide to. The Gita’s answer is not confidence, it is duty performed without attachment to the outcome, which is why Arjuna keeps his fear and fights anyway.',
  },
  {
    id: 'athena',
    name: 'Athena',
    tradition: 'Ancient Greek (later Roman Minerva)',
    sources: [
      'Homer’s Iliad and Odyssey',
      'Hesiod’s Theogony, which gives her birth from Zeus’s head',
      'The Homeric Hymn to Athena',
      'Later writers such as Pindar, Apollodorus and Ovid',
    ],
    relationships: [
      { with: 'Odysseus', note: 'Her chosen mortal — she guides, disguises and tests him.' },
      { with: 'Zeus', note: 'Father; their alliance is the closest thing she has to a partnership.' },
      { with: 'Poseidon', note: 'Rival for Attica; the contest for Athens is decided by an olive tree.' },
      { with: 'Arachne', note: 'The weaver punished for claiming equality in her own craft.' },
    ],
    family: [
      { relation: 'Father', name: 'Zeus' },
      { relation: 'Mother (Hesiod)', name: 'Metis', note: 'Swallowed by Zeus while pregnant, in the Theogony’s telling.' },
      { relation: 'Half-siblings', name: 'Apollo, Artemis, Ares, Hermes, Hephaestus and others' },
      { relation: 'Associates', name: 'Nike', note: 'Victory, frequently shown beside her.' },
      { relation: 'Older cult form', name: 'A-ta-na po-ti-ni-ja', note: '“Mistress of Athana”, in Linear B tablets at Knossos.' },
    ],
    timeline: [
      { when: 'Mycenaean period (c. 1400 BCE)', event: 'A “Mistress of Athana” appears in Linear B records — earlier than any Greek myth we have.' },
      { when: 'Archaic period', event: 'Major civic cults and the Panathenaia festival at Athens.' },
      { when: '5th century BCE', event: 'The Parthenon and Athena Parthenos give her the most famous temple in the Greek world.' },
      { when: 'Roman period', event: 'Identified with Minerva and absorbed into Roman state religion.' },
      { when: 'Modern', event: 'A stock symbol of wisdom, strategy, universities and, more often than the myths allow, peace.' },
    ],
    story:
      'Athena is born from Zeus’s head, already grown and already armed — the only Olympian whose birth is a fully-formed adult appearing in a flash. In the Iliad and Odyssey she is the divine mind of the Greek camp: she tips a spear, whispers the right deception into Odysseus’s ear, and disguises him when he needs to be unrecognised. Around Athens she is a civic patron, with contests of weaving and olives; she is generous with those who respect craft and merciless with those who claim to have surpassed her.',
    lesserKnown: [
      { layer: 'textual', text: 'In Hesiod, her mother is Metis, whose name means something like “counsel” or “cunning intelligence”; Zeus swallows Metis while she is pregnant, and Athena is born from his head.' },
      { layer: 'traditional', text: 'Later tellings add the axe: Hephaestus (sometimes Prometheus) splits Zeus’s head, and Athena emerges with a shout.' },
      { layer: 'analysis', text: 'Her name appears to predate Greek, though the explanation is debated; the Linear B record shows her as a goddess before she is a myth, which is a useful reminder that cults are usually older than the stories told about them.' },
      { layer: 'inference', text: 'Her iconography — shield, spear, helmet, and no consort — is often read as a deliberately non-marital figure in a very marital society, yet no ancient source states the intent.' },
    ],
    variants: [
      { tradition: 'Hesiod', difference: 'Theogony gives Metis as her mother and places her birth at the top of the cosmic order, as the child of Zeus’s mind.' },
      { tradition: 'Homeric hymns and later mythography', difference: 'The story of the axe, and the identity of who wielded it, varies freely across authors, which the tradition never bothers to reconcile.' },
      { tradition: 'Cult practice vs myth', difference: 'In Athens she is a civic, festival deity with priestesses and processions; the myths about her are comparatively few. Practice carries more weight than narrative.' },
    ],
    analysis:
      'Athena is the most strategic figure on Olympus, and one of the most unsettling: her wisdom is inseparable from winning. Read alongside her birth, the myth does something precise — it takes cunning intelligence (Metis), puts it inside Zeus, and produces a warrior daughter from his head. Strategically useful cleverness is domesticated into the established order, which is itself a commentary on how power handles intelligence.',
  },
  {
    id: 'sita',
    name: 'Sita',
    tradition: 'Hindu — Ramayana epic',
    sources: [
      'Valmiki’s Ramayana (the Sanskrit epic, “Adi Kavya”)',
      'Tulsidas’s Ramcharitmanas (16th century, Awadhi)',
      'The Adhyatma Ramayana and other devotional retellings',
      'Jain Ramayanas and regional folk versions, which differ substantially',
    ],
    relationships: [
      { with: 'Rama', note: 'Husband; the epic’s central pairing of exile, separation and reunion.' },
      { with: 'Ravana', note: 'Captor in Valmiki; in some Jain and folk versions something very different.' },
      { with: 'Hanuman', note: 'He reaches her alone in the Ashok Vatika and returns with her message.' },
      { with: 'Valmiki', note: 'Shelters her in exile; her sons learn the epic from him.' },
    ],
    family: [
      { relation: 'Father', name: 'Janaka', note: 'King of Mithila, known across the epics for wisdom.' },
      { relation: 'Mother', name: 'Sunayana' },
      { relation: 'Sisters', name: 'Urmila, Mandavi, Shrutakirti' },
      { relation: 'Husband', name: 'Rama' },
      { relation: 'Sons', name: 'Lava and Kusha', note: 'Born after the second exile.' },
      { relation: 'Origin', name: 'Found in a furrow', note: 'Sita means “furrow”; the earth is her source in Valmiki’s telling.' },
    ],
    timeline: [
      { when: 'Birth', event: 'Found as an infant while Janaka’s field is being ploughed; raised in Mithila.' },
      { when: 'Marriage', event: 'Marries Rama when he lifts and breaks Shiva’s bow.' },
      { when: 'Exile', event: 'Insists on going with Rama and Lakshmana into the forest for fourteen years.' },
      { when: 'Kidnapping', event: 'Carried off from Panchavati after crossing the Lakshmana Rekha in most later tellings.' },
      { when: 'Rescue', event: 'Rama defeats Ravana; Sita proves herself and they return to Ayodhya.' },
      { when: 'Second exile and end', event: 'She is sent away, raises her sons, and at the end returns to the earth.' },
    ],
    story:
      'Sita is Janaka’s daughter, found as a baby in a furrow in a field, and she grows up in the court of Mithila. She marries Rama, walks into a fourteen-year exile with him by her own insistence, and is taken to Lanka while he is away chasing a deer. Everything after that is harder rather than better: the war, the public doubt, the fire, the return, and then a second exile — sent away not for anything she did but because a king is expected to answer to opinion. In the epic’s last pages she is reunited with Rama once, raises the twins who recite her story, and finally asks the earth she came from to take her back.',
    lesserKnown: [
      { layer: 'textual', text: 'In Valmiki, Sita’s sons learn their father’s own epic from Valmiki and sing it back to him at a sacrifice. Rarely in world literature is a family’s tragedy narrated inside itself.' },
      { layer: 'traditional', text: 'The Lakshmana Rekha — the line Sita must not cross — is enormously well known across South Asia and is not in the Valmiki Ramayana at all.' },
      { layer: 'analysis', text: 'Modern scholars and writers have read the final act — Sita rejecting a return and choosing the earth — as her one unambiguous act of refusal in an epic where she is otherwise asked to prove herself repeatedly.' },
      { layer: 'inference', text: 'Some readings connect her name to both agriculture and the earth goddess, and treat the epic’s ending as the earth reclaiming its own. The text does not state this connection.' },
    ],
    variants: [
      { tradition: 'Valmiki Ramayana', difference: 'Ravana carries off the real Sita; after the war she undergoes an ordeal by fire, and in the final book she is received by the earth.' },
      { tradition: 'Ramcharitmanas / Adhyatma Ramayana', difference: 'Devotional traditions have a shadow Sita (maya-Sita) taken by Ravana, with the real Sita kept hidden with Agni — the ordeal is then an appearance, not a trial.' },
      { tradition: 'Jain Ramayana (Vimalsuri, Ravisena)', difference: 'Sita is Ravana’s daughter in these tellings, and the entire moral shape of the abduction changes; Rama is also a figure of non-violence, not only a warrior.' },
    ],
    analysis:
      'Sita’s story is where the epic is at its most uncomfortable, because the person with the least power keeps being asked for proof. Psychologically she is read as the epic’s centre of endurance — but the more modern reading is sharper: her final refusal is the moment the epic stops being about a king and becomes about a woman who has stopped answering.',
  },
  {
    id: 'anansi',
    name: 'Anansi',
    tradition: 'Akan (Asante) oral tradition, carried across the Atlantic',
    sources: [
      'Akan oral storytelling — no scripture and no fixed written canon',
      'Collections made in the early 20th century, such as R. S. Rattray’s Twi collections',
      'Jamaican Anancy stories and Gullah/Southern US “Aunt Nancy” tellings',
      'Modern children’s literature and Caribbean retellings',
    ],
    relationships: [
      { with: 'Nyame', note: 'The sky god, from whom the stories are bought — and, in some tellings, his father.' },
      { with: 'Aso', note: 'His wife, who sees through most of his schemes.' },
      { with: 'Turtle, Rabbit and Leopard', note: 'The neighbours his tricks are usually aimed at.' },
      { with: 'Nyame’s four tasks', note: 'A python, hornets, a leopard and a fairy — the price of the stories.' },
    ],
    family: [
      { relation: 'Father (some tellings)', name: 'Nyame', note: 'The sky god — in other tellings he is not kin but the one who owns the stories.' },
      { relation: 'Mother', name: 'Asase Yaa', note: 'The earth, in tellings that make the lineage explicit.' },
      { relation: 'Wife', name: 'Aso' },
      { relation: 'Son', name: 'Ntikuma', note: 'Named in some Akan tellings, often the one who sees what his father is doing.' },
      { relation: 'Canon', name: 'No fixed genealogy', note: 'The tradition does not agree, and does not need to.' },
    ],
    timeline: [
      { when: 'Pre-colonial Akan tradition', event: 'Tales told as “Anansesem”, with the teller and the audience answering each other. Origin undatable.' },
      { when: '19th–20th centuries', event: 'Euro-American collectors write them down; spelling and structure settle for the first time.' },
      { when: 'Middle Passage', event: 'Carried to the Caribbean and the American South, where he becomes Anancy, Aunt Nancy and a cousin of Brer Rabbit.' },
      { when: '20th century onward', event: 'A widely published children’s character, and a recognised emblem of survival, cunning and storytelling itself.' },
    ],
    story:
      'Anansi is a spider, small and never strong, who lives by his wits. In the best-known tale he finds that all the stories belong to Nyame, the sky god, and asks for them. Nyame sets a price: capture Onini the python, the hornets, Osebo the leopard, and Mmoatia the fairy. Anansi does all four — a branch and a vine for the python, a gourd for the hornets, a pit for the leopard, and a doll of gum for the fairy — and the stories are renamed for him. What he wins is not treasure or a kingdom: it is the right to be talked about. From then on every tale is Anansi’s tale, and every teller is his accomplice.',
    lesserKnown: [
      { layer: 'textual', text: 'There is no scripture, so “textual” here means the recorded collections. Before the nineteenth century, Anansi exists only in performance — which raises a real scholarly problem, since written versions freeze one voice out of many.' },
      { layer: 'traditional', text: 'In some Akan tellings Anansi is Nyame’s son or messenger; in many others he is simply the neighbour who argues with him. The tradition keeps both.' },
      { layer: 'analysis', text: 'After the Middle Passage he becomes one of the few African characters who successfully crossed into the Americas, where scholars read his survival as a way of telling stories that could not be told directly.' },
      { layer: 'inference', text: 'He is often said to have inspired or shaded into Brer Rabbit in the American South; the family resemblance is real, but the line of transmission is argued rather than documented.' },
    ],
    variants: [
      { tradition: 'Akan (Ghana)', difference: 'Anansi is a full morally ambiguous character, and the tales are told with audience participation, proverbs and songs — the performance is the story.' },
      { tradition: 'Jamaican Anancy', difference: 'Told in patois, the trickster is more openly subversive, with the trickiness emphasised over the spider form.' },
      { tradition: 'Modern publishing', difference: 'Illustrated retellings frequently make him more childlike and tidier than any oral telling, and the sharper edges are removed.' },
    ],
    analysis:
      'Anansi is what a tradition creates when the powerful cannot be confronted directly: he has no strength, no title and no army, and he gets what he wants by talking. That is why the character functions as more than a trickster — the very right to tell stories is what he wins, so every Anansi tale is also about who gets to speak.',
  },
  {
    id: 'hanuman',
    name: 'Hanuman',
    tradition: 'Hindu — Ramayana, Puranas and a large devotional tradition',
    sources: [
      'Valmiki’s Ramayana, especially the Sundara Kanda, which is effectively his book',
      'The Mahabharata, where he appears in the Pandavas’ story',
      'Tulsidas’s Hanuman Chalisa and Vinaya Patrika',
      'Regional and Southeast Asian retellings, including the Thai Ramakien',
    ],
    relationships: [
      { with: 'Rama', note: 'The centre of his devotion; the reason he can lift a mountain.' },
      { with: 'Sita', note: 'He finds her in Lanka and carries her message back.' },
      { with: 'Sugriva', note: 'Vanara ally he helps to the throne of Kishkindha.' },
      { with: 'Bhima', note: 'Meets his own brother in the Mahabharata and teaches him humility.' },
    ],
    family: [
      { relation: 'Mother', name: 'Anjana', note: 'An apsara reborn as a vanara woman.' },
      { relation: 'Father', name: 'Kesari', note: 'A vanara chief.' },
      { relation: 'Divine parent', name: 'Vayu', note: 'The wind god; hence Maruti and Vayusuta.' },
      { relation: 'Brother (tradition)', name: 'Bhima', note: 'Both are associated with Vayu in the Mahabharata.' },
      { relation: 'Son', name: 'Makardhwaja', note: 'Appears in later folk and Puranic tellings, not Valmiki.' },
      { relation: 'Status', name: 'One of the chiranjivis', note: 'Traditionally the immortals who remain through the ages.' },
    ],
    timeline: [
      { when: 'Childhood', event: 'Leaps at the rising sun thinking it is a fruit; is struck down, and is granted boons (and in some tellings a curse of forgetting his power).' },
      { when: 'Meeting Rama', event: 'Sent by Sugriva as a messenger; recognises Rama at first sight.' },
      { when: 'Search for Sita', event: 'Leaps the ocean, shrinks and grows at will, and finds her in Ashok Vatika.' },
      { when: 'Lanka', event: 'His tail is set alight; he burns the city and returns.' },
      { when: 'During the war', event: 'Carries the Oshadhi mountain when he cannot identify the healing herb.' },
      { when: 'After the war', event: 'In Tulsidas’s telling he is offered a necklace of pearls and asks, instead, to be given Rama and Sita.' },
    ],
    story:
      'Hanuman is the son of Anjana and Kesari, with the wind itself as his divine parent, and as a child he tries to eat the sun. He grows into the strongest of the vanaras but is often the last to remember what he can do, and it takes others — Jambavan, then Rama — to remind him. From the moment he meets Rama he has a single purpose: finding Sita. He crosses the sea, brings back her message, allows his tail to be set on fire and hands that fire back to Lanka. In the war he fetches a whole mountain because he cannot recognise the herb on it, and afterwards, offered a necklace of pearls, he asks for Rama and Sita instead.',
    lesserKnown: [
      { layer: 'textual', text: 'In the Mahabharata, Hanuman also rides on Arjuna’s chariot banner during the Kurukshetra war — his earliest appearance outside the Ramayana is as a standard, not a character.' },
      { layer: 'traditional', text: 'The Hanuman Chalisa, attributed to Tulsidas, is a much later devotional text than the epic and is recited far more often than the epic is read.' },
      { layer: 'analysis', text: 'His function in the epic is unusual: he is the only character who is almost never wrong, which is why the tradition reads him as the ideal devotee rather than the ideal hero.' },
      { layer: 'inference', text: 'The herb-fetching episode is often explained as a joke about strength outrunning knowledge, but the epic offers no such comment — that is a reader’s inference.' },
    ],
    variants: [
      { tradition: 'Valmiki Ramayana', difference: 'Hanuman is a formidable vanara ally whose powers are real but whose forgetting of them is central.' },
      { tradition: 'Thai Ramakien', difference: 'In Southeast Asian tellings, Hanuman is a romantic trickster with a very different moral profile — a striking contrast with the celibate devotee of Indian devotion.' },
      { tradition: 'Regional temple traditions', difference: 'In many places he is worshipped as a protective gate-keeper and patron of wrestlers and gymnasiums, a role that barely appears in the epic text.' },
    ],
    analysis:
      'Hanuman is the character the tradition uses to think about strength without ego. His powers are never in doubt; what changes is whether he remembers them, which makes him a rare mythological model in which the work is not in acquiring a capability but in recalling it when it is needed.',
  },
  {
    id: 'loki',
    name: 'Loki',
    tradition: 'Norse — recorded in 13th-century Icelandic sources',
    sources: [
      'The Poetic Edda, especially Lokasenna, Thrymskvida and Voluspa',
      'Snorri Sturluson’s Prose Edda (c. 1220), written two centuries after conversion',
      'Later Scandinavian folklore and ballads',
      'Modern retellings, which are effectively a tradition of their own',
    ],
    relationships: [
      { with: 'Odin', note: 'Blood-brothers, by Loki’s own claim in the Lokasenna.' },
      { with: 'Thor', note: 'Companion on several journeys, and the target of his worst trick.' },
      { with: 'Baldr', note: 'In Snorri, the cause of his death; this is what gets him bound.' },
      { with: 'Heimdall', note: 'They will finally fight each other at Ragnarök.' },
    ],
    family: [
      { relation: 'Father', name: 'Farbauti', note: 'Meaning something like “cruel striker”.' },
      { relation: 'Mother', name: 'Laufey (or Nal)', note: 'Loki is sometimes called Laufey’s son, and he carries her name.' },
      { relation: 'Wife', name: 'Sigyn', note: 'Holds a bowl over him in the cave, catching the dripping venom.' },
      { relation: 'Consort', name: 'Angrboda', note: 'A giantess; mother of Fenrir, Jormungandr and Hel.' },
      { relation: 'Children', name: 'Fenrir, Jormungandr, Hel, Narfi/Váli', note: 'Also Sleipnir — whom Loki bore in the form of a mare.' },
      { relation: 'Siblings', name: 'Byleistr and Helblindi', note: 'Named but never developed.' },
    ],
    timeline: [
      { when: 'Pre-Christian period', event: 'Effectively invisible. There is no certain image, place name or amulet of Loki from pagan Scandinavia — unlike Odin or Thor.' },
      { when: 'c. 1270', event: 'The Codex Regius is written down, containing the Lokasenna, where Loki insults every god in turn.' },
      { when: 'c. 1220', event: 'Snorri’s Prose Edda shapes the Loki most people now know: the architect of Baldr’s death and a bound traitor.' },
      { when: '19th century', event: 'Romantic philology turns him into a fire god or a storm spirit — a reading that later scholarship largely abandoned.' },
      { when: '21st century', event: 'Film and comics make him a global character, with an entirely new family resemblance to modern anti-heroes.' },
    ],
    story:
      'Loki is the god the other gods cannot expel until they must. He travels with Thor, talks them out of the trouble he created, and accepts the risk of being the only one willing to lie. He cuts Sif’s hair and then has to replace it with gold; he borrows a dress with Thor and steals back Mjolnir; he takes the form of a mare and gives birth to Odin’s eight-legged horse. And then, in Snorri’s telling, he arranges the death of Baldr by putting a mistletoe weapon into a blind brother’s hand. Bound in a cave with his son’s entrails, with poison dripping onto his face and his wife holding a bowl, he waits — and the stories end with him breaking free and fighting Heimdall at the end of the world.',
    lesserKnown: [
      { layer: 'textual', text: 'The Lokasenna is largely a flying — an insult contest — and its Loki is a guest with genuine grievances, not merely a villain. Snorri’s Loki, written later and after religious change, is darker and more orderly as a villain.' },
      { layer: 'textual', text: 'Loki has almost no archaeological footprint. No pagan-period image certainly depicts him, which is unusual for a figure this prominent in the written sources.' },
      { layer: 'analysis', text: 'The 19th-century idea that Loki was a fire god rests largely on his name resembling “logi” (flame) and on a desire for neat parallels. The etymology is not settled, and the fire-god reading is a modern construction.' },
      { layer: 'inference', text: 'His gender-changing, his shape-shifting and his rule-breaking are often read as a “boundary figure” in a society that mapped kin and oath strictly. The sources never explain him that way.' },
    ],
    variants: [
      { tradition: 'Poetic Edda', difference: 'Loki is a companion and a trickster among the gods, funny and dangerous, with a real quarrel to make.' },
      { tradition: 'Snorri’s Prose Edda', difference: 'He is organised into a coherent antagonist with a crime (Baldr) and a lawful punishment.' },
      { tradition: 'Modern popular culture', difference: 'He is a sympathetic, charismatic outsider — a reading far closer to 20th-century tastes than to either medieval text.' },
    ],
    analysis:
      'Loki is the character the Norse sources use to test the price of a society built on oaths, kinship and obligation: he is useful precisely as long as his rule-breaking stays entertaining, and the myths show what happens when it finally costs the gods one of their own. Modern retellings make him the hero of that story, which is a choice about us rather than about him.',
  },
  {
    id: 'ganesha',
    name: 'Ganesha',
    tradition: 'Hindu — Puranic and devotional traditions',
    sources: [
      'The Shiva Purana, which narrates the severed-head episode',
      'The Ganesha Purana and Mudgala Purana — texts devoted to him',
      'The Ganapati Atharvashirsha, a late Upanishad of the Ganapatya tradition',
      'The Rigveda (RV 2.23.1), which uses the word Gaṇapati in a different, older sense',
    ],
    relationships: [
      { with: 'Shiva', note: 'Father; the one who beheads him in the Puranic telling.' },
      { with: 'Parvati', note: 'Mother; in the most common story, the reason he exists at first is her protection.' },
      { with: 'Kartikeya', note: 'Brother; their race around the world is one of the tradition’s favourite stories.' },
      { with: 'Vyasa', note: 'Traditionally he writes down the Mahabharata as Vyasa dictates it.' },
    ],
    family: [
      { relation: 'Father', name: 'Shiva' },
      { relation: 'Mother', name: 'Parvati' },
      { relation: 'Brother', name: 'Kartikeya (Skanda)' },
      { relation: 'Consorts (North Indian tradition)', name: 'Riddhi and Siddhi', note: 'Also Buddhi in some texts.' },
      { relation: 'Status (South Indian tradition)', name: 'Often unmarried', note: 'A deliberate regional difference, not an error.' },
      { relation: 'Mount', name: 'Mooshika', note: 'A mouse or rat — the obstacle-remover rides the smallest creature.' },
    ],
    timeline: [
      { when: 'Vedic period', event: '“Gaṇapati” appears as an epithet, applied to Brihaspati/Brahmanaspati — not to an elephant-headed deity.' },
      { when: 'Puranic period (roughly mid-to-late 1st millennium CE)', event: 'The elephant-headed, obstacle-removing Ganesha of the Puranas takes shape.' },
      { when: 'Late medieval period', event: 'Ganapatya devotional traditions and texts such as the Ganapati Atharvashirsha.' },
      { when: '19th century', event: 'Public Ganpati festivals in western India are reshaped as a collective, political-cultural occasion.' },
      { when: 'Today', event: 'Invoked before beginnings — exams, journeys, weddings, software launches.' },
    ],
    story:
      'Parvati makes a boy from the material of her own body and sets him to guard the door, and when Shiva returns and is refused entry, the boy’s head is cut off. Parvati’s grief is so dangerous that Shiva has a head brought — an elephant’s — and the boy is restored to life, named the leader of Shiva’s hosts, and given the right to be worshipped before every other deity. In another favourite story he and his brother Kartikeya race around the world, and Ganesha simply walks around his parents and wins.',
    lesserKnown: [
      { layer: 'textual', text: 'In the Rigveda, “Gaṇapati” is an epithet meaning roughly “lord of the hosts”, used for Brihaspati. The elephant-headed Ganesha of the Puranas is a much later, separate development — the same word, not the same deity.' },
      { layer: 'traditional', text: 'The substitution head is usually an elephant’s, but which elephant varies: the Puranas often name Indra’s elephant Airavata, while other tellings speak of a demon who is beheaded.' },
      { layer: 'analysis', text: 'The mouse as a vehicle has been read as a joke about control over the smallest nuisance, and about an obstacle-remover who needs a way through a crowded room.' },
      { layer: 'inference', text: 'Some writers connect the single broken tusk to the act of writing the Mahabharata with a broken pen. The tusk-breaking appears in several stories, but not all of them are about the epic.' },
    ],
    variants: [
      { tradition: 'Shiva Purana', difference: 'Shiva beheads the boy in anger; the head is replaced by an elephant’s.' },
      { tradition: 'Regional tellings', difference: 'In some versions the original head is burned away by Shani’s gaze, or the boy is cursed, rather than killed by his father.' },
      { tradition: 'South Indian tradition', difference: 'Ganesha is often understood as unmarried and permanently young, while North Indian traditions give him Riddhi, Siddhi and sometimes Buddhi.' },
    ],
    analysis:
      'Ganesha sits at an intersection the tradition deliberately built: he is the god of beginnings, of thresholds and of writing, and also the one who removes obstacles — which is to say, the deity of starting. Psychologically he is the friendliest possible answer to a very human problem, the fear of the blank page, which is why his images appear on shop shutters and title pages far more often than in temples.',
  },
  {
    id: 'enkidu',
    name: 'Enkidu',
    tradition: 'Mesopotamian — the Epic of Gilgamesh',
    sources: [
      'The Standard Babylonian Epic of Gilgamesh (tablets, c. 1200 BCE, compiled by Sîn-leqi-unninni)',
      'The Old Babylonian Gilgamesh materials (c. 1800 BCE)',
      'Sumerian poems about Bilgames (c. 2000 BCE), in which his role is smaller',
      'Tablet XI, whose flood account parallels the Genesis narrative',
    ],
    relationships: [
      { with: 'Gilgamesh', note: 'The pair at the epic’s centre — the city king and the wild man he was made to match.' },
      { with: 'Shamhat', note: 'The woman who brings him in from the steppe.' },
      { with: 'Humwawa (Humbaba)', note: 'The guardian they kill together, which seals their fate.' },
      { with: 'Ishtar', note: 'Her anger at Gilgamesh turns on the pair.' },
    ],
    family: [
      { relation: 'Creator', name: 'Aruru (with Nintu)', note: 'Shaped from clay, cast onto the steppe.' },
      { relation: 'Parents', name: 'None named', note: 'He has no human lineage — that is the whole point of him.' },
      { relation: 'Kin (first half of the epic)', name: 'The gazelles and wild animals', note: 'For a while his family is a herd.' },
      { relation: 'Bond', name: 'Gilgamesh', note: 'His equal, made specifically to match him.' },
    ],
    timeline: [
      { when: 'Sumerian poems (c. 2000 BCE)', event: 'Enkidu appears mainly as a servant figure to Bilgames — not yet an equal.' },
      { when: 'Old Babylonian period (c. 1800 BCE)', event: 'He is shaped into the king’s mirror and companion.' },
      { when: 'c. 1200 BCE', event: 'The Standard Babylonian epic is compiled: Enkidu’s friendship, his death, and Gilgamesh’s terror of dying become the story’s engine.' },
      { when: '1853 onward', event: 'Tablets are recovered from Nineveh; George Smith’s flood reading (1872) becomes a Victorian sensation.' },
      { when: 'Modern', event: 'Enkidu is read as the first “wild man” in literature, and Gilgamesh’s grief as one of the earliest acts of mourning on record.' },
    ],
    story:
      'Enkidu is made from clay by the goddess Aruru because the people of Uruk cannot bear their king’s arrogance, and he is cast onto the steppe, where he runs with the gazelles and knows nothing of bread or beer or kings. A woman named Shamhat is sent to meet him, and the epic spends a remarkable passage on teeth, drink and oil: he is civilised by eating, bathing and clothes. He then walks into Uruk as the only person who can match Gilgamesh, wrestles him to a standstill and afterwards acknowledges him as destined to be king, and becomes his companion. Together they kill the monster Humbaba and insult a goddess, and because of that Enkidu is condemned to die — slowly, over twelve nights of fever and dreams.',
    lesserKnown: [
      { layer: 'textual', text: 'In the Sumerian poems Enkidu is closer to a servant; the Standard Babylonian epic is what makes him Gilgamesh’s equal and the pivot of the story.' },
      { layer: 'textual', text: 'His death, not his life, drives the epic: it is Enkidu’s dying that sends Gilgamesh looking for immortality.' },
      { layer: 'analysis', text: 'Tablet XI contains a flood story close to the biblical version, and the Mesopotamian text is older. Scholars discuss the relationship between them, but “borrowing” is a conclusion, not a quotation.' },
      { layer: 'inference', text: 'That the epic is “about” an unrequited or hidden love between the two men is a modern argument. The text’s vocabulary of love and grief is far more expansive than modern friendship talk, and translators disagree about the strongest line.' },
    ],
    variants: [
      { tradition: 'Sumerian poems', difference: 'Gilgamesh’s servant and helper rather than his match; the friendship is not yet the epic’s centre.' },
      { tradition: 'Old Babylonian version', difference: 'The death-and-fear arc is already present, but the epic is still unstable, and surviving tablets differ from each other.' },
      { tradition: 'Standard Babylonian epic', difference: 'The definitive version — Enkidu as mirror, the twelve-day dying, and Gilgamesh’s fear of death as the point of the whole story.' },
    ],
    analysis:
      'Enkidu exists to make a very old argument: the civilised life is better, and it still ends. Everything he gains — food, language, friendship, city clothes — brings him closer to the fear of death, and his death is what turns a story about a king’s arrogance into the first great poem about the dread of dying.',
  },
  {
    id: 'ravana',
    name: 'Ravana',
    tradition: 'Hindu — Ramayana and Puranas; with major Jain and Southeast Asian retellings',
    sources: [
      'Valmiki’s Ramayana, where he is the antagonist of the Yuddha Kanda',
      'Puranic material, including the Shiva Purana’s telling of his devotion to Shiva',
      'The Jain Ramayanas (Vimalsuri’s Paumachariya, Ravisena’s Padma Purana)',
      'The Thai Ramakien and other Southeast Asian versions',
    ],
    relationships: [
      { with: 'Rama', note: 'The opposing king; their war is the epic’s spine.' },
      { with: 'Sita', note: 'Captor in Valmiki; in Jain tellings, a figure under a curse who never touches her.' },
      { with: 'Shiva', note: 'His chosen deity; the tradition credits him with powerful devotional poetry.' },
      { with: 'Vibhishana', note: 'His younger brother, who leaves him for Rama.' },
    ],
    family: [
      { relation: 'Father', name: 'Vishrava', note: 'A sage, son of Pulastya.' },
      { relation: 'Mother', name: 'Kaikasi', note: 'A rakshasa princess.' },
      { relation: 'Half-brother', name: 'Kubera', note: 'Lord of wealth, from a different mother.' },
      { relation: 'Brothers', name: 'Kumbhakarna and Vibhishana' },
      { relation: 'Sister', name: 'Shurpanakha', note: 'Whose humiliation begins the whole conflict.' },
      { relation: 'Wife', name: 'Mandodari' },
      { relation: 'Son', name: 'Indrajit (Meghanada)', note: 'The most feared warrior on his side.' },
    ],
    timeline: [
      { when: 'Early life', event: 'Performs severe austerities; obtains boons that make him nearly impossible to kill.' },
      { when: 'Kingship', event: 'Takes Lanka from his half-brother Kubera and rules it as a thriving city.' },
      { when: 'Before the war', event: 'His sister is humiliated; he abducts Sita in revenge.' },
      { when: 'The war', event: 'Loses his son, his brothers and his army across eighteen days.' },
      { when: 'The end', event: 'Faces Rama in single combat and dies on the last day of the war.' },
      { when: 'Afterlife of the story', event: 'Becomes, in Jain and Southeast Asian traditions, a very different kind of king.' },
    ],
    story:
      'Ravana is the son of the sage Vishrava and the rakshasa princess Kaikasi, a scholar of enormous learning and a king whose capital Lanka is described as a place of wealth rather than squalor. He performs austerities so severe that he wins boons making him nearly invulnerable, and he takes what he wants, including another man’s wife, out of anger at what was done to his sister. That single act turns a prosperous king into a doomed one: he loses his son, his brothers and his army over eighteen days, and dies at Rama’s hands. The tradition does not treat him as a man who did not know better — it treats him as one who knew, and acted anyway, which is also why several regional retellings give him a measure of grace at the very end.',
    lesserKnown: [
      { layer: 'textual', text: 'In Valmiki’s Ramayana, Ravana is a Vedic scholar, an accomplished veena player and a devotee of Shiva. The epic does not present him as uncivilised; it presents him as powerful and unrestrained.' },
      { layer: 'traditional', text: 'The Shiv Tandav Stotra, a celebrated hymn to Shiva, is traditionally attributed to him. The attribution is part of the tradition rather than a documented historical fact.' },
      { layer: 'analysis', text: 'His ten heads are commonly explained as a symbol of vast learning — knowledge that is real but not yet turned into self-control.' },
      { layer: 'inference', text: 'Ravana is said in some modern retellings to represent a “what Rama could have become” — the same gifts, refused discipline. The epics do not frame him this way.' },
    ],
    variants: [
      { tradition: 'Valmiki Ramayana', difference: 'He abducts Sita by force and is destroyed for it; the epic is unambiguous about his guilt.' },
      { tradition: 'Jain Ramayana (Vimalsuri, Ravisena)', difference: 'His abduction is driven by a curse, he is a Prati-vasudeva of great ascetic discipline who does not violate Sita, and he is ultimately liberated — a moral portrait that would be unrecognisable in the Sanskrit epic.' },
      { tradition: 'Thai Ramakien', difference: 'Thotsakan is a more tragic, ceremonious king, and the epic’s ethical weighting shifts away from simple villainy.' },
    ],
    analysis:
      'Ravana is the tradition’s study of capability without restraint: he has the learning, the discipline of austerity, the devotion and the courage, and the epic still ends him, because none of it is attached to self-control. That is why he is one of the few villains in world epic who is remembered for what he knew.',
  },
  {
    id: 'amaterasu',
    name: 'Amaterasu',
    tradition: 'Japanese Shinto',
    sources: [
      'The Kojiki (712 CE), Japan’s oldest surviving chronicle',
      'The Nihon Shoki (720 CE), which records several variant accounts side by side',
      'Later Shinto practice, especially at the Ise Grand Shrine',
      'Modern political history, including the 1946 imperial declaration',
    ],
    relationships: [
      { with: 'Izanagi', note: 'Father, who washes after returning from the land of the dead — and gives her the sky.' },
      { with: 'Susanoo', note: 'Her violent brother; his rampage is what sends her into the cave.' },
      { with: 'Uzume', note: 'The goddess whose wild dance draws her back out.' },
      { with: 'Ninigi and Jimmu', note: 'Grandson and great-grandson in her descent line, with the three regalia.' },
    ],
    family: [
      { relation: 'Father', name: 'Izanagi' },
      { relation: 'Mother', name: 'Izanami', note: 'Dying before Amaterasu’s birth; the reason for Izanagi’s purification.' },
      { relation: 'Brother', name: 'Susanoo' },
      { relation: 'Brother', name: 'Tsukuyomi', note: 'The moon, born with her in the Kojiki’s account.' },
      { relation: 'Grandson', name: 'Ninigi', note: 'Sent down to rule the islands, carrying the mirror, jewel and sword.' },
      { relation: 'Shrine', name: 'Ise', note: 'Her principal shrine; rebuilt regularly, and occupied by an imperial princess.' },
    ],
    timeline: [
      { when: '712 CE', event: 'The Kojiki records her birth, the heavenly rock cave, and her line down to the legendary emperors.' },
      { when: '720 CE', event: 'The Nihon Shoki gives several versions of the same events — the court chronicle deliberately keeps the alternatives.' },
      { when: 'Later centuries', event: 'The Ise cult and imperial legitimacy become inseparable; the mirror of the regalia is her emblem.' },
      { when: '1868–1945', event: 'State Shinto links her cult to the modern nation and to imperial divinity.' },
      { when: '1946', event: 'The imperial rescript denies the emperor’s divine status, an unresolved boundary between a religious figure and a national one.' },
    ],
    story:
      'Amaterasu is born from her father’s eye as he washes himself clean after visiting the dead, and she is given the sky. Her brother Susanoo, who can never behave, wrecks her rice fields and then throws a flayed horse into her weaving hall. She withdraws into a rock cave, and light goes out of the world. The eight hundred gods gather, and Uzume dances on an upturned tub until the laughter becomes indecent; Amaterasu, curious, edges the stone door open — a mirror is held up, she sees herself, and is drawn out. She is sent down again through her descendants, not through her: it is her grandson Ninigi who is given the mirror, the jewel and the sword to carry to the islands.',
    lesserKnown: [
      { layer: 'textual', text: 'The Kojiki and the Nihon Shoki differ, and the Nihon Shoki itself prints variant versions of the cave story in parallel. The court chronicle never hid the disagreement.' },
      { layer: 'traditional', text: 'The three imperial regalia are understood as sent with her line — the mirror in particular is identified with her at Ise, so closely that it is kept from all eyes.' },
      { layer: 'analysis', text: 'The mirror is not a prop but the mechanism: the sun returns because she sees herself. That is a story about self-recognition long before modern psychology called it one.' },
      { layer: 'inference', text: 'The withdrawal-return pattern is often compared to the changing seasons and to a solar eclipse. Japan’s myths never state that reading, and the comparison is a scholar’s.' },
    ],
    variants: [
      { tradition: 'Kojiki', difference: 'A single, confident narrative that establishes her female identity, the cave, and the unchallenged order of the heavenly line.' },
      { tradition: 'Nihon Shoki', difference: 'Multiple competing accounts, some differing on the order of the births and on who rules which realm — an official text preserving alternatives.' },
      { tradition: 'Modern Japanese society', difference: 'The shrine continues, but the political claim that grew around her in the 19th and 20th centuries is a modern development, and it is still being contested.' },
    ],
    analysis:
      'Amaterasu’s story is unusually domestic for a sun goddess: the light of the world disappears because two siblings cannot get along. Read that way, the myth is about the fragility of order — it takes eight hundred gods and a dance to coax daytime back, which is a portrait of what ordinary peace actually requires.',
  },
  {
    id: 'yama',
    name: 'Yama',
    tradition: 'Vedic and later Hindu; with a separate Zoroastrian and Buddhist afterlife',
    sources: [
      'Rigveda 10.10 (the Yami–Yama dialogue) and 10.14 (the funeral hymn to Yama)',
      'The Atharvaveda and the Brahmanas',
      'The Katha Upanishad, where he teaches Nachiketa',
      'Buddhist texts and later Puranic material, in which his role changes',
    ],
    relationships: [
      { with: 'Yami (Yamuna)', note: 'His twin, and the other voice in one of the Rigveda’s most debated hymns.' },
      { with: 'Nachiketa', note: 'The boy who walks to his house and asks the questions no one asks.' },
      { with: 'Chitragupta', note: 'Later tradition’s record-keeper, counting what people have done.' },
      { with: 'Vivasvat and the Ashvins', note: 'His family belongs to the solar line of the Vedas.' },
    ],
    family: [
      { relation: 'Father', name: 'Vivasvat (Surya)' },
      { relation: 'Mother', name: 'Saranyu (Sanjna)' },
      { relation: 'Twin sister', name: 'Yami (Yamuna)' },
      { relation: 'Brother', name: 'Manu', note: 'Named in later Vedic material; in some tellings Yama is the elder.' },
      { relation: 'Brother (later tradition)', name: 'Shani', note: 'The planetary deity, in Puranic genealogies.' },
      { relation: 'Attendants', name: 'Two four-eyed dogs', note: 'Guards of the path, described in the Rigveda.' },
    ],
    timeline: [
      { when: 'Rigvedic period (c. 1500–1200 BCE)', event: 'Yama is the first mortal to die, who finds the path and becomes king of the ancestors — a role of welcome, not terror.' },
      { when: 'Brahmanas and Upanishads', event: 'He becomes the knowledgeable teacher who receives the dead and answers Nachiketa.' },
      { when: 'Puranic period', event: 'The legal, ministerial Yama takes shape: Yamaloka, Chitragupta’s ledger, Yama’s messengers.' },
      { when: 'Buddhist texts (from the early centuries CE)', event: 'A separate Yama develops as a righteous deva-king — the same name, a different office.' },
      { when: 'Modern popular culture', event: 'Yamraj and his messengers become fixtures of Hindi storytelling and calendar art, usually comic.' },
    ],
    story:
      'Yama is described in the oldest hymns not as a frightening god but as the first person who died — the one who discovered the road and now shows it to others. His twin sister Yami argues with him in one of the Rigveda’s most discussed dialogues; he refuses what she asks. Over centuries his role changes: he becomes the king of the ancestral world, then the teacher whom a boy named Nachiketa questions about death, and finally the careful, ledger-keeping judge of the Puranas, with messengers who arrive at the hour nobody wants.',
    lesserKnown: [
      { layer: 'textual', text: 'In the Rigveda, Yama’s role is largely hospitable — he is the ancestor-king who receives the dead. The terrifying, legal Yama of popular imagination is a much later development.' },
      { layer: 'textual', text: 'Rigveda 10.14 mentions his two four-eyed dogs guarding the path. They survive into later tradition as his messengers and watchmen.' },
      { layer: 'analysis', text: 'Linguists connect his name to the Zoroastrian Yima (Jamshed), from the same Indo-Iranian root. Yima, however, is the first king and not a god of death at all — the same name, a different story.' },
      { layer: 'inference', text: 'The Yami–Yama dialogue is widely read as an early argument about incest and cosmic order, but the hymn does not explain itself, and translation of its hardest lines is contested.' },
    ],
    variants: [
      { tradition: 'Vedic', difference: 'Yama is the first mortal and king of the dead — welcoming, and at times simply a person who went first.' },
      { tradition: 'Buddhist', difference: 'Yama becomes a deva and righteous king, sometimes understood as a being who is himself subject to his own judgement.' },
      { tradition: 'Zoroastrian', difference: 'Yima is the first king and a protector of the world, with no death-god role — evidence that the two traditions inherited a shared name and then went different ways.' },
    ],
    analysis:
      'Yama is a case study in how the same figure is redesigned by need. The Rigveda needed a hospitable first-ancestor who could be followed; the Puranas needed an administrator. Read psychologically, the shift from welcoming ancestor to ledger-keeping judge is a portrait of how societies changed what they feared: not death as a destination, but accountability for one’s life.',
  },
  {
    id: 'isis',
    name: 'Isis',
    tradition: 'Ancient Egyptian (later worshipped across the Mediterranean)',
    sources: [
      'The Pyramid Texts (c. 2350 BCE), the oldest religious texts in the world',
      'The Coffin Texts and the Book of the Dead',
      'The Metternich Stela, a healing spell text with the Isis and Horus story',
      'Plutarch’s De Iside et Osiride (2nd century CE) — Greek, and much later',
    ],
    relationships: [
      { with: 'Osiris', note: 'Husband and brother; the search for him is the myth’s core.' },
      { with: 'Horus', note: 'Son; she heals and hides him in the marshes until he can claim the throne.' },
      { with: 'Set', note: 'Brother and killer; the myth’s antagonist.' },
      { with: 'Thoth', note: 'Ally and spell-master in the contest between Horus and Set.' },
    ],
    family: [
      { relation: 'Parents', name: 'Geb (earth) and Nut (sky)' },
      { relation: 'Siblings', name: 'Osiris, Set, Nephthys' },
      { relation: 'Husband', name: 'Osiris', note: 'Also her brother — a pairing normal for deities, not for people.' },
      { relation: 'Son', name: 'Horus' },
      { relation: 'Name in Egyptian', name: 'Aset (ꜣst)', note: '“Isis” is the Greek form; the throne hieroglyph sits in her name.' },
      { relation: 'Cult centre', name: 'Philae and later Rome', note: 'Her temples outlast most of Egyptian religion itself.' },
    ],
    timeline: [
      { when: 'c. 2350 BCE — Old Kingdom', event: 'Isis appears in the Pyramid Texts as a mourner and mourner’s helper for the dead king.' },
      { when: 'Middle Kingdom', event: 'Coffin Texts expand her magical role for ordinary people.' },
      { when: 'New Kingdom', event: 'Her mother-and-healer character consolidated in the Book of the Dead and magical stelae.' },
      { when: 'Greco-Roman period', event: 'A cosmopolitan Isis is worshipped from Egypt to Britain; Plutarch writes the familiar version of the Osiris myth.' },
      { when: 'c. 550 CE', event: 'The last Egyptian temple, at Philae, is closed — after which her cult is history rather than practice.' },
    ],
    story:
      'Isis is the daughter of sky and earth, and she marries her brother Osiris. Set kills him, seals the body in a chest and floats it away; Isis searches the country until she finds it, and Set scatters the pieces. She reassembles her husband, mourns him, and conceives a son, Horus — then hides with the child in the marshes of the delta while his uncle hunts him. When Horus grows up, she uses every spell, trick and argument at her disposal to get him his father’s throne, and Egypt’s legitimate kingship is traced to that final judgement.',
    lesserKnown: [
      { layer: 'textual', text: 'The Isis who appears in the earliest Egyptian texts is a mourner and magical helper, not the great universal goddess of later centuries, nor yet the mother of a divine child. Her image grows over two thousand years.' },
      { layer: 'textual', text: 'The version everyone knows — the chest, the scattering, the reassembly — is told most fully by Plutarch, a Greek writer in the 2nd century CE. That is late, and it is not an Egyptian source.' },
      { layer: 'analysis', text: 'The name Aset is written with the hieroglyph for “throne” — so the oldest reading of her is a throne-goddess, the seat of kingship itself, rather than a maternal one.' },
      { layer: 'inference', text: 'Some scholars see the later spread of Isis through the Roman world as clearing ground for the veneration of Mary. The resemblance is discussed; a direct line of borrowing is not established.' },
    ],
    variants: [
      { tradition: 'Old Kingdom Egypt', difference: 'A funerary goddess in the king’s pyramid, mourner and spell-helper — essential but narrow.' },
      { tradition: 'Greco-Roman Mediterranean', difference: 'A universal mother goddess, identified with dozens of local deities, her mysteries described by Greek and Latin writers.' },
      { tradition: 'Modern pop culture', difference: 'She reappears as a symbol of “ancient magic”, stripped of mourning, kingship and ritual — a useful reminder of how much interpretation your own version carries.' },
    ],
    analysis:
      'Isis is a portrait of grief with an organising purpose: she loses her husband, and then spends the rest of the myth making a case for her son. The tradition that ran for two thousand years is essentially the story of a woman who will not accept that the matter is closed, and Egypt traced its idea of kingship to her persistence.',
  },

];
