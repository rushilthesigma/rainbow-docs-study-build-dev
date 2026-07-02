// Preset Cornell-style notes for PAUSD high school science courses.
// Covers the standard 9th→10th→11th sequence: Biology → Chemistry → Physics,
// with topics drawn from Palo Alto High School's published course catalog
// (2026-27 edition) and NGSS California standards.

export const PAUSD_SCIENCE_NOTES = [
  // ===========================================================================
  // BIOLOGY — 9th Grade
  // Topics per Paly catalog: evolution, biochemistry and cells, energy for
  // life, body systems, genetics, ecology, human impacts on the Earth.
  // ===========================================================================

  {
    slug: 'bio-evolution',
    subject: 'Evolution & Natural Selection',
    course: 'PAUSD Biology',
    grade: '9th Grade — Biology',
    title: 'Evolution & Natural Selection',
    cues: [
      'What four conditions are required for natural selection to act?',
      'How does fitness differ from strength or size?',
      'What is the difference between directional, stabilizing, and disruptive selection?',
      'Name four lines of evidence for evolution.',
      'What is the difference between microevolution and macroevolution?',
      'How does allopatric speciation produce a new species?',
    ],
    mainNotes: `## Natural Selection
Natural selection is the mechanism by which heritable traits that increase reproductive success become more common in a population over time. Darwin identified four requirements:
1. **Variation** exists among individuals in a population.
2. Some variation is **heritable** (passed from parent to offspring).
3. More offspring are produced than the environment can support (**overproduction**).
4. Individuals with favorable traits **survive and reproduce more** — differential reproductive success.

Individuals are not "trying" to evolve; selection acts on existing variation, not on need.

## Fitness and Adaptation
- **Fitness** = relative reproductive success in a given environment (not physical strength).
- **Adaptation** = a heritable trait that increases fitness. Can be structural, behavioral, or physiological.
- Fitness is always relative to the environment; a trait advantageous in one setting may be neutral or harmful in another.

## Modes of Natural Selection
| Mode | Which phenotypes favored | Effect on population |
|---|---|---|
| Directional | One extreme | Average shifts toward that extreme |
| Stabilizing | Intermediate | Variation decreases; average stays |
| Disruptive | Both extremes | Population may split into two groups |

## Evidence for Evolution
- **Fossil record** — shows organisms changing over geologic time; transitional forms link major groups.
- **Comparative anatomy** — homologous structures (same ancestry, different function, e.g., human arm and whale flipper) and vestigial structures (reduced remnants of ancestral structures).
- **Biogeography** — species distributions match expected dispersal from common ancestors.
- **Molecular biology** — DNA and protein sequence similarities correlate with evolutionary relatedness; universal genetic code.
- **Direct observation** — documented cases include antibiotic resistance, beak-size shifts in Galápagos finches, and industrial melanism in peppered moths.

## Micro vs. Macroevolution
- **Microevolution** = change in allele frequencies within a population. Driven by natural selection, genetic drift, gene flow, and mutation.
- **Macroevolution** = large-scale evolutionary change over long periods; includes the origin of new species and higher-level taxonomic groups.
- **Genetic drift** = random changes in allele frequencies, especially significant in small populations (bottleneck effect, founder effect).

## Speciation
Speciation occurs when populations accumulate enough genetic differences to become **reproductively isolated** — unable to interbreed and produce fertile offspring.
- **Allopatric speciation** — a geographic barrier physically separates a population; each group evolves independently.
- **Sympatric speciation** — speciation without geographic separation; more common in plants via polyploidy.`,
    summary: 'Natural selection drives evolution when heritable variation produces differences in reproductive success. Evidence from fossils, anatomy, molecular biology, and biogeography all converge on evolution as the unifying theory of biology. Speciation — the origin of new species — occurs when populations become reproductively isolated and diverge genetically over time.',
  },

  {
    slug: 'bio-cells',
    subject: 'Cell Structure & Function',
    course: 'PAUSD Biology',
    grade: '9th Grade — Biology',
    title: 'Cell Structure & Function',
    cues: [
      'What are the three parts of the cell theory?',
      'How do prokaryotic and eukaryotic cells differ structurally?',
      'What is the function of each membrane-bound organelle in animal and plant cells?',
      'How does the fluid-mosaic model describe the cell membrane?',
      'What mechanisms move substances across the cell membrane?',
      'Why is the cell membrane selectively permeable?',
    ],
    mainNotes: `## Cell Theory
The cell theory has three components:
1. All living things are made of one or more cells.
2. The cell is the basic unit of life.
3. All cells come from pre-existing cells.

## Prokaryotes vs. Eukaryotes
| Feature | Prokaryote | Eukaryote |
|---|---|---|
| Nucleus | No (nucleoid region) | Yes (membrane-bound) |
| Membrane-bound organelles | No | Yes |
| Size | ~1–10 µm | ~10–100 µm |
| DNA | Circular, in cytoplasm | Linear, in nucleus |
| Examples | Bacteria, archaea | Plants, animals, fungi, protists |

## Key Organelles (Eukaryotes)
- **Nucleus** — contains DNA; directs cell activity; surrounded by nuclear envelope with pores.
- **Ribosomes** — site of protein synthesis; found free in cytoplasm or on rough ER; present in both prokaryotes and eukaryotes.
- **Endoplasmic reticulum (ER)** — rough ER (with ribosomes) produces proteins; smooth ER synthesizes lipids and detoxifies.
- **Golgi apparatus** — packages, modifies, and ships proteins and lipids (the "post office" of the cell).
- **Mitochondria** — site of cellular respiration; produces ATP; has its own DNA (evidence of endosymbiotic origin).
- **Lysosome** — contains digestive enzymes; breaks down waste and worn-out organelles.
- **Vacuole** — storage; large central vacuole in plant cells maintains turgor pressure.
- **Chloroplast** (plants only) — site of photosynthesis; has own DNA; double membrane.
- **Cell wall** (plants, fungi, bacteria) — rigid outer layer provides structural support.

## Cell Membrane — Fluid Mosaic Model
The cell membrane is a **phospholipid bilayer** with embedded proteins. It is described as a "fluid mosaic" because:
- **Fluid** — phospholipids can move laterally; the membrane is flexible.
- **Mosaic** — various proteins are embedded or attached.

Phospholipid structure: hydrophilic (water-loving) heads face outward; hydrophobic (water-fearing) tails face inward.

Membrane proteins: **channel proteins** allow passive transport; **carrier proteins** assist facilitated diffusion or active transport; **receptor proteins** receive signals.

## Membrane Transport
| Mechanism | Energy required? | Direction | Example |
|---|---|---|---|
| Simple diffusion | No | High → low concentration | O₂, CO₂ |
| Osmosis | No | High water → low water potential | Water across membranes |
| Facilitated diffusion | No | High → low concentration | Glucose into cells |
| Active transport | Yes (ATP) | Low → high concentration | Na⁺/K⁺ pump |
| Endocytosis/Exocytosis | Yes | Bulk movement | Large molecules |

**Osmosis** results: hypotonic solution → cell swells; hypertonic solution → cell shrinks (crenation in animals; plasmolysis in plants); isotonic → no net water movement.`,
    summary: 'Cells are the basic units of life, divided into prokaryotes (no nucleus) and eukaryotes (membrane-bound nucleus and organelles). Each organelle performs a specialized function within the cell. The fluid-mosaic cell membrane is selectively permeable, regulating what enters and exits through diffusion, osmosis, facilitated diffusion, and active transport.',
  },

  {
    slug: 'bio-cell-energy',
    subject: 'Cellular Energetics',
    course: 'PAUSD Biology',
    grade: '9th Grade — Biology',
    title: 'Cellular Energetics: Photosynthesis & Respiration',
    cues: [
      'What is the overall equation for photosynthesis? For cellular respiration?',
      'Where in the chloroplast do the light-dependent and light-independent reactions occur?',
      'What is the role of ATP in cells?',
      'What are the three stages of cellular respiration and where does each occur?',
      'How are photosynthesis and cellular respiration complementary?',
      'What is the difference between aerobic and anaerobic respiration?',
    ],
    mainNotes: `## Photosynthesis Overview
Photosynthesis converts light energy into chemical energy (glucose).

**Overall equation:** 6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂

Occurs in **chloroplasts** of plant cells and algae.

### Light-Dependent Reactions (Thylakoid membranes)
- Light strikes **chlorophyll** in the thylakoid membrane.
- Water molecules are split (**photolysis**): 2H₂O → 4H⁺ + 4e⁻ + O₂ (oxygen released as byproduct).
- Light energy is used to produce **ATP** and **NADPH**.
- Electrons move through the **electron transport chain**.

### Light-Independent Reactions / Calvin Cycle (Stroma)
- ATP and NADPH from the light reactions power the Calvin cycle.
- CO₂ is fixed (attached to an organic molecule) via **RuBisCO**.
- Products: **G3P** (glyceraldehyde-3-phosphate), which is used to build glucose and other organic molecules.

## Cellular Respiration Overview
Cellular respiration releases chemical energy stored in glucose and converts it to **ATP** (usable energy).

**Overall equation (aerobic):** C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ~36–38 ATP

### Stage 1: Glycolysis (Cytoplasm)
- Glucose (6C) → 2 pyruvate (3C).
- Net gain: **2 ATP**, 2 NADH.
- Does NOT require oxygen.

### Stage 2: Pyruvate Oxidation + Krebs Cycle (Mitochondrial matrix)
- Pyruvate is converted to acetyl-CoA; CO₂ is released.
- Krebs cycle: acetyl-CoA enters; CO₂ released; produces NADH, FADH₂, 2 ATP per glucose.

### Stage 3: Oxidative Phosphorylation / ETC (Inner mitochondrial membrane)
- NADH and FADH₂ pass electrons to the **electron transport chain**.
- O₂ is the final electron acceptor (forms H₂O).
- Electron flow drives ATP synthase → **~32–34 ATP** produced.

### Anaerobic Respiration / Fermentation
When oxygen is absent, glycolysis continues but NADH must be recycled:
- **Lactic acid fermentation** (animals, bacteria): pyruvate → lactate.
- **Alcoholic fermentation** (yeast, plants): pyruvate → ethanol + CO₂.
- Net yield: only **2 ATP** per glucose (much less efficient than aerobic respiration).

## Photosynthesis vs. Cellular Respiration
| | Photosynthesis | Cellular Respiration |
|---|---|---|
| Energy change | Stores energy in glucose | Releases energy from glucose |
| Reactants | CO₂, H₂O, light | C₆H₁₂O₆, O₂ |
| Products | Glucose, O₂ | CO₂, H₂O, ATP |
| Location | Chloroplast | Mitochondria (+ cytoplasm) |
| Who does it | Plants, algae, some bacteria | Nearly all living cells |

The two processes are complementary: the products of each are the reactants of the other, cycling carbon and oxygen through ecosystems.`,
    summary: 'Photosynthesis (in chloroplasts) converts CO₂, water, and light energy into glucose and O₂ through light-dependent and light-independent (Calvin cycle) reactions. Cellular respiration (in mitochondria and cytoplasm) breaks glucose back down into CO₂ and water, yielding up to 36–38 ATP through glycolysis, the Krebs cycle, and the electron transport chain. The two processes are chemically complementary and drive the carbon and oxygen cycles.',
  },

  {
    slug: 'bio-genetics',
    subject: 'Genetics & Heredity',
    course: 'PAUSD Biology',
    grade: '9th Grade — Biology',
    title: 'Genetics & Heredity',
    cues: [
      'What is the difference between a genotype and a phenotype?',
      'What are Mendel\'s Law of Segregation and Law of Independent Assortment?',
      'How do you set up and interpret a Punnett square?',
      'What is the difference between complete dominance, incomplete dominance, and codominance?',
      'What is the structure of DNA and how does it store genetic information?',
      'How does DNA replication differ from transcription and translation?',
    ],
    mainNotes: `## Key Vocabulary
- **Gene** — a segment of DNA that codes for a protein or functional RNA.
- **Allele** — alternative forms of a gene.
- **Genotype** — the genetic makeup (e.g., Bb, BB, bb).
- **Phenotype** — the observable trait resulting from the genotype and environment.
- **Dominant** allele — expressed when one or two copies are present (uppercase letter).
- **Recessive** allele — expressed only when two copies are present (lowercase letter).
- **Homozygous** — two identical alleles (BB or bb); **heterozygous** — two different alleles (Bb).

## Mendel's Laws
- **Law of Segregation** — each individual has two alleles for each trait; alleles separate during gamete formation so each gamete carries only one.
- **Law of Independent Assortment** — alleles for different traits assort independently during gamete formation (applies to genes on different chromosomes or far apart on the same chromosome).

## Punnett Squares
Cross parents' alleles to predict offspring genotype and phenotype ratios.
- Monohybrid cross (one trait): e.g., Bb × Bb → 1 BB : 2 Bb : 1 bb (genotype), 3 dominant : 1 recessive (phenotype).
- Dihybrid cross (two traits): 9:3:3:1 ratio for two independent dominant/recessive traits.

## Non-Mendelian Inheritance
| Pattern | Description | Example |
|---|---|---|
| Complete dominance | Dominant masks recessive | Pea plant seed color |
| Incomplete dominance | Blend of phenotypes in heterozygote | Red × white → pink snapdragon |
| Codominance | Both alleles fully expressed | AB blood type |
| Multiple alleles | More than two alleles in the population | ABO blood type system |
| Sex-linked traits | Gene on X or Y chromosome | Color blindness, hemophilia |
| Polygenic inheritance | Multiple genes contribute to one trait | Skin color, height |

## DNA Structure
- **Double helix** — two antiparallel strands of nucleotides linked by hydrogen bonds between bases.
- Nucleotide components: deoxyribose sugar, phosphate group, nitrogenous base.
- Base-pairing rules: **Adenine (A) pairs with Thymine (T)**; **Guanine (G) pairs with Cytosine (C)**.
- Sequence of bases = genetic information.

## Central Dogma: DNA → RNA → Protein
1. **Replication** (nucleus): DNA → DNA. DNA helicase unwinds; DNA polymerase adds complementary nucleotides. Each new double helix has one old and one new strand (**semiconservative**).
2. **Transcription** (nucleus): DNA → mRNA. RNA polymerase reads the template strand and builds complementary mRNA. U replaces T in RNA.
3. **Translation** (ribosome): mRNA → protein. Ribosome reads mRNA codons (3 bases); tRNA brings amino acids; a polypeptide chain is assembled.

## Mutations
- **Point mutation** — change in a single nucleotide (silent, missense, or nonsense depending on effect on amino acid sequence).
- **Frameshift mutation** — insertion or deletion shifts the reading frame; typically more disruptive.
- Mutations can be beneficial, neutral, or harmful; they are the ultimate source of genetic variation.`,
    summary: 'Genetics explains how traits are inherited through genes and alleles. Mendel\'s Laws of Segregation and Independent Assortment predict inheritance ratios, extended by non-Mendelian patterns such as codominance and polygenic inheritance. The central dogma — DNA → mRNA → protein — describes how genetic information flows from nucleotide sequence to functional proteins, with mutations serving as the raw material for evolutionary change.',
  },

  {
    slug: 'bio-ecology',
    subject: 'Ecology & Human Impact',
    course: 'PAUSD Biology',
    grade: '9th Grade — Biology',
    title: 'Ecology & Human Impact',
    cues: [
      'What are the levels of ecological organization from smallest to largest?',
      'What is the difference between a food chain and a food web?',
      'Why does energy decrease at each trophic level?',
      'How does matter (carbon, nitrogen, water) cycle through ecosystems?',
      'What are the main ways humans disrupt ecosystems?',
      'What is the difference between primary and secondary succession?',
    ],
    mainNotes: `## Levels of Ecological Organization
Individual → Population → Community → Ecosystem → Biome → Biosphere

- **Population** — individuals of the same species in the same area.
- **Community** — all populations in an area.
- **Ecosystem** — community plus its abiotic (non-living) environment.
- **Biome** — large geographic area with a characteristic climate and community type.

## Energy Flow
**Producers** (autotrophs, e.g., plants) capture sunlight via photosynthesis and form the base of the food web.
**Consumers** (heterotrophs): primary consumers eat producers; secondary consumers eat primary consumers; and so on.
**Decomposers** (bacteria, fungi) break down dead organic matter, returning nutrients to the soil.

Energy flows in one direction through a food web; at each trophic level only **~10%** of energy is transferred to the next (the rest is lost as heat). This limits food chains to about 4–5 trophic levels.

## Biogeochemical Cycles
- **Carbon cycle** — CO₂ is fixed by photosynthesis, released by respiration and combustion. Fossil fuel burning adds extra CO₂ to the atmosphere, amplifying the greenhouse effect.
- **Nitrogen cycle** — N₂ gas is fixed by bacteria into NH₃/NH₄⁺ (nitrogen fixation); nitrification converts it to NO₃⁻ (usable by plants); denitrification returns N₂ to the atmosphere.
- **Water cycle** — evaporation, transpiration, condensation, precipitation, runoff, and infiltration continuously cycle water between the atmosphere, land, and ocean.

## Population Dynamics
- **Carrying capacity (K)** — maximum population size an environment can sustain indefinitely.
- **Limiting factors** — density-dependent (food, disease, predation) or density-independent (weather, natural disasters).
- **Exponential growth** — occurs when resources are unlimited (J-shaped curve).
- **Logistic growth** — growth slows as population approaches K (S-shaped curve).

## Ecological Relationships
| Relationship | Species A | Species B |
|---|---|---|
| Predation | + | – |
| Competition | – | – |
| Mutualism | + | + |
| Commensalism | + | 0 |
| Parasitism | + | – |

## Human Impacts
- **Habitat destruction** — deforestation, urbanization, agriculture fragment habitats.
- **Pollution** — air, water, and soil pollution affect biodiversity and biogeochemical cycles.
- **Invasive species** — out-compete native species; disrupt food webs (e.g., zebra mussels, kudzu).
- **Overexploitation** — overhunting and overfishing reduce populations below recovery thresholds.
- **Climate change** — rising CO₂ warms the planet, shifts biome ranges, and acidifies oceans.

## Ecological Succession
- **Primary succession** — colonization of bare rock or newly formed land with no soil; pioneering species (lichens, mosses) build soil for later communities.
- **Secondary succession** — recovery of a community after a disturbance (fire, flood); soil already present; faster than primary.
- Both types progress toward a **climax community** — a relatively stable endpoint.`,
    summary: 'Ecosystems are organized from individuals to the biosphere, with energy flowing one way through food webs (losing ~90% at each trophic level) and matter cycling repeatedly through biogeochemical cycles. Human activities — habitat loss, pollution, invasive species, overexploitation, and climate change — disrupt these cycles and reduce biodiversity. Ecological succession describes how communities recover from disturbance over time.',
  },

  // ===========================================================================
  // CHEMISTRY — 10th Grade
  // Topics per Paly catalog: atomic structure, nuclear chemistry, periodic
  // properties, chemical bonding, intermolecular forces, gas laws, solids,
  // liquids, solutions, chemical nomenclature, stoichiometry, equilibrium,
  // reaction rates, acid-base chemistry, thermochemistry.
  // ===========================================================================

  {
    slug: 'chem-atomic-structure',
    subject: 'Atomic Structure & the Periodic Table',
    course: 'PAUSD Chemistry',
    grade: '10th Grade — Chemistry',
    title: 'Atomic Structure & the Periodic Table',
    cues: [
      'What are the three subatomic particles, their charges, and their locations?',
      'How do you determine the number of protons, neutrons, and electrons from a nuclide notation?',
      'What are isotopes and how do they affect atomic mass?',
      'How are electrons arranged in energy levels and sublevels?',
      'What are the periodic trends for atomic radius, ionization energy, and electronegativity?',
      'What information does an element\'s position (group and period) reveal?',
    ],
    mainNotes: `## Subatomic Particles
| Particle | Charge | Mass (amu) | Location |
|---|---|---|---|
| Proton | +1 | 1 | Nucleus |
| Neutron | 0 | 1 | Nucleus |
| Electron | –1 | ~0 (1/1836) | Electron cloud |

- **Atomic number (Z)** = number of protons (defines the element).
- **Mass number (A)** = protons + neutrons.
- **Number of electrons** = protons (in a neutral atom).
- Nuclide notation: ᴬ_Z X (e.g., ¹²₆C = carbon with 6 protons, 6 neutrons).

## Isotopes
Isotopes are atoms of the same element with different numbers of neutrons (same Z, different A).
- Example: ¹²C (6 neutrons) and ¹⁴C (8 neutrons) are both carbon.
- **Average atomic mass** on the periodic table is the weighted average based on natural isotope abundance.

## Electron Configuration
Electrons occupy **energy levels** (n = 1, 2, 3…) and **sublevels** (s, p, d, f).
- Capacity: s = 2, p = 6, d = 10, f = 14 electrons.
- Fill order (Aufbau principle): 1s → 2s → 2p → 3s → 3p → 4s → 3d → 4p…
- **Valence electrons** — outermost electrons; determine chemical behavior.
- Elements in the same **group** have the same number of valence electrons → similar properties.

## Periodic Table Organization
- **Periods** (rows) — elements in the same period have the same number of electron shells.
- **Groups** (columns) — elements share the same number of valence electrons and similar reactivity.
- **Metals** (left/center) — good conductors, malleable, lose electrons in reactions.
- **Nonmetals** (upper right) — poor conductors, gain or share electrons.
- **Metalloids** (staircase line) — intermediate properties; semiconductors.

## Periodic Trends
| Trend | Across a period (left → right) | Down a group (top → bottom) |
|---|---|---|
| Atomic radius | Decreases | Increases |
| Ionization energy | Increases | Decreases |
| Electronegativity | Increases | Decreases |
| Metallic character | Decreases | Increases |

**Explanation:** Across a period, nuclear charge increases while shielding stays roughly constant, pulling electrons closer and making it harder to remove them. Down a group, more electron shells increase atomic size and shield outer electrons from the nucleus, lowering ionization energy and electronegativity.

## Nuclear Chemistry
- **Radioactive decay** — unstable nuclei emit particles to become more stable.
  - Alpha (α) decay: emits ⁴He; A decreases by 4, Z by 2.
  - Beta (β) decay: neutron → proton + electron; Z increases by 1.
  - Gamma (γ) radiation: high-energy photons; no change in A or Z.
- **Half-life** — time for half of a radioactive sample to decay. Used in radiometric dating.`,
    summary: 'Atoms are composed of protons (charge +1, defines the element), neutrons, and electrons. Electron configuration determines an element\'s chemical behavior, with valence electrons being most important. The periodic table organizes elements so that periodic trends — atomic radius, ionization energy, and electronegativity — arise predictably from changes in nuclear charge and shielding across periods and down groups.',
  },

  {
    slug: 'chem-bonding',
    subject: 'Chemical Bonding',
    course: 'PAUSD Chemistry',
    grade: '10th Grade — Chemistry',
    title: 'Chemical Bonding & Molecular Structure',
    cues: [
      'What is the difference between ionic, covalent, and metallic bonding?',
      'How do you determine the Lewis structure of a molecule?',
      'What is VSEPR theory and how does it predict molecular shape?',
      'What is the difference between polar and nonpolar covalent bonds?',
      'What are the three major types of intermolecular forces and how do they affect boiling point?',
      'How do ionic and molecular compounds differ in their physical properties?',
    ],
    mainNotes: `## Types of Chemical Bonds
| Bond type | Between | Electrons | Example |
|---|---|---|---|
| Ionic | Metal + nonmetal | Transferred | NaCl |
| Covalent | Nonmetal + nonmetal | Shared | H₂O, CO₂ |
| Metallic | Metal + metal | "Sea" of delocalized e⁻ | Cu, Fe |

## Ionic Bonding
- Metal atom loses electrons → becomes cation (+).
- Nonmetal atom gains electrons → becomes anion (–).
- Electrostatic attraction between opposite charges holds the lattice together.
- Properties: high melting points, conduct electricity when dissolved or molten, form crystalline solids.

## Covalent Bonding & Lewis Structures
- Atoms share electron pairs to fill their valence shells (octet rule; duet for H).
- **Single bond** = 1 shared pair; **double bond** = 2 shared pairs; **triple bond** = 3 shared pairs.
- Lewis dot structures show valence electrons; lone pairs are unshared.
- Steps: count total valence electrons → connect atoms with single bonds → complete octets → convert lone pairs to multiple bonds if needed.

## VSEPR Theory & Molecular Geometry
Valence Shell Electron Pair Repulsion: electron pairs (bonding and lone) arrange to minimize repulsion.

| Electron groups | Lone pairs | Shape | Bond angle | Example |
|---|---|---|---|---|
| 2 | 0 | Linear | 180° | CO₂ |
| 3 | 0 | Trigonal planar | 120° | BF₃ |
| 3 | 1 | Bent | <120° | SO₂ |
| 4 | 0 | Tetrahedral | 109.5° | CH₄ |
| 4 | 1 | Trigonal pyramidal | <109.5° | NH₃ |
| 4 | 2 | Bent | <109.5° | H₂O |

Lone pairs repel more strongly than bonding pairs, compressing bond angles.

## Polarity
- **Bond polarity** — depends on electronegativity difference. ΔEN < 0.4: nonpolar covalent; 0.4–1.7: polar covalent; >1.7: ionic.
- **Molecular polarity** — a molecule is polar if it has polar bonds AND an asymmetric geometry (dipole moments do not cancel).
  - Polar: H₂O, NH₃, HCl.
  - Nonpolar (symmetric): CO₂, CH₄, Cl₂.

## Intermolecular Forces (IMFs)
Forces between molecules (weaker than bonds within molecules).
| IMF | Occurs when | Relative strength |
|---|---|---|
| London dispersion forces | All molecules | Weakest; increases with molecular size |
| Dipole-dipole | Polar molecules | Moderate |
| Hydrogen bonding | H bonded to N, O, or F | Strongest IMF |

Stronger IMFs → higher boiling point, higher viscosity, lower vapor pressure.`,
    summary: 'Chemical bonds form when atoms achieve lower energy by transferring electrons (ionic bonds) or sharing them (covalent bonds). VSEPR theory predicts molecular geometry from the arrangement of electron pairs around central atoms. Polarity depends on both bond electronegativity differences and molecular symmetry. Intermolecular forces — London dispersion, dipole-dipole, and hydrogen bonding — determine physical properties like boiling point and solubility.',
  },

  {
    slug: 'chem-stoichiometry',
    subject: 'Stoichiometry & Reactions',
    course: 'PAUSD Chemistry',
    grade: '10th Grade — Chemistry',
    title: 'Stoichiometry & Chemical Reactions',
    cues: [
      'What does it mean to balance a chemical equation?',
      'What are the five types of chemical reactions?',
      'How do you convert between mass, moles, and number of particles?',
      'What is the mole and what is Avogadro\'s number?',
      'How do you identify the limiting reagent in a reaction?',
      'What is percent yield and how do you calculate it?',
    ],
    mainNotes: `## Balancing Chemical Equations
The Law of Conservation of Mass requires that atoms are neither created nor destroyed in a reaction. A balanced equation has equal numbers of each type of atom on both sides.
- Use coefficients (whole numbers in front of formulas) to balance, never change subscripts.
- Check by counting each element's atoms on reactant and product sides.

## Types of Chemical Reactions
| Type | Pattern | Example |
|---|---|---|
| Synthesis (combination) | A + B → AB | 2H₂ + O₂ → 2H₂O |
| Decomposition | AB → A + B | 2H₂O₂ → 2H₂O + O₂ |
| Single replacement | A + BC → AC + B | Zn + 2HCl → ZnCl₂ + H₂ |
| Double replacement | AB + CD → AD + CB | AgNO₃ + NaCl → AgCl↓ + NaNO₃ |
| Combustion | Hydrocarbon + O₂ → CO₂ + H₂O | CH₄ + 2O₂ → CO₂ + 2H₂O |

## The Mole
The **mole** is the SI unit of amount of substance.
- **1 mole** = 6.022 × 10²³ particles (**Avogadro's number**).
- **Molar mass** = mass of 1 mole of a substance (in g/mol) = atomic/formula mass in amu.

## Mole Conversions (Mole Map)
mass (g) ÷ molar mass → moles × Avogadro's number → particles (and reverse)
- grams → moles: divide by molar mass.
- moles → grams: multiply by molar mass.
- moles → particles: multiply by 6.022 × 10²³.

## Stoichiometry: Mole Ratios
Coefficients in a balanced equation give the **mole ratio** of reactants and products.
- Example: N₂ + 3H₂ → 2NH₃. For every 1 mol N₂, 3 mol H₂ are needed and 2 mol NH₃ are produced.
- Procedure: moles of given → use mole ratio → moles of unknown → convert to grams if needed.

## Limiting Reagent
The **limiting reagent** is completely consumed first and determines how much product forms. The excess reagent is left over.
- To find: calculate moles of product each reactant would produce → smaller amount identifies the limiting reagent.

## Percent Yield
percent yield = (actual yield / theoretical yield) × 100%
- **Theoretical yield** = maximum calculated from the limiting reagent.
- **Actual yield** = experimentally measured amount.
- Percent yield < 100% due to incomplete reactions, side reactions, or experimental loss.`,
    summary: 'Stoichiometry uses balanced chemical equations and mole ratios to relate the amounts of reactants and products. Avogadro\'s number (6.022 × 10²³) connects moles to actual particle counts, and molar mass connects moles to grams. The limiting reagent determines the maximum theoretical yield; percent yield compares the actual experimental result to this theoretical maximum.',
  },

  {
    slug: 'chem-acid-base',
    subject: 'Acids, Bases & pH',
    course: 'PAUSD Chemistry',
    grade: '10th Grade — Chemistry',
    title: 'Acids, Bases & pH',
    cues: [
      'How do the Arrhenius and Brønsted-Lowry definitions of acids and bases differ?',
      'What is the pH scale and what does each region indicate?',
      'How do strong and weak acids differ in their dissociation?',
      'What is a neutralization reaction and what does it produce?',
      'What is a buffer and why is it important biologically?',
      'How do you calculate pH from [H₃O⁺] concentration?',
    ],
    mainNotes: `## Definitions of Acids and Bases
**Arrhenius model:**
- Acid — produces H⁺ (hydrogen ions) in aqueous solution. Example: HCl → H⁺ + Cl⁻.
- Base — produces OH⁻ (hydroxide ions) in aqueous solution. Example: NaOH → Na⁺ + OH⁻.

**Brønsted-Lowry model (broader):**
- Acid — proton (H⁺) donor.
- Base — proton (H⁺) acceptor.
- In any acid-base reaction, a **conjugate acid-base pair** is related by one H⁺.

## The pH Scale
pH = –log[H₃O⁺]
| pH range | Solution type |
|---|---|
| 0 – < 7 | Acidic |
| 7 | Neutral (pure water at 25°C) |
| > 7 – 14 | Basic (alkaline) |

Each unit change in pH represents a 10-fold change in [H⁺].

Relationship: pH + pOH = 14 (at 25°C); [H₃O⁺][OH⁻] = 1 × 10⁻¹⁴ (Kw).

## Strong vs. Weak Acids and Bases
- **Strong acid** — dissociates completely in water. Examples: HCl, H₂SO₄, HNO₃, HBr, HI, HClO₄.
- **Weak acid** — partially dissociates; equilibrium exists between acid and ions. Examples: acetic acid (CH₃COOH), carbonic acid (H₂CO₃).
- **Strong base** — fully dissociates. Examples: NaOH, KOH, Ca(OH)₂.
- **Weak base** — partially dissociates. Example: NH₃.

## Neutralization Reactions
When an acid reacts with a base, they produce a salt and water:
HCl + NaOH → NaCl + H₂O

Net ionic equation: H⁺ + OH⁻ → H₂O

**Titration** — a procedure using a buret to add a solution of known concentration (titrant) to determine the unknown concentration of the sample. The **equivalence point** is where moles of acid = moles of base.

## Buffers
A **buffer** resists changes in pH when small amounts of acid or base are added. It consists of a **weak acid and its conjugate base** (or weak base and its conjugate acid).
- Blood buffer: carbonic acid/bicarbonate system (H₂CO₃ / HCO₃⁻) maintains blood pH ~7.4.
- When H⁺ is added: HCO₃⁻ + H⁺ → H₂CO₃ (absorbs acid).
- When OH⁻ is added: H₂CO₃ + OH⁻ → HCO₃⁻ + H₂O (absorbs base).`,
    summary: 'Acids donate protons (H⁺) and lower pH; bases accept protons and raise pH. The pH scale (0–14) is logarithmic — each unit represents a 10-fold change in H⁺ concentration. Strong acids and bases dissociate completely, while weak acids and bases reach an equilibrium. Neutralization reactions produce salt and water; buffers maintain relatively stable pH by containing a weak acid/conjugate base pair that absorbs both added acids and bases.',
  },

  {
    slug: 'chem-thermochemistry',
    subject: 'Thermochemistry & Reaction Rates',
    course: 'PAUSD Chemistry',
    grade: '10th Grade — Chemistry',
    title: 'Thermochemistry & Reaction Rates',
    cues: [
      'What is the difference between endothermic and exothermic reactions?',
      'What is enthalpy (ΔH) and how do you interpret its sign?',
      'What factors affect the rate of a chemical reaction?',
      'What is activation energy and how does a catalyst lower it?',
      'What does a reaction energy diagram show?',
      'What is equilibrium and what does Le Châtelier\'s Principle predict?',
    ],
    mainNotes: `## Heat and Temperature
- **Heat (q)** — transfer of thermal energy between objects at different temperatures (measured in joules, J).
- **Temperature** — average kinetic energy of particles; not the same as heat.
- q = mcΔT, where m = mass, c = specific heat capacity, ΔT = change in temperature.
- Water has an unusually high specific heat (4.18 J/g·°C), which buffers temperature changes in aqueous systems.

## Endothermic vs. Exothermic Reactions
- **Exothermic reaction** — releases heat to surroundings; products have lower energy than reactants. ΔH < 0.
  - Examples: combustion, many neutralization reactions, rusting.
- **Endothermic reaction** — absorbs heat from surroundings; products have higher energy than reactants. ΔH > 0.
  - Examples: photosynthesis, melting ice, cooking an egg.

## Reaction Energy Diagrams
A reaction coordinate (energy) diagram shows:
- **Reactants** energy level on the left.
- **Products** energy level on the right.
- **Transition state / activated complex** at the peak — highest energy point.
- **Activation energy (Ea)** — minimum energy needed for a reaction to occur = energy of peak − energy of reactants.
- ΔH = energy of products − energy of reactants.

A catalyst lowers Ea (provides an alternate pathway) without shifting the position of reactants or products.

## Factors Affecting Reaction Rate
| Factor | Effect on rate | Reason |
|---|---|---|
| Temperature increase | Increases | More kinetic energy; more frequent and energetic collisions |
| Concentration increase | Increases | More particles; more frequent collisions |
| Surface area increase | Increases | More exposed particles available to react |
| Catalyst | Increases | Lowers activation energy |
| Pressure increase (gases) | Increases | Effectively increases concentration |

## Chemical Equilibrium
When the forward and reverse reaction rates are equal, the system reaches **dynamic equilibrium**. Concentrations of reactants and products remain constant (not necessarily equal).

**Equilibrium constant (Keq)** = [products]ⁿ / [reactants]ⁿ (coefficients become exponents).
- Keq > 1: products favored.
- Keq < 1: reactants favored.

## Le Châtelier's Principle
If a system at equilibrium is stressed (disturbed), the system shifts to relieve the stress and re-establish equilibrium.

| Stress | System shifts |
|---|---|
| Add reactant | Toward products |
| Remove reactant | Toward reactants |
| Increase pressure (gases) | Toward side with fewer moles of gas |
| Increase temperature | Toward endothermic direction |`,
    summary: 'Thermochemistry tracks energy changes in reactions: exothermic reactions release heat (ΔH < 0), while endothermic reactions absorb it (ΔH > 0). Reaction rates depend on temperature, concentration, surface area, and catalysts — all of which affect collision frequency or activation energy. Chemical equilibrium is dynamic and described by Keq; Le Châtelier\'s Principle predicts how a system shifts to relieve any applied stress.',
  },

  // ===========================================================================
  // PHYSICS — 11th Grade
  // Topics per Paly catalog: motion, forces, momentum, energy, waves, sound,
  // light/optics, static electricity, electric circuits, magnetism.
  // ===========================================================================

  {
    slug: 'phys-kinematics',
    subject: 'Kinematics & Motion',
    course: 'PAUSD Physics',
    grade: '11th Grade — Physics',
    title: 'Kinematics & Motion',
    cues: [
      'What is the difference between distance and displacement? Speed and velocity?',
      'How is acceleration defined and what are its units?',
      'What do slope and area represent on position-time and velocity-time graphs?',
      'What are the four kinematic equations and when can you use them?',
      'What makes projectile motion a combination of two independent motions?',
      'What is the difference between scalar and vector quantities?',
    ],
    mainNotes: `## Scalar vs. Vector
- **Scalar** — magnitude only (distance, speed, mass, time).
- **Vector** — magnitude AND direction (displacement, velocity, acceleration, force).

## Position, Displacement, Distance
- **Position (x)** — location relative to a reference point.
- **Displacement (Δx = x_f − x_i)** — change in position; vector; can be negative.
- **Distance** — total path length traveled; scalar; always ≥ 0.

## Velocity and Speed
- **Average speed** = total distance / total time.
- **Average velocity (v̄)** = displacement / time = Δx / Δt. (vector)
- **Instantaneous velocity** — velocity at a specific moment; equals the slope of a position-time graph.

## Acceleration
a = Δv / Δt = (v_f − v_i) / t
- Units: m/s² (SI).
- Positive acceleration does not necessarily mean speeding up — it depends on the direction of velocity.
- Object slows down when velocity and acceleration have opposite signs.

## Motion Graphs
| Graph | Slope represents | Area under curve |
|---|---|---|
| Position vs. time | Velocity | — |
| Velocity vs. time | Acceleration | Displacement |
| Acceleration vs. time | Jerk (not required) | Change in velocity |

Constant velocity → horizontal line on v-t graph; constant acceleration → straight diagonal line on v-t graph.

## Kinematic Equations (constant acceleration only)
1. v_f = v_i + at
2. Δx = v_i t + ½at²
3. v_f² = v_i² + 2aΔx
4. Δx = (v_i + v_f)/2 · t

Variables: Δx (displacement), v_i (initial velocity), v_f (final velocity), a (acceleration), t (time).
Given any three, solve for the other two.

## Free Fall
- Objects in free fall accelerate downward at g = 9.8 m/s² (ignoring air resistance).
- The direction "down" is often assigned as negative, so a = –g = –9.8 m/s².

## Projectile Motion
Projectile motion is 2-D motion under gravity only. The horizontal and vertical components are independent:
- **Horizontal** (x): constant velocity (no acceleration); x = v_x · t.
- **Vertical** (y): constant acceleration g downward; uses kinematic equations.
- The time of flight is determined entirely by the vertical component.
- At the peak of the trajectory: v_y = 0 (only v_x remains).`,
    summary: 'Kinematics describes motion using position, velocity, and acceleration without asking why the motion occurs. Displacement (vector) differs from distance (scalar); velocity (vector) differs from speed. The four kinematic equations relate these quantities under constant acceleration, including free fall at g = 9.8 m/s². In projectile motion, horizontal and vertical motions are fully independent — horizontal velocity is constant while vertical acceleration is g.',
  },

  {
    slug: 'phys-forces',
    subject: 'Newton\'s Laws & Forces',
    course: 'PAUSD Physics',
    grade: '11th Grade — Physics',
    title: 'Newton\'s Laws & Forces',
    cues: [
      'State Newton\'s three laws of motion in your own words.',
      'What is the difference between mass and weight?',
      'How do you draw and interpret a free-body diagram?',
      'How do you find the net force on an object and use it to find acceleration?',
      'What is friction and how do you calculate kinetic and static friction?',
      'Why don\'t Newton\'s third law pairs cancel each other out?',
    ],
    mainNotes: `## Newton's First Law — Inertia
An object at rest stays at rest, and an object in motion stays in motion at constant velocity, **unless acted on by a net external force**.
- **Inertia** = resistance to change in motion; proportional to mass.
- Net force = 0 → object in **equilibrium** (either at rest or constant velocity).

## Newton's Second Law — F = ma
The net force on an object equals its mass times its acceleration.
**F_net = ma**
- Units: Force in Newtons (N = kg·m/s²).
- F_net is the vector sum of all forces; must be applied in the same direction as acceleration.
- If multiple forces act: find x- and y-components separately, then find net force in each direction.

## Newton's Third Law — Action-Reaction
For every action force, there is an equal and opposite reaction force.
- Forces always come in pairs acting on **different objects** (that is why they do NOT cancel).
- Example: You push a wall (action); wall pushes you back with equal force (reaction) — but on different objects.

## Mass vs. Weight
- **Mass (m)** — amount of matter; scalar; measured in kg; constant everywhere.
- **Weight (W = mg)** — gravitational force on an object; vector; measured in N; varies with g.
- On Earth: g = 9.8 m/s². On the Moon: g ≈ 1.6 m/s² (so weight is less; mass is unchanged).

## Free-Body Diagrams (FBD)
An FBD shows all forces acting on a single object as arrows from the object's center:
- **Weight (W = mg)** — downward.
- **Normal force (N)** — perpendicular to the surface (not always vertical).
- **Friction (f)** — along the surface, opposing motion.
- **Applied force** — direction of push or pull.
- **Tension (T)** — along a rope or string, away from the object.

## Common Forces
**Normal force** — contact force perpendicular to a surface; on a flat surface: N = mg.
**Friction:**
- **Static friction (f_s)** — acts when surfaces are not sliding; f_s ≤ µ_s N. Opposes impending motion.
- **Kinetic friction (f_k)** — acts when surfaces slide; f_k = µ_k N. Usually < f_s.
- µ (coefficient of friction) depends on the materials in contact.

## Applying Newton's Laws
1. Draw a free-body diagram.
2. Choose a coordinate system (usually +x in the direction of motion or acceleration).
3. Sum forces in each direction: ΣF_x = ma_x, ΣF_y = ma_y.
4. Solve for the unknown.

If acceleration = 0 in a direction: ΣF = 0 in that direction (equilibrium).`,
    summary: 'Newton\'s three laws describe how forces change motion: the first defines inertia, the second relates net force to acceleration (F = ma), and the third states that forces come in equal and opposite action-reaction pairs acting on different objects. Weight (W = mg) is a force; mass is not. Free-body diagrams and component analysis allow application of Newton\'s second law to solve for unknown forces or accelerations.',
  },

  {
    slug: 'phys-energy',
    subject: 'Energy, Work & Momentum',
    course: 'PAUSD Physics',
    grade: '11th Grade — Physics',
    title: 'Energy, Work & Momentum',
    cues: [
      'How is work defined in physics and when is zero work done?',
      'What is the work-energy theorem?',
      'What is the difference between kinetic energy and gravitational potential energy?',
      'State the law of conservation of energy.',
      'What is the difference between elastic and inelastic collisions?',
      'How are impulse and change in momentum related?',
    ],
    mainNotes: `## Work
Work is done on an object when a force causes a displacement.
**W = Fd·cosθ** (θ = angle between force and displacement)
- Units: Joule (J = N·m).
- No work done if: force ⊥ displacement (θ = 90°), no displacement, or no force.
- Only the component of force parallel to displacement does work.

## Kinetic Energy (KE)
KE = ½mv²
- Kinetic energy depends on speed squared — doubling speed quadruples KE.
- Units: Joules (J).

## Work-Energy Theorem
The net work done on an object equals its change in kinetic energy:
**W_net = ΔKE = KE_f − KE_i**

## Potential Energy (PE)
- **Gravitational PE** = mgh (h = height above reference level, g = 9.8 m/s²).
- **Spring (elastic) PE** = ½kx² (k = spring constant, x = compression/extension).

## Conservation of Mechanical Energy
In the absence of non-conservative forces (friction, air resistance):
**KE_i + PE_i = KE_f + PE_f**
Total mechanical energy (KE + PE) is constant. As height decreases, speed increases (and vice versa).

When friction is present: energy is not lost — it converts to thermal energy. Total energy (including heat) is still conserved.

## Power
Power = rate of doing work.
P = W/t = Fd/t = Fv
- Units: Watt (W = J/s).

## Momentum
Linear momentum: **p = mv** (vector; direction matters).
Units: kg·m/s.

**Impulse-Momentum Theorem:**
J = Δp = F·Δt
Impulse (J) = change in momentum. A large force over a short time or a small force over a long time can produce the same impulse.

**Conservation of Momentum** (no external net force):
p_total before = p_total after
Σm_i v_i = Σm_f v_f

## Types of Collisions
| Type | Momentum | Kinetic Energy |
|---|---|---|
| Elastic | Conserved | Conserved |
| Inelastic | Conserved | NOT conserved (converted to heat/sound) |
| Perfectly inelastic | Conserved | Objects stick together; maximum KE lost |

In all collisions (isolated system), momentum is conserved. Kinetic energy is only conserved in elastic collisions.`,
    summary: 'Work (W = Fd cosθ) transfers energy to an object, changing its kinetic energy per the work-energy theorem. Without friction, total mechanical energy (KE + PE) is conserved as it transforms between kinetic and potential forms. Momentum (p = mv) is also conserved in isolated systems; the impulse-momentum theorem connects force and time to changes in momentum. All collisions conserve momentum, but only elastic collisions conserve kinetic energy.',
  },

  {
    slug: 'phys-waves',
    subject: 'Waves & Sound',
    course: 'PAUSD Physics',
    grade: '11th Grade — Physics',
    title: 'Waves & Sound',
    cues: [
      'What are the properties of a wave (amplitude, wavelength, frequency, speed)?',
      'How are wavelength, frequency, and wave speed related?',
      'What is the difference between transverse and longitudinal waves?',
      'What is the Doppler effect and what causes it?',
      'What is wave interference, and how do constructive and destructive interference differ?',
      'What are the properties of sound and what determines pitch and loudness?',
    ],
    mainNotes: `## Wave Properties
A wave is a disturbance that transfers energy through matter or space without net transfer of matter.

- **Amplitude (A)** — maximum displacement from equilibrium; related to energy and loudness/brightness.
- **Wavelength (λ)** — distance between two successive identical points on a wave (e.g., crest to crest); units: meters.
- **Frequency (f)** — number of complete wave cycles per second; units: Hertz (Hz = cycles/s).
- **Period (T)** — time for one complete cycle; T = 1/f.
- **Wave speed (v)** — how fast the wave pattern moves; v = fλ.

## Wave Speed
**v = fλ** (the wave equation)
Wave speed depends on the **medium** (material), not on frequency or amplitude.
- In air at room temperature: sound ≈ 343 m/s; light ≈ 3 × 10⁸ m/s.

## Types of Waves
- **Transverse wave** — particles oscillate perpendicular to the direction of wave travel. Examples: light, electromagnetic waves, waves on a rope.
- **Longitudinal (compressional) wave** — particles oscillate parallel to the direction of wave travel. Example: sound, seismic P-waves.
- Sound is a longitudinal pressure wave that requires a medium (cannot travel through a vacuum).

## Sound
- **Pitch** is determined by frequency; higher frequency → higher pitch.
- **Loudness** is determined by amplitude; larger amplitude → louder sound.
- Sound intensity is measured in decibels (dB).
- Sound travels fastest in solids, slower in liquids, slowest in gases (more particle contacts in denser media).

## Doppler Effect
The apparent change in frequency (pitch for sound) due to relative motion between the wave source and the observer.
- Source moving **toward** observer → compressed wavefronts → **higher observed frequency** (higher pitch).
- Source moving **away** from observer → stretched wavefronts → **lower observed frequency** (lower pitch).
- Applications: police radar, medical ultrasound, astronomical redshift.

## Superposition and Interference
When two or more waves overlap, their displacements add (superposition principle).
- **Constructive interference** — waves in phase; amplitudes add → larger amplitude.
- **Destructive interference** — waves out of phase (180°); amplitudes cancel → smaller or zero amplitude.
- **Standing waves** — interference pattern created when a wave reflects back on itself; nodes (no displacement) and antinodes (maximum displacement) form at fixed positions.

## Reflection and Refraction (preview of optics)
- **Reflection** — wave bounces off a surface; angle of incidence = angle of reflection.
- **Refraction** — wave changes direction when it enters a new medium (due to change in speed); a slower medium bends the wave toward the normal.`,
    summary: 'Waves transfer energy through oscillations described by amplitude, wavelength, frequency, and speed (v = fλ). Transverse waves oscillate perpendicular to travel (e.g., light); longitudinal waves oscillate parallel (e.g., sound). The Doppler effect shifts observed frequency when source and observer move relative to each other. When waves overlap, constructive interference increases amplitude and destructive interference decreases it — a principle underlying standing waves, noise cancellation, and many optical phenomena.',
  },

  {
    slug: 'phys-optics',
    subject: 'Light & Optics',
    course: 'PAUSD Physics',
    grade: '11th Grade — Physics',
    title: 'Light & Optics',
    cues: [
      'What is the electromagnetic spectrum and how are its regions ordered?',
      'State the law of reflection.',
      'What is Snell\'s Law and how does it explain refraction?',
      'How does a converging (convex) lens form an image differently from a diverging (concave) lens?',
      'What is total internal reflection and when does it occur?',
      'What is the difference between real and virtual images?',
    ],
    mainNotes: `## The Electromagnetic Spectrum
All EM waves travel at the speed of light (c = 3 × 10⁸ m/s in a vacuum) and require no medium.

From longest wavelength / lowest frequency / lowest energy to shortest / highest / highest:
**Radio → Microwave → Infrared → Visible light → Ultraviolet → X-rays → Gamma rays**

Visible light spans approximately 400 nm (violet) to 700 nm (red).
Energy: E = hf (h = Planck's constant; higher frequency = higher energy per photon).

## Reflection
When light strikes a surface, it bounces back.
**Law of reflection:** angle of incidence (θ_i) = angle of reflection (θ_r), both measured from the **normal** to the surface.

- **Specular reflection** — smooth surface; parallel rays reflect parallel (mirror).
- **Diffuse reflection** — rough surface; parallel rays scatter in many directions (why most objects are visible).

## Refraction and Snell's Law
Refraction occurs when light changes speed as it passes from one medium to another, causing it to bend.

**Snell's Law:** n₁ sin θ₁ = n₂ sin θ₂
- n = index of refraction = c / v (higher n → slower light).
- Light bends **toward the normal** when entering a denser (higher n) medium.
- Light bends **away from the normal** when entering a less dense (lower n) medium.

**Total internal reflection (TIR)** — occurs when light in a denser medium strikes the boundary at an angle ≥ the critical angle; all light is reflected back in. Basis of fiber optics.

## Lenses
| Lens type | Also called | Effect on rays | Image formed |
|---|---|---|---|
| Converging | Convex | Bends rays inward toward focal point | Real and inverted (if object > f); virtual, upright, magnified (if object < f) |
| Diverging | Concave | Bends rays outward as if from a focal point | Always virtual, upright, smaller |

**Focal length (f)** — distance from lens to focal point; determines how strongly the lens converges or diverges light.
**Thin lens equation:** 1/f = 1/d_o + 1/d_i (d_o = object distance, d_i = image distance).

## Real vs. Virtual Images
- **Real image** — light rays actually converge at the image location; can be projected onto a screen; inverted.
- **Virtual image** — light rays appear to diverge from the image location but don't actually pass through it; cannot be projected; upright.

## Color and Light
- White light contains all visible wavelengths (demonstrated by a prism splitting it into a spectrum).
- Objects appear a certain color because they reflect that wavelength and absorb others.
- **Additive color mixing** (light): red + green + blue = white.
- **Subtractive color mixing** (pigments): cyan + magenta + yellow = black (absorbs all).`,
    summary: 'Light is an electromagnetic wave spanning a broad spectrum from radio to gamma rays. Reflection obeys the law of equal angles; refraction follows Snell\'s Law and bends light toward or away from the normal depending on the change in index of refraction. Converging lenses form real, inverted images (when the object is beyond the focal length) and are used in cameras and the human eye; diverging lenses always form virtual, upright, smaller images.',
  },

  {
    slug: 'phys-electricity',
    subject: 'Electricity & Circuits',
    course: 'PAUSD Physics',
    grade: '11th Grade — Physics',
    title: 'Electricity & Circuits',
    cues: [
      'What is the difference between conductors and insulators?',
      'What are current, voltage, and resistance, and what are their units?',
      'State Ohm\'s Law.',
      'How do you find total resistance in series and parallel circuits?',
      'How does voltage and current behave differently in series vs. parallel circuits?',
      'What is the difference between static electricity and current electricity?',
    ],
    mainNotes: `## Electric Charge
- Two types: **positive (+)** and **negative (–)**.
- Like charges repel; opposite charges attract.
- Charge is conserved — cannot be created or destroyed, only transferred.
- Fundamental unit: **electron** (charge = –1.6 × 10⁻¹⁹ C).

## Conductors vs. Insulators
- **Conductors** — electrons flow freely; most metals. Used in wires.
- **Insulators** — electrons do not flow freely; rubber, glass, wood. Used for insulation.
- **Semiconductors** — intermediate conductivity; silicon, germanium. Used in computer chips.

## Static Electricity
The buildup of electric charge on a surface.
- Charging by **friction** — transfer of electrons between surfaces.
- Charging by **induction** — redistribution of charges without contact, caused by nearby charged object.
- Coulomb's Law: F = kq₁q₂/r² (force increases with charge magnitude; decreases with distance squared).

## Current Electricity
- **Electric current (I)** = rate of flow of charge. I = Q/t. Units: **Ampere (A)**.
- Current flows from + (high potential) to – (low potential) in conventional notation; electrons actually flow in the opposite direction.
- **Voltage (V)** = electric potential difference = the "push" that drives current. Units: **Volt (V)**.
- **Resistance (R)** = opposition to current flow. Units: **Ohm (Ω)**.

## Ohm's Law
**V = IR**
- Ohm's Law applies to ohmic materials (resistance is constant regardless of current/voltage).

## Power in Circuits
P = IV = I²R = V²/R
Units: Watts (W).

## Series Circuits
Components connected in a single path.
- Current is the same through all components: I_total = I₁ = I₂ = I₃.
- Voltage divides: V_total = V₁ + V₂ + V₃.
- Total resistance: **R_total = R₁ + R₂ + R₃** (always greater than any single resistor).
- If one component fails, the circuit breaks entirely.

## Parallel Circuits
Components connected in separate branches.
- Voltage is the same across all branches: V_total = V₁ = V₂ = V₃.
- Current divides: I_total = I₁ + I₂ + I₃.
- Total resistance: **1/R_total = 1/R₁ + 1/R₂ + 1/R₃** (always less than the smallest resistor).
- If one branch fails, other branches continue to function.
- Most household circuits are wired in parallel.

## Magnetism
- Moving electric charges create magnetic fields.
- **Electromagnet** — current through a coil of wire creates a magnetic field; used in motors and generators.
- **Electromagnetic induction** — changing magnetic field induces an electric current (Faraday's Law); basis of generators and transformers.`,
    summary: 'Electric charge drives circuits: voltage (V) provides the push, current (I = Q/t) is the flow rate, and resistance (R) opposes flow — related by Ohm\'s Law (V = IR). In series circuits, resistance adds and current is constant; in parallel circuits, reciprocal resistance adds and voltage is constant. Moving charges create magnetic fields; changing magnetic fields induce currents — connecting electricity and magnetism in electromagnetic induction.',
  },
];

export const PAUSD_SCIENCE_NOTES_BY_SLUG = Object.fromEntries(
  PAUSD_SCIENCE_NOTES.map(n => [n.slug, n])
);
