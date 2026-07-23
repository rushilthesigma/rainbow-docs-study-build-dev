// Curated literature courses for the built-in Curriculum Marketplace. These
// are intentionally text-centered: each unit moves from close reading to
// comparative analysis and ends in the platform's standard essay/assessment
// enrichment when a learner enrolls.

const lesson = (title, description) => ({ title, description });

export const LITERATURE_COURSES = [
  {
    slug: 'american-literature',
    title: 'American Literature',
    description: 'Trace American voices from Indigenous traditions and the colonial era to contemporary writing through close reading, historical context, and argument.',
    subject: 'english',
    grade: '11',
    difficulty: 'advanced',
    units: [
      {
        title: 'Origins, Colonies, and the American Voice',
        description: 'Oral traditions, encounter narratives, Puritan writing, and the rhetoric of revolution.',
        lessons: [
          lesson('Indigenous oral traditions and origin stories', 'Analyze how storytelling preserves cultural values, relationships to place, and communal memory.'),
          lesson('Colonial encounters and captivity narratives', 'Examine point of view, power, and cultural conflict in early American prose.'),
          lesson('Puritanism: sermon, plain style, and community', 'Read Puritan arguments for their theology, rhetoric, and vision of social order.'),
          lesson('Revolutionary rhetoric and the language of liberty', 'Compare persuasive strategies in arguments about independence, rights, and citizenship.'),
        ],
      },
      {
        title: 'Romanticism, Transcendentalism, and Reform',
        description: 'Individualism, nature, conscience, and dissent in nineteenth-century literature.',
        lessons: [
          lesson('American Romanticism and the Gothic', 'Identify Romantic and Gothic conventions in fiction about imagination, fear, and the self.'),
          lesson('Transcendentalism: Emerson, Thoreau, and self-reliance', 'Evaluate how Transcendentalist writers connect nature, intuition, and moral independence.'),
          lesson('Abolitionist narratives and witness', 'Analyze narrative voice, audience, and evidence in literature that confronts slavery.'),
          lesson('Hawthorne, Melville, and the burden of symbol', 'Develop interpretations of ambiguity, allegory, and moral conflict in major fiction.'),
        ],
      },
      {
        title: 'Realism, Regionalism, and Naturalism',
        description: 'A changing nation represented through ordinary life, local color, class, race, and environment.',
        lessons: [
          lesson('Realism and the representation of ordinary life', 'Distinguish realist techniques and explain how detail produces social critique.'),
          lesson('Regionalism and local color', 'Compare dialect, setting, and community in writing shaped by particular American regions.'),
          lesson('Race, reconstruction, and double consciousness', 'Read post–Civil War literature for its treatment of identity, citizenship, and power.'),
          lesson('Naturalism: environment, inheritance, and choice', 'Analyze how naturalist texts stage the tension between agency and social forces.'),
        ],
      },
      {
        title: 'Modernism and the Harlem Renaissance',
        description: 'Experiment, migration, fragmentation, and the remaking of American culture.',
        lessons: [
          lesson('Modernism: fragmentation and new forms', 'Identify modernist formal choices and connect them to uncertainty in the early twentieth century.'),
          lesson('The Harlem Renaissance and cultural self-definition', 'Analyze how writers and artists create new visions of Black identity and modernity.'),
          lesson('The American Dream in the interwar years', 'Evaluate competing definitions of success, mobility, and belonging in canonical fiction.'),
          lesson('War, displacement, and the limits of language', 'Use close reading to trace understatement, trauma, and alienation in modern prose and poetry.'),
        ],
      },
      {
        title: 'Contemporary American Literatures',
        description: 'Plural voices, contested histories, and new forms from the postwar era to the present.',
        lessons: [
          lesson('Postwar dissent and the counterculture', 'Examine how postwar writers challenge conformity, consumerism, and inherited authority.'),
          lesson('Civil rights, protest, and social imagination', 'Analyze how literature participates in movements for justice and collective change.'),
          lesson('Immigration, diaspora, and hybrid identity', 'Compare narratives of migration, language, memory, and belonging.'),
          lesson('Synthesis: defining an American literature', 'Construct a comparative argument about continuity and change across the American tradition.'),
        ],
      },
    ],
  },
  {
    slug: 'british-literature',
    title: 'British Literature',
    description: 'Read the literature of Britain from Old English epic to contemporary voices, with attention to form, empire, class, gender, and historical change.',
    subject: 'english',
    grade: '11',
    difficulty: 'advanced',
    units: [
      {
        title: 'Old English and Medieval Worlds',
        description: 'Epic, faith, courtly culture, and social satire in early British writing.',
        lessons: [
          lesson('Beowulf and the epic hero', 'Analyze alliteration, kennings, heroic code, and the poem’s blend of pagan and Christian values.'),
          lesson('The Middle Ages: pilgrimage, estates, and satire', 'Read selections from Chaucer for frame narrative, social types, and irony.'),
          lesson('Arthurian legend and romance', 'Identify the conventions of quest, chivalry, temptation, and moral testing.'),
          lesson('Medieval lyric, ballad, and drama', 'Compare how compact poetic and dramatic forms create voice, conflict, and communal meaning.'),
        ],
      },
      {
        title: 'Renaissance and Reformation',
        description: 'Humanism, religious change, court culture, and the flowering of English drama and poetry.',
        lessons: [
          lesson('Humanism, the sonnet, and the lyric self', 'Analyze Renaissance poetic form and the construction of love, beauty, and identity.'),
          lesson('Shakespearean tragedy', 'Trace tragic structure, dramatic irony, and the relationship between private desire and public power.'),
          lesson('Shakespearean comedy and romance', 'Examine mistaken identity, social order, and theatrical self-awareness.'),
          lesson('Metaphysical poetry and argument', 'Interpret conceits, paradox, rhythm, and spiritual or erotic argument in seventeenth-century poetry.'),
        ],
      },
      {
        title: 'Restoration, Enlightenment, and Satire',
        description: 'Reason, wit, social performance, and the rise of the novel.',
        lessons: [
          lesson('Restoration comedy and social performance', 'Analyze manners, gender roles, and hypocrisy through comic dialogue and stage conventions.'),
          lesson('Neoclassicism and the art of satire', 'Evaluate irony, parody, and persona in critiques of politics, taste, and human folly.'),
          lesson('The Enlightenment and the individual', 'Examine rational inquiry, travel, and self-making in eighteenth-century prose.'),
          lesson('The rise of the English novel', 'Trace point of view, realism, and the novel’s interest in interior life and social mobility.'),
        ],
      },
      {
        title: 'Romantic and Victorian Britain',
        description: 'Revolution, industry, nature, empire, and the changing conditions of modern life.',
        lessons: [
          lesson('Romanticism: nature, imagination, and revolution', 'Compare Romantic poets’ responses to landscape, freedom, emotion, and social change.'),
          lesson('The Gothic and the uncanny', 'Analyze suspense, doubling, setting, and transgression in Romantic and Victorian Gothic fiction.'),
          lesson('Victorian realism and the social novel', 'Explain how novels depict class, industrialization, gender, and moral responsibility.'),
          lesson('Empire and the Victorian imagination', 'Read British texts critically for their representations of race, colonization, and global power.'),
        ],
      },
      {
        title: 'Modern and Contemporary Britain',
        description: 'Modernist experiment, postwar reconstruction, and diverse contemporary British identities.',
        lessons: [
          lesson('Modernism and fractured experience', 'Identify stream of consciousness, montage, and formal experimentation in response to modern life.'),
          lesson('War poetry and witness', 'Compare poetic responses to conflict, memory, nationalism, and loss.'),
          lesson('Postwar drama and social critique', 'Analyze subtext, absurdity, and domestic space in postwar British theater.'),
          lesson('Contemporary British voices', 'Develop a comparative reading of multiculturalism, devolution, migration, and changing national identity.'),
        ],
      },
    ],
  },
  {
    slug: 'european-literature',
    title: 'European Literature',
    description: 'Explore major European literary traditions in translation, from classical epic and drama to modernism and contemporary cross-border writing.',
    subject: 'english',
    grade: '12',
    difficulty: 'advanced',
    units: [
      {
        title: 'Classical Foundations',
        description: 'Epic, tragedy, myth, and civic life in Greek and Roman literature.',
        lessons: [
          lesson('Epic, myth, and the journey', 'Analyze how classical epics use divine intervention, hospitality, and homecoming to define heroism.'),
          lesson('Greek tragedy: fate, choice, and the polis', 'Examine tragic conflict, chorus, catharsis, and the relationship between individual and state.'),
          lesson('Roman literature and imperial vision', 'Read Roman poetry and prose for adaptation, civic duty, and the politics of empire.'),
          lesson('Classical reception across Europe', 'Trace how later writers revise classical myths to address new cultural and political questions.'),
        ],
      },
      {
        title: 'Medieval and Renaissance Europe',
        description: 'Pilgrimage, courtly love, humanism, and new visions of the individual.',
        lessons: [
          lesson('Dante and the moral architecture of the afterlife', 'Analyze allegory, journey structure, and the relationship between justice, faith, and poetry.'),
          lesson('Courtly love and chivalric romance', 'Compare ideals of desire, honor, and gender in medieval lyric and romance.'),
          lesson('Humanism and the Renaissance self', 'Explain how humanist writing reimagines education, dignity, skepticism, and worldly experience.'),
          lesson('Cervantes and the invention of modern fiction', 'Examine metafiction, competing realities, and satire of inherited literary forms.'),
        ],
      },
      {
        title: 'Enlightenment, Revolution, and Romanticism',
        description: 'Reason, political upheaval, emotion, and the modern individual.',
        lessons: [
          lesson('Enlightenment satire and philosophical fiction', 'Evaluate irony and thought experiment as tools for criticizing custom, authority, and intolerance.'),
          lesson('Revolution and the rights of the individual', 'Analyze literary responses to political transformation, citizenship, and violence.'),
          lesson('European Romanticism', 'Compare Romantic approaches to nature, nationalism, imagination, and the sublime.'),
          lesson('The Gothic across Europe', 'Interpret the Gothic as a mode for exploring repression, desire, science, and social anxiety.'),
        ],
      },
      {
        title: 'Realism, Naturalism, and the Nineteenth-Century Novel',
        description: 'Class, family, cities, and the pressures of social change.',
        lessons: [
          lesson('Realism and social observation', 'Analyze narrative detail, free indirect discourse, and the social worlds of realist fiction.'),
          lesson('The Russian novel: conscience and society', 'Explore moral conflict, psychological depth, and historical change in nineteenth-century Russian prose.'),
          lesson('Naturalism and determinism', 'Assess how heredity, environment, and institutions shape character and plot.'),
          lesson('Symbolism and the turn inward', 'Identify how symbolist poetry uses image, sound, and suggestion to resist plain statement.'),
        ],
      },
      {
        title: 'Modernism to the Present',
        description: 'War, existentialism, memory, migration, and formal experiment in twentieth- and twenty-first-century Europe.',
        lessons: [
          lesson('Modernism and the crisis of representation', 'Compare fragmented form, interiority, and urban experience across modernist texts.'),
          lesson('Kafka, absurdity, and alienation', 'Analyze bureaucratic power, estrangement, and uncertainty in modern European fiction.'),
          lesson('Existentialism and moral choice', 'Evaluate freedom, responsibility, and absurdity in philosophical fiction and drama.'),
          lesson('Contemporary European literature in translation', 'Construct a comparative argument about memory, borders, language, and belonging in recent work.'),
        ],
      },
    ],
  },
  {
    slug: 'world-literature',
    title: 'World Literature',
    description: 'Read influential texts from multiple regions and traditions while practicing translation-aware close reading, comparison, and contextual research.',
    subject: 'english',
    grade: '10-12',
    difficulty: 'advanced',
    units: [
      {
        title: 'Ways of Reading World Literature',
        description: 'Translation, context, genre, and ethical comparison across cultures.',
        lessons: [
          lesson('What makes a text “world literature”?', 'Define circulation, translation, adaptation, and reception as ways texts travel across cultures.'),
          lesson('Reading in translation', 'Evaluate how diction, form, paratext, and translator choices shape a reader’s experience.'),
          lesson('Oral tradition, performance, and the written text', 'Compare how stories change when they move among oral, performed, and printed forms.'),
          lesson('Close reading without flattening context', 'Practice evidence-based interpretation that respects historical and cultural specificity.'),
        ],
      },
      {
        title: 'Ancient and Classical Traditions',
        description: 'Epic, wisdom literature, drama, and philosophical storytelling across early civilizations.',
        lessons: [
          lesson('Epic journeys: Mesopotamia, Greece, and South Asia', 'Compare heroism, mortality, duty, and divine order in foundational epic traditions.'),
          lesson('Wisdom, parable, and ethical narrative', 'Analyze concise narrative forms that teach through paradox, example, and debate.'),
          lesson('Classical drama across cultures', 'Examine ritual, conflict, and social order in dramatic traditions from several regions.'),
          lesson('Love poetry and lyric traditions', 'Compare voice, imagery, and convention in classical lyric from different literary cultures.'),
        ],
      },
      {
        title: 'Empire, Encounter, and Colonialism',
        description: 'Travel, conquest, resistance, and the literary consequences of unequal contact.',
        lessons: [
          lesson('Travel writing and the construction of the “other”', 'Analyze description, selection, and authority in accounts of unfamiliar peoples and places.'),
          lesson('Colonial narratives and counter-narratives', 'Compare imperial perspectives with texts that resist, revise, or reclaim them.'),
          lesson('Race, caste, class, and social hierarchy', 'Interpret how literary form represents systems of inequality and lived experience.'),
          lesson('Decolonizing the canon', 'Evaluate how anthology choices, translation, and critical frameworks shape literary value.'),
        ],
      },
      {
        title: 'Modernity, War, and Social Change',
        description: 'New cities, revolutions, conflict, and the search for individual and collective meaning.',
        lessons: [
          lesson('Modernism beyond one center', 'Identify experimental forms in twentieth-century writing from multiple regions.'),
          lesson('War, partition, and testimony', 'Analyze memory, silence, and witness in literature responding to conflict and displacement.'),
          lesson('Magical realism and contested reality', 'Examine how the marvelous can represent history, power, and everyday life.'),
          lesson('Gender, liberation, and social transformation', 'Compare literary representations of gendered experience and movements for change.'),
        ],
      },
      {
        title: 'Contemporary Global Voices',
        description: 'Migration, climate, technology, diaspora, and the interdependence of contemporary life.',
        lessons: [
          lesson('Diaspora and multilingual identity', 'Analyze code-switching, memory, and family narratives across diasporic writing.'),
          lesson('Climate, land, and environmental justice', 'Interpret how contemporary literature connects ecological crisis to culture and inequality.'),
          lesson('Global cities and digital life', 'Examine how contemporary texts represent networks, labor, surveillance, and urban change.'),
          lesson('Comparative final: a conversation across texts', 'Build a nuanced comparative argument linking texts across regions, periods, and traditions.'),
        ],
      },
    ],
  },
  {
    slug: 'poetry',
    title: 'Poetry',
    description: 'Develop confidence as a close reader and writer of poetry through sound, image, form, literary movements, performance, and a final portfolio.',
    subject: 'english',
    grade: '9-12',
    difficulty: 'intermediate',
    units: [
      {
        title: 'The Craft of Close Reading',
        description: 'Image, sound, line, syntax, and the habits of attentive reading.',
        lessons: [
          lesson('Image, figurative language, and sensory detail', 'Analyze metaphor, simile, symbol, and imagery as systems of meaning rather than decoration.'),
          lesson('Sound: rhyme, rhythm, meter, and repetition', 'Trace how sonic choices create emphasis, pace, mood, and argument.'),
          lesson('Line, stanza, and the visual field', 'Explain how enjambment, caesura, white space, and stanza shape a poem’s movement.'),
          lesson('Speaker, address, and tone', 'Distinguish poet from speaker and analyze audience, stance, and tonal shifts.'),
        ],
      },
      {
        title: 'Forms and Traditions',
        description: 'Fixed and open forms from several literary traditions.',
        lessons: [
          lesson('The sonnet: argument in fourteen lines', 'Compare Petrarchan and Shakespearean structures and analyze the volta as a turn in thought.'),
          lesson('Haiku, tanka, and compression', 'Read brief lyric forms for image, season, juxtaposition, and precise attention.'),
          lesson('Ballad, ode, elegy, and dramatic monologue', 'Identify how inherited genres organize voice, occasion, and emotional movement.'),
          lesson('Free verse and invented form', 'Evaluate how poets create pattern and constraint without relying on traditional meter or rhyme.'),
        ],
      },
      {
        title: 'Poetry, Identity, and Place',
        description: 'Voice, language, memory, community, and landscape in lyric poetry.',
        lessons: [
          lesson('Nature and the lyric self', 'Analyze how poems use place to explore perception, emotion, and philosophical questions.'),
          lesson('Identity, ancestry, and memory', 'Compare how poets use voice and image to negotiate inheritance and self-definition.'),
          lesson('Poetry of protest and witness', 'Examine rhetorical strategies in poems that confront injustice, violence, and public history.'),
          lesson('Translation, bilingualism, and untranslatability', 'Discuss how multiple languages and translation choices expand poetic meaning.'),
        ],
      },
      {
        title: 'Modern and Contemporary Poetries',
        description: 'Experiment, performance, visual form, and new poetic publics.',
        lessons: [
          lesson('Modernism and the break with convention', 'Identify fragmentation, collage, and allusion in modernist poetry.'),
          lesson('The Harlem Renaissance and Black poetic innovation', 'Analyze form, music, and cultural assertion in Black poetic traditions.'),
          lesson('Confessional, feminist, and queer poetics', 'Examine intimacy, persona, and the politics of private experience.'),
          lesson('Spoken word, slam, and digital poetry', 'Compare page-based and performed poetry with attention to audience, voice, and medium.'),
        ],
      },
      {
        title: 'Reading Like a Poet, Writing Like a Critic',
        description: 'Revision, annotation, comparison, and a polished personal portfolio.',
        lessons: [
          lesson('Annotation and evidence in poetry analysis', 'Develop claims that connect precise formal observations to a poem’s larger meaning.'),
          lesson('Comparative poetry essay', 'Plan and draft an argument that puts two poems in productive conversation.'),
          lesson('Revision as a poetic practice', 'Use sound, line, image, and structure to revise a short original poem with intention.'),
          lesson('Portfolio and artist statement', 'Curate close readings and original work into a final portfolio with a reflective statement.'),
        ],
      },
    ],
  },
];
