import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  ImageRun,
} from 'docx';
import JSZip from 'jszip';
import { Entity, Project, WorldMap, World } from '../types/worldify';
import { categoryLabel, categoryColor } from './categories';
import { formatTickToDate } from './calendarEngine';
import { resolveImageSrc, collectProjectImages } from './assetStore';

// ==========================================
// BROWSER DOWNLOAD & UTILITY HELPERS
// ==========================================

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim();
}

/**
 * Common Word document styles setting the standard body font to 12pt (size: 24 half-points)
 */
function getWordDocumentStyles() {
  return {
    default: {
      document: {
        run: {
          size: 24, // 12pt regular body text
          font: 'Calibri',
          color: '1e293b',
        },
        paragraph: {
          spacing: { line: 276, lineRule: 'auto' as const, after: 140 }, // 1.15 line spacing, 7pt spacing after
        },
      },
    },
  };
}

/**
 * Fetches an image (from asset:<id>, webp, png, jpg, or data URL),
 * resizes it within standard printable margins (max width: 550, max height: 450),
 * and converts it to a standard PNG Uint8Array for flawless rendering in docx.
 */
async function fetchAndNormalizeImage(
  src: string
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    const resolvedUrl = (await resolveImageSrc(src)) || src;
    if (!resolvedUrl) return null;

    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      const res = await fetch(resolvedUrl);
      const buf = await res.arrayBuffer();
      return { data: new Uint8Array(buf), width: 500, height: 350 };
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = resolvedUrl;
    });

    const origW = img.naturalWidth || img.width || 600;
    const origH = img.naturalHeight || img.height || 400;

    // Word margin printable width is ~550px at 96 DPI (approx 5.7 inches)
    const maxWidth = 550;
    const maxHeight = 450;
    let targetW = origW;
    let targetH = origH;

    if (targetW > maxWidth) {
      targetH = Math.round((targetH * maxWidth) / targetW);
      targetW = maxWidth;
    }
    if (targetH > maxHeight) {
      targetW = Math.round((targetW * maxHeight) / targetH);
      targetH = maxHeight;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!blob) return null;

    const arrayBuffer = await blob.arrayBuffer();
    return {
      data: new Uint8Array(arrayBuffer),
      width: targetW,
      height: targetH,
    };
  } catch (err) {
    console.warn('Could not load/process image for Word export:', src, err);
    return null;
  }
}

// ==========================================
// 1. INDIVIDUAL WIKI PAGE EXPORTS
// ==========================================

/**
 * Export a single wiki page to clean Obsidian-compatible Markdown (.md)
 */
export function exportEntityToMarkdown(entity: Entity, project: Project) {
  const world = project.worlds.find((w) => w.id === entity.worldId);
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];

  const frontmatterLines = [
    '---',
    `title: "${entity.title.replace(/"/g, '\\"')}"`,
    entity.subtitle ? `subtitle: "${entity.subtitle.replace(/"/g, '\\"')}"` : null,
    `category: ${entity.category}`,
    entity.subcategory ? `subcategory: "${entity.subcategory}"` : null,
    world ? `world: "${world.name}"` : null,
    entity.tags.length > 0 ? `tags: [${entity.tags.map((t) => `"${t}"`).join(', ')}]` : null,
    entity.summary ? `summary: "${entity.summary.replace(/"/g, '\\"')}"` : null,
    entity.lifecycleStartTick !== undefined && calendar
      ? `founded_or_born: "${formatTickToDate(calendar, entity.lifecycleStartTick).displayShort}"`
      : null,
    entity.lifecycleEndTick !== undefined && calendar
      ? `fell_or_died: "${formatTickToDate(calendar, entity.lifecycleEndTick).displayShort}"`
      : null,
    ...Object.entries(entity.templateValues).map(
      ([k, v]) => `${k}: ${typeof v === 'string' ? `"${v.replace(/"/g, '\\"')}"` : JSON.stringify(v)}`
    ),
    `updated: "${entity.updatedAt}"`,
    '---',
  ].filter(Boolean);

  const sections: string[] = [frontmatterLines.join('\n'), '', `# ${entity.title}`];

  if (entity.subtitle) {
    sections.push(`*${entity.subtitle}*\n`);
  }

  if (entity.summary) {
    sections.push(`> ${entity.summary}\n`);
  }

  // Custom properties / Attributes table
  if (entity.customProperties.length > 0) {
    sections.push('### Overview & Properties\n');
    sections.push('| Property | Value |');
    sections.push('| --- | --- |');
    entity.customProperties.forEach((prop) => {
      sections.push(`| **${prop.label}** | ${prop.value} |`);
    });
    sections.push('');
  }

  // Main Markdown Content
  sections.push(entity.contentMd);

  // Spatio-Temporal Locations (if any)
  if (entity.spatialKeyframes.length > 0) {
    sections.push('\n### Spatio-Temporal Locations\n');
    entity.spatialKeyframes.forEach((kf) => {
      const map = project.maps.find((m) => m.id === kf.mapId);
      const dateStr = calendar ? formatTickToDate(calendar, kf.tick).displayShort : `Tick ${kf.tick}`;
      sections.push(`- **${dateStr}** on *${map ? map.name : 'Map'}*: (${Math.round(kf.x)}, ${Math.round(kf.y)})${kf.statusNote ? ` — *${kf.statusNote}*` : ''}`);
    });
  }

  // Relations
  const outgoing = project.relations.filter((r) => r.sourceEntityId === entity.id);
  const incoming = project.relations.filter((r) => r.targetEntityId === entity.id);
  if (outgoing.length > 0 || incoming.length > 0) {
    sections.push('\n### Connected Lore & Relationships\n');
    outgoing.forEach((rel) => {
      const target = project.entities.find((e) => e.id === rel.targetEntityId);
      if (target) {
        sections.push(`- **${rel.type.replace(/_/g, ' ')}** → [[${target.title}]]${rel.label ? ` (${rel.label})` : ''}`);
      }
    });
    incoming.forEach((rel) => {
      const source = project.entities.find((e) => e.id === rel.sourceEntityId);
      if (source) {
        sections.push(`- ← **${rel.type.replace(/_/g, ' ')}** from [[${source.title}]]${rel.label ? ` (${rel.label})` : ''}`);
      }
    });
  }

  const markdownContent = sections.join('\n');
  const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `${sanitizeFilename(entity.title)}.md`);
}

/**
 * Export a single wiki page to a Microsoft Word document (.docx)
 * with 12pt body text and full image incorporation
 */
export async function exportEntityToWord(entity: Entity, project: Project) {
  const world = project.worlds.find((w) => w.id === entity.worldId);
  const children: (Paragraph | Table)[] = [];

  // Title (28pt bold)
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({
          text: entity.title,
          bold: true,
          size: 56, // 28pt
          color: '0f172a',
        }),
      ],
      spacing: { after: 120 },
    })
  );

  // Subtitle (13pt italic)
  if (entity.subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: entity.subtitle,
            italics: true,
            size: 26, // 13pt
            color: '64748b',
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // Category and World badge line (10pt bold)
  const metaRuns = [
    new TextRun({
      text: `CATEGORY: ${categoryLabel(entity.category).toUpperCase()}`,
      bold: true,
      size: 20, // 10pt
      color: 'b45309',
    }),
  ];
  if (entity.subcategory) {
    metaRuns.push(
      new TextRun({
        text: `  •  SUBCATEGORY: ${entity.subcategory.toUpperCase()}`,
        bold: true,
        size: 20,
        color: '475569',
      })
    );
  }
  if (world) {
    metaRuns.push(
      new TextRun({
        text: `  •  WORLD: ${world.name}`,
        bold: true,
        size: 20,
        color: '0369a1',
      })
    );
  }
  children.push(new Paragraph({ children: metaRuns, spacing: { after: 240 } }));

  // Summary Quote Box (12pt italic)
  if (entity.summary) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: entity.summary,
            italics: true,
            size: 24, // 12pt
            color: '1e293b',
          }),
        ],
        shading: {
          type: ShadingType.CLEAR,
          fill: 'f8fafc',
          color: 'auto',
        },
        border: {
          left: {
            color: 'f59e0b',
            space: 12,
            style: BorderStyle.SINGLE,
            size: 24,
          },
        },
        spacing: { before: 100, after: 300 },
      })
    );
  }

  // Properties Table (12pt headers & cells)
  if (entity.customProperties.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'Attributes & Properties', bold: true, size: 30 })],
        spacing: { before: 200, after: 120 },
      })
    );

    const tableRows = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            shading: { fill: '0f172a' },
            children: [new Paragraph({ children: [new TextRun({ text: 'Property', bold: true, color: 'ffffff', size: 24 })] })],
          }),
          new TableCell({
            width: { size: 6000, type: WidthType.DXA },
            shading: { fill: '0f172a' },
            children: [new Paragraph({ children: [new TextRun({ text: 'Value', bold: true, color: 'ffffff', size: 24 })] })],
          }),
        ],
      }),
      ...entity.customProperties.map(
        (prop, idx) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 3000, type: WidthType.DXA },
                shading: { fill: idx % 2 === 0 ? 'f8fafc' : 'ffffff' },
                children: [new Paragraph({ children: [new TextRun({ text: prop.label, bold: true, size: 24 })] })],
              }),
              new TableCell({
                width: { size: 6000, type: WidthType.DXA },
                shading: { fill: idx % 2 === 0 ? 'f8fafc' : 'ffffff' },
                children: [new Paragraph({ children: [new TextRun({ text: String(prop.value), size: 24 })] })],
              }),
            ],
          })
      ),
    ];

    children.push(
      new Table({
        rows: tableRows,
        width: { size: 9000, type: WidthType.DXA },
      })
    );
    children.push(new Paragraph({ spacing: { after: 240 } }));
  }

  // Markdown Body parsed to Word Paragraphs (with embedded images!)
  const bodyParagraphs = await markdownToWordParagraphs(entity.contentMd);
  children.push(...bodyParagraphs);

  // Spatio-Temporal Locations (12pt)
  if (entity.spatialKeyframes.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'Spatio-Temporal Locations', bold: true, size: 30 })],
        spacing: { before: 300, after: 120 },
      })
    );

    entity.spatialKeyframes.forEach((kf) => {
      const map = project.maps.find((m) => m.id === kf.mapId);
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: `Day ${kf.tick} on `, bold: true, size: 24 }),
            new TextRun({ text: map ? map.name : 'World Map', italics: true, size: 24 }),
            new TextRun({ text: `: Coordinates (${Math.round(kf.x)}, ${Math.round(kf.y)})`, size: 24 }),
            kf.statusNote ? new TextRun({ text: ` — ${kf.statusNote}`, italics: true, size: 24 }) : new TextRun({ text: '' }),
          ],
        })
      );
    });
  }

  // Connected Lore (12pt)
  const outgoing = project.relations.filter((r) => r.sourceEntityId === entity.id);
  const incoming = project.relations.filter((r) => r.targetEntityId === entity.id);
  if (outgoing.length > 0 || incoming.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'Connected Lore & Relationships', bold: true, size: 30 })],
        spacing: { before: 300, after: 120 },
      })
    );

    outgoing.forEach((rel) => {
      const target = project.entities.find((e) => e.id === rel.targetEntityId);
      if (target) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: `${rel.type.replace(/_/g, ' ')} → `, bold: true, color: 'b45309', size: 24 }),
              new TextRun({ text: target.title, bold: true, size: 24 }),
              rel.label ? new TextRun({ text: ` (${rel.label})`, italics: true, size: 24 }) : new TextRun({ text: '' }),
            ],
          })
        );
      }
    });

    incoming.forEach((rel) => {
      const source = project.entities.find((e) => e.id === rel.sourceEntityId);
      if (source) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: `← ${rel.type.replace(/_/g, ' ')} from `, bold: true, color: '0369a1', size: 24 }),
              new TextRun({ text: source.title, bold: true, size: 24 }),
              rel.label ? new TextRun({ text: ` (${rel.label})`, italics: true, size: 24 }) : new TextRun({ text: '' }),
            ],
          })
        );
      }
    });
  }

  const doc = new Document({
    styles: getWordDocumentStyles(),
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${sanitizeFilename(entity.title)}.docx`);
}

/**
 * Export a single wiki page to clean PDF via print window
 */
export async function exportEntityToPdf(entity: Entity, project: Project) {
  const world = project.worlds.find((w) => w.id === entity.worldId);
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];

  const contentHtml = await markdownToHtml(entity.contentMd);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(entity.title)} — ${escapeHtml(project.name)}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 18mm 20mm 18mm;
    }
    body {
      font-family: 'Merriweather', Georgia, 'Times New Roman', serif;
      line-height: 1.7;
      color: #1e293b;
      background: #ffffff;
      padding: 0;
      margin: 0;
      font-size: 11.5pt;
    }
    .header-pill {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 9.5pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #b45309;
      margin-bottom: 6px;
    }
    h1 {
      font-size: 26pt;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 8px 0;
      line-height: 1.2;
    }
    .subtitle {
      font-size: 13.5pt;
      font-style: italic;
      color: #64748b;
      margin-bottom: 16px;
    }
    .meta-line {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 9.5pt;
      color: #475569;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    blockquote {
      margin: 16px 0;
      padding: 12px 18px;
      background: #f8fafc;
      border-left: 4px solid #f59e0b;
      color: #334155;
      font-style: italic;
      font-size: 11.5pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 18px 0;
      font-size: 10.5pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #0f172a;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
    .content h2 {
      font-size: 17pt;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-top: 28px;
    }
    .content h3 {
      font-size: 14pt;
      font-weight: 700;
      color: #1e293b;
      margin-top: 22px;
    }
    .wikilink {
      color: #d97706;
      font-weight: 600;
      text-decoration: none;
    }
    .footer {
      margin-top: 36px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 8.5pt;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header-pill">${categoryLabel(entity.category)}${entity.subcategory ? ` · ${escapeHtml(entity.subcategory)}` : ''}</div>
  <h1>${escapeHtml(entity.title)}</h1>
  ${entity.subtitle ? `<div class="subtitle">${escapeHtml(entity.subtitle)}</div>` : ''}
  <div class="meta-line">
    <strong>Project:</strong> ${escapeHtml(project.name)}
    ${world ? ` &nbsp;•&nbsp; <strong>World:</strong> ${escapeHtml(world.name)}` : ''}
    ${entity.tags.length > 0 ? ` &nbsp;•&nbsp; <strong>Tags:</strong> ${escapeHtml(entity.tags.join(', '))}` : ''}
  </div>

  ${entity.summary ? `<blockquote>${escapeHtml(entity.summary)}</blockquote>` : ''}

  ${
    entity.customProperties.length > 0
      ? `<table>
          <thead><tr><th>Property</th><th>Value</th></tr></thead>
          <tbody>
            ${entity.customProperties
              .map(
                (p) =>
                  `<tr><td style="font-weight:600;width:35%;">${escapeHtml(p.label)}</td><td>${escapeHtml(String(p.value))}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>`
      : ''
  }

  <div class="content">
    ${contentHtml}
  </div>

  ${
    entity.spatialKeyframes.length > 0
      ? `<h2>Spatio-Temporal Locations</h2>
        <ul>
          ${entity.spatialKeyframes
            .map((kf) => {
              const map = project.maps.find((m) => m.id === kf.mapId);
              const dateStr = calendar
                ? formatTickToDate(calendar, kf.tick).displayShort
                : `Tick ${kf.tick}`;
              return `<li><strong>${escapeHtml(dateStr)}</strong> on <em>${map ? escapeHtml(map.name) : 'Map'}</em>: (${Math.round(kf.x)}, ${Math.round(kf.y)})${kf.statusNote ? ` — <em>${escapeHtml(kf.statusNote)}</em>` : ''}</li>`;
            })
            .join('')}
        </ul>`
      : ''
  }

  ${(() => {
    const outgoing = project.relations.filter((r) => r.sourceEntityId === entity.id);
    const incoming = project.relations.filter((r) => r.targetEntityId === entity.id);
    if (outgoing.length === 0 && incoming.length === 0) return '';
    return `<h2>Connected Lore & Relationships</h2>
      <ul>
        ${outgoing
          .map((r) => {
            const tgt = project.entities.find((e) => e.id === relTargetId(r));
            return tgt
              ? `<li><strong>${escapeHtml(r.type.replace(/_/g, ' '))}</strong> → <span class="wikilink">${escapeHtml(tgt.title)}</span>${r.label ? ` (<em>${escapeHtml(r.label)}</em>)` : ''}</li>`
              : '';
          })
          .join('')}
        ${incoming
          .map((r) => {
            const src = project.entities.find((e) => e.id === r.sourceEntityId);
            return src
              ? `<li>← <strong>${escapeHtml(r.type.replace(/_/g, ' '))}</strong> from <span class="wikilink">${escapeHtml(src.title)}</span>${r.label ? ` (<em>${escapeHtml(r.label)}</em>)` : ''}</li>`
              : '';
          })
          .join('')}
      </ul>`;
  })()}

  <div class="footer">
    <span>${escapeHtml(project.name)} — Worldify Wiki</span>
    <span>Exported ${new Date().toLocaleDateString()}</span>
  </div>

  <script>
    window.onload = function() {
      var imgs = Array.from(document.images);
      var promises = imgs.map(function(img) {
        if (img.complete) return Promise.resolve();
        return new Promise(function(resolve) {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });
      Promise.all(promises).then(function() {
        setTimeout(function() { window.print(); }, 400);
      });
    };
  </script>
</body>
</html>
  `;

  openPrintWindow(htmlContent);
}

function relTargetId(r: { targetEntityId: string }) {
  return r.targetEntityId;
}

// ==========================================
// 2. ENTIRE PROJECT EXPORTS
// ==========================================

/**
 * Export Entire Project as an Obsidian Vault .zip archive
 * matching the canonical structure of elad-haviv/avalymia,
 * including bundling all images into images/ and 99 Appendices/01 Images/!
 */
export async function exportProjectToObsidianVaultZip(project: Project) {
  const zip = new JSZip();
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];

  // 1. Collect and Bundle All Project Images
  const projectImages = await collectProjectImages(project);
  const srcToVaultPath = new Map<string, string>();

  for (const imgOpt of projectImages) {
    try {
      const resolvedUrl = (await resolveImageSrc(imgOpt.src)) || imgOpt.src;
      if (!resolvedUrl) continue;

      const res = await fetch(resolvedUrl);
      if (!res.ok) continue;

      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();

      let ext = '.png';
      if (blob.type.includes('webp') || imgOpt.src.endsWith('.webp')) ext = '.webp';
      else if (blob.type.includes('jpeg') || blob.type.includes('jpg') || imgOpt.src.endsWith('.jpg') || imgOpt.src.endsWith('.jpeg')) ext = '.jpg';
      else if (blob.type.includes('svg') || imgOpt.src.endsWith('.svg')) ext = '.svg';
      else if (blob.type.includes('gif') || imgOpt.src.endsWith('.gif')) ext = '.gif';

      const baseName = sanitizeFilename(imgOpt.name || imgOpt.src.split('/').pop()?.split('.')[0] || 'image');
      const filename = `${baseName}${ext}`;

      // Save into images/ and 99 Appendices/01 Images/
      zip.file(`images/${filename}`, arrayBuffer);
      zip.file(`99 Appendices/01 Images/${filename}`, arrayBuffer);

      srcToVaultPath.set(imgOpt.src, filename);
    } catch (err) {
      console.warn('Could not bundle image into zip:', imgOpt.src, err);
    }
  }

  // 2. .obsidian configuration folder
  zip.file(
    '.obsidian/app.json',
    JSON.stringify(
      {
        promptDelete: false,
        showLineNumber: true,
        useTab: true,
        tabSize: 2,
        foldHeading: true,
        foldIndent: true,
      },
      null,
      2
    )
  );

  zip.file(
    '.obsidian/appearance.json',
    JSON.stringify({ accentColor: '#f59e0b', cssTheme: '' }, null, 2)
  );

  zip.file(
    '.obsidian/core-plugins.json',
    JSON.stringify(
      [
        'file-explorer',
        'global-search',
        'graph',
        'backlink',
        'canvas',
        'outgoing-link',
        'tag-pane',
        'page-preview',
        'daily-notes',
        'templates',
        'note-composer',
        'command-palette',
        'markdown-importer',
        'word-count',
        'outline',
      ],
      null,
      2
    )
  );

  zip.file(
    '.obsidian/graph.json',
    JSON.stringify(
      {
        'collapse-filter': false,
        search: '',
        'local-search': '',
        'local-backend': 'gephi',
        'local-forefront': true,
        'local-interlinks': true,
        'local-neighbor-data': true,
      },
      null,
      2
    )
  );

  // 3. Root Readme and Agents Guidance
  const readmeMd = `# ${project.name}

${project.tagline ? `*${project.tagline}*\n` : ''}
${project.description}

---

## Multiverse & Setting Structure
- **Genre**: ${project.genre}
- **Worlds & Planes**: ${project.worlds.map((w) => w.name).join(', ')}
- **Total Wiki Entries**: ${project.entities.length}
- **Active Calendar**: ${calendar ? calendar.name : 'Standard Calendar'}
- **Visual Assets & Maps**: ${projectImages.length} images bundled in \`images/\` and \`99 Appendices/01 Images/\`

## Vault Organization

| Folder | Contents |
| --- | --- |
| \`00 Overview/\` | Setting tone, pillars, cosmological foundations |
| \`01 Universe & Concepts/\` | Magic systems, physics, planar laws |
| \`02 History & Lore/\` | Chronological eras, historical chronicles, major wars |
| \`03 Gazetteer (Places & Locations)/\` | Continents, citadels, cities, landmarks (subdivided by World) |
| \`04 Inhabitants/\` | Characters, deities, sapient races, beast bestiary |
| \`05 Society & Culture/\` | Factions, religions, guilds, politics |
| \`06 Compendium (Items & Mechanics)/\` | Artifacts, magical materials, legendary weapons |
| \`99 Appendices/01 Images/\` | Visual assets, portraits, and cartographic charts |
| \`99 Appendices/02 Stories/\` | Literary narratives, chapters, and scene manuscripts |
| \`99 Appendices/03 Cartography/\` | Map markers, routes, territorial zones, and surveys |

*Exported seamlessly from Worldify Studio on ${new Date().toISOString().split('T')[0]}.*
`;
  zip.file('README.md', readmeMd);

  const agentsMd = `# AGENTS.md — Lore Guidance & Source of Truth

This Obsidian vault contains the canonical worldbuilding lore for **${project.name}**.

## Source of Truth Hierarchy
1. Existing notes in this repository take absolute precedence over assumptions.
2. Interconnected Wikilinks (\`[[Note Title]]\`) form the knowledge graph.
3. Keep characters in \`04 Inhabitants/\`, places in \`03 Gazetteer/\`, items in \`06 Compendium/\`.
4. When creating new notes, provide YAML frontmatter with \`title\`, \`category\`, and \`tags\`.
5. Visual illustrations and maps are stored in \`images/\` and referenced via \`![[filename.webp]]\` or \`![alt](images/filename.webp)\`.
`;
  zip.file('AGENTS.md', agentsMd);

  // 4. 00 Overview
  zip.file(
    '00 Overview/Core Themes & Tone.md',
    `# Core Themes & Tone\n\n${project.name} explores a universe steeped in ${project.genre.toLowerCase()}. ${project.description}\n\nKey themes include the clash of ancient powers, planar resonance, and mortal discovery.`
  );
  zip.file(
    '00 Overview/Overview.md',
    `# ${project.name} — Overview\n\n**Genre**: ${project.genre}\n\n${project.tagline}\n\n${project.description}`
  );

  // Helper to rewrite markdown image paths to vault local relative paths
  const rewriteImageLinks = (md: string): string => {
    let rewritten = md;
    srcToVaultPath.forEach((vaultFilename, originalSrc) => {
      rewritten = rewritten.split(originalSrc).join(`images/${vaultFilename}`);
    });
    return rewritten;
  };

  // 5. Folder Routing Logic matching elad-haviv/avalymia
  const getObsidianPath = (ent: Entity): string => {
    const world = project.worlds.find((w) => w.id === ent.worldId);
    const worldFolder = world ? world.name.replace(/[\\/:*?"<>|]+/g, '') : 'Cosmology';

    switch (ent.category) {
      case 'cosmology':
        return `01 Universe & Concepts/${sanitizeFilename(ent.title)}.md`;
      case 'magic_tech':
        return `01 Universe & Concepts/Magic System/${sanitizeFilename(ent.title)}.md`;
      case 'event_lore':
        return `02 History & Lore/${sanitizeFilename(ent.title)}.md`;
      case 'location':
        return `03 Gazetteer (Places & Locations)/${worldFolder}/${sanitizeFilename(ent.title)}.md`;
      case 'character':
        if (ent.subcategory?.toLowerCase().includes('demon') || ent.tags.includes('archdemon')) {
          return `04 Inhabitants/Archdemons/${sanitizeFilename(ent.title)}.md`;
        }
        return `04 Inhabitants/Notable Individuals/${sanitizeFilename(ent.title)}.md`;
      case 'deity':
        return `04 Inhabitants/Deities/${sanitizeFilename(ent.title)}.md`;
      case 'species':
        if (
          ent.subcategory?.toLowerCase().includes('creature') ||
          ent.subcategory?.toLowerCase().includes('beast') ||
          ent.tags.includes('beast')
        ) {
          return `04 Inhabitants/Creatures & Beastiary/${sanitizeFilename(ent.title)}.md`;
        }
        return `04 Inhabitants/Sapient Races/${sanitizeFilename(ent.title)}.md`;
      case 'faction':
        return `05 Society & Culture/Factions & Groups/${sanitizeFilename(ent.title)}.md`;
      case 'item':
        if (ent.subcategory?.toLowerCase().includes('material') || ent.tags.includes('material')) {
          return `06 Compendium (Items & Mechanics)/Resources & Materials/${sanitizeFilename(ent.title)}.md`;
        }
        if (ent.subcategory?.toLowerCase().includes('tool') || ent.tags.includes('tool')) {
          return `06 Compendium (Items & Mechanics)/Tools/${sanitizeFilename(ent.title)}.md`;
        }
        return `06 Compendium (Items & Mechanics)/Artifacts & Notable Items/${sanitizeFilename(ent.title)}.md`;
      default:
        return `05 Society & Culture/${sanitizeFilename(ent.title)}.md`;
    }
  };

  // 6. Populate Entities into Folders
  project.entities.forEach((ent) => {
    const filePath = getObsidianPath(ent);
    const world = project.worlds.find((w) => w.id === ent.worldId);

    const frontmatterLines = [
      '---',
      `title: "${ent.title.replace(/"/g, '\\"')}"`,
      ent.subtitle ? `subtitle: "${ent.subtitle.replace(/"/g, '\\"')}"` : null,
      `category: ${ent.category}`,
      ent.subcategory ? `subcategory: "${ent.subcategory}"` : null,
      world ? `world: "${world.name}"` : null,
      ent.tags.length > 0 ? `tags: [${ent.tags.map((t) => `"${t}"`).join(', ')}]` : null,
      ent.summary ? `summary: "${ent.summary.replace(/"/g, '\\"')}"` : null,
      ...Object.entries(ent.templateValues).map(
        ([k, v]) => `${k}: ${typeof v === 'string' ? `"${v.replace(/"/g, '\\"')}"` : JSON.stringify(v)}`
      ),
      `updated: "${ent.updatedAt}"`,
      '---',
    ].filter(Boolean);

    const lines = [
      frontmatterLines.join('\n'),
      '',
      `# ${ent.title}`,
      ent.subtitle ? `*${ent.subtitle}*\n` : '',
      ent.summary ? `> ${ent.summary}\n` : '',
    ];

    if (ent.customProperties.length > 0) {
      lines.push('### Attributes & Custom Properties\n');
      lines.push('| Property | Value |');
      lines.push('| --- | --- |');
      ent.customProperties.forEach((p) => {
        lines.push(`| **${p.label}** | ${p.value} |`);
      });
      lines.push('');
    }

    lines.push(rewriteImageLinks(ent.contentMd));

    // Spatio-Temporal Locations
    if (ent.spatialKeyframes.length > 0) {
      lines.push('\n### Spatio-Temporal Locations\n');
      ent.spatialKeyframes.forEach((kf) => {
        const map = project.maps.find((m) => m.id === kf.mapId);
        const dateStr = calendar ? formatTickToDate(calendar, kf.tick).displayShort : `Tick ${kf.tick}`;
        lines.push(`- **${dateStr}** on *${map ? map.name : 'World Map'}*: (${Math.round(kf.x)}, ${Math.round(kf.y)})${kf.statusNote ? ` — *${kf.statusNote}*` : ''}`);
      });
    }

    // Relationships as Wikilinks
    const outgoing = project.relations.filter((r) => r.sourceEntityId === ent.id);
    const incoming = project.relations.filter((r) => r.targetEntityId === ent.id);
    if (outgoing.length > 0 || incoming.length > 0) {
      lines.push('\n### Connected Lore & Relationships\n');
      outgoing.forEach((rel) => {
        const target = project.entities.find((e) => e.id === rel.targetEntityId);
        if (target) {
          lines.push(`- **${rel.type.replace(/_/g, ' ')}** → [[${target.title}]]${rel.label ? ` (${rel.label})` : ''}`);
        }
      });
      incoming.forEach((rel) => {
        const source = project.entities.find((e) => e.id === rel.sourceEntityId);
        if (source) {
          lines.push(`- ← **${rel.type.replace(/_/g, ' ')}** from [[${source.title}]]${rel.label ? ` (${rel.label})` : ''}`);
        }
      });
    }

    zip.file(filePath, lines.join('\n'));
  });

  // 7. 99 Appendices: Visual Assets & Cartography Overview
  zip.file(
    '99 Appendices/01 Images/README.md',
    `# Visual Assets & Illustrations\n\nThis directory holds the complete media collection for **${project.name}**.\nAll files are mirrored in \`images/\` for native Obsidian embeds (\`![[image.webp]]\`).`
  );

  // 8. 99 Appendices: Stories & Chapters
  if (project.stories && project.stories.length > 0) {
    project.stories.forEach((story) => {
      story.chapters.forEach((ch, chIdx) => {
        const chTitle = `${String(chIdx + 1).padStart(2, '0')} - ${sanitizeFilename(ch.title)}`;
        const chContent = [
          `# ${ch.title}`,
          `*Chapter in "${story.title}"*\n`,
          ch.synopsis ? `> ${ch.synopsis}\n` : '',
        ];

        ch.scenes.forEach((sc, scIdx) => {
          chContent.push(`## Scene ${scIdx + 1}: ${sc.title}`);
          if (sc.summary) chContent.push(`*${sc.summary}*\n`);
          chContent.push(rewriteImageLinks(sc.contentMd));
          chContent.push('\n---\n');
        });

        zip.file(
          `99 Appendices/02 Stories/${sanitizeFilename(story.title)}/${chTitle}.md`,
          chContent.join('\n')
        );
      });
    });
  }

  // 9. 99 Appendices: Maps & Cartography summary
  if (project.maps && project.maps.length > 0) {
    project.maps.forEach((m) => {
      const mapFilename = m.rasterImageUrl ? srcToVaultPath.get(m.rasterImageUrl) : null;
      const mapLines = [
        `# ${m.name}`,
        `**Mode**: ${m.mode} | **Scale**: ${m.totalWidthUnits} ${m.scaleUnit}\n`,
        mapFilename ? `![${m.name}](images/${mapFilename})\n` : '',
        m.summary ? `> ${m.summary}\n` : '',
        '## Cartographic Landmarks & Markers',
        ...m.markers.map((mkr) => `- **${mkr.name}** [${mkr.icon}]: (${Math.round(mkr.x)}, ${Math.round(mkr.y)})${mkr.notes ? ` — ${mkr.notes}` : ''}`),
        '',
        '## Territorial Zones',
        ...m.zones.map((z) => `- **${z.name}** (${z.color}): ${z.points.length} boundary vertices`),
        '',
        '## Known Routes & Paths',
        ...m.paths.map((p) => `- **${p.name}** (${p.style}): ${p.points.length} waypoints`),
      ];
      zip.file(`99 Appendices/03 Cartography/${sanitizeFilename(m.name)}.md`, mapLines.join('\n'));
    });
  }

  // Generate ZIP and download
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const filename = `${sanitizeFilename(project.name.toLowerCase().replace(/\s+/g, '-'))}-obsidian-vault.zip`;
  downloadBlob(zipBlob, filename);
}

/**
 * Export Entire Project to a Book-like Microsoft Word document (.docx)
 * with 12pt body text and full image incorporation (illustrations + atlas maps)
 */
export async function exportProjectToBookWord(project: Project) {
  const children: (Paragraph | Table)[] = [];
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];

  // 1. COVER PAGE
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: project.name.toUpperCase(),
          bold: true,
          size: 64, // 32pt
          color: '0f172a',
        }),
      ],
      spacing: { before: 2000, after: 200 },
    })
  );

  if (project.tagline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: project.tagline,
            italics: true,
            size: 28, // 14pt
            color: 'b45309',
          }),
        ],
        spacing: { after: 400 },
      })
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `A Comprehensive World Encyclopedia & Codex`,
          size: 24, // 12pt
          color: '475569',
        }),
      ],
      spacing: { after: 1200 },
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${project.genre}  •  ${project.worlds.length} Worlds  •  ${project.entities.length} Codex Entries`,
          bold: true,
          size: 22, // 11pt
          color: '64748b',
        }),
      ],
      spacing: { after: 2400 },
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Forged and Compiled with Worldify Studio`,
          italics: true,
          size: 20, // 10pt
          color: '94a3b8',
        }),
      ],
      pageBreakBefore: false,
    })
  );

  // Page break after cover
  children.push(new Paragraph({ pageBreakBefore: true }));

  // 2. PREFACE & OVERVIEW
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Preface & World Overview', bold: true, size: 38, color: '0f172a' })],
      spacing: { after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: project.description, size: 24, color: '334155' })],
      spacing: { after: 400 },
    })
  );

  // Worlds summary table (12pt headers & cells)
  if (project.worlds.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'Known Worlds & Planes of Existence', bold: true, size: 30 })],
        spacing: { before: 200, after: 140 },
      })
    );

    const worldRows = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            shading: { fill: '0f172a' },
            children: [new Paragraph({ children: [new TextRun({ text: 'World / Plane', bold: true, color: 'ffffff', size: 24 })] })],
          }),
          new TableCell({
            width: { size: 2000, type: WidthType.DXA },
            shading: { fill: '0f172a' },
            children: [new Paragraph({ children: [new TextRun({ text: 'Type', bold: true, color: 'ffffff', size: 24 })] })],
          }),
          new TableCell({
            width: { size: 4000, type: WidthType.DXA },
            shading: { fill: '0f172a' },
            children: [new Paragraph({ children: [new TextRun({ text: 'Physics & Planar Laws', bold: true, color: 'ffffff', size: 24 })] })],
          }),
        ],
      }),
      ...project.worlds.map(
        (w, i) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 3000, type: WidthType.DXA },
                shading: { fill: i % 2 === 0 ? 'f8fafc' : 'ffffff' },
                children: [new Paragraph({ children: [new TextRun({ text: w.name, bold: true, size: 24 })] })],
              }),
              new TableCell({
                width: { size: 2000, type: WidthType.DXA },
                shading: { fill: i % 2 === 0 ? 'f8fafc' : 'ffffff' },
                children: [new Paragraph({ children: [new TextRun({ text: w.type.toUpperCase(), size: 24 })] })],
              }),
              new TableCell({
                width: { size: 4000, type: WidthType.DXA },
                shading: { fill: i % 2 === 0 ? 'f8fafc' : 'ffffff' },
                children: [new Paragraph({ children: [new TextRun({ text: w.magicOrPhysicsRules || 'Standard Physical Laws', size: 24 })] })],
              }),
            ],
          })
      ),
    ];

    children.push(new Table({ rows: worldRows, width: { size: 9000, type: WidthType.DXA } }));
    children.push(new Paragraph({ spacing: { after: 300 } }));
  }

  // 3. ENCYCLOPEDIA CHAPTERS GROUPED BY CATEGORY
  const categoryGroups: Array<{
    key: string;
    title: string;
    description: string;
    filter: (e: Entity) => boolean;
  }> = [
    {
      key: 'cosmology',
      title: 'Book I: Cosmology & Ancient Concepts',
      description: 'The fundamental laws, planar spheres, magic systems, and cosmic origins of reality.',
      filter: (e) => e.category === 'cosmology' || e.category === 'magic_tech',
    },
    {
      key: 'history',
      title: 'Book II: Chronicles of History & Epochs',
      description: 'The turning of the great cycles, ancient wars, mythical falls, and pivotal turning points.',
      filter: (e) => e.category === 'event_lore',
    },
    {
      key: 'gazetteer',
      title: 'Book III: The Grand Gazetteer of Places',
      description: 'Citadels, continents, sovereign territories, sanctums, and uncharted waters.',
      filter: (e) => e.category === 'location',
    },
    {
      key: 'inhabitants',
      title: 'Book IV: Inhabitants, Deities & Races',
      description: 'Living souls, divine beings, archdemons, rulers, and mortal civilizations.',
      filter: (e) => e.category === 'character' || e.category === 'deity' || e.category === 'species',
    },
    {
      key: 'society',
      title: 'Book V: Factions, Faiths & Societies',
      description: 'Political factions, guilds, holy orders, covenants, and sovereign powers.',
      filter: (e) => e.category === 'faction',
    },
    {
      key: 'compendium',
      title: 'Book VI: Compendium of Relics & Phenomena',
      description: 'Legendary weapons, divine materials, arcane relics, and supernatural instruments.',
      filter: (e) => e.category === 'item',
    },
  ];

  for (const group of categoryGroups) {
    const groupEntities = project.entities.filter(group.filter);
    if (groupEntities.length === 0) continue;

    // Major Book / Section Header
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [
          new TextRun({
            text: group.title,
            bold: true,
            size: 38,
            color: '0f172a',
          }),
        ],
        spacing: { before: 400, after: 120 },
      })
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: group.description, italics: true, size: 24, color: '64748b' })],
        spacing: { after: 400 },
      })
    );

    // Each Entity
    for (const ent of groupEntities) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: ent.title,
              bold: true,
              size: 30,
              color: '1e293b',
            }),
          ],
          spacing: { before: 300, after: 80 },
        })
      );

      if (ent.subtitle) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: ent.subtitle, italics: true, size: 24, color: '64748b' })],
            spacing: { after: 120 },
          })
        );
      }

      if (ent.summary) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: ent.summary, italics: true, size: 24, color: '334155' })],
            shading: { fill: 'f8fafc' },
            border: { left: { color: 'f59e0b', space: 10, style: BorderStyle.SINGLE, size: 20 } },
            spacing: { before: 80, after: 200 },
          })
        );
      }

      // Entity attributes table (if any)
      if (ent.customProperties.length > 0) {
        const entPropRows = [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({
                width: { size: 3000, type: WidthType.DXA },
                shading: { fill: '0f172a' },
                children: [new Paragraph({ children: [new TextRun({ text: 'Property', bold: true, color: 'ffffff', size: 24 })] })],
              }),
              new TableCell({
                width: { size: 6000, type: WidthType.DXA },
                shading: { fill: '0f172a' },
                children: [new Paragraph({ children: [new TextRun({ text: 'Value', bold: true, color: 'ffffff', size: 24 })] })],
              }),
            ],
          }),
          ...ent.customProperties.map(
            (p, idx) =>
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 3000, type: WidthType.DXA },
                    shading: { fill: idx % 2 === 0 ? 'f8fafc' : 'ffffff' },
                    children: [new Paragraph({ children: [new TextRun({ text: p.label, bold: true, size: 24 })] })],
                  }),
                  new TableCell({
                    width: { size: 6000, type: WidthType.DXA },
                    shading: { fill: idx % 2 === 0 ? 'f8fafc' : 'ffffff' },
                    children: [new Paragraph({ children: [new TextRun({ text: String(p.value), size: 24 })] })],
                  }),
                ],
              })
          ),
        ];

        children.push(
          new Table({
            rows: entPropRows,
            width: { size: 9000, type: WidthType.DXA },
          })
        );
        children.push(new Paragraph({ spacing: { after: 160 } }));
      }

      // Body paragraphs (all 12pt with embedded illustrations!)
      const body = await markdownToWordParagraphs(ent.contentMd);
      children.push(...body);
      children.push(new Paragraph({ spacing: { after: 200 } }));
    }
  }

  // 4. BOOK VII: CARTOGRAPHY & ATLAS (with embedded maps!)
  if (project.maps && project.maps.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [
          new TextRun({
            text: 'Book VII: Cartography & Atlas of Known Worlds',
            bold: true,
            size: 38,
            color: '0f172a',
          }),
        ],
        spacing: { before: 400, after: 120 },
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Cartographic surveys, territorial zones, marked strongholds, and explored routes.',
            italics: true,
            size: 24,
            color: '64748b',
          }),
        ],
        spacing: { after: 400 },
      })
    );

    for (const m of project.maps) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: `Map: ${m.name}`,
              bold: true,
              size: 30,
              color: '1e293b',
            }),
          ],
          spacing: { before: 300, after: 80 },
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Scale: ${m.totalWidthUnits} ${m.scaleUnit}  •  Mode: ${m.mode.toUpperCase()}`,
              size: 22,
              bold: true,
              color: 'b45309',
            }),
          ],
          spacing: { after: 100 },
        })
      );

      if (m.summary) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: m.summary, italics: true, size: 24, color: '334155' })],
            shading: { fill: 'f8fafc' },
            border: { left: { color: 'f59e0b', space: 10, style: BorderStyle.SINGLE, size: 20 } },
            spacing: { before: 80, after: 160 },
          })
        );
      }

      // Embed Map Image
      if (m.rasterImageUrl) {
        const imgInfo = await fetchAndNormalizeImage(m.rasterImageUrl);
        if (imgInfo) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                type: 'png',
                data: imgInfo.data,
                  transformation: {
                    width: imgInfo.width,
                    height: imgInfo.height,
                  },
                }),
              ],
              spacing: { before: 200, after: 80 },
            })
          );
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `Cartographic chart for ${m.name}`,
                  italics: true,
                  size: 20,
                  color: '64748b',
                }),
              ],
              spacing: { after: 200 },
            })
          );
        }
      }

      // Landmarks & Markers list
      if (m.markers.length > 0) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: 'Key Landmarks & Points of Interest', bold: true, size: 26 })],
            spacing: { before: 180, after: 80 },
          })
        );
        m.markers.forEach((mkr) => {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              children: [
                new TextRun({ text: `${mkr.name} `, bold: true, size: 24 }),
                new TextRun({ text: `[${mkr.icon}] (${Math.round(mkr.x)}, ${Math.round(mkr.y)})`, size: 22, color: '64748b' }),
                mkr.notes ? new TextRun({ text: ` — ${mkr.notes}`, italics: true, size: 24 }) : new TextRun({ text: '' }),
              ],
            })
          );
        });
      }

      // Territorial Zones
      if (m.zones.length > 0) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: 'Territorial Borders & Zones', bold: true, size: 26 })],
            spacing: { before: 180, after: 80 },
          })
        );
        m.zones.forEach((z) => {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              children: [
                new TextRun({ text: `${z.name} `, bold: true, size: 24 }),
                new TextRun({ text: `(${z.color}, ${z.borderStyle}): ${z.points.length} boundary vertices`, size: 24 }),
              ],
            })
          );
        });
      }

      children.push(new Paragraph({ spacing: { after: 240 } }));
    }
  }

  const doc = new Document({
    styles: getWordDocumentStyles(),
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${sanitizeFilename(project.name)} — World Encyclopedia.docx`);
}

/**
 * Export Entire Project as a Book-like PDF via print window
 * with high quality layout, 11.5pt body text, and full image incorporation
 */
export async function exportProjectToBookPdf(project: Project) {
  const calendar =
    project.calendars.find((c) => c.id === project.activeCalendarId) || project.calendars[0];

  const categoryGroups = [
    { title: 'Volume I: Cosmology & Ancient Origins', filter: (e: Entity) => e.category === 'cosmology' || e.category === 'magic_tech', desc: 'Cosmic spheres, planar boundaries, and divine mechanics.' },
    { title: 'Volume II: Chronicles & Ancient History', filter: (e: Entity) => e.category === 'event_lore', desc: 'The annals of time, epochs, recorded cataclysms, and wars.' },
    { title: 'Volume III: The Gazetteer of Places', filter: (e: Entity) => e.category === 'location', desc: 'Continents, kingdoms, citadels, and geographic landmarks.' },
    { title: 'Volume IV: Inhabitants & Divine Powers', filter: (e: Entity) => e.category === 'character' || e.category === 'deity' || e.category === 'species', desc: 'Deities, notable sovereigns, heroes, and sapient peoples.' },
    { title: 'Volume V: Society, Factions & Faiths', filter: (e: Entity) => e.category === 'faction', desc: 'The great orders, empires, covenants, and guilds.' },
    { title: 'Volume VI: Relics, Artifacts & Phenomena', filter: (e: Entity) => e.category === 'item', desc: 'Arcane relics, divine materials, and legendary creations.' },
  ];

  // Render Volumes HTML asynchronously
  const volumesHtmlParts: string[] = [];
  for (const vol of categoryGroups) {
    const volEntities = project.entities.filter(vol.filter);
    if (volEntities.length === 0) continue;

    const entriesHtmlParts: string[] = [];
    for (const ent of volEntities) {
      const entHtml = await markdownToHtml(ent.contentMd);
      entriesHtmlParts.push(`
        <div class="entry-block">
          <div class="entry-title">${escapeHtml(ent.title)}</div>
          ${ent.subtitle ? `<div class="entry-subtitle">${escapeHtml(ent.subtitle)}</div>` : ''}
          ${ent.summary ? `<div class="entry-summary">${escapeHtml(ent.summary)}</div>` : ''}
          ${
            ent.customProperties.length > 0
              ? `<table>
                  <thead><tr><th>Property</th><th>Value</th></tr></thead>
                  <tbody>
                    ${ent.customProperties
                      .map(
                        (p) =>
                          `<tr><td style="font-weight:600;width:30%;">${escapeHtml(p.label)}</td><td>${escapeHtml(String(p.value))}</td></tr>`
                      )
                      .join('')}
                  </tbody>
                </table>`
              : ''
          }
          <div style="margin-top:10px;">${entHtml}</div>
        </div>
      `);
    }

    volumesHtmlParts.push(`
      <div class="section-break">
        <div class="book-volume-title">${escapeHtml(vol.title)}</div>
        <div class="book-volume-desc">${escapeHtml(vol.desc)}</div>
        ${entriesHtmlParts.join('')}
      </div>
    `);
  }

  // Render Cartography Volume
  let cartographyHtml = '';
  if (project.maps && project.maps.length > 0) {
    const mapHtmlParts: string[] = [];
    for (const m of project.maps) {
      const resolvedImg = m.rasterImageUrl
        ? (await resolveImageSrc(m.rasterImageUrl)) || m.rasterImageUrl
        : null;

      mapHtmlParts.push(`
        <div class="entry-block">
          <div class="entry-title">Map: ${escapeHtml(m.name)}</div>
          <div class="entry-subtitle">Scale: ${m.totalWidthUnits} ${escapeHtml(m.scaleUnit)} &nbsp;•&nbsp; Mode: ${escapeHtml(m.mode.toUpperCase())}</div>
          ${m.summary ? `<div class="entry-summary">${escapeHtml(m.summary)}</div>` : ''}
          ${
            resolvedImg
              ? `<div style="text-align:center; margin:18px 0;">
                  <img src="${escapeHtml(resolvedImg)}" alt="${escapeHtml(m.name)}" style="max-width:100%; max-height:480px; height:auto; border-radius:8px; border:1px solid #cbd5e1; box-shadow:0 4px 14px rgba(0,0,0,0.12); display:inline-block;" />
                  <div style="font-size:9.5pt; font-style:italic; color:#64748b; margin-top:8px;">Cartographic chart for ${escapeHtml(m.name)}</div>
                </div>`
              : ''
          }
          ${
            m.markers.length > 0
              ? `<h3>Key Cartographic Landmarks</h3>
                <ul>
                  ${m.markers.map((mkr) => `<li><strong>${escapeHtml(mkr.name)}</strong> [${escapeHtml(mkr.icon)}]: (${Math.round(mkr.x)}, ${Math.round(mkr.y)})${mkr.notes ? ` — <em>${escapeHtml(mkr.notes)}</em>` : ''}</li>`).join('')}
                </ul>`
              : ''
          }
        </div>
      `);
    }

    cartographyHtml = `
      <div class="section-break">
        <div class="book-volume-title">Volume VII: Cartography & Atlas of the Worlds</div>
        <div class="book-volume-desc">The cartographic surveys, territorial domains, marked settlements, and trade routes.</div>
        ${mapHtmlParts.join('')}
      </div>
    `;
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(project.name)} — World Encyclopedia</title>
  <style>
    @page {
      size: A4;
      margin: 22mm 18mm 22mm 18mm;
      @bottom-right {
        content: counter(page);
        font-family: Georgia, serif;
        font-size: 9pt;
        color: #94a3b8;
      }
      @top-center {
        content: "${escapeHtml(project.name)}";
        font-family: -apple-system, sans-serif;
        font-size: 8pt;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #94a3b8;
      }
    }
    body {
      font-family: 'Merriweather', Georgia, 'Times New Roman', serif;
      line-height: 1.7;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11pt;
    }
    .cover {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      min-height: 85vh;
      padding: 40px 20px;
    }
    .cover-title {
      font-size: 34pt;
      font-weight: 900;
      letter-spacing: 0.05em;
      color: #0f172a;
      text-transform: uppercase;
      margin: 0 0 16px 0;
      border-bottom: 3px double #f59e0b;
      padding-bottom: 16px;
    }
    .cover-tagline {
      font-size: 15pt;
      font-style: italic;
      color: #b45309;
      margin-bottom: 24px;
    }
    .cover-stats {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10pt;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: #64748b;
      margin-top: 40px;
    }
    .cover-footer {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 8.5pt;
      color: #94a3b8;
      margin-top: auto;
    }
    .toc {
      page-break-after: always;
      padding-top: 20px;
    }
    .toc h2 {
      font-size: 18pt;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 6px;
      margin-bottom: 16px;
    }
    .toc-item {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dotted #cbd5e1;
      padding: 4px 0;
      font-size: 10pt;
    }
    .section-break {
      page-break-before: always;
      padding-top: 24px;
    }
    .book-volume-title {
      font-size: 22pt;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 2px solid #f59e0b;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .book-volume-desc {
      font-size: 11.5pt;
      font-style: italic;
      color: #64748b;
      margin-bottom: 28px;
    }
    .entry-block {
      margin-bottom: 36px;
      break-inside: avoid;
    }
    .entry-title {
      font-size: 17pt;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 4px 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .entry-subtitle {
      font-size: 11pt;
      font-style: italic;
      color: #64748b;
      margin-bottom: 8px;
    }
    .entry-summary {
      background: #f8fafc;
      border-left: 3.5px solid #f59e0b;
      padding: 8px 14px;
      font-style: italic;
      margin: 10px 0 14px 0;
      color: #334155;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 10px;
      text-align: left;
    }
    th {
      background: #0f172a;
      color: #ffffff;
      font-family: -apple-system, sans-serif;
    }
    tr:nth-child(even) { background: #f8fafc; }
    .wikilink { color: #d97706; font-weight: 600; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- COVER -->
  <div class="cover">
    <div style="font-family:-apple-system, sans-serif; font-weight:700; font-size:10pt; letter-spacing:0.15em; color:#b45309; text-transform:uppercase; margin-bottom:12px;">Codex Universalise</div>
    <div class="cover-title">${escapeHtml(project.name)}</div>
    ${project.tagline ? `<div class="cover-tagline">${escapeHtml(project.tagline)}</div>` : ''}
    <div style="max-width:550px; font-size:11.5pt; color:#475569; margin:0 auto;">${escapeHtml(project.description)}</div>
    <div class="cover-stats">
      ${escapeHtml(project.genre)} &nbsp;•&nbsp; ${project.worlds.length} Worlds &nbsp;•&nbsp; ${project.entities.length} Codex Entries
    </div>
    <div class="cover-footer">
      Compiled with Worldify Studio &nbsp;•&nbsp; ${new Date().toLocaleDateString()}
    </div>
  </div>

  <!-- TABLE OF CONTENTS -->
  <div class="toc">
    <h2>Table of Contents</h2>
    ${project.entities
      .map(
        (ent) => `
        <div class="toc-item">
          <span><strong>${escapeHtml(ent.title)}</strong> <span style="color:#94a3b8; font-size:8.5pt;">(${escapeHtml(categoryLabel(ent.category))})</span></span>
          <span style="color:#94a3b8; font-size:9pt;">${escapeHtml(ent.summary.slice(0, 50))}...</span>
        </div>
      `
      )
      .join('')}
  </div>

  <!-- CHAPTERS & ENTRIES -->
  ${volumesHtmlParts.join('')}

  <!-- CARTOGRAPHY & ATLAS -->
  ${cartographyHtml}

  <script>
    window.onload = function() {
      var imgs = Array.from(document.images);
      var promises = imgs.map(function(img) {
        if (img.complete) return Promise.resolve();
        return new Promise(function(resolve) {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });
      Promise.all(promises).then(function() {
        setTimeout(function() { window.print(); }, 500);
      });
    };
  </script>
</body>
</html>
  `;

  openPrintWindow(htmlContent);
}

// ==========================================
// INTERNAL PARSING & CONVERSION HELPERS
// ==========================================

function openPrintWindow(html: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to open the printable document.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Markdown to HTML converter for book/page PDF rendering
 * including figures and embedded images
 */
async function markdownToHtml(md: string): Promise<string> {
  if (!md) return '';
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let inCode = false;

  for (let line of lines) {
    // Code fence
    if (line.startsWith('```')) {
      if (inCode) {
        out.push('</pre></code>');
        inCode = false;
      } else {
        out.push(
          '<pre><code style="display:block;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;font-family:monospace;font-size:9.5pt;">'
        );
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line) + '\n');
      continue;
    }

    // List close
    if (inList && !line.match(/^(\s*[-*+]|\d+\.)\s/)) {
      out.push('</ul>');
      inList = false;
    }

    // Standalone Image: ![alt](src) or Obsidian image: ![[src]]
    const imgMatch =
      line.trim().match(/^!\[(.*?)\]\((.*?)\)$/) ||
      line.trim().match(/^!\[\[(.*?)\]\]$/);

    if (imgMatch) {
      const alt = imgMatch[1] || '';
      const rawSrc = imgMatch[2] || imgMatch[1] || '';
      const resolved = (await resolveImageSrc(rawSrc)) || rawSrc;

      out.push(`
        <figure style="margin:24px 0; text-align:center;">
          <img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}" style="max-width:100%; max-height:480px; height:auto; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.12); border:1px solid #e2e8f0; display:inline-block;" />
          ${
            alt &&
            !alt.startsWith('http') &&
            !alt.startsWith('/') &&
            !alt.startsWith('asset:') &&
            !alt.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i)
              ? `<figcaption style="font-size:9.5pt; font-style:italic; color:#64748b; margin-top:8px;">${escapeHtml(alt)}</figcaption>`
              : ''
          }
        </figure>
      `);
      continue;
    }

    // Headings
    if (line.startsWith('#### ')) {
      out.push(`<h4>${inlineFormat(line.slice(5))}</h4>`);
    } else if (line.startsWith('### ')) {
      out.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      out.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      out.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
    } else if (line.startsWith('> ')) {
      out.push(`<blockquote>${inlineFormat(line.slice(2))}</blockquote>`);
    } else if (line.match(/^[-*+]\s+(.*)$/)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      const item = line.replace(/^[-*+]\s+/, '');
      out.push(`<li>${inlineFormat(item)}</li>`);
    } else if (line.match(/^\d+\.\s+(.*)$/)) {
      if (!inList) {
        out.push('<ol>');
        inList = true;
      }
      const item = line.replace(/^\d+\.\s+/, '');
      out.push(`<li>${inlineFormat(item)}</li>`);
    } else if (line.match(/^---+$/)) {
      out.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">');
    } else if (line.trim().length > 0) {
      out.push(`<p>${inlineFormat(line)}</p>`);
    }
  }

  if (inList) out.push('</ul>');
  if (inCode) out.push('</pre></code>');

  return out.join('\n');
}

function inlineFormat(text: string): string {
  let res = escapeHtml(text);
  // Bold
  res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  res = res.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Wikilinks
  res = res.replace(/\[\[(.*?)\]\]/g, (_, target) => {
    const parts = target.split('|');
    const label = parts[1] || parts[0];
    return `<span class="wikilink">[[${label}]]</span>`;
  });
  // Inline code
  res = res.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 5px;border-radius:4px;font-size:9.5pt;">$1</code>');
  return res;
}

/**
 * Markdown to Word Paragraphs converter
 * Strictly applies 12pt (size: 24) to all normal text, bullet items, numbered items, and blockquotes,
 * while loading and embedding images inline as ImageRun elements!
 */
async function markdownToWordParagraphs(md: string): Promise<Paragraph[]> {
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // 1. Standalone Markdown Image: ![alt](src) or Obsidian image: ![[src]]
    const imgMatch =
      line.trim().match(/^!\[(.*?)\]\((.*?)\)$/) ||
      line.trim().match(/^!\[\[(.*?)\]\]$/);

    if (imgMatch) {
      const alt = imgMatch[1] || '';
      const rawSrc = imgMatch[2] || imgMatch[1] || '';
      const imgInfo = await fetchAndNormalizeImage(rawSrc);

      if (imgInfo) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: 'png',
                data: imgInfo.data,
                transformation: {
                  width: imgInfo.width,
                  height: imgInfo.height,
                },
              }),
            ],
            spacing: { before: 200, after: 80 },
          })
        );

        if (
          alt &&
          alt.trim() &&
          !alt.startsWith('http') &&
          !alt.startsWith('/') &&
          !alt.startsWith('asset:') &&
          !alt.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i)
        ) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: alt.trim(),
                  italics: true,
                  size: 20, // 10pt caption
                  color: '64748b',
                }),
              ],
              spacing: { after: 200 },
            })
          );
        }
      } else {
        // Fallback placeholder note if image could not be loaded
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `[Image: ${alt || rawSrc}]`,
                italics: true,
                size: 20,
                color: '94a3b8',
              }),
            ],
            spacing: { before: 120, after: 120 },
          })
        );
      }
      continue;
    }

    // 2. Headings
    if (line.startsWith('#### ')) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          children: parseInlineRuns(line.slice(5), { bold: true, size: 24 }),
          spacing: { before: 180, after: 60 },
        })
      );
    } else if (line.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: parseInlineRuns(line.slice(4), { bold: true, size: 26 }),
          spacing: { before: 220, after: 80 },
        })
      );
    } else if (line.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: parseInlineRuns(line.slice(3), { bold: true, color: '0f172a', size: 30 }),
          spacing: { before: 280, after: 100 },
        })
      );
    } else if (line.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: parseInlineRuns(line.slice(2), { bold: true, color: '0f172a', size: 36 }),
          spacing: { before: 340, after: 120 },
        })
      );
    } else if (line.startsWith('> ')) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(line.slice(2), { italics: true, color: '334155', size: 24 }),
          shading: { fill: 'f8fafc' },
          border: { left: { color: 'f59e0b', space: 10, style: BorderStyle.SINGLE, size: 20 } },
          spacing: { before: 100, after: 140 },
        })
      );
    } else if (line.match(/^[-*+]\s+(.*)$/)) {
      const item = line.replace(/^[-*+]\s+/, '');
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(item, { size: 24 }),
          spacing: { after: 60 },
        })
      );
    } else if (line.match(/^\d+\.\s+(.*)$/)) {
      const item = line.replace(/^\d+\.\s+/, '');
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(item, { size: 24 }),
          spacing: { after: 60 },
        })
      );
    } else {
      // Normal paragraph (12pt / size: 24)
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(line, { size: 24 }),
          spacing: { after: 140 },
        })
      );
    }
  }

  return paragraphs;
}

/**
 * Parses inline formatting (**bold**, *italic*, [[wikilinks]], `code`)
 * guaranteeing every TextRun has size: 24 (12pt) by default.
 */
function parseInlineRuns(
  text: string,
  defaults: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}
): TextRun[] {
  const runs: TextRun[] = [];
  const baseSize = defaults.size ?? 24; // 12pt by default!
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|\[\[.*?\]\]|`.*?`)/g);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(
        new TextRun({
          text: part.slice(2, -2),
          bold: true,
          italics: defaults.italics,
          color: defaults.color || '0f172a',
          size: baseSize,
        })
      );
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(
        new TextRun({
          text: part.slice(1, -1),
          italics: true,
          bold: defaults.bold,
          color: defaults.color,
          size: baseSize,
        })
      );
    } else if (part.startsWith('[[') && part.endsWith(']]')) {
      const inside = part.slice(2, -2);
      const label = inside.split('|')[1] || inside.split('#')[0];
      runs.push(
        new TextRun({
          text: label,
          bold: true,
          color: 'b45309', // Amber wikilink
          size: baseSize,
        })
      );
    } else if (part.startsWith('`') && part.endsWith('`')) {
      runs.push(
        new TextRun({
          text: part.slice(1, -1),
          font: 'Consolas',
          color: '0369a1',
          size: Math.max(20, baseSize - 2),
        })
      );
    } else {
      runs.push(
        new TextRun({
          text: part,
          bold: defaults.bold,
          italics: defaults.italics,
          color: defaults.color,
          size: baseSize,
        })
      );
    }
  }

  return runs;
}
