#!/usr/bin/env node
/**
 * Obsidian vault → Worldify project converter.
 *
 * Usage:
 *   node scripts/import-obsidian.mjs <path-to-config.mjs> [path-to-vault]
 *
 * Example (Avalymia):
 *   npm run import:avalymia                       (uses the config's defaultVaultPath)
 *   npm run import:avalymia -- "C:/path/to/avalymia"
 *
 * What it does:
 *   - Reads every Markdown note (minus excluded folders) and turns it into a Wiki entry.
 *   - Rewrites Obsidian links ([[alias]], [[Note#Heading|label]], ![[embeds]]) so they
 *     resolve inside Worldify.
 *   - Uses the folder structure for categories, worlds, tags and "part of" relations.
 *   - Converts embedded images to compressed WebP under public/vaults/<id>/images/.
 *   - Writes public/vaults/<id>/project.json, which the app loads automatically.
 *
 * The vault itself is only read, never modified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , configArg, vaultArg] = process.argv;
if (!configArg) {
  console.error('Usage: node scripts/import-obsidian.mjs <config.mjs> [vault-dir]');
  process.exit(1);
}

const config = (await import(pathToFileURL(path.resolve(configArg)).href)).default;
const VAULT = path.resolve(vaultArg || config.defaultVaultPath || '.');
if (!fs.existsSync(VAULT)) {
  console.error(`Vault folder not found: ${VAULT}\nPass it explicitly: npm run import:${config.slug} -- "<path to vault>"`);
  process.exit(1);
}
const PROJECT_ID = config.project.id;
const OUT_DIR = path.resolve('public', 'vaults', config.slug);
const IMG_DIR = path.join(OUT_DIR, 'images');
const IMG_URL = `/vaults/${config.slug}/images`;
const NOW = new Date().toISOString();

// ───────────────────────── helpers ─────────────────────────

const toPosix = (p) => p.split(path.sep).join('/');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const slugify = (s) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Minimal YAML front-matter reader (scalars, inline arrays and "- item" lists). */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { data: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: text };
  const raw = text.slice(3, end).split(/\r?\n/);
  const body = text.slice(end + 4).replace(/^\r?\n/, '');
  const data = {};
  let currentKey = null;
  for (const line of raw) {
    if (!line.trim()) continue;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const v = kv[2].trim();
      if (!v) data[currentKey] = [];
      else if (v.startsWith('[') && v.endsWith(']'))
        data[currentKey] = v.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter(Boolean);
      else data[currentKey] = unquote(v);
    }
  }
  return { data, body };
}
const unquote = (s) => s.replace(/^["']|["']$/g, '');
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Plain-text first sentence(s) for the summary line. */
function summarize(md) {
  const para = md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('![') && !l.startsWith('|') && !l.startsWith('>') && !/^[-*_]{3,}$/.test(l));
  if (!para) return '';
  const plain = para
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/^[-*]\s+/, '');
  if (plain.length <= 220) return plain;
  const cut = plain.slice(0, 220);
  const dot = cut.lastIndexOf('. ');
  return dot > 80 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

function ruleFor(relPath) {
  return config.categoryRules.find((r) => relPath.startsWith(r.prefix)) ?? config.defaultRule;
}

// ───────────────────────── 1. collect notes ─────────────────────────

const allFiles = walk(VAULT);
const isExcluded = (rel) => config.exclude.some((ex) => rel.startsWith(ex));

const notes = [];
const imageFiles = new Map(); // lowercased basename -> absolute path
for (const abs of allFiles) {
  const rel = toPosix(path.relative(VAULT, abs));
  const ext = path.extname(abs).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    imageFiles.set(path.basename(abs).toLowerCase(), abs);
    continue;
  }
  if (ext !== '.md' || isExcluded(rel)) continue;
  const raw = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
  const { data, body } = parseFrontmatter(raw);
  const title = path.basename(abs, '.md');
  notes.push({ abs, rel, dir: toPosix(path.dirname(rel)), title, data, body });
}

// Index titles + aliases (case-insensitive) → canonical title
const titleIndex = new Map();
const duplicates = [];
for (const n of notes) {
  const k = n.title.toLowerCase();
  if (titleIndex.has(k)) duplicates.push(n.rel);
  else titleIndex.set(k, n.title);
}
for (const n of notes) {
  for (const alias of asArray(n.data.aliases)) {
    const k = String(alias).toLowerCase();
    if (!titleIndex.has(k)) titleIndex.set(k, n.title);
  }
}

// ───────────────────────── 2. rewrite Markdown ─────────────────────────

const usedImages = new Set();
let unresolvedLinks = 0;

function imageMarkdown(name) {
  const key = name.toLowerCase();
  if (!imageFiles.has(key)) return null;
  usedImages.add(key);
  const out = key.replace(/\.(png|jpe?g|gif|webp)$/, '.webp');
  return `![${path.basename(name).replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')}](${IMG_URL}/${encodeURI(out)})`;
}

function rewrite(body, selfTitle) {
  let md = body;

  // Embeds: ![[image.png|300]] → standalone image; ![[Note]] → link
  md = md.replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g, (m, target) => {
    const t = target.trim();
    if (/\.(png|jpe?g|gif|webp)$/i.test(t)) {
      const img = imageMarkdown(t);
      return img ? `\n\n${img}\n\n` : '';
    }
    return `[[${t}]]`;
  });

  // Links: [[Target#Heading|Label]]
  md = md.replace(/\[\[([^\]|]*)(?:\|([^\]]+))?\]\]/g, (m, target, label) => {
    const [page, heading] = target.split('#');
    // Obsidian also allows path links ("Folder/Sub/Note") – match on the note name.
    const pageName = page.trim().split('/').pop().replace(/\.md$/i, '');
    if (!pageName) {
      // same-note heading link – just show the text
      return label?.trim() || heading?.trim() || '';
    }
    const canonical = titleIndex.get(pageName.toLowerCase());
    const shown = (label?.trim() || pageName).replace(/\|/g, '');
    if (!canonical) {
      unresolvedLinks++;
      return shown === pageName ? `[[${pageName}]]` : `[[${pageName}|${shown}]]`;
    }
    if (canonical === selfTitle) return shown;
    return shown === canonical ? `[[${canonical}]]` : `[[${canonical}|${shown}]]`;
  });

  // Obsidian comments %% … %% and block references ^abc123
  md = md.replace(/%%[\s\S]*?%%/g, '').replace(/\s\^[A-Za-z0-9-]+$/gm, '');

  return md.replace(/\n{3,}/g, '\n\n').trim();
}

// ───────────────────────── 3. entities ─────────────────────────

const worldForPath = (dir) => {
  const hit = config.worlds
    .filter((w) => w.folder && (dir === w.folder || dir.startsWith(w.folder + '/')))
    .sort((a, b) => b.folder.length - a.folder.length)[0];
  return hit ? hit.id : null;
};

const templates = new Map();
const entities = [];
const entityByTitle = new Map();
const usedSlugs = new Set();

for (const n of notes) {
  const rule = ruleFor(n.rel);
  if (!templates.has(rule.template.id)) {
    templates.set(rule.template.id, {
      id: rule.template.id,
      projectId: PROJECT_ID,
      name: rule.template.name,
      category: rule.category,
      icon: rule.template.icon ?? 'book',
      color: rule.template.color,
      fields: [],
      defaultMarkdown: '',
    });
  }

  let slug = slugify(n.title) || 'note';
  while (usedSlugs.has(slug)) slug += '-2';
  usedSlugs.add(slug);

  const aliases = asArray(n.data.aliases).map(String);
  const folderTags = n.dir
    .split('/')
    .slice(2) // skip the top-level folder and its first sub-folder (the category)
    .filter((seg) => seg && seg !== n.title && !config.untaggedFolders.includes(seg))
    .map(slugify);
  const fmTags = asArray(n.data.tags).map((t) => slugify(String(t).replace(/^#/, '')));
  const contentMd = rewrite(n.body, n.title);

  const entity = {
    id: `ent-${slug}`,
    projectId: PROJECT_ID,
    worldId: worldForPath(n.dir),
    templateId: rule.template.id,
    category: rule.category,
    slug,
    title: n.title,
    ...(aliases.length ? { subtitle: `Also known as ${aliases.join(', ')}` } : {}),
    summary: summarize(contentMd),
    tags: [...new Set([...folderTags, ...fmTags])].filter(Boolean),
    contentMd,
    templateValues: {},
    customProperties: [
      { key: 'obsidian_path', label: 'Obsidian note', value: n.rel, type: 'text' },
      ...(aliases.length ? [{ key: 'aliases', label: 'Aliases', value: aliases.join(', '), type: 'text' }] : []),
    ],
    spatialKeyframes: [],
    temporalStates: [],
    updatedAt: NOW,
  };
  entities.push(entity);
  entityByTitle.set(n.title.toLowerCase(), entity);
}

// ───────────────────────── 4. folder hierarchy → relations ─────────────────────────
// A folder "X/" containing "X.md" is a folder note. Every other note in X/ (and the
// folder notes of its sub-folders) becomes "part of" / "located in" X.

const folderNote = new Map(); // dir -> entity
for (const n of notes) {
  if (path.posix.basename(n.dir) === n.title) folderNote.set(n.dir, entityByTitle.get(n.title.toLowerCase()));
}

const relations = [];
for (const n of notes) {
  const self = entityByTitle.get(n.title.toLowerCase());
  let dir = path.posix.basename(n.dir) === n.title ? path.posix.dirname(n.dir) : n.dir;
  let parent = null;
  while (dir && dir !== '.') {
    parent = folderNote.get(dir);
    if (parent) break;
    dir = path.posix.dirname(dir);
  }
  if (!parent || parent.id === self.id) continue;
  const isPlace = n.rel.startsWith(config.placesFolder);
  relations.push({
    id: `rel-${self.slug}--${parent.slug}`,
    projectId: PROJECT_ID,
    sourceEntityId: self.id,
    targetEntityId: parent.id,
    type: isPlace ? 'located_in' : 'member_of',
    label: isPlace ? 'Located in' : 'Part of',
  });
}

// ───────────────────────── 5. stories ─────────────────────────

const stories = [];
for (const s of config.stories ?? []) {
  const abs = path.join(VAULT, s.file);
  if (!fs.existsSync(abs)) {
    console.warn(`! story not found: ${s.file}`);
    continue;
  }
  const { body } = parseFrontmatter(fs.readFileSync(abs, 'utf8'));
  const text = rewrite(body, '').replace(/^#\s+.*\n+/, '');
  const parts = text.split(/^##\s+/m);
  const intro = parts.shift().trim();
  const storyId = `story-${slugify(s.title)}`;
  const chapterId = `${storyId}-ch1`;
  const sections = parts.length ? parts : [`${s.title}\n${intro}`];
  const scenes = sections.map((p, i) => {
    const [heading, ...rest] = p.split('\n');
    const content = (i === 0 && parts.length && intro ? intro + '\n\n' : '') + rest.join('\n').trim();
    const participants = [...content.matchAll(/\[\[([^\]|]+)/g)]
      .map((m) => entityByTitle.get(m[1].toLowerCase())?.id)
      .filter(Boolean);
    return {
      id: `${chapterId}-sc${i + 1}`,
      chapterId,
      title: heading.trim(),
      order: i,
      summary: summarize(content),
      contentMd: content,
      status: 'draft',
      participatingEntityIds: [...new Set(participants)],
      startTick: 0,
      wordCountGoal: 1500,
    };
  });
  stories.push({
    id: storyId,
    projectId: PROJECT_ID,
    worldId: s.worldId ?? null,
    title: s.title,
    subtitle: s.subtitle ?? '',
    synopsis: scenes[0]?.summary ?? '',
    status: 'drafting',
    protagonistEntityIds: [],
    chapters: [{ id: chapterId, storyId, title: s.chapterTitle ?? 'Chapter I', order: 0, synopsis: '', scenes }],
    updatedAt: NOW,
  });
}

// ───────────────────────── 6. images ─────────────────────────

fs.mkdirSync(IMG_DIR, { recursive: true });
for (const extra of config.extraImages ?? []) usedImages.add(extra.toLowerCase());

let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('! sharp not installed – copying images without compression');
}
let imgBytes = 0;
for (const key of usedImages) {
  const src = imageFiles.get(key);
  if (!src) continue;
  const dest = path.join(IMG_DIR, key.replace(/\.(png|jpe?g|gif|webp)$/, '.webp'));
  if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) {
    imgBytes += fs.statSync(dest).size;
    continue;
  }
  const maxWidth = (config.fullResImages ?? []).includes(key) ? 3200 : 1400;
  if (sharp) {
    await sharp(src).resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 78 }).toFile(dest);
  } else {
    fs.copyFileSync(src, dest);
  }
  imgBytes += fs.statSync(dest).size;
}

// ───────────────────────── 7. assemble project ─────────────────────────

const maps = (config.maps ?? []).map((m) => ({
  projectId: PROJECT_ID,
  mode: 'raster',
  markers: [],
  paths: [],
  zones: [],
  labels: [],
  ...m,
  rasterImageUrl: m.image ? `${IMG_URL}/${encodeURI(m.image.toLowerCase().replace(/\.(png|jpe?g)$/, '.webp'))}` : undefined,
  image: undefined,
}));

const worlds = config.worlds.map(({ folder, ...w }) => ({
  projectId: PROJECT_ID,
  summary: entityByTitle.get(w.name.toLowerCase())?.summary ?? '',
  ...w,
}));

const project = {
  ...config.project,
  activeWorldId: config.project.activeWorldId ?? worlds[0]?.id,
  activeCalendarId: config.calendars[0]?.id,
  currentTick: config.project.currentTick ?? 0,
  worlds,
  worldConnections: (config.worldConnections ?? []).map((c) => ({ projectId: PROJECT_ID, ...c })),
  calendars: config.calendars.map((c) => ({ projectId: PROJECT_ID, ...c })),
  templates: [...templates.values()],
  entities,
  relations,
  timelineEvents: [],
  maps,
  stories,
  importedFrom: { source: config.sourceLabel, importedAt: NOW, notes: notes.length },
  updatedAt: NOW,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'project.json'), JSON.stringify(project));

// Register in public/vaults/index.json so the app picks it up automatically.
const indexPath = path.resolve('public', 'vaults', 'index.json');
let index = [];
try {
  index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
} catch {
  /* first import */
}
index = index.filter((e) => e.slug !== config.slug);
index.push({
  slug: config.slug,
  projectId: PROJECT_ID,
  name: config.project.name,
  url: `/vaults/${config.slug}/project.json`,
  importedAt: NOW,
});
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');

console.log(`✓ ${config.project.name}`);
console.log(`  ${entities.length} wiki entries, ${relations.length} folder relations, ${stories.length} stories`);
console.log(`  ${worlds.length} worlds, ${maps.length} maps, ${templates.size} templates`);
console.log(`  ${usedImages.size} images → ${(imgBytes / 1e6).toFixed(1)} MB`);
console.log(`  ${unresolvedLinks} links point to notes that don't exist yet (shown as red links)`);
if (duplicates.length) console.log(`  ! duplicate note names (first one wins): ${duplicates.join(', ')}`);
console.log(`  → ${toPosix(path.relative(process.cwd(), path.join(OUT_DIR, 'project.json')))}`);
