import type { ChemistryConcept } from '../types';

/**
 * Chemistry of the Day — one compact concept, every day.
 *
 * Shape, and why: a plain explanation first, a deeper one only when the first
 * one is not the whole truth, an equation or worked example when it actually
 * helps, the everyday connection that made the concept worth teaching, one
 * surprising fact, and one question to ask a class. Selections lean on things
 * that happen in an Indian kitchen, a school lab or a road in July, because a
 * concept attached to something the reader has already seen is the one that
 * survives the exam.
 */
export const chemistryConcepts: ChemistryConcept[] = [
  {
    id: 'salt-on-ice',
    topic: 'Why does salt melt ice?',
    simple:
      'Salt does not melt ice with heat. It gets in the way of freezing: dissolved salt particles make it harder for water molecules to lock into the ice lattice, so the freezing point of the mixture drops below 0 °C and the ice that was already there turns back to liquid.',
    deeper:
      'This is freezing-point depression, a colligative property — it depends on how many dissolved particles there are, not on which salt you chose. One mole of sodium chloride gives two moles of ions, so it depresses the freezing point about twice as effectively as one mole of sugar. The effect has a floor: a saturated brine and ice reach a eutectic near −21 °C, below which adding more salt achieves nothing.',
    equation: 'ΔTf = i · Kf · m   →   for 1 molal NaCl, i = 2, Kf = 1.86 K·kg/mol, so the freezing point falls ≈ 3.7 °C',
    connection:
      'Salt on a winter road, salt rubbed into a kulfi or ice-cream churn to make the ice colder than 0 °C, and rock salt on the steps of a hill station in January.',
    surprising:
      'Salt on ice is not warm — it is the reverse. Making the brine takes heat from its surroundings, so a salt-and-ice mixture becomes colder than ice alone, which is exactly why an old-fashioned ice-cream churn needs it.',
    question:
      'If salt lowers the freezing point of water, why does a salted road still turn to ice on a very cold night — and what is that limit called?',
  },
  {
    id: 'apple-browning',
    topic: 'Why does a cut apple turn brown?',
    simple:
      'Cutting breaks open the apple’s cells and lets an enzyme meet the air. The enzyme oxidises natural plant compounds into brown pigments, so the surface darkens within minutes.',
    deeper:
      'The enzyme is polyphenol oxidase. It converts colourless phenols into quinones, which then link up into larger brown polymers very like melanin. It needs oxygen and a workable pH, which is why lemon juice slows it down: the acid lowers the pH enough to stall the enzyme, and vitamin C also reacts with the quinones before they can brown.',
    equation: 'phenol + ½O₂  —(polyphenol oxidase)→  quinone  →  brown polymer',
    connection:
      'Apples, bananas, potatoes and brinjals doing the same thing on the same chopping board, and the reason a sliced apple looks tired by the time the lunch break ends.',
    surprising:
      'The browning is a defence, not decay. The same reaction produces compounds that make the damaged fruit less appetising to insects and microbes — the apple is trying to close a wound.',
    question:
      'Why does lemon juice keep a cut apple pale while plain water only delays the change — what are the two things the acid is doing?',
  },
  {
    id: 'baking-soda-vs-powder',
    topic: 'Baking soda or baking powder?',
    simple:
      'Baking soda is sodium bicarbonate on its own: it makes carbon dioxide only when it meets an acid. Baking powder is baking soda with a dry acid mixed in, so it works with nothing but water and heat.',
    deeper:
      'On heating, sodium bicarbonate also decomposes by itself, leaving sodium carbonate — the soapy, metallic taste of a batter where too much soda was used, along with a yellow crumb. Powder avoids this by carrying its own acid, usually cream of tartar or a phosphate, so the released carbon dioxide stays in balance with the alkali. Most commercial powders are “double-acting”: one acid that reacts in the bowl, and another that only reacts in the heat of the oven.',
    equation: 'NaHCO₃ + H⁺ → Na⁺ + H₂O + CO₂   ·   on heating: 2 NaHCO₃ → Na₂CO₃ + H₂O + CO₂',
    connection:
      'A sponge that rises in a hot oven, a dhokla batter that puffs on the steamer, and the difference between a recipe that says “a pinch of soda” and one that says “baking powder”.',
    surprising:
      'All the gas that lifts the cake was inside the batter from the start — sodium bicarbonate is roughly half carbon dioxide by mass, which is the only reason a spoonful can raise a whole cake.',
    question:
      'A batter made with too much baking soda tastes soapy and looks yellow — why does one mistake cause both, and what does sodium bicarbonate decompose into?',
  },
  {
    id: 'lemon-and-copper',
    topic: 'Why does lemon juice clean a copper vessel?',
    simple:
      'A dull copper or brass vessel is covered by a thin layer of oxide and tarnish. Citric acid dissolves that layer, revealing the metal below, and the tarnish is gone without any scrubbing.',
    deeper:
      'The dull layer is mostly copper oxide and copper carbonate. An acid turns them into a soluble copper salt, which is then wiped away as a greenish smear — the reason the cloth turns coloured. Tamarind and vinegar work for the same reason. The caution matters as much as the trick: an acid that is safe for copper will attack aluminium and iron utensils, so this is a copper-and-brass method only.',
    equation: 'CuO + 2 H⁺ → Cu²⁺ + H₂O   (the soluble copper salt is then rinsed off)',
    connection:
      'Tamarind or lemon rubbed on a brass lamp before a festival, and the school-lab tradition of brightening a copper strip with dilute acid.',
    surprising:
      'You are not polishing the metal — you are stripping away a few micrometres of metal salts. Do it often enough on a thin vessel and you are genuinely losing copper each time.',
    question:
      'A lemon shines copper but corrodes aluminium — what does reactivity tell you about which metal is safe to clean with an acid?',
  },
  {
    id: 'hard-water-scum',
    topic: 'Why soap scum forms in hard water',
    simple:
      'Hard water carries dissolved calcium and magnesium. Soap reacts with those ions and forms an insoluble solid instead of lather — that grey, greasy film is scum.',
    deeper:
      'Ordinary soap is a sodium salt of a long fatty acid. Swap sodium for calcium and you get the calcium salt of the same fatty acid, which will not dissolve in water and will not lift oil; it precipitates instead. Everything the soap might have done is spent on the minerals in the water, which is why hard water needs much more soap and leaves bucket rings, dull utensils and clothes that slowly turn grey. Detergents are sulphonates, whose calcium salts are soluble, so they lather in either kind of water.',
    equation: '2 R–COO⁻Na⁺ (soap) + Ca²⁺ → (R–COO)₂Ca (scum, insoluble) + 2 Na⁺',
    connection:
      'A bucket that will not lather, a film on the bathroom tap, and white deposit in a kettle in a city with borewell water.',
    surprising:
      'Temporary hardness — bicarbonates — can simply be boiled off as carbonate scale, while permanent hardness — sulphates and chlorides — cannot. The difference explains why hard water behaves differently in different towns, or even in different wells of the same town.',
    question:
      'Which water will clean oily hands with less soap, and why does a detergent succeed where soap fails?',
  },
  {
    id: 'rusting-and-galvanising',
    topic: 'Why does iron rust — and why does zinc stop it?',
    simple:
      'Rust needs both air and water: iron gives up electrons to oxygen and turns into hydrated iron(III) oxide, the flaking red-brown layer that lets more of the metal be eaten away.',
    deeper:
      'It is an electrochemical process — a small corrosion cell with the iron acting as the anode, oxygen as the cathode, and a film of water carrying the ions. Because the rust is porous, it does not protect the metal below it, unlike the oxide layer on aluminium which seals the surface and is why aluminium apparently never rusts. Galvanising protects iron with zinc: zinc is more reactive, so it corrodes preferentially in place of the iron, and even a scratch in the coating keeps the iron safe as long as some zinc is nearby.',
    equation: 'anode: Fe → Fe²⁺ + 2e⁻   ·   cathode: O₂ + 2H₂O + 4e⁻ → 4OH⁻   ·   overall: Fe²⁺ → Fe₂O₃·xH₂O',
    connection:
      'Rusty grills and gates after the monsoon, the dull grey zinc on an electric pole, and chromium plating on a bicycle handlebar.',
    surprising:
      'A scratch on galvanised iron is not the danger it looks like. Pure iron in one small patch of a larger zinc sheet rusts more slowly than the same iron alone, because the zinc takes the damage.',
    question:
      'Aluminium and iron both react with oxygen — so why is one only shiny and the other dust?',
  },
  {
    id: 'curd-setting',
    topic: 'Why does milk set into curd?',
    simple:
      'Bacteria in the starter culture turn lactose into lactic acid. As the milk becomes acidic, its protein molecules clump together and trap water, and the liquid thickens into a gel.',
    deeper:
      'Milk protein, casein, is held in suspension in microscopic micelles, kept apart by electric charge. Lactic acid supplies hydrogen ions that remove that charge; with the repulsion gone, the micelles link and form a network — the gel that is curd. Around pH 4.6, casein reaches its isoelectric point and is least soluble, which is why curd sets reliably there and turns sour and watery if fermentation is left to run past it. Boiling the milk has already done one useful thing: it kills competing microbes, but the milk must still be cooled before the culture is added, because heat would kill the culture too.',
    equation: 'C₁₂H₂₂O₁₁ (lactose) → 4 CH₃CH(OH)COOH (lactic acid)   ·   casein at pH ≈ 4.6 precipitates',
    connection:
      'A spoon of yesterday’s curd added to tonight’s warm milk, a bowl set overnight in a kitchen in summer, and the sour taste of a curd kept a day too long.',
    surprising:
      'The same acidity that sets curd also separates paneer: add lemon juice or vinegar and the casein curdles completely. Curd and paneer are the same chemistry, stopped at two different points.',
    question:
      'Why is curd set more reliably in summer than in winter, and why does a spoonful of old curd speed up the whole bowl?',
  },
  {
    id: 'antacids',
    topic: 'How does an antacid work?',
    simple:
      'The stomach keeps hydrochloric acid at a pH near 2 to digest food and kill microbes. An antacid is a mild base that neutralises some of that acid, raising the pH enough to stop the burning.',
    deeper:
      'Different bases bring different side effects, which is why they are sold in combinations. Sodium bicarbonate is fast but releases carbon dioxide — that is the burp — and can leave the stomach briefly over-alkaline, prompting a rebound of acid. Magnesium hydroxide is effective and acts as a laxative; aluminium hydroxide is slower and constipating; the two are paired so the effects cancel. None of them cure the cause, and the stomach is protected against its own acid by a mucus layer whose failure, not the acid itself, is what usually needs treating.',
    equation: 'NaHCO₃ + HCl → NaCl + H₂O + CO₂   ·   Mg(OH)₂ + 2 HCl → MgCl₂ + 2 H₂O',
    connection:
      'A spoon of baking soda in water after a heavy dinner, an antacid tablet before an exam, and a doctor asking whether the burning happens before or after eating.',
    surprising:
      'The stomach does not need the acid destroyed — it needs the acid kept away from a damaged lining. That is why a little antacid often helps more than a lot, and why long-term self-medication can hide a problem instead of solving it.',
    question:
      'Two antacids act on the same acid. Why is one sold with the other in the same tablet?',
  },
  {
    id: 'carbonation',
    topic: 'Why does a warm cold drink fizz over?',
    simple:
      'Carbon dioxide is dissolved in the drink under pressure. Warm liquid cannot hold as much dissolved gas as cold liquid, so a warm bottle has already begun to release the gas — and a shaken one releases all of it at once.',
    deeper:
      'This is Henry’s law: the amount of gas that stays dissolved is proportional to its partial pressure above the liquid, and the constant falls sharply as the temperature rises. Much of the dissolved carbon dioxide also reacts with water to form carbonic acid, which is why a soft drink is slightly acidic and tastes sharp. Shaking does not create gas; it creates bubble nuclei throughout the liquid so the gas escapes from every surface at once instead of quietly from the top.',
    equation: 'CO₂(g) ⇌ CO₂(aq)   ·   CO₂(aq) + H₂O ⇌ H₂CO₃ (carbonic acid)',
    connection:
      'A bottle left in the sun that erupts when opened, a chilled bottle that stays lively for hours, and the flat taste of a drink left open overnight.',
    surprising:
      'The gas you taste as “fizz” is also a mild anaesthetic on the tongue — the prickle of carbonation is partly the carbonic acid activating the same receptors that detect sourness and irritation.',
    question:
      'Why does a cold bottle of soda keep its fizz and a warm one lose it, even without being opened twice?',
  },
  {
    id: 'hydrogen-peroxide',
    topic: 'Why does hydrogen peroxide bubble on a wound?',
    simple:
      'The bubbling is oxygen. Catalase, an enzyme present in blood and skin, splits hydrogen peroxide into water and oxygen gas so quickly that you see the gas forming as foam.',
    deeper:
      'The reaction is a decomposition: 2 H₂O₂ → 2 H₂O + O₂, catalysed rather than consumed. The same demonstration works with a pinch of manganese dioxide or with pieces of raw potato, and the same enzyme is why the drugstore bottle is kept in a dark container — light slowly decomposes peroxide too. Modern medicine uses far less of it now: it does kill microbes, but it also damages the tissue it is poured on, which delays healing.',
    equation: '2 H₂O₂ → 2 H₂O + O₂   (catalysed by catalase; the foam is O₂, not vapour)',
    connection:
      'A cut treated at home, the pharmacist’s brown bottle, and the “elephant’s toothpaste” demonstration in a school science fair.',
    surprising:
      'The foaming was never a measure of how well it cleans. It measures how much catalase the wound supplies — so a bubbling wound is evidence of blood and tissue, not of microbes being destroyed.',
    question:
      'If the same bubbling happens with potato and with blood, what does that tell you about the enzyme — and about using the foam as proof of cleanliness?',
  },
  {
    id: 'bleach',
    topic: 'How does bleach remove colour?',
    simple:
      'Bleach oxidises the coloured molecules in a stain and breaks the chains of alternating double bonds that absorb visible light. Destroy that pattern and the molecule has no colour left to show.',
    deeper:
      'Household bleach is a hypochlorite solution, and its oxidising power comes from the chlorine it can release. Dyes and many stains owe their colour to long conjugated systems — alternating single and double bonds that absorb part of the visible spectrum. Oxidising the molecule breaks the sequence, the absorption moves out of the visible range, and the stain appears to vanish even though the fabric remains. Its destructive power is not selective, so it damages cotton fibres and most other colours along with the stain.',
    equation: 'OCl⁻ + H₂O + 2e⁻ → Cl⁻ + 2OH⁻   (the hypochlorite ion is the oxidising agent)',
    connection:
      'White shirts kept white, a bathroom scrubbed after the monsoon, and a bucket of water left with bleach to clean vegetables — for which it is not a safe substitute for washing.',
    surprising:
      'Bleach on a stain and bleach in a bucket are fine; bleach in the same bucket as acid toilet cleaner or ammonia releases chlorine or chloramine gas. Most household poisonings in this family come from mixing two cleaning agents, not from one of them.',
    question:
      'Bleach removes the colour of a stain but colours nothing. In terms of electrons, what exactly has it done?',
  },
  {
    id: 'water-of-crystallisation',
    topic: 'Why does blue copper sulphate turn white on heating?',
    simple:
      'Copper sulphate crystals carry five water molecules locked into their structure. Heat drives that water out, the ordered blue lattice falls apart, and the powder turns white; add water and the blue returns.',
    deeper:
      'Water of crystallisation is not surface moisture — it is part of the crystal itself, holding the ions in a particular arrangement. Removing it changes the compound’s structure, and with it the colour, because the blue comes from water molecules bonded to the copper ion. Because the change is reversible, this is a standard test: the white solid that turns blue on adding water is evidence of water. The same phenomenon explains Plaster of Paris, which sets by taking water back into its crystals, and the heat generated when quicklime is slaked.',
    equation: 'CuSO₄·5H₂O (blue)  —heat→  CuSO₄ (white) + 5 H₂O   ·   and back again on adding water',
    connection:
      'A blue vitriol crystal in the school cupboard, blue crystals planted in an aquarium or a pond to control algae, and the setting of a plaster cast on a broken arm.',
    surprising:
      'The same salt can be used as a test for water and as a drying agent, because the reaction runs both ways. The white powder that proves water is present is the very thing that removes it.',
    question:
      'Heating removed only water and the colour changed completely. What does that tell you about where the colour of a salt comes from?',
  },
];
