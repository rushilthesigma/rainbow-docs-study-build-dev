const IGC_BATTERY_MIXED_BLUEPRINT = [
  'Follow the official IGC mixed distribution for every 100-question set: approximately 24 non-location-specific human geography questions and 24 non-location-specific physical geography questions (including oceans).',
  'Include approximately 6 miscellaneous geographic-concept questions from any discipline.',
  'Mix in regional questions throughout the set: approximately 8 United States (roughly half human and half physical), 8 Europe, 10 Africa, 8 other Americas, 12 Asia, and 2 Australia/Oceania/Antarctica. The official targets may overlap or vary by 1-2 questions; the finished set must contain exactly 100 questions.',
  'Human and physical questions should include short runs that introduce a concept and then test concrete examples of that concept, matching the structure of published IGC Battery sets.',
];

// Competition-oriented human geography course. This is intentionally a
// thematic course (rather than a country list) so students learn to explain
// geographic patterns, not only recall locations.
export const HUMAN_GEOGRAPHY_COURSE = {
  slug: 'human-geography',
  title: 'Human Geography: International Geography Bee Prep',
  description: 'A competition-ready human geography course: population, culture, politics, cities, development, and globalization — ending with a dedicated International Geography Bee Battery practice exam.',
  subject: 'geography',
  grade: '6-12',
  difficulty: 'advanced',
  textbook: 'International Geography Bee-aligned human geography syllabus',
  examConfig: {
    battery: {
      title: 'International Geography Bee Battery Exam',
      description: 'Official-format 400-question mixed geography simulation with IGC timing and scoring.',
      questionCount: 400,
      timeLimitMinutes: 120,
      scoring: { correct: 2, blank: 0, incorrect: -1 },
      unlockAt: 0.9,
      blueprint: IGC_BATTERY_MIXED_BLUEPRINT,
      practiceQuizzes: [
        {
          id: 'battery-set-1',
          title: 'Battery Practice Set 1',
          description: '100 mixed questions using the official IGC human, physical, concepts, and regional distribution.',
          questionCount: 100,
          timeLimitMinutes: 30,
          unlockAt: 0.1,
          blueprint: IGC_BATTERY_MIXED_BLUEPRINT,
        },
        {
          id: 'battery-set-2',
          title: 'Battery Practice Set 2',
          description: '100 mixed questions using the official IGC human, physical, concepts, and regional distribution.',
          questionCount: 100,
          timeLimitMinutes: 30,
          unlockAt: 0.1,
          blueprint: IGC_BATTERY_MIXED_BLUEPRINT,
        },
        {
          id: 'battery-set-3',
          title: 'Battery Practice Set 3',
          description: '100 mixed questions using the official IGC human, physical, concepts, and regional distribution.',
          questionCount: 100,
          timeLimitMinutes: 30,
          unlockAt: 0.1,
          blueprint: IGC_BATTERY_MIXED_BLUEPRINT,
        },
        {
          id: 'battery-set-4',
          title: 'Battery Practice Set 4',
          description: '100 mixed questions using the official IGC human, physical, concepts, and regional distribution.',
          questionCount: 100,
          timeLimitMinutes: 30,
          unlockAt: 0.1,
          blueprint: IGC_BATTERY_MIXED_BLUEPRINT,
        },
      ],
    },
  },
  units: [
    {
      title: 'Geographic Thinking and Spatial Patterns',
      description: 'The tools geographers use to describe where people live and why patterns form.',
      lessons: [
        { title: 'Maps, scale, projections, and spatial data', description: 'Interpret scale, direction, projections, thematic maps, GIS layers, and common map distortions.' },
        { title: 'Place, region, diffusion, and spatial interaction', description: 'Use the core geographic concepts to explain how places are connected and how ideas spread.' },
        { title: 'Population density, distribution, and carrying capacity', description: 'Compare arithmetic, physiological, and agricultural density; explain uneven population distribution.' },
        { title: 'Reading population pyramids and demographic indicators', description: 'Infer birth rates, death rates, dependency ratios, and population momentum from demographic data.' },
      ],
    },
    {
      title: 'Population, Migration, and Health',
      description: 'Why populations grow, move, and experience unequal health outcomes.',
      lessons: [
        { title: 'Demographic transition and population policy', description: 'Explain the stages of demographic transition and evaluate pronatalist and antinatalist policies.' },
        { title: 'Migration: push-pull factors and migration systems', description: 'Distinguish voluntary, forced, internal, international, step, chain, and seasonal migration.' },
        { title: 'Refugees, remittances, diaspora, and brain drain', description: 'Analyze migration consequences for origin, destination, and transnational communities.' },
        { title: 'Health geography and epidemiological transition', description: 'Connect disease patterns, access to care, development, and the epidemiological transition.' },
      ],
    },
    {
      title: 'Culture, Language, and Religion',
      description: 'How culture spreads, persists, and reshapes landscapes.',
      lessons: [
        { title: 'Cultural landscapes, identity, and appropriation', description: 'Recognize how built environments, food, dress, and land use express cultural identity.' },
        { title: 'Language families, dialects, and linguistic diffusion', description: 'Map major language families and explain lingua francas, dialect continua, and language loss.' },
        { title: 'Religions, sacred space, and diffusion', description: 'Compare ethnic and universalizing religions, their diffusion patterns, and their landscapes.' },
        { title: 'Ethnicity, nationality, race, and gender geography', description: 'Use precise distinctions among identity terms and analyze spatial patterns of inequality.' },
      ],
    },
    {
      title: 'Political Geography and Borders',
      description: 'States, boundaries, power, and territorial claims.',
      lessons: [
        { title: 'States, nations, nation-states, and sovereignty', description: 'Distinguish state, nation, multinational state, stateless nation, and sovereignty.' },
        { title: 'Boundaries, enclaves, exclaves, and territorial disputes', description: 'Classify boundaries and analyze why border shapes and disputed territories matter.' },
        { title: 'Centripetal and centrifugal forces', description: 'Explain how language, religion, resources, and regional inequality can unite or fragment states.' },
        { title: 'Supranational organizations and geopolitics', description: 'Evaluate how alliances, trade blocs, and international organizations affect sovereignty and power.' },
      ],
    },
    {
      title: 'Agriculture, Food, and Rural Land Use',
      description: 'How food systems, rural livelihoods, and land-use patterns respond to markets and environments.',
      lessons: [
        { title: 'Subsistence, commercial, and intensive agriculture', description: 'Classify agricultural systems and connect them to climate, labor, markets, and technology.' },
        { title: 'Von Thünen, land rent, and rural settlement', description: 'Apply land-rent theory to explain agricultural patterns around cities.' },
        { title: 'The Green Revolution and food security', description: 'Assess high-yield crops, inputs, food deserts, and the trade-offs of agricultural modernization.' },
        { title: 'Agricultural sustainability and commodity chains', description: 'Trace food commodity chains and evaluate soil, water, labor, and biodiversity impacts.' },
      ],
    },
    {
      title: 'Cities, Urban Systems, and Settlement',
      description: 'How cities grow, organize space, and connect to one another.',
      lessons: [
        { title: 'Urbanization, suburbanization, and megacities', description: 'Explain urban growth patterns, informal settlements, and metropolitan change worldwide.' },
        { title: 'Central place theory and city hierarchies', description: 'Use threshold, range, primate city, rank-size, and central-place concepts.' },
        { title: 'Urban models and land-use patterns', description: 'Compare concentric-zone, sector, multiple-nuclei, Latin American, African, and Southeast Asian city models.' },
        { title: 'Segregation, gentrification, and urban sustainability', description: 'Analyze unequal access to housing, transport, services, and environmental quality.' },
      ],
    },
    {
      title: 'Economic Development and Industry',
      description: 'Why wealth, work, resources, and infrastructure are unevenly distributed.',
      lessons: [
        { title: 'Measuring development and inequality', description: 'Interpret GDP, GNI, HDI, Gini coefficient, PPP, and limits of aggregate indicators.' },
        { title: 'Economic sectors and industrial location', description: 'Explain primary through quinary sectors, Weber theory, agglomeration, and deindustrialization.' },
        { title: 'Energy, resources, and environmental justice', description: 'Compare energy systems and identify how resource extraction and pollution affect communities.' },
        { title: 'Transportation, trade corridors, and supply chains', description: 'Trace how ports, chokepoints, canals, railways, and logistics shape global economic geography.' },
      ],
    },
    {
      title: 'Globalization and Human-Environment Systems',
      description: 'The global connections and environmental choices that shape contemporary places.',
      lessons: [
        { title: 'Globalization, time-space compression, and networks', description: 'Explain how trade, media, migration, and technology intensify spatial connections.' },
        { title: 'Tourism, cultural change, and heritage', description: 'Evaluate tourism’s economic benefits, environmental costs, and effects on cultural landscapes.' },
        { title: 'Climate justice, adaptation, and environmental migration', description: 'Connect climate risks to vulnerability, adaptation, displacement, and policy.' },
        { title: 'Sustainable development and competing land uses', description: 'Evaluate geographic trade-offs among conservation, housing, food, energy, and growth.' },
      ],
    },
  ],
};
