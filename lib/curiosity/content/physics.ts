import type { PhysicsConcept } from '../types';

/**
 * Physics of the Day — one compact concept, every day.
 *
 * Same shape as the chemistry card, with a real-world connection instead of an
 * everyday one. Several entries deliberately correct a comfortable textbook
 * explanation, because a school explanation that is *nearly* right is exactly
 * where a thoughtful student loses the thread — the deeper paragraph says what
 * the simple one left out.
 */
export const physicsConcepts: PhysicsConcept[] = [
  {
    id: 'blue-sky',
    topic: 'Why is the sky blue?',
    simple:
      'Sunlight is white — a mixture of all colours. The smallest molecules in the air scatter the short wavelengths of light far more strongly than the long ones, so blue light arrives at your eye from every direction of the sky.',
    deeper:
      'This is Rayleigh scattering, and the scattered intensity goes as 1/λ⁴, which makes blue about five times more scattered than red. The sky is not actually blue in the source: violet is scattered even more strongly than blue, but the sun emits less violet, the atmosphere absorbs some of it, and our eyes are much more sensitive to blue. At sunset the light has travelled a longer path through the atmosphere, so nearly all the blue is scattered away and what survives is orange and red.',
    equation: 'I ∝ 1/λ⁴   ·   a 450 nm photon is scattered about 5× more strongly than a 650 nm one',
    connection:
      'Why distant mountains look hazy and bluish, why a red filter makes a photograph look dramatic, and why pilots often describe the sky at altitude as a much deeper colour.',
    surprising:
      'On the Moon the sky is black even in daytime. There is no atmosphere, so there is nothing to scatter the sunlight sideways into an astronaut’s eyes — the Sun is a harsh white disc in an empty void.',
    question:
      'Violet light scatters more than blue, so why is the sky not violet?',
  },
  {
    id: 'magnus-effect',
    topic: 'Why does a spinning ball curve in the air?',
    simple:
      'A spinning ball drags a thin layer of air around with it. One side of the ball moves with the airflow and the other against it, and the pressure difference pushes the ball sideways in flight.',
    deeper:
      'This is the Magnus effect, and it comes with the spin, not with the speed. The surface drags air into a swirl — on one side the swirl agrees with the passing air and speeds it up, and where air moves faster the pressure is lower. Where the surface is spinning away from the airflow the air slows and the pressure rises. The ball then curves towards the low-pressure side. It is a small force acting for a long time: over a free kick’s thirty metres it can bend the ball a metre or more, which is the whole margin between a goal and a wall.',
    equation: 'F = ½ · ρ · v² · A · C_L(Spin)   — the lift coefficient grows with the spin ratio, not the speed alone',
    connection:
      'A bending free kick, a tennis topspin lob that dips early, a well-hit golf ball, and the reason a shuttlecock is feathered rather than smooth — a shuttle is dragged by spin it does not want.',
    surprising:
      'In cricket, the “swing” of a new ball is largely a different mechanism — the seam steers a boundary layer rather than a spinning surface. The Magnus effect is the one you can actually see in a football, which is why the same physics gets two names in two sports.',
    question:
      'A ball curving in flight and a kite lifting on a string both involve a pressure difference. What is doing the work in each case?',
  },
  {
    id: 'lightning-thunder',
    topic: 'Why do we see lightning before we hear thunder?',
    simple:
      'Light travels at about 300,000 km/s and sound at about 343 m/s in air. The flash and the bang happen together, but the light reaches you almost instantly while the sound takes its time.',
    deeper:
      'The three-second rule is a real measurement, not a folk remedy: sound covers roughly one kilometre every three seconds, so counting from flash to thunder gives the strike’s distance in kilometres. The thunder itself is not the “sound of lightning” but the sound of air superheated by the discharge — the channel reaches tens of thousands of kelvin in microseconds, the air expands faster than the speed of sound, and the resulting shock wave rolls and rumbles as it reflects off the ground, clouds and buildings.',
    equation: 'distance (km) ≈ seconds between flash and thunder ÷ 3   (since 1000 m ÷ 343 m/s ≈ 2.9 s)',
    connection:
      'A monsoon evening, an approaching storm judged by counting, and a delay between the flash and the crack that tells you the danger has already passed overhead or is still coming.',
    surprising:
      'You can also be struck by lightning before you hear it — the light is a warning arriving instantaneously from a strike that may already have hit nearby ground. Thunder is a report, not an alarm.',
    question:
      'A flash is followed by thunder after nine seconds. How far away is the strike, and would it be safe to stand under a tree for that long?',
  },
  {
    id: 'pressure-cooker',
    topic: 'Why does a pressure cooker cook faster?',
    simple:
      'Sealing the pot lets the steam raise the pressure inside, and water under higher pressure boils above 100 °C. Cooking happens faster at a higher temperature, not at a higher pressure itself.',
    deeper:
      'The boiling point of a liquid is the temperature at which its vapour pressure equals the surrounding pressure. Trap the steam and the pressure rises to about two atmospheres, so water now boils near 121 °C — roughly a 20 °C advantage, and reaction rates generally double for every 10 °C, which is where the striking time saving comes from. The same principle explains why rice takes longer at a hill station: at 2,000 m the pressure is lower, water boils around 93 °C, and the food cooks more slowly even though it is boiling hard.',
    equation: 'boiling point rises ≈ 1 °C for every 36 mbar above atmospheric pressure',
    connection:
      'A pressure cooker in a hill kitchen, an autoclave in a clinic, a steamer in a school canteen, and instructions that warn you never to open the lid before the pressure falls.',
    surprising:
      'The cooker is a pressure vessel, not a magic pot: it will fail if the safety valve or the weight is blocked. The whistle you hear is the valve doing exactly what it should — releasing excess steam so the pressure cannot keep climbing.',
    question:
      'Water boils at 100 °C in Ludhiana and near 93 °C in Manali. Which cooks a potato faster, and why does a “rolling boil” not mean a hotter one?',
  },
  {
    id: 'evaporation-wind',
    topic: 'Why do clothes dry faster in wind?',
    simple:
      'Drying is evaporation: the fastest water molecules leave the cloth and become vapour. Wind carries that vapour away so it does not build up and slow the escape.',
    deeper:
      'Evaporation happens at the surface, and its rate depends on the temperature, the exposed area, and how much vapour is already in the air. Still, humid air quickly becomes saturated just above the cloth, and then almost nothing can leave. Wind sweeps that saturated layer away and keeps the gradient steep. This also explains why wet clothes dry slowly on a rainy day even at the same temperature — the air is already close to saturated — and why evaporation cools the cloth, which is exactly how a matka keeps water cold and how sweating cools a body.',
    equation: 'energy needed to evaporate water ≈ 2,260 kJ/kg at 100 °C (latent heat of vaporisation)',
    connection:
      'A clothesline on a windy roof drying in twenty minutes, a pressure cooker releasing visible steam, and a wet cloth on a forehead bringing a fever down.',
    surprising:
      'The same process chilling your skin is why a fan does not cool a room. A fan does not lower air temperature; it removes the humid layer of air above your skin, so evaporation speeds up and you feel cooler.',
    question:
      'A wet cloth on a table and the same cloth on a line dry at different speeds in the same room — what is different about the air just above each one?',
  },
  {
    id: 'doppler',
    topic: 'Why does a train’s whistle change pitch as it passes?',
    simple:
      'A moving source of sound piles its waves up in front of it and stretches them out behind. Closer together means a higher note; further apart means a lower one.',
    deeper:
      'The source does not change — the wavelength arriving at your ear does. As the train approaches, each successive wave is emitted a little nearer to you, so the crests reach you more often and the pitch sounds higher. As it passes and moves away, each wave starts a little farther off, the crests arrive less often, and the note drops. This is the Doppler effect, and it is the same effect that lets a radar set measure a vehicle’s speed and lets astronomers read a star’s motion from its spectral lines.',
    equation: 'f_observed = f_source · (v_sound ± v_observer) / (v_sound ∓ v_source)',
    connection:
      'A train on the Ludhiana–Amritsar line, an ambulance siren passing, a traffic radar unit, and the red shift astronomers use to measure galaxies moving away.',
    surprising:
      'The siren’s note does not drop because the driver slowed down. The vehicle can hold a perfectly steady pitch the whole time — it is the geometry that changes, and the drop is sharpest exactly at the fly-by.',
    question:
      'An ambulance passes you at a constant speed with a constant siren — what do you hear, and why does your ear report a change where nothing changed?',
  },
  {
    id: 'how-wings-lift',
    topic: 'How does an aeroplane wing actually generate lift?',
    simple:
      'A wing is set at a slight angle to the airflow and it turns the air downwards. By Newton’s third law, pushing air down produces an upward reaction on the wing.',
    deeper:
      'The textbook shortcut — “air over the curved upper surface travels farther, so it must go faster, and lower pressure pushes the wing up” — is not the real mechanism. Air does not need to meet again at the trailing edge. The accurate picture has two equivalent parts: the wing deflects a large mass of air downward, and the pressure difference across the wing follows from the circulation of the flow around it, which the Kutta–Joukowski theorem relates directly to speed and angle of attack. Bernoulli’s theorem is then a bookkeeping tool for the pressure, not the cause of the lift.',
    equation: 'Lift = ½ · ρ · v² · S · C_L   ·   Kutta–Joukowski: L′ = ρ · v · Γ',
    connection:
      'The flaps a pilot lowers for extra lift at low speed, the sharp stall when the angle gets too high, and the wake turbulence that makes a light aircraft uncomfortable minutes behind a heavy one.',
    surprising:
      'At a high enough angle of attack the airflow separates from the upper surface and lift collapses in seconds — that is a stall, and it is a function of angle, not of speed. A stalled wing can be flying fast.',
    question:
      'If lift depended only on the pressure difference caused by unequal path lengths, inverted flight would be impossible. How do you explain a stunt plane flying upside down?',
  },
  {
    id: 'apparent-weight',
    topic: 'Why do you feel heavier in a lift that starts going up?',
    simple:
      'Your weight has not changed; the force of the floor on your feet has. Accelerating upwards needs an extra upward push, and you feel that push as extra weight.',
    deeper:
      'In a lift accelerating upward at a, the floor must provide m(g + a) — that is your apparent weight, and a bathroom scale would read it. Moving up at a steady speed gives exactly m·g, no more than standing in a room. When the lift accelerates downward, the floor pushes with m(g − a), which feels light; in free fall, a = g and the reading is zero — the same feeling astronauts get in orbit, which is not the absence of gravity but continuous falling.',
    equation: 'N = m(g + a) while accelerating up   ·   N = m(g − a) while accelerating down   ·   N = mg at constant velocity',
    connection:
      'The lift in a hospital block, an aircraft climbing after take-off, a roller-coaster valley, and the queasy feeling in a fast descent.',
    surprising:
      'Feeling “weightless” in orbit does not mean gravity has gone. The space station is still firmly in Earth’s field — it is simply falling around the planet at the same rate as everyone inside it, so nothing presses on anything.',
    question:
      'A lift moves upwards at a constant speed and then slows near your floor — what does a scale under your feet read during each stage?',
  },
  {
    id: 'ice-floats',
    topic: 'Why does ice float on water?',
    simple:
      'When water freezes, its molecules lock into an open hexagonal arrangement held by hydrogen bonds. The structure takes up more space than the liquid, so ice is less dense and it floats.',
    deeper:
      'Water is one of the very few substances whose solid is less dense than its liquid — 0.917 g/cm³ against 1.00 g/cm³. In liquid water the molecules are constantly breaking and remaking hydrogen bonds and can pack closely; in ice, every molecule is held at an open-armed distance from four neighbours. This single quirk has enormous consequences: water expands on freezing, which is why pipes burst and bottles crack, and ice forming on the top of a lake insulates the water below, letting fish survive a Himalayan winter.',
    equation: 'density of ice ≈ 917 kg/m³ vs water ≈ 1,000 kg/m³   ·   about 9% of an iceberg floats above the surface',
    connection:
      'Ice on a pond in January, water left in a pipe on a freezing night, a bottle of water in the freezer, and the way a sealed bottle of milk cracks in a hill town.',
    surprising:
      'The same property is why freezing is used to break rock and road surfaces in cold countries — the growing ice crystals do the work of a demolition crew, without any explosive.',
    question:
      'A lake freezes from the top down, not the bottom up — what does that single fact tell you about the density of ice?',
  },
  {
    id: 'static-shock',
    topic: 'Why does a doorknob give you a shock on a dry day?',
    simple:
      'Walking on a carpet or a car seat rubs electrons onto you. Your body builds a charge, and when your hand meets a metal object the charge jumps across in a fraction of a second — the spark is that jump.',
    deeper:
      'This is triboelectric charging: two dissimilar materials in contact exchange electrons, and the one with greater affinity keeps them. Since you are insulated from the ground by dry air and shoes, the charge cannot simply flow away; it accumulates to several thousand volts. Touching metal earthing a conductor lets it discharge through you in microseconds. What you feel is not the voltage but the current and the heating along a tiny path — which is why a 5,000-volt spark from your finger is harmless while a household 230-volt wire is not: the wall supply can keep pushing current, and your charged body can only spend what it accumulated.',
    equation: 'charge stored ≈ C · V — a human body holds roughly 100–1,000 pF, so only a microjoule is discharged',
    connection:
      'A spark at a car door in winter, a crackle while removing a woollen sweater, and the anti-static strips a fuel tanker drags along the road.',
    surprising:
      'Humidity is the master variable. On a monsoon day your skin’s surface film of water conducts the charge away as fast as it builds, which is why painful shocks are a winter phenomenon everywhere.',
    question:
      'A few thousand volts jump from your fingertip and it stings, while a 1.5-volt cell wired directly to your skin is unnoticeable. What does that tell you about electricity and danger?',
  },
  {
    id: 'sun-fusion',
    topic: 'Why does the Sun shine steadily instead of exploding?',
    simple:
      'Deep in the core, hydrogen nuclei fuse into helium and release energy. Two forces hold the balance: gravity pulls inward, and the outward pressure of the hot, newly produced energy pushes back.',
    deeper:
      'Fusion needs protons to get close enough for the strong force to take over, but they repel each other electrically. Temperatures of about 15 million kelvin are not enough on their own — the Sun relies on quantum tunnelling, which lets a tiny fraction of protons pass the barrier anyway. That rarity sets the Sun’s engine at a remarkably low power density, closer to a compost heap than to a fire, and the huge size of the core makes it add up. The balance is genuinely self-correcting: a little more fusion pushes the core outward, which cools it, which slows the fusion again.',
    equation: '4 ¹H → ⁴He + 2e⁺ + 2ν + energy   ·   Δm ≈ 0.7%, so E = Δm·c² gives about 4 × 10⁻¹² J per reaction',
    connection:
      'Sunlight on a solar panel, the temperature difference that makes the monsoon, and the fact that a school in Punjab receives in a day about as much solar energy as a small village uses.',
    surprising:
      'A hydrogen fusion bomb releases its energy in microseconds precisely because it is not held together by gravity. The Sun is a controlled reaction, not a small bomb — and it has stayed controlled for four and a half billion years.',
    question:
      'If the temperature of the Sun’s core rose, what would happen to the rate of fusion — and why does that answer make the Sun stable?',
  },
  {
    id: 'coriolis-myth',
    topic: 'Does the Coriolis effect decide how your sink drains?',
    simple:
      'No. The Coriolis effect is real, but at the scale of a sink or a bucket it is far too weak to decide which way the water spins; the shape of the basin, how it was filled and any leftover motion decide that.',
    deeper:
      'The Coriolis effect turns a moving object sideways because the Earth is rotating under it, and its size depends on the speed of the flow and the latitude — a function that vanishes at the equator. For water a metre across with a few centimetres per second of flow, the sideways force is thousands of times weaker than the everyday disturbances from the plumbing. Where it does dominate is in systems that run for hours over hundreds of kilometres: cyclones spin anticlockwise in the northern hemisphere and clockwise in the southern, and the trade winds are diverted the same way.',
    equation: 'Coriolis acceleration a = 2 · Ω · v · sin(φ)   — negligible for v ≈ 0.01 m/s in a basin, dominant for v ≈ 10 m/s over 1,000 km',
    connection:
      'Weather systems on a satellite image, a pilot correcting a heading on a long flight, long-range artillery calculations — and a school demonstration that the internet has been wrong about for years.',
    surprising:
      'The equator version of the myth is even stranger: the idea that the effect switches direction exactly at the equator, so a basin drains straight down there, has been demonstrated for tourists many times — all by holding the water still and starting it in the direction the demonstrator wanted.',
    question:
      'A cyclone and a draining sink both rotate — why does the Earth’s rotation dominate one and not the other?',
  },
];
