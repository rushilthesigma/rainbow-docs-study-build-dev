// South America History lesson sequence authored with DeepSeek V4 Pro and
// grounded in the shared country-history note library.
import { COUNTRY_HISTORY_NOTES } from './countryHistoryNotes/index.js';

const SOUTH_AMERICA_NOTES = COUNTRY_HISTORY_NOTES.filter(
  (note) => note.region === 'Americas' && note.subregion === 'South America'
);

const DEEPSEEK_LESSON_PLANS = {
  Argentina: [
    ['Indigenous Peoples and Spanish Colonial Outposts', 'Explore diverse indigenous societies like the Mapuche and Guaraní, and the late colonial rise of Buenos Aires as a commercial hub in the Río de la Plata.'],
    ['Independence, Federalism, and Civil Wars', 'Trace the May Revolution, conflicts between Unitarians and Federalists, and the consolidation of a federal republic under the 1853 Constitution.'],
    ['Peronism, Military Rule, and Democratic Recovery', 'Examine Perón’s populism, cycles of dictatorship and democracy, the Dirty War, the Falklands defeat, and post-1983 economic and memory politics.'],
  ],
  Bolivia: [
    ['Tiwanaku, Inca Rule, and the Silver Mines of Potosí', 'Study the rise of Tiwanaku, Inca incorporation, and Spanish colonial mining at Potosí, which fueled global trade and deep social inequality.'],
    ['Independence, Territorial Loss, and the Federal War', 'Analyze independence from Spain, the loss of coastal territory to Chile, and late nineteenth-century conflicts between liberal and conservative forces.'],
    ['Revolution, Military Rule, and Indigenous Resurgence', 'Cover the 1952 Revolution, decades of military rule, and the early twenty-first-century rise of Indigenous politics under Evo Morales.'],
  ],
  Brazil: [
    ['Indigenous Diversity and Portuguese Colonization', 'Survey Brazil’s many Indigenous groups, the establishment of Portuguese sugar plantations, and the central role of African slavery in colonial society.'],
    ['The Brazilian Empire and the First Republic', 'Trace the peaceful transition from colony to empire in 1822, the abolition of slavery, and the establishment of the Old Republic in 1889.'],
    ['Dictatorship, Democracy, and Social Challenges', 'Explore Vargas’s Estado Novo, the 1964–1985 military dictatorship, democratic consolidation, and persistent inequality amid economic growth.'],
  ],
  Chile: [
    ['Mapuche Resistance and Spanish Frontier Colonization', 'Examine the Mapuche as a long-standing frontier, the encomienda system, and the development of a centralized colonial administration in Santiago.'],
    ['Independence, the War of the Pacific, and State Consolidation', 'Cover independence under O’Higgins, the War of the Pacific that expanded northern borders, and the parliamentary republic’s stability.'],
    ['Allende, Pinochet, and the Return to Democracy', 'Study Allende’s socialist experiment, the 1973 coup and Pinochet’s dictatorship, and the negotiated democratic transition after 1990.'],
  ],
  Colombia: [
    ['Pre-Columbian Societies and Spanish Conquest', 'Explore the Muisca and Tairona, the Spanish conquest of the Chibcha, and the colonial economy based on gold and tribute.'],
    ['Gran Colombia and the Liberal-Conservative Wars', 'Trace the breakdown of Gran Colombia, the Thousand Days’ War, and the consolidation of the 1886 centralist constitution.'],
    ['La Violencia, Drug Trafficking, and Peace Processes', 'Examine partisan violence, the rise of drug cartels, guerrilla conflicts, the 1991 constitution, and the 2016 peace accord with FARC.'],
  ],
  Ecuador: [
    ['Inca Expansion and Spanish Colonial Rule', 'Cover the Inca conquest of the Quitu-Cara, the establishment of the Audiencia of Quito, and the obraje textile economy.'],
    ['From Gran Colombia to the Liberal Revolution', 'Analyze Ecuador’s separation from Gran Colombia, early republican instability, and the Liberal Revolution’s secularizing reforms under Eloy Alfaro.'],
    ['Oil, Border Conflicts, and Political Instability', 'Explore the oil boom of the 1970s, the Cenepa War with Peru, dollarization, and recurrent political crises into the 2020s.'],
  ],
  Guyana: [
    ['Indigenous Societies and Dutch Plantation Colonies', 'Survey the Arawak and Carib peoples, Dutch colonization along coastal rivers, and the transition to British Guiana built on sugar and slavery.'],
    ['Independence, the Burnham Era, and Ethnic Divides', 'Examine independence in 1966, Forbes Burnham’s cooperative republic, and the racial divide between Afro-Guyanese and Indo-Guyanese populations.'],
    ['Democracy, Oil, and the Venezuelan Border Dispute', 'Cover the 1992 democratic elections, economic liberalization, offshore oil, and the ongoing territorial dispute with Venezuela.'],
  ],
  Paraguay: [
    ['Guaraní-Spanish Encounters and Jesuit Missions', 'Explore Guaraní societies, the encomienda system, and the Jesuit missions that shaped early colonial society and bilingual identity.'],
    ['Isolation, War of the Triple Alliance, and Chaco War', 'Trace Dr. Francia’s authoritarian isolation, the catastrophic War of the Triple Alliance, and the border-defining Chaco War with Bolivia.'],
    ['Stroessner’s Dictatorship and Democratic Transition', 'Study the 35-year Stroessner regime, its alliance with the Colorado Party, and gradual democratization after his 1989 overthrow.'],
  ],
  Peru: [
    ['Andean Civilizations and the Inca Empire', 'From Caral to the Inca, explore long pre-Columbian history, then Spanish conquest under Pizarro and the colonial Viceroyalty of Peru.'],
    ['Independence, Caudillos, and the Guano Era', 'Examine San Martín’s liberation, early caudillo rule, and the guano boom that funded state-building but deepened coastal-highland divides.'],
    ['Shining Path, Fujimori, and Democratic Restoration', 'Analyze the internal conflict with Shining Path, Alberto Fujimori’s authoritarian presidency, and the uneven return to democracy since 2000.'],
  ],
  Suriname: [
    ['Maroons, Plantations, and Asian Indentured Labor', 'Explore Indigenous Carib and Arawak societies, the Dutch plantation system, Maroon communities, and later Javanese and Indian indentured workers.'],
    ['Independence, the Sergeants’ Coup, and Military Rule', 'Cover Suriname’s 1975 independence, the 1980 military coup led by Dési Bouterse, and the civil war between the army and Maroon groups.'],
    ['Democracy, Resource Dependence, and Environmental Pressures', 'Examine the return to civilian rule, the dominance of bauxite, gold, and oil, and contemporary challenges from climate change.'],
  ],
  Uruguay: [
    ['Charrúa Peoples and the Banda Oriental Contested Frontier', 'Study the nomadic Charrúa, the contested Banda Oriental between Spanish and Portuguese empires, and the early ranching economy.'],
    ['Artigas, the Cisplatine War, and Independent Uruguay', 'Trace José Artigas’s federalism, the Brazilian occupation as Cisplatina, and the 1828 treaty that created an independent buffer state.'],
    ['Batllismo, Dictatorship, and Progressive Democracy', 'Examine Batlle y Ordóñez’s welfare state, the 1973–1985 military regime, and Uruguay’s reputation for stable democracy and social progress.'],
  ],
  Venezuela: [
    ['Pre-Columbian Societies and Spanish Colonial Rule', 'Explore diverse Indigenous groups, the Captaincy General of Venezuela, and the colonial economy based on cacao and coerced labor.'],
    ['From Gran Colombia to Caudillo Rule', 'Cover Bolívar’s independence struggle, the breakup of Gran Colombia, and nineteenth-century caudillo conflicts that delayed stable state formation.'],
    ['Oil, Democracy, and the Bolivarian Crisis', 'Study oil’s rise as an economic driver, alternating democracy and dictatorship, and post-1998 polarization, collapse, and humanitarian crisis.'],
  ],
};

function countryUnit(note) {
  const lessonPlan = DEEPSEEK_LESSON_PLANS[note.country];
  if (!lessonPlan) throw new Error(`Missing DeepSeek lesson plan for ${note.country}`);
  return {
    title: note.country,
    description: note.summary,
    textbookContext: note.mainNotes,
    lessons: lessonPlan.map(([title, description]) => ({ title, description })),
  };
}

const FINAL_EXAM_UNIT = {
  title: 'Final Exam - Comprehensive South American History',
  description: 'Cumulative review of Indigenous societies, colonial systems, independence movements, state formation, military rule, democratic transitions, economic change, and regional disputes across South America.',
  textbookContext: SOUTH_AMERICA_NOTES.map((note) => `- ${note.country}: ${note.summary}`).join('\n'),
  lessons: [
    {
      title: 'Comparative Colonialisms and Independence Movements',
      description: 'Review the region’s diverse colonial systems and independence processes, comparing creole agency, Indigenous resistance, slavery, labor systems, and the timing and character of state formation.',
    },
    {
      title: 'Twentieth-Century Legacies: Democracy, Dictatorship, and Reform',
      description: 'Analyze shared patterns of authoritarian rule, democratic transitions, economic dependency, social reform, memory, inequality, and institutional stability across South America.',
    },
  ],
};

export const SOUTH_AMERICA_HISTORY_COURSE = {
  slug: 'south-america-history',
  title: 'South America History',
  description: 'A rigorous survey of South American history from pre-Columbian societies to the present, examining Indigenous legacies, colonial experiences, independence struggles, state formation, and twentieth-century transformations across twelve countries.',
  subject: 'history',
  grade: '9-12',
  difficulty: 'advanced',
  textbook: 'Covalent AI South America history notes',
  generatedWith: 'deepseek-v4-pro',
  units: [
    ...SOUTH_AMERICA_NOTES.map(countryUnit),
    FINAL_EXAM_UNIT,
  ],
};
