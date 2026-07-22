// Compact PAUSD-style elective: "Oceania Geography". The larger continental
// presets use one unit per country; this course stays intentionally shorter by
// pairing neighboring Pacific states while still covering all 14 sovereign
// countries in Oceania. Lessons are grounded in the existing country geography
// notes used by the Notes and Quiz Bowl preset catalogs.
import { OCEANIA } from './countryGeoNotes/oceania.js';

const NOTE_BY_COUNTRY = Object.fromEntries(
  OCEANIA.map((note) => [note.country, note]),
);

function textbookContextFor(countries) {
  return countries
    .map((country) => {
      const note = NOTE_BY_COUNTRY[country];
      if (!note) return null;
      return `${note.title}\n\n${note.mainNotes}\n\nSummary: ${note.summary}`;
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

const REGIONAL_FOUNDATIONS_CONTEXT = `OCEANIA — REGIONAL FOUNDATIONS

Oceania is a Pacific-centered world region made up of Australia, New Zealand,
Papua New Guinea, and thousands of islands traditionally grouped into
Melanesia, Micronesia, and Polynesia. Its 14 sovereign states occupy a small
combined land area but govern enormous exclusive economic zones.

The region sits across the Pacific Ring of Fire and includes continental
islands, high volcanic islands, uplifted coral islands, and low coral atolls.
Plate boundaries create the Southern Alps of New Zealand, the New Guinea
Highlands, deep ocean trenches, active volcanoes, and frequent earthquakes.
Trade winds, the South Pacific Convergence Zone, El Nino and La Nina, tropical
cyclones, drought, and sea-level rise shape life across the islands.

The three cultural-geographic subregions are:
- Melanesia: Papua New Guinea, Fiji, Solomon Islands, and Vanuatu.
- Micronesia: Palau, the Federated States of Micronesia, Marshall Islands,
  Nauru, and commonly Kiribati.
- Polynesia: Samoa, Tonga, Tuvalu, New Zealand, and a much wider Pacific
  triangle whose island groups include Hawaii, Rapa Nui, and French Polynesia.

Australia and New Zealand are often grouped as Australasia. Major outside
territories and associated states, including Guam, New Caledonia, French
Polynesia, American Samoa, the Cook Islands, and Niue, are important map anchors
but are not counted among the 14 sovereign states in this course.`;

const COURSE_UNITS = [
  {
    title: 'Oceania at a Glance',
    description: 'A map-first introduction to Oceania, its subregions, island types, plate boundaries, climates, and ocean scale.',
    textbookContext: REGIONAL_FOUNDATIONS_CONTEXT,
    lessons: [
      {
        title: 'Mapping Australasia, Melanesia, Micronesia & Polynesia',
        description: 'Locate Oceania in the Pacific; distinguish Australasia, Melanesia, Micronesia, and Polynesia; identify the 14 sovereign states and the major dependent territories that anchor the regional map.',
      },
      {
        title: 'Islands, Plate Boundaries & Pacific Climate',
        description: 'Compare continental, volcanic, and coral islands; trace the Ring of Fire and major trenches; and explain how trade winds, ENSO, cyclones, drought, and sea-level rise affect the region.',
      },
    ],
  },
  {
    title: 'Australia',
    description: 'The continent-country: coastal cities, the dry interior, river basins, ranges, reefs, and climatic contrasts.',
    countries: ['Australia'],
    lessons: [
      {
        title: 'Australia - Cities, States & the Coastal Rim',
        description: 'Locate Canberra, Sydney, Melbourne, Brisbane, Perth, Adelaide, Darwin, and Hobart; connect the states and territories to Australia\'s strongly coastal population pattern.',
      },
      {
        title: 'Australia - Outback, Rivers, Ranges & Reefs',
        description: 'Study the Outback and major deserts, the Great Dividing Range, Murray-Darling basin, Lake Eyre, Tasmania, and Great Barrier Reef, including drought and bushfire risk.',
      },
    ],
  },
  {
    title: 'New Zealand',
    description: 'Aotearoa across two main islands: tectonics, mountains, volcanoes, fjords, rivers, and cities.',
    countries: ['New Zealand'],
    lessons: [
      {
        title: 'New Zealand - North Island, South Island & Cities',
        description: 'Locate Auckland, Wellington, Christchurch, and the two main islands across Cook Strait; compare their settlement, agriculture, and regional roles.',
      },
      {
        title: 'New Zealand - Southern Alps, Volcanoes & Fjords',
        description: 'Connect the Pacific-Australian plate boundary to the Southern Alps, Aoraki / Mount Cook, Alpine Fault, Taupo volcanic zone, earthquakes, braided rivers, and Fiordland.',
      },
    ],
  },
  {
    title: 'Papua New Guinea',
    description: 'The eastern half of New Guinea and its surrounding islands, from highland valleys to active volcanic arcs.',
    countries: ['Papua New Guinea'],
    lessons: [
      {
        title: 'Papua New Guinea - Cities, Provinces & Island Regions',
        description: 'Locate Port Moresby, Lae, Mount Hagen, the Highlands, the Sepik basin, New Britain, New Ireland, Bougainville, and the maritime approaches to Torres Strait.',
      },
      {
        title: 'Papua New Guinea - Highlands, Rivers & Ring of Fire',
        description: 'Study Mount Wilhelm and the New Guinea Highlands, the Sepik and Fly rivers, tropical rainforest, volcanic hazards, biodiversity, and the geographic roots of extreme linguistic diversity.',
      },
    ],
  },
  {
    title: 'Fiji',
    description: 'Melanesia\'s central island hub: volcanic high islands, coral reefs, trade-wind rainfall, and regional connections.',
    countries: ['Fiji'],
    lessons: [
      {
        title: 'Fiji - Viti Levu, Vanua Levu & Urban Centers',
        description: 'Locate Suva, Nadi, Lautoka, Labasa, Viti Levu, and Vanua Levu; explain why the two largest islands dominate population, transport, tourism, and government.',
      },
      {
        title: 'Fiji - Volcanic Islands, Reefs & Climate',
        description: 'Study Mount Tomanivi, the Rewa River, the Great Sea Reef, wet windward and dry leeward slopes, tropical cyclones, and the contrast between high islands and coral islets.',
      },
    ],
  },
  {
    title: 'Solomon Islands & Vanuatu',
    description: 'Two Melanesian archipelagos shaped by active subduction, dispersed settlement, and tropical hazards.',
    countries: ['Solomon Islands', 'Vanuatu'],
    lessons: [
      {
        title: 'Solomon Islands - Guadalcanal, Provinces & Volcanic Arcs',
        description: 'Locate Honiara, Guadalcanal, Malaita, New Georgia, and the Santa Cruz Islands; study forested volcanic terrain, earthquakes, reefs, WWII geography, and the challenges of an elongated archipelago.',
      },
      {
        title: 'Vanuatu - Island Chain, Volcanoes & Cyclones',
        description: 'Locate Port Vila, Espiritu Santo, Efate, Tanna, and Ambrym; connect the New Hebrides Trench to Yasur and other volcanoes, earthquakes, cyclones, and high linguistic diversity.',
      },
    ],
  },
  {
    title: 'Palau & the Federated States of Micronesia',
    description: 'Western Micronesia: high islands, coral atolls, vast ocean distances, and close ties with the United States.',
    countries: ['Palau', 'Micronesia'],
    lessons: [
      {
        title: 'Palau - Rock Islands, Reefs & Western Micronesia',
        description: 'Locate Babeldaob, Koror, Ngerulmud, the Rock Islands, and Palau Trench; examine uplifted limestone, coral ecosystems, marine conservation, and tourism.',
      },
      {
        title: 'Micronesia - Yap, Chuuk, Pohnpei & Kosrae',
        description: 'Compare the four FSM states, Palikir, Chuuk Lagoon, Nan Madol, rainy volcanic Pohnpei, and the outer atolls across a 2,700-kilometer federation.',
      },
    ],
  },
  {
    title: 'Marshall Islands & Nauru',
    description: 'Low atolls and a raised coral island: nuclear history, phosphate mining, water scarcity, and climate vulnerability.',
    countries: ['Marshall Islands', 'Nauru'],
    lessons: [
      {
        title: 'Marshall Islands - Ratak, Ralik & the Great Atolls',
        description: 'Map Majuro, Kwajalein, Bikini, and Enewetak; distinguish the Ratak and Ralik chains and connect low relief to freshwater limits, nuclear-testing history, and sea-level risk.',
      },
      {
        title: 'Nauru - Phosphate, Topside & a Coastal Nation',
        description: 'Explain how phosphate mining transformed Nauru\'s Topside plateau, why settlement rings the coast, how Yaren functions without an official capital, and why water and land restoration are central challenges.',
      },
    ],
  },
  {
    title: 'Kiribati & Tuvalu',
    description: 'Far-flung atoll states where ocean territory, freshwater lenses, migration, and rising seas dominate geography.',
    countries: ['Kiribati', 'Tuvalu'],
    lessons: [
      {
        title: 'Kiribati - Three Island Groups Across Four Hemispheres',
        description: 'Locate the Gilbert, Phoenix, and Line islands, South Tarawa, Banaba, and Kiritimati; explain the International Date Line adjustment and Kiribati\'s enormous ocean span.',
      },
      {
        title: 'Tuvalu - Nine Atolls, Funafuti & Sea-Level Risk',
        description: 'Map Funafuti and Tuvalu\'s nine islands; examine narrow settlement land, freshwater lenses, king tides, cyclone exposure, remoteness, and adaptation to sea-level rise.',
      },
    ],
  },
  {
    title: 'Samoa & Tonga',
    description: 'Polynesian high islands and coral islands shaped by volcanism, ocean navigation, and powerful tropical systems.',
    countries: ['Samoa', 'Tonga'],
    lessons: [
      {
        title: 'Samoa - Upolu, Savai\'i & the Polynesian Core',
        description: 'Locate Apia, Upolu, and Savai\'i; study shield volcanoes, lava fields, wet tropical interiors, coastal settlement, the 2009 tsunami, and Samoa\'s place in Polynesia.',
      },
      {
        title: 'Tonga - Island Groups, Tofua Arc & Ocean Hazards',
        description: 'Compare Tongatapu, Ha\'apai, and Vava\'u; connect the Tonga Trench and Tofua volcanic arc to earthquakes, Hunga Tonga-Hunga Ha\'apai, tsunamis, reefs, and the location of Nuku\'alofa.',
      },
    ],
  },
].map(({ countries = [], ...unit }) => ({
  ...unit,
  textbookContext: unit.textbookContext || textbookContextFor(countries),
}));

const FINAL_EXAM_UNIT = {
  title: 'Final Exam - Comprehensive Oceania Geography',
  description: 'Cumulative review across Oceania\'s 14 sovereign states: locations, capitals, island groups, physical geography, climate, and regional connections.',
  textbookContext: `OCEANIA — CUMULATIVE FINAL-EXAM SCOPE

${OCEANIA.map((note) => `- ${note.country} (${note.subregion}): ${note.summary}`).join('\n')}

Be able to locate all 14 sovereign states and their capitals; sort countries
among Australasia, Melanesia, Micronesia, and Polynesia; distinguish continental,
volcanic, raised-coral, and atoll landscapes; identify the major ranges, rivers,
trenches, reefs, and island groups; and compare tectonic, cyclone, freshwater,
remoteness, and sea-level hazards across the region.`,
  lessons: [
    {
      title: 'Oceania Review - Countries, Capitals & Subregions',
      description: 'Synthesize the regional map by matching all 14 sovereign states to their capitals, major island groups, principal cities, and placement in Australasia, Melanesia, Micronesia, or Polynesia.',
    },
    {
      title: 'Oceania Review - Islands, Tectonics, Climate & Oceans',
      description: 'Compare Australia\'s continental interior, New Zealand and Melanesia\'s active plate margins, Micronesian and Polynesian high islands and atolls, major reefs and trenches, ENSO, cyclones, freshwater constraints, and sea-level rise.',
    },
  ],
};

export const OCEANIA_GEOGRAPHY_COURSE = {
  slug: 'oceania-geography',
  title: 'Oceania Geography',
  description: 'A compact regional tour of Oceania. All 14 sovereign states are covered through focused country and paired-island units on cities, island groups, physical geography, climate, and ocean connections, followed by a cumulative final exam.',
  subject: 'geography',
  grade: '9-12',
  difficulty: 'advanced',
  textbook: 'Covalent AI Oceania geography notes',
  units: [...COURSE_UNITS, FINAL_EXAM_UNIT],
};
