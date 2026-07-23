// A broad visual-arts foundation for the built-in Curriculum Marketplace.
// Enrollment adds the platform's standard practice, essay, and assessment
// lessons after each unit.
export const FINE_ARTS_COURSE = {
  slug: 'fine-arts',
  title: 'Fine Arts',
  description: 'Build visual literacy and studio practice through the elements of art, media exploration, art history, criticism, and a final curated portfolio.',
  subject: 'art',
  grade: '9-12',
  difficulty: 'intermediate',
  units: [
    {
      title: 'Visual Language',
      description: 'The elements and principles artists use to make meaning.',
      lessons: [
        { title: 'Line, shape, form, and space', description: 'Use contour, gesture, positive and negative space, and volume to analyze and compose images.' },
        { title: 'Color: hue, value, temperature, and harmony', description: 'Apply color vocabulary to explain mood, emphasis, contrast, and visual unity.' },
        { title: 'Texture, pattern, and visual rhythm', description: 'Identify tactile and implied texture, repetition, variation, and rhythm in artworks.' },
        { title: 'Composition: balance, contrast, emphasis, and movement', description: 'Analyze how artists guide attention and organize a viewer’s experience.' },
      ],
    },
    {
      title: 'Studio Methods and Media',
      description: 'Material choices, process, technique, and intentional experimentation.',
      lessons: [
        { title: 'Drawing as observation and invention', description: 'Practice proportion, value, mark-making, and expressive line as tools for visual thinking.' },
        { title: 'Painting and color application', description: 'Compare opaque, transparent, layered, and blended approaches to paint.' },
        { title: 'Printmaking, collage, and mixed media', description: 'Explore repetition, appropriation, texture, and layering through reproducible and assembled forms.' },
        { title: 'Sculpture, installation, and three-dimensional design', description: 'Analyze material, scale, site, and viewer movement in three-dimensional work.' },
      ],
    },
    {
      title: 'Art, Culture, and History',
      description: 'Artworks as records of belief, power, identity, and exchange across cultures.',
      lessons: [
        { title: 'Sacred art and the visual expression of belief', description: 'Compare how symbols, spaces, and materials support religious and spiritual meaning.' },
        { title: 'Portraiture, identity, and representation', description: 'Examine who is pictured, who is omitted, and how portraits construct status and selfhood.' },
        { title: 'Art of exchange: trade, travel, and cultural contact', description: 'Trace how materials, motifs, and techniques circulate among regions and traditions.' },
        { title: 'Museums, collecting, and cultural stewardship', description: 'Evaluate questions of provenance, display, repatriation, and public access.' },
      ],
    },
    {
      title: 'Movements and Modern Visual Culture',
      description: 'Major shifts in artistic style and the expanding definition of art.',
      lessons: [
        { title: 'Renaissance to Romanticism: observation, reason, and emotion', description: 'Compare changing ideals of realism, beauty, individualism, and the sublime.' },
        { title: 'Impressionism, Post-Impressionism, and new ways of seeing', description: 'Analyze color, light, brushwork, and subjective perception in late nineteenth-century art.' },
        { title: 'Modernism: abstraction, expression, and experiment', description: 'Explain how modern artists challenged representation, tradition, and audience expectations.' },
        { title: 'Contemporary art, design, and digital media', description: 'Interpret installation, photography, video, design, and digital art in contemporary visual culture.' },
      ],
    },
    {
      title: 'Critique, Curation, and Portfolio',
      description: 'Articulate artistic decisions, revise work, and present a coherent body of work.',
      lessons: [
        { title: 'Describing, analyzing, interpreting, and evaluating art', description: 'Use a four-step critique process to make evidence-based claims about artworks.' },
        { title: 'Artist statements and visual research', description: 'Connect process, influences, intent, and material choices in clear reflective writing.' },
        { title: 'Revision, feedback, and ethical critique', description: 'Give and use constructive feedback while documenting experimentation and revision.' },
        { title: 'Curating a final portfolio or exhibition', description: 'Select, sequence, label, and contextualize artwork for a compelling final presentation.' },
      ],
    },
  ],
};
