/**
 * Import settings for Encyclopaedia Avalymia (github.com/elad-haviv/avalymia).
 * Everything here describes how the vault's own structure maps into Worldify —
 * no lore is invented. Where Worldify needs a value the vault doesn't define
 * (e.g. hours per day, cosmology-map positions, colours) a neutral placeholder is used.
 */
const GAZ = '03 Gazetteer (Places & Locations)/Planes of Existence';

const tpl = (id, name, color, icon) => ({ id: `tpl-av-${id}`, name, color, icon });

export default {
  slug: 'avalymia',
  // Relative to the worldify folder: OneDrive/01 Projects/App Development/worldify
  // → OneDrive/01 Projects/Worldbuilding/Avalymia/vault/Avalymia
  defaultVaultPath: '../../Worldbuilding/Avalymia/vault/Avalymia',
  sourceLabel: 'Obsidian vault · github.com/elad-haviv/avalymia',

  project: {
    id: 'proj-avalymia',
    name: 'Encyclopaedia Avalymia',
    tagline: 'A fantasy multiverse of high fantasy, cosmic horror and grimdark.',
    description:
      "Elad Haviv's original multiverse, imported from the Avalymia Obsidian vault: cosmology, history, places, inhabitants, cultures and mechanics as interconnected notes. The vault remains the source of truth.",
    genre: 'High Fantasy / Cosmic Horror',
    activeWorldId: 'av-ezob',
    currentTick: 0,
  },

  // Folders that are not lore (session logs, recycle bin, helper sheets, assets…)
  exclude: ['99 Appendices/', 'AGENTS.md', 'README.md'],
  untaggedFolders: ['Planes of Existence'],
  placesFolder: '03 Gazetteer',

  // First matching prefix wins – most specific first.
  categoryRules: [
    { prefix: '00 Overview/', category: 'cosmology', template: tpl('overview', 'Overview', '#94a3b8', 'compass') },
    { prefix: '01 Universe & Concepts/Magic System/', category: 'magic_tech', template: tpl('magic', 'Magic System', '#eab308', 'sparkles') },
    { prefix: '01 Universe & Concepts/', category: 'cosmology', template: tpl('concept', 'Universe & Concept', '#94a3b8', 'orbit') },
    { prefix: '02 History & Lore/', category: 'event_lore', template: tpl('history', 'History & Myth', '#f97316', 'scroll') },
    { prefix: '03 Gazetteer', category: 'location', template: tpl('place', 'Place', '#6366f1', 'map-pin') },
    { prefix: '04 Inhabitants/Notable Individuals/', category: 'character', template: tpl('individual', 'Notable Individual', '#f59e0b', 'user') },
    { prefix: '04 Inhabitants/Archdemons/', category: 'character', template: tpl('archdemon', 'Archdemon', '#dc2626', 'flame') },
    { prefix: '04 Inhabitants/Deities/', category: 'deity', template: tpl('deity', 'Deity', '#a855f7', 'sun') },
    { prefix: '04 Inhabitants/Sapient Races/', category: 'species', template: tpl('race', 'Sapient Race', '#14b8a6', 'users') },
    { prefix: '04 Inhabitants/Creatures & Beastiary/', category: 'species', template: tpl('creature', 'Creature', '#0d9488', 'paw') },
    { prefix: '05 Society & Culture/Factions & Groups/', category: 'faction', template: tpl('faction', 'Faction & Group', '#10b981', 'shield') },
    { prefix: '05 Society & Culture/', category: 'event_lore', template: tpl('culture', 'Society & Culture', '#fb923c', 'landmark') },
    { prefix: '06 Compendium (Items & Mechanics)/Artifacts & Notable Items/', category: 'item', template: tpl('artifact', 'Artifact', '#ec4899', 'gem') },
    { prefix: '06 Compendium (Items & Mechanics)/Resources & Materials/', category: 'item', template: tpl('material', 'Resource & Material', '#f472b6', 'box') },
    { prefix: '06 Compendium (Items & Mechanics)/Tools/', category: 'item', template: tpl('tool', 'Tool', '#db2777', 'wrench') },
    { prefix: '06 Compendium (Items & Mechanics)/', category: 'magic_tech', template: tpl('mechanic', 'Mechanic & Phenomenon', '#ca8a04', 'zap') },
  ],
  defaultRule: { category: 'cosmology', template: tpl('note', 'Note', '#64748b', 'file') },

  // Planes of Existence (+ Ezob's moon). Notes inside each folder belong to that world.
  worlds: [
    {
      id: 'av-ezob',
      name: 'Ezob',
      type: 'planet',
      folder: `${GAZ}/Ezob`,
      color: '#f59e0b',
      cosmologyX: 500,
      cosmologyY: 500,
      magicOrPhysicsRules:
        'The Nexus at the centre of Avalymia: Nexus Pulses are most frequent here, so magic is most potent and time passes slowly relative to outer regions.',
    },
    { id: 'av-ruuna', name: "Ru'una", type: 'moon', parentWorldId: 'av-ezob', folder: `${GAZ}/Ezob/Ru'una`, color: '#34d399', cosmologyX: 640, cosmologyY: 400, orbitRadius: 170, magicOrPhysicsRules: '' },
    { id: 'av-derdama', name: 'Derdama', type: 'plane', folder: `${GAZ}/Derdama`, color: '#dc2626', cosmologyX: 500, cosmologyY: 800, magicOrPhysicsRules: '' },
    { id: 'av-korr', name: 'Korr', type: 'planet', folder: `${GAZ}/Korr`, color: '#64748b', cosmologyX: 210, cosmologyY: 300, magicOrPhysicsRules: '' },
    { id: 'av-earth', name: 'Earth', type: 'plane', folder: `${GAZ}/Earth`, color: '#3b82f6', cosmologyX: 800, cosmologyY: 720, magicOrPhysicsRules: '' },
    { id: 'av-orielia', name: 'Orielia', type: 'plane', folder: `${GAZ}/Orielia`, color: '#e879f9', cosmologyX: 800, cosmologyY: 260, magicOrPhysicsRules: '' },
    { id: 'av-asban', name: 'Asban', type: 'plane', folder: `${GAZ}/Asban`, color: '#a78bfa', cosmologyX: 200, cosmologyY: 720, magicOrPhysicsRules: '' },
  ],

  // Only connections the vault states outright.
  worldConnections: [
    { id: 'av-conn-ruuna', sourceWorldId: 'av-ruuna', targetWorldId: 'av-ezob', type: 'orbital_tether', label: 'Moon of Ezob', color: '#34d399' },
    { id: 'av-conn-derdama', sourceWorldId: 'av-derdama', targetWorldId: 'av-ezob', type: 'planar_rift', label: 'Lies deep beneath Ezob', color: '#dc2626' },
    { id: 'av-conn-earth', sourceWorldId: 'av-earth', targetWorldId: 'av-ezob', type: 'astral_sea_route', label: 'World shards carried humans to Ezob', color: '#3b82f6' },
  ],

  // From "Ezob Local Calendar.md". Seasons for months the note doesn't describe are placeholders.
  calendars: [
    {
      id: 'cal-av-ezob',
      name: 'Ezob Local Calendar (Era of Man)',
      hoursPerDay: 24,
      weekdays: [],
      months: [
        ['Iyar', 'Spring'],
        ['Jenjo', 'Summer'],
        ['Amon', 'Summer'],
        ['Kez', 'Summer'],
        ['Avar', 'Autumn'],
        ['Mozeta', 'Autumn'],
        ['Elher', 'Autumn'],
        ['Sebatonin', 'Winter'],
        ['Haas', 'Winter'],
        ['Ticmary', 'Winter'],
        ['Tevet', 'Winter'],
      ].map(([name, season]) => ({ id: `m-${name.toLowerCase()}`, name, days: 30, season })),
      eras: [
        {
          id: 'era-bm',
          name: 'Before Man',
          abbreviation: 'BM',
          startYear: -100000,
          endYear: -1,
          countsBackward: true,
          color: '#a855f7',
          description: 'Events predating human arrival: the age of the Emeshar, the flourishing of the Adyni, and all primordial history.',
        },
        {
          id: 'era-em',
          name: 'Era of Man',
          abbreviation: 'EM',
          startYear: 0,
          color: '#f59e0b',
          description: 'Years following the First Landing. Year 1 EM marks the first permanent human settlement on Ezob.',
        },
      ],
      // Full moon (the Vigil) on days 14–16, new moon (the Blind Days) on days 28–30.
      moons: [{ id: 'moon-ruuna', name: "Ru'una", color: '#34d399', periodDays: 30, phaseOffsetDays: 1 }],
      epochName: 'The First Landing (1 Iyar, 1 EM)',
    },
  ],

  maps: [
    {
      id: 'map-av-ezob',
      worldId: 'av-ezob',
      name: 'Ezob',
      summary: 'World map of Ezob from the vault (99 Appendices/01 Images/ezob-map.png).',
      scaleUnit: 'units',
      totalWidthUnits: 1000,
      image: 'ezob-map.png',
    },
    {
      id: 'map-av-ezob-hemispheres',
      worldId: 'av-ezob',
      name: 'Ezob — Hemispheres',
      summary: 'Hemisphere view of Ezob from the vault.',
      scaleUnit: 'units',
      totalWidthUnits: 1000,
      image: 'ezob-hemispheres.png',
    },
  ],
  extraImages: ['ezob-map.png', 'ezob-hemispheres.png'],
  fullResImages: ['ezob-map.png', 'ezob-hemispheres.png'],

  stories: [
    {
      file: '99 Appendices/02 My Works/Niran-among-Men-Smugglers-Hum.md',
      title: "Niran among Men: The Smuggler's Hum",
      worldId: 'av-ezob',
      chapterTitle: "The Smuggler's Hum",
    },
  ],
};
