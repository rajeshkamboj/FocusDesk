import type { CuriosityPoolEntry, OneThingItem } from '../types';

/**
 * One Thing Worth Knowing — the daily pool.
 *
 * Twenty-two entries, so a reader who opens Curiosity every day sees no repeat
 * for more than three weeks. The three items that shipped with the first version of the
 * tab keep their original wording and their original `availableFrom` date, so
 * the published record stays honest about when each item first became eligible;
 * everything added later is dated to the day it was authored here.
 *
 * Rules the whole pool follows: one idea per item, an explanation that stays
 * true without a specialist's background, and a link to somewhere a reader can
 * check the claim. `provenance` is `curated` for text written for this app and
 * `source-checked` where the wording was compared against the linked source.
 */
export const oneThingPool: CuriosityPoolEntry<OneThingItem>[] = [
  {
    id: 'one-thing-llm-tokens',
    category: 'one-thing',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['technology', 'machine-learning'],
    source: { url: 'https://en.wikipedia.org/wiki/Large_language_model', name: 'Wikipedia · Large language model', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why does an LLM generate text one token at a time?',
      explanation:
        'An LLM does not write a whole answer in one step. It converts the context into numbers, estimates a probability for the next token, selects one, then runs the expanded context through the model again. A token may be a word, part of a word, punctuation, or whitespace. This repeated prediction makes streaming possible and lets each new token depend on everything already written. It also explains why a model can sound coherent locally while still drifting globally: each choice is made from probabilities, not from a guaranteed outline of the finished answer.',
      url: 'https://en.wikipedia.org/wiki/Large_language_model',
      sourceName: 'Wikipedia',
    },
  },
  {
    id: 'one-thing-database-index',
    category: 'one-thing',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['databases', 'engineering'],
    source: { url: 'https://www.postgresql.org/docs/current/indexes.html', name: 'PostgreSQL documentation' },
    item: {
      title: 'Why does a database index make a query faster?',
      explanation:
        'A database index is an additional, organized lookup structure built beside a table. Without one, the database may inspect every row to find matching records. With one, it can navigate a smaller structure—often a B-tree—to locate likely row positions quickly. The trade-off is space and work on writes: every insert, update, or delete may also need to update the index. Indexes help most when they match real filters and sort orders; adding one to every column can make a system slower rather than faster.',
      url: 'https://www.postgresql.org/docs/current/indexes.html',
      sourceName: 'PostgreSQL documentation',
    },
  },
  {
    id: 'one-thing-core-web-vitals',
    category: 'one-thing',
    availableFrom: '2024-01-01',
    provenance: 'curated',
    tags: ['web', 'performance'],
    source: { url: 'https://web.dev/articles/vitals', name: 'web.dev' },
    item: {
      title: 'Why can a fast server still produce poor Core Web Vitals?',
      explanation:
        'Server response time is only one part of the journey to a usable page. A page can receive HTML quickly and still feel slow if it sends a large JavaScript bundle, waits for client rendering, shifts content when images load, or blocks the main thread with expensive work. Core Web Vitals measure what the visitor experiences: loading, visual stability, and interaction responsiveness. Improving them often means reducing browser work and reserving layout space, not only upgrading the server.',
      url: 'https://web.dev/articles/vitals',
      sourceName: 'web.dev',
    },
  },
  {
    id: 'one-thing-floating-point',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['mathematics', 'programming'],
    source: { url: 'https://en.wikipedia.org/wiki/IEEE_754', name: 'Wikipedia · IEEE 754', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why does 0.1 + 0.2 not equal 0.3 in most programming languages?',
      explanation:
        'Most languages store non-integers in binary floating point, which is a fixed number of binary digits. One tenth has no exact representation in base two, the way one third has none in base ten, so the nearest available value is kept instead. Adding two such values produces a result that is close to 0.3 but not the stored value for 0.3. The fix is not a cleverer comparison but a different representation: integers of minor units for money, a decimal type for accounting, or a tolerance for measurement.',
      url: 'https://en.wikipedia.org/wiki/IEEE_754',
      sourceName: 'Wikipedia · IEEE 754',
    },
  },
  {
    id: 'one-thing-tls-handshake',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['security', 'web'],
    source: { url: 'https://developer.mozilla.org/en-US/docs/Glossary/TLS', name: 'MDN Web Docs', attribution: 'MDN content is CC BY-SA 2.5.' },
    item: {
      title: 'What actually happens in the fraction of a second before an HTTPS page loads?',
      explanation:
        'The browser and server agree on how they will talk: which cipher suites both support, then keys for that session. The server proves its identity with a certificate chained to a root the browser already trusts, and the two sides derive shared keys that never travel across the network. Content encrypted with those keys can then flow. Two ideas do different jobs here — encryption keeps a listener from reading the traffic, while the certificate keeps a stranger from pretending to be the site. A padlock icon mostly shows the second one.',
      url: 'https://developer.mozilla.org/en-US/docs/Glossary/TLS',
      sourceName: 'MDN Web Docs',
    },
  },
  {
    id: 'one-thing-mercator',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['geography', 'design'],
    source: { url: 'https://en.wikipedia.org/wiki/Mercator_projection', name: 'Wikipedia · Mercator projection', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why does Greenland look as large as Africa on many maps?',
      explanation:
        'A flat map cannot keep angles, areas and distances all at once. The Mercator projection keeps angles, which is what a navigator needs: a straight line on the map is a constant compass bearing. To do that, it stretches the surface more the farther a place is from the equator. Greenland, near the pole, is inflated enormously; Africa, straddling the equator, is barely touched. The distortion is a consequence of the choice, not a mistake in the drawing — which is why maps for comparison of size use other projections.',
      url: 'https://en.wikipedia.org/wiki/Mercator_projection',
      sourceName: 'Wikipedia · Mercator projection',
    },
  },
  {
    id: 'one-thing-leap-year-rule',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['time', 'systems'],
    source: { url: 'https://en.wikipedia.org/wiki/Leap_year', name: 'Wikipedia · Leap year', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why is the year 2100 not a leap year?',
      explanation:
        'A calendar that added a day every four years would run slightly long, because Earth’s orbit takes about 365.2422 days rather than 365.25. The Gregorian rule compensates: years divisible by four are leap years, except century years, which are leap years only when divisible by four hundred. Skipping three leap days every four hundred years brings the average to 365.2425 days, close enough that the error accumulates over thousands of years rather than decades. That is why 2000 had a 29 February and 2100 will not.',
      url: 'https://en.wikipedia.org/wiki/Leap_year',
      sourceName: 'Wikipedia · Leap year',
    },
  },
  {
    id: 'one-thing-sky-blue',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['physics', 'everyday'],
    source: { url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering', name: 'Wikipedia · Rayleigh scattering', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why is the sky blue and the setting sun red — from the same effect?',
      explanation:
        'Molecules in the air scatter light far more strongly at short wavelengths than at long ones. Coming from overhead, sunlight crosses a thin layer of atmosphere, and the scattered light reaching your eye from every direction is weighted toward blue. Near the horizon it crosses a much thicker layer, and so much of the blue has been scattered out of the direct beam that what remains is weighted toward orange and red. The same physics explains why smoke can look bluish in transmitted light and yellowish against a dark background.',
      url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering',
      sourceName: 'Wikipedia · Rayleigh scattering',
    },
  },
  {
    id: 'one-thing-honey-spoilage',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['chemistry', 'food'],
    source: { url: 'https://en.wikipedia.org/wiki/Honey', name: 'Wikipedia · Honey', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why does sealed honey outlast almost everything else in the cupboard?',
      explanation:
        'Honey is a supersaturated sugar solution with very little free water, so the microbes that spoil food cannot get what they need to grow; its mild acidity and the hydrogen peroxide produced by an enzyme the bees add make it harder still. The usual failure is not spoilage but fermentation after the honey absorbs enough water from the air to let ambient yeasts work. Keep it sealed and it stays edible indefinitely — which is why the interesting museum question about honey is not whether it is safe, but what it was used for.',
      url: 'https://en.wikipedia.org/wiki/Honey',
      sourceName: 'Wikipedia · Honey',
    },
  },
  {
    id: 'one-thing-microwave-standing-waves',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['physics', 'everyday'],
    source: { url: 'https://en.wikipedia.org/wiki/Microwave_oven', name: 'Wikipedia · Microwave oven', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why does a microwave have a turntable, and why is the middle often cold?',
      explanation:
        'The magnetron generates microwaves that reflect off the metal walls, and the reflected waves interfere with the incoming ones to form a standing pattern of fixed hot and cold regions. Those regions are centimetres apart, which is why a stationary plate emerges with scorched edges and a cold centre. The turntable exists to move the food through the pattern so heating averages out. A few ovens replace the turntable with a fan that stirs the field instead; the underlying problem is the same, and it is why instructions say to stir halfway through.',
      url: 'https://en.wikipedia.org/wiki/Microwave_oven',
      sourceName: 'Wikipedia · Microwave oven',
    },
  },
  {
    id: 'one-thing-voice-recording',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['body', 'sound'],
    source: { url: 'https://en.wikipedia.org/wiki/Bone_conduction', name: 'Wikipedia · Bone conduction', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why does your own recorded voice sound wrong to you?',
      explanation:
        'When you speak, you hear yourself by two routes at once: through the air, and through the bones and tissue of your own skull. The bony route carries lower frequencies better, so your voice seems fuller and deeper to you than it does to anyone else. A recording keeps only the airborne route, which is the one other people have always been hearing. The mismatch feels like a flaw in the recording, but the recording is the accurate part — which is why the voice in a video of yourself takes a moment to accept.',
      url: 'https://en.wikipedia.org/wiki/Bone_conduction',
      sourceName: 'Wikipedia · Bone conduction',
    },
  },
  {
    id: 'one-thing-utility-frequency',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['engineering', 'history'],
    source: { url: 'https://en.wikipedia.org/wiki/Utility_frequency', name: 'Wikipedia · Utility frequency', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why does half the world run its grid at 50 Hz and the other half at 60 Hz?',
      explanation:
        'The choice was made early, when grids were local and equipment was not yet interchangeable. Lower frequencies suit long transmission and heavy motors; higher ones allow smaller transformers and run lighting with less flicker — and one manufacturer’s existing customer base pushed each region one way or the other. Nothing about the physics makes one objectively correct, which is why the split has persisted: appliances, clocks that count cycles, and industrial motors were all built around it. A modern grid still keeps frequency tightly regulated, partly because that same stability is useful to the equipment hanging off it.',
      url: 'https://en.wikipedia.org/wiki/Utility_frequency',
      sourceName: 'Wikipedia · Utility frequency',
    },
  },
  {
    id: 'one-thing-iso-8601',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['data', 'everyday'],
    source: { url: 'https://en.wikipedia.org/wiki/ISO_8601', name: 'Wikipedia · ISO 8601', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why is 2026-10-18 the least confusing way to write a date?',
      explanation:
        'Writing year, then month, then day makes the string sort correctly as text: sorting character by character is the same as sorting chronologically, which no other arrangement gives you. It also removes the 03/04 ambiguity that costs real money in spreadsheets and shipping documents, because no reader has to know a national convention first. That is the reasoning behind the international standard rather than merely a European or American habit, and it is why most databases and log formats store dates this way — a plain string in this order needs no parsing to be ordered.',
      url: 'https://en.wikipedia.org/wiki/ISO_8601',
      sourceName: 'Wikipedia · ISO 8601',
    },
  },
  {
    id: 'one-thing-event-loop-blocking',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['programming', 'web'],
    source: { url: 'https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick', name: 'Node.js documentation' },
    item: {
      title: 'Why does one slow function freeze an entire server?',
      explanation:
        'A JavaScript server usually handles requests on a single thread with an event loop: it waits for input, runs the callback that the input woke, then takes the next item. Nothing runs while your code runs, so a loop that takes four seconds of CPU stops every other request for four seconds too, even though none of them is waiting on you. Asynchronous calls do not solve this by themselves — they only avoid blocking while waiting. When work is genuinely heavy, the answer is to move it off the loop: a worker thread, a queue, or another service.',
      url: 'https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick',
      sourceName: 'Node.js documentation',
    },
  },
  {
    id: 'one-thing-background-timers',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['browsers', 'product'],
    source: { url: 'https://developer.chrome.com/blog/timer-throttling-in-chrome-88', name: 'Chrome for Developers' },
    item: {
      title: 'Why does a timer in a hidden browser tab drift?',
      explanation:
        'Browsers throttle repeated timers in tabs that are not visible, because a page nobody is looking at should not keep waking the processor — and background activity is one of the main reasons a laptop runs warm and a tab is blamed for it. A one-second interval can therefore be coalesced into something far less frequent, so counting ticks is not a clock. Pages that must keep time in the background need APIs designed for the purpose, such as service worker events, or they should record timestamps and compute elapsed time when the tab is next seen.',
      url: 'https://developer.chrome.com/blog/timer-throttling-in-chrome-88',
      sourceName: 'Chrome for Developers',
    },
  },
  {
    id: 'one-thing-rivers-meander',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['earth-science', 'systems'],
    source: { url: 'https://www.usgs.gov/special-topics/water-science-school/science/meanders-and-oxbow-lakes', name: 'USGS Water Science School' },
    item: {
      title: 'Why do rivers wind instead of running straight to the sea?',
      explanation:
        'Any small bend gives the flow an asymmetric path: water moves faster along the outside of the curve, which erodes that bank, and slower along the inside, which drops the sediment it was carrying. The bend therefore deepens on one side and grows on the other, and a random wobble becomes a pronounced loop. Left alone, some loops tighten until the river cuts across the neck during a flood and takes the shorter path, leaving an oxbow lake behind. The lesson a river teaches about systems is that small asymmetries compound rather than average out.',
      url: 'https://www.usgs.gov/special-topics/water-science-school/science/meanders-and-oxbow-lakes',
      sourceName: 'USGS Water Science School',
    },
  },
  {
    id: 'one-thing-bread-rise',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['biology', 'food'],
    source: { url: 'https://en.wikipedia.org/wiki/Fermentation_in_baking', name: 'Wikipedia · Fermentation in baking', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'What is actually happening while bread proves?',
      explanation:
        'Yeast feeds on the simple sugars flour releases and produces carbon dioxide and ethanol. The gas cannot escape a dough whose gluten network has been developed, so it inflates pockets and the loaf rises; the same network is what lets those pockets hold their shape until the heat of the oven sets them. Temperature drives the pace, which is why a long cold rise buys flavour from slower activity and more time for enzymes to work. Baking then kills the yeast, expands the gas, evaporates the alcohol, and gelatinises the starch — the crumb is fixed at that point.',
      url: 'https://en.wikipedia.org/wiki/Fermentation_in_baking',
      sourceName: 'Wikipedia · Fermentation in baking',
    },
  },
  {
    id: 'one-thing-401-vs-403',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['web', 'security'],
    source: { url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401', name: 'MDN Web Docs', attribution: 'MDN content is CC BY-SA 2.5.' },
    item: {
      title: 'What is the difference between 401 and 403?',
      explanation:
        'A 401 means the server does not know who is asking; the response carries a `WWW-Authenticate` header describing how to prove identity, and retrying with credentials is the expected next step. A 403 means the server knows who is asking and will not serve this particular thing to them; credentials are already present, so offering them again changes nothing. Collapsing the two — answering “forbidden” to an unauthenticated request — is a defensible choice in an API that does not want to reveal that a resource exists, but it loses the signal that tells a client to sign in rather than give up.',
      url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401',
      sourceName: 'MDN Web Docs',
    },
  },
  {
    id: 'one-thing-dns',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['networking', 'web'],
    source: { url: 'https://www.cloudflare.com/learning/dns/what-is-dns/', name: 'Cloudflare Learning Center' },
    item: {
      title: 'What has to happen before your browser even starts asking for a page?',
      explanation:
        'A name must become an address. The browser checks its own cache, then the operating system, then asks a recursive resolver, which walks the hierarchy: a root server points at the servers for the top-level domain, those point at the servers authoritative for the zone, and the authoritative answer carries the record along with a lifetime. Each answer is cached for as long as it says, which is why a DNS change can appear instantly on one machine and take hours on another. The time to live is not a delay someone forgot to remove; it is the price of not asking the world for every click.',
      url: 'https://www.cloudflare.com/learning/dns/what-is-dns/',
      sourceName: 'Cloudflare Learning Center',
    },
  },
  {
    id: 'one-thing-gps-error',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['physics', 'everyday'],
    source: { url: 'https://en.wikipedia.org/wiki/Error_analysis_for_the_Global_Positioning_System', name: 'Wikipedia · GPS error analysis', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why can a phone know your street but not which floor you are on?',
      explanation:
        'A receiver estimates its distance from several satellites by timing how long their signals took. Light travels so fast that a timing error of a millionth of a second is worth hundreds of metres, and the clock in a phone is nowhere near an atomic clock, so the solution has to absorb clock error as an unknown and depends on geometry the satellites happen to allow. The atmosphere delays signals, buildings and hills block or reflect them, and vertical accuracy is worse than horizontal because the satellites are all above you. Indoors there is often too little clear sky for a usable fix at all.',
      url: 'https://en.wikipedia.org/wiki/Error_analysis_for_the_Global_Positioning_System',
      sourceName: 'Wikipedia · GPS error analysis',
    },
  },
  {
    id: 'one-thing-birth-rate-axis',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['statistics', 'reading-data'],
    source: { url: 'https://en.wikipedia.org/wiki/Bar_chart', name: 'Wikipedia · Bar chart', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why should a bar chart usually start at zero, and when should it not?',
      explanation:
        'A bar invites the eye to compare lengths, so a truncated vertical axis changes the comparison far more than it changes the numbers: a rise of one unit can look like a doubling. Line charts, which show change rather than magnitude, can honestly use an axis range that fits the data — provided the scale is labelled and the full range is not being hidden to make a wiggle look like a trend. The rule is not “always zero” but “the visual difference should match the numerical difference”, and the way to check is to read the figure before noticing the axis.',
      url: 'https://en.wikipedia.org/wiki/Bar_chart',
      sourceName: 'Wikipedia · Bar chart',
    },
  },
  {
    id: 'one-thing-plastic-degrades',
    category: 'one-thing',
    availableFrom: '2026-10-18',
    provenance: 'curated',
    tags: ['materials', 'environment'],
    source: { url: 'https://en.wikipedia.org/wiki/Biodegradation', name: 'Wikipedia · Biodegradation', attribution: 'Source article is CC BY-SA 4.0.' },
    item: {
      title: 'Why does plastic break into smaller plastic instead of going away?',
      explanation:
        'Photodegradation and mechanical wear do work on plastic: ultraviolet light makes polymer chains brittle and shortens them, so a bottle becomes flakes and then fragments. What it does not do is produce molecules that microbes can eat at a useful rate, because the polymers were designed for chemical stability and long carbon chains are poor food. Sunlight and salt water in the open ocean therefore make the problem finer rather than smaller, and most of what is collected is a fraction of what left the shore. Genuine biodegradation needs specific chemistry, which is why “compostable” usually names an industrial condition and not a garden.',
      url: 'https://en.wikipedia.org/wiki/Biodegradation',
      sourceName: 'Wikipedia · Biodegradation',
    },
  },
];
