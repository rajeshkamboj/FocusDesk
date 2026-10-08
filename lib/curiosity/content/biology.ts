import type { BiologyConcept } from '../types';

/**
 * Biology of the Day — one compact concept, every day.
 *
 * Same shape as the chemistry and physics cards, on purpose: concept, an
 * intuitive explanation first, a deeper one only where the simple version is
 * incomplete, an equation or worked example when it genuinely helps, the
 * everyday or bodily connection, one surprising fact, and a question a teacher
 * can put to a class as it stands.
 *
 * Several entries set out to correct a comfortable school shorthand — that a
 * plant does not breathe, that a fever is a fault, that finishing an antibiotic
 * course is always the right advice, that a food chain can be long. A student
 * who is told the neat version first and the real one later has to unlearn
 * something; these cards put both in the same place.
 */
export const biologyConcepts: BiologyConcept[] = [
  {
    id: 'photosynthesis',
    topic: 'How does a leaf make food out of air and light?',
    simple:
      'A leaf is a solar kitchen. Chlorophyll captures light energy, the leaf takes carbon dioxide in through tiny pores and water up from the roots, and the captured energy is used to build sugar — with oxygen left over as the by-product.',
    deeper:
      'The light reactions run in the thylakoid membranes, where water is split to supply electrons, producing ATP and NADPH. The Calvin cycle then spends that ATP and NADPH to fix carbon dioxide into sugar. Two details matter for a classroom: the oxygen released comes from the water, not from the carbon dioxide — proved with labelled oxygen in the 1940s — and photosynthesis is not the plant’s only business. A leaf respires all day and all night. Only a small fraction of the sunlight falling on a leaf, often about one or two percent, ends up stored as chemical energy.',
    equation: '6 CO₂ + 6 H₂O  —light, chlorophyll→  C₆H₁₂O₆ + 6 O₂',
    connection:
      'A tulsi plant on a windowsill leaning towards the light, the darker green of a leaf on the side facing the window, and the bubbles rising from pond weed in a beaker kept in the sun.',
    surprising:
      'The oxygen you are breathing was split out of water, not out of carbon dioxide — the classic isotope experiment swapped the labelled atom into water and watched the label appear in the gas. Photosynthesis is, quite literally, splitting water with sunlight.',
    question:
      'A leaf in bright sun has plenty of carbon dioxide but the plant is wilting and its stomata are shut. Which half of photosynthesis suffers first, and what happens to the oxygen being produced?',
  },
  {
    id: 'leaves-turn-yellow',
    topic: 'Why do leaves turn yellow before they fall?',
    simple:
      'The yellow was already there. As the tree withdraws and recycles the green chlorophyll before dropping the leaf, the yellow and orange pigments that were hidden underneath it finally become visible.',
    deeper:
      'Carotenoids — the same family that colours a carrot — sit in the leaf all season, absorbing light the chlorophyll cannot use well and protecting the leaf from damage when light is too intense. Before a leaf is shed, the tree dismantles its chlorophyll, which is a nitrogen-rich molecule, and pulls the nitrogen, magnesium and phosphorus back down the stem to be reused. What remains is the carotenoid colouring. The reds are different again: they come from anthocyanins made fresh in autumn, and their purpose is still argued about.',
    connection:
      'A peepal or neem shedding its leaves in a dry spell, an old banana leaf turning yellow on the plant, and the same yellow appearing on a leaf kept in a dark cupboard — where no autumn is involved at all.',
    surprising:
      'Autumn colour is not slow decay, it is an eviction. The tree is actively taking the leaf apart and salvaging the costly atoms before letting it go; a leaf left to die on the branch would throw away nitrogen the tree can barely afford to lose each year.',
    question:
      'The yellow pigment has been in the leaf since summer — so what exactly has to happen before you can see it, and who is doing that work?',
  },
  {
    id: 'transpiration-pull',
    topic: 'How does water climb to the top of a tall tree?',
    simple:
      'There is no pump in a tree. Water enters the roots, and as it evaporates from the leaves through tiny pores, it pulls the column of water above it upward — like lifting a chain by its top link.',
    deeper:
      'The driving force is transpiration. Each water molecule leaving a stoma tugs the next one, and hydrogen bonding keeps the whole column under tension inside the narrow xylem tubes, where cohesion and adhesion stop it from snapping. Roots add a small push from below, but root pressure is far too weak to raise water thirty metres; the energy for the lift is the Sun’s, working through evaporation. The cost is real: carbon dioxide can only enter through the same open pores that let water out, so a tree in drought must close its stomata and stop growing to save water. Moving water down a water-potential gradient — from soil at close to 0 MPa towards air spaces in the leaf at about −2 MPa — the column rises.',
    equation: 'water potential: soil ≈ −0.05 MPa → root → stem → leaf air spaces ≈ −2 MPa, so water moves leaf-ward',
    connection:
      'A potted plant collapsing within hours of being forgotten, water droplets on the inside of a plastic bag tied over a leaf, and the trickle of moisture onto the floor from a hanging clothes line of wet washing — evaporation doing work in both cases.',
    surprising:
      'More than nine-tenths of the water a plant lifts is transpired, not used in photosynthesis. A mature tree can move hundreds of litres in a day and keep almost none of it. That water is the price of getting carbon dioxide in through a pore that cannot help letting water out.',
    question:
      'Roots have no pump and stems have no valves — so what is doing the lifting, and what happens to that mechanism at noon in May when the stomata close?',
  },
  {
    id: 'mendel-3-1',
    topic: 'Where does Mendel’s 3:1 ratio come from?',
    simple:
      'Every pea plant carries two copies of each gene. Only one of the two is visible, and which copy goes into a pollen grain or an egg is decided at random — so the hidden copy turns up again in the next generation.',
    deeper:
      'In a monohybrid cross the first-generation plants are all heterozygous and all tall, because tall is dominant. Cross two of those and the copies pair in four equally likely ways: two tall-homozygous, two heterozygous, and one short. Three of the four combinations look tall and one looks short — that is the whole of the 3:1 ratio. It is a counting result, not a law of nature, and it depends on the two alleles separating cleanly and recombining at random. Break either assumption — linkage between genes, or an allele that kills pollen — and the neat ratio fails, which is exactly what later geneticists found when they looked beyond peas.',
    equation: 'Tt × Tt → TT : Tt : tT : tt = 1 : 2 : 1, giving 3 tall : 1 short',
    connection:
      'A trait that disappears in one generation and returns in the next, a family where a disease skips a generation, and the difference between a bitter and a sweet variety of the same gourd.',
    surprising:
      'Mendel published in 1866 and was almost completely ignored; his work was rediscovered around 1900 by three separate researchers, sixteen years after his death. The first quantitative law in biology sat unread in a Brünn journal for three decades — which is also why historians keep arguing about how tidy his recorded numbers were.',
    question:
      'A tall pea plant is crossed with a short one and every single offspring is tall. What is the tall parent’s genotype, and how would you settle the question with one more cross?',
  },
  {
    id: 'abo-blood-groups',
    topic: 'Why does blood have groups at all?',
    simple:
      'Red cells carry marker molecules on their surface, and plasma carries antibodies against the markers it does not have. Put the wrong two together and the antibodies clump the red cells into lumps.',
    deeper:
      'The ABO gene comes in three common forms — A, B and O — and you inherit two of them. A and B are codominant, so AB blood carries both markers and makes neither antibody; O carries no marker and makes both. Your own cells are spared because the antibodies are directed against the marker you lack. Oddly, these antibodies appear without any transfusion ever having happened, probably shaped by similar molecules on gut bacteria — the exact reason is still not settled. Grouping is a safety test, not a compatibility certificate: it says nothing about Rh, and nothing at all about suitability for marriage, which is where this test is most often misunderstood.',
    equation: 'parents A (AO) and B (BO) can have a child of any group: A, B, AB or O',
    connection:
      'A blood group card kept in a wallet, an O-negative unit held for emergencies in a trauma ward, and the family discussion before a wedding that confuses a laboratory test with a compatibility judgement.',
    surprising:
      'The “universal donor” is a partial truth. O negative red cells can go to almost anyone in an emergency, but O plasma carries both antibodies and is not universal at all — the same donor’s red cells and plasma behave in opposite ways.',
    question:
      'Parents with groups A and B have a child with group O. Was something recorded wrongly, or is this perfectly possible — and which genotype makes it possible?',
  },
  {
    id: 'antibiotic-resistance',
    topic: 'Does stopping an antibiotic early create “superbugs”?',
    simple:
      'An antibiotic does not kill every bacterium, only the vulnerable ones. Whatever survives has, by definition, some protection, and it multiplies. So how long the drug is present matters, and so does why it was taken in the first place.',
    deeper:
      'The old instruction to always finish the full course was aimed at preventing a relapse, and relapse is real. But a long course also keeps the drug in contact with more bacteria, and resistance can be selected for just as readily by treating for too long as for too short — so guidance has been shifting towards the shortest effective course chosen for that particular infection, rather than a fixed number of days for everything. What is not in dispute: antibiotics do nothing to a virus, so taking them for a cold applies selection pressure for no benefit, and unprescribed use in people and in livestock turns ordinary places into testing grounds.',
    equation: 'selection, not learning: 1 survivor in 10⁹ that divides every 30 minutes is a population of 10⁹ again in about 15 hours',
    connection:
      'A pharmacist selling an antibiotic over the counter for a sore throat, a poultry shed where the drug is used as a growth habit, and a hospital lab reporting an organism resistant to everything on the panel.',
    surprising:
      'Resistance travels sideways as well as downwards. A bacterium can pick up a resistance gene from a dead neighbour’s DNA or through a plasmid passed between cells — even between different species — so resistance can spread faster than ordinary inheritance ever could.',
    question:
      'Antibiotics do not act on a cold. If someone takes them anyway, what exactly is being selected, and where do the survivors come from?',
  },
  {
    id: 'fever-thermostat',
    topic: 'Why does a fever make you feel cold first?',
    simple:
      'A fever is a thermostat set higher, not a thermostat broken. Your brain’s target temperature is raised, your body now counts as under-heated, and it shivers and curls up until that new temperature is reached.',
    deeper:
      'Bacterial and viral products make immune cells release pyrogens, of which interleukin-1 is the classic example. These act on the hypothalamus and raise its set point. Until you reach the new target you feel cold and shiver, which generates heat; once you reach it you stop shivering and feel ordinary at 39 °C. When the fever breaks, the set point drops and you feel hot and start sweating, because you are now above target. That also explains why paracetamol makes you comfortable without shortening the illness: the fever is a coordinated defence, not merely a symptom.',
    equation: 'a 3 °C rise in core temperature raises oxygen demand by roughly 10–15%, which is why a long high fever strains the heart',
    connection:
      'Wanting two blankets during the shivering stage, the sweat that follows a paracetamol tablet, and a school’s rule about sending a child with fever home.',
    surprising:
      'There is no single normal temperature. The familiar 37 °C is a nineteenth-century average, and healthy people run roughly 36.1 to 37.2 °C — lower in the morning, higher in the evening. Chasing a decimal point on a thermometer is not a diagnosis.',
    question:
      'You shiver at the start of a fever and sweat as it breaks. What is the hypothalamus doing in each of those two stages?',
  },
  {
    id: 'booster-dose',
    topic: 'Why does a vaccine need a second dose?',
    simple:
      'The first dose teaches the immune system to recognise a pathogen. The second makes it genuinely competent — more antibodies, better-fitting antibodies, and a store of memory cells that reacts in hours instead of days.',
    deeper:
      'A primary response takes days and produces antibodies of only moderate fit. On meeting the same antigen again, memory B cells that were already selected for binding quality multiply and their antibodies are refined further, so the second response is faster, larger and stickier. That is why a booster is often a smaller dose, and why the interval matters: give it too soon and the reaction has not had time to mature. Live vaccines complicate the general rule, since some give lasting immunity after a single dose, while inactivated and protein-based vaccines usually need repeats — and tetanus needs a top-up about every ten years because that memory fades.',
    equation: 'primary response: antibody detectable in about 5–10 days  ·  secondary response: within 1–3 days',
    connection:
      'A BCG scar on the upper arm, a tetanus injection after stepping on a thorn, and an immunisation card filed away for a school admission.',
    surprising:
      'The immune system is less a wall than a filing cabinet. Its real trick is not killing the pathogen — it is remembering the shape of it, which is why a second encounter can be shut down before you notice you were infected at all.',
    question:
      'A child who had only the first dose caught the illness later, but mildly. What did that first dose actually achieve, and what would the second have added?',
  },
  {
    id: 'sickle-cell-malaria',
    topic: 'Why does a harmful gene survive in a population?',
    simple:
      'The sickle cell gene is harmful on its own, but carrying a single copy gives strong protection against malaria. Where malaria is common, that protection outweighs the cost of the disease.',
    deeper:
      'One change in the beta-globin gene swaps a single amino acid, and haemoglobin built only from the altered form distorts red cells into sickle shapes when oxygen is low. A carrier — one normal copy and one altered copy — has almost normal red cells and, in malarial regions, a substantially lower risk of dying of malaria, because the parasite fares poorly in those less hospitable cells. This is balanced polymorphism: the allele settles at a stable frequency set by the advantage against malaria and the cost of the disease. Where malaria is absent, the allele slowly drifts down instead, which is what has been observed in populations of African origin living in non-malarial countries.',
    equation: 'HbAS × HbAS → 1 HbAA : 2 HbAS : 1 HbSS',
    connection:
      'Screening programmes and counselling in the districts of central India where the trait is common, and the ethical questions that come with a carrier result reaching a family before it reaches a doctor.',
    surprising:
      'Sickle cell trait is not sickle cell disease. A carrier is usually perfectly healthy, and without malaria is slightly protected; the same allele is a serious illness, a shield against malaria, or nothing much at all, depending on how many copies you carry and where you live.',
    question:
      'If the sickle cell allele is harmful, why did it not simply disappear from these populations thousands of years ago?',
  },
  {
    id: 'insulin-feedback',
    topic: 'How does the body keep blood sugar steady?',
    simple:
      'After a meal, insulin moves glucose out of the blood and into cells; when glucose falls, glucagon does the opposite. The blood itself supplies the signal, so the two hormones keep each other in check.',
    deeper:
      'The pancreatic beta cell is a glucose sensor as much as a factory: glucose entering it raises the ATP-to-ADP ratio, which closes a potassium channel, depolarises the membrane, lets calcium in and triggers insulin release. Type 1 diabetes destroys those cells in an autoimmune attack, so the sensor and the signal are both gone. Type 2 diabetes is usually different — muscle, liver and fat stop responding well to insulin, so the pancreas produces more and more until it can no longer keep up. Same symptom, opposite fault, which is why the two are treated so differently.',
    equation: 'glucose → beta cell senses and secretes insulin → uptake by muscle and fat, storage as glycogen in the liver',
    connection:
      'A glucometer reading before and after a meal, a school PT period lowering blood sugar without any medicine, and the timing advice given to someone on insulin before a three-hour examination.',
    surprising:
      'Insulin was extracted from dog pancreases in 1921, and within months a fourteen-year-old boy who had only weeks to live was receiving it. It later became the first protein whose full sequence was worked out — the beginning of protein sequencing as a science.',
    question:
      'Two people have high blood sugar: one makes no insulin at all, the other makes plenty. How can the same reading come from opposite problems?',
  },
  {
    id: 'plants-respire',
    topic: 'Why does a plant need oxygen if it also makes oxygen?',
    simple:
      'Photosynthesis makes food; respiration uses food to release energy — and every living cell respires all the time, in light or in darkness. A plant is not an exception to breathing; it simply also makes its own sugar.',
    deeper:
      'Photosynthesis happens only where there is chlorophyll and light, and it stops when the light goes. Respiration never stops. In bright sun a healthy leaf’s photosynthesis runs far ahead of its respiration, so the leaf gives out a net surplus of oxygen; at night the exchange reverses and the plant consumes oxygen like any other living thing. The roots have no chlorophyll and cannot photosynthesise at all — they rely on their own respiration for the energy to take up minerals, which is why soil with no air in it kills a plant far faster than the same amount of water in a pot that can drain.',
    equation: 'respiration:  C₆H₁₂O₆ + 6 O₂ → 6 CO₂ + 6 H₂O + energy',
    connection:
      'A pot that dies because it was watered every single day in heavy clay, a cutting that rots at the base, and the yellowing leaves of a plant standing in a waterlogged saucer.',
    surprising:
      'More houseplants are killed by overwatering than by underwatering, and the mechanism is drowning: the roots suffocate, not the leaves. The first visible sign appears in the leaves, which is why the real cause is so often missed.',
    question:
      'A plant is kept in a dark room for three days. Is its oxygen exchange the same on day one and day three — and which of the two processes is running in each case?',
  },
  {
    id: 'energy-pyramid',
    topic: 'Why is there no food chain with ten links?',
    simple:
      'Only about a tenth of the energy stored at one level ends up stored at the level above. Each step keeps a fraction of the previous one, so after four or five steps there is not enough left to support anything.',
    deeper:
      'The loss is not wastefulness but thermodynamics. Most of the energy a plant captures is spent on staying alive — respiring, growing, repairing — and some is left behind in matter that the next animal cannot digest. A rough ten percent rule often holds for energy transfer between trophic levels, which is why food chains are pyramids, why top predators are large, few and need enormous territories, and why eating one rung lower on the ladder — eating the grain rather than feeding it to an animal first — supports many more people from the same field.',
    equation: '1,000 kg of grass → about 100 kg of grasshopper → about 10 kg of frog → about 1 kg of snake',
    connection:
      'Why a tiger needs tens of square kilometres of forest, why a meat meal uses far more land than a grain meal of the same energy, and why a pond holds many small fish and only a handful of large ones.',
    surprising:
      'The pyramid is about energy, not about counting. A single tree can support thousands of insects and only a few birds, so a pyramid of numbers can look upside down — while the pyramid of energy never does, which is why ecologists prefer it.',
    question:
      'A field of grain feeds many more people than the same field’s grain fed to cattle. Where did the rest of the energy go, and is anything really lost from the animal that ate it?',
  },
];
