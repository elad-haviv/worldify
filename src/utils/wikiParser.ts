import { Entity, EntityRelation, Project } from '../types/worldify';

export interface ParsedWikiLink {
  rawMatch: string;
  targetQuery: string; // Title or Slug
  displayText: string;
  resolvedEntity?: Entity;
}

/**
 * Extracts all [[Target]] or [[Target|Display Text]] links from Markdown content.
 */
export function extractWikiLinks(markdown: string, entities: Entity[]): ParsedWikiLink[] {
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const results: ParsedWikiLink[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    const targetQuery = match[1].trim();
    const displayText = (match[2] || match[1]).trim();
    const resolvedEntity = entities.find(
      (e) =>
        e.title.toLowerCase() === targetQuery.toLowerCase() ||
        e.slug.toLowerCase() === targetQuery.toLowerCase() ||
        e.id === targetQuery
    );
    results.push({
      rawMatch: match[0],
      targetQuery,
      displayText,
      resolvedEntity,
    });
  }

  return results;
}

/**
 * Computes the complete set of Knowledge Graph relations by merging:
 * 1. Explicit semantic relations stored on project.relations
 * 2. Auto-extracted [[WikiLink]] mentions from entity Markdown bodies
 * 3. Auto-extracted entity_ref values from Template & Custom Properties
 */
export function computeAllProjectRelations(project: Project): EntityRelation[] {
  const combined: EntityRelation[] = [...project.relations];
  const seenKeys = new Set<string>(
    project.relations.map((r) => `${r.sourceEntityId}->${r.targetEntityId}:${r.type}`)
  );
  // Track pairs that already have explicit semantic connections so generic mentions don't duplicate them
  const explicitPairs = new Set<string>(
    project.relations.map((r) => `${r.sourceEntityId}->${r.targetEntityId}`)
  );

  for (const entity of project.entities) {
    // 1. Markdown [[WikiLinks]]
    const links = extractWikiLinks(entity.contentMd, project.entities);
    for (const link of links) {
      if (link.resolvedEntity && link.resolvedEntity.id !== entity.id) {
        const pairKey = `${entity.id}->${link.resolvedEntity.id}`;
        const key = `${pairKey}:mention`;
        if (!seenKeys.has(key) && !explicitPairs.has(pairKey)) {
          seenKeys.add(key);
          combined.push({
            id: `auto-mention-${entity.id}-${link.resolvedEntity.id}`,
            projectId: project.id,
            sourceEntityId: entity.id,
            targetEntityId: link.resolvedEntity.id,
            type: 'mention',
            label: 'mentions in lore',
          });
        }
      }
    }

    // 2. Template property references
    const template = project.templates.find((t) => t.id === entity.templateId);
    if (template) {
      for (const field of template.fields) {
        if (field.type === 'entity_ref' || field.type === 'multi_entity_ref') {
          const val = entity.templateValues[field.key];
          const refIds = Array.isArray(val)
            ? val
            : typeof val === 'string' && val.trim()
              ? [val.trim()]
              : [];

          for (const ref of refIds) {
            const target = project.entities.find(
              (e) =>
                e.id === ref ||
                e.title.toLowerCase() === ref.toLowerCase() ||
                e.slug.toLowerCase() === ref.toLowerCase()
            );
            if (target && target.id !== entity.id) {
              const key = `${entity.id}->${target.id}:property_ref`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                combined.push({
                  id: `auto-prop-${entity.id}-${target.id}-${field.key}`,
                  projectId: project.id,
                  sourceEntityId: entity.id,
                  targetEntityId: target.id,
                  type: 'property_ref',
                  label: field.label.toLowerCase(),
                });
              }
            }
          }
        }
      }
    }

    // 3. Custom Properties with type === 'entity_ref'
    for (const prop of entity.customProperties || []) {
      if (prop.type === 'entity_ref' && prop.value) {
        const target = project.entities.find(
          (e) =>
            e.id === prop.value ||
            e.title.toLowerCase() === prop.value.toLowerCase() ||
            e.slug.toLowerCase() === prop.value.toLowerCase()
        );
        if (target && target.id !== entity.id) {
          const key = `${entity.id}->${target.id}:property_ref`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            combined.push({
              id: `auto-cprop-${entity.id}-${target.id}-${prop.key}`,
              projectId: project.id,
              sourceEntityId: entity.id,
              targetEntityId: target.id,
              type: 'property_ref',
              label: prop.label.toLowerCase(),
            });
          }
        }
      }
    }
  }

  return combined;
}

/**
 * Finds the shortest path of entities & relations between two entities using BFS.
 */
export function findShortestLorePath(
  relations: EntityRelation[],
  startEntityId: string,
  endEntityId: string
): { entityIds: string[]; relationIds: string[] } | null {
  if (startEntityId === endEntityId) {
    return { entityIds: [startEntityId], relationIds: [] };
  }

  const adj = new Map<string, Array<{ neighborId: string; relationId: string }>>();
  for (const rel of relations) {
    if (!adj.has(rel.sourceEntityId)) adj.set(rel.sourceEntityId, []);
    if (!adj.has(rel.targetEntityId)) adj.set(rel.targetEntityId, []);
    adj.get(rel.sourceEntityId)!.push({ neighborId: rel.targetEntityId, relationId: rel.id });
    adj.get(rel.targetEntityId)!.push({ neighborId: rel.sourceEntityId, relationId: rel.id });
  }

  const queue: Array<{ currentId: string; entityPath: string[]; relationPath: string[] }> = [
    { currentId: startEntityId, entityPath: [startEntityId], relationPath: [] },
  ];
  const visited = new Set<string>([startEntityId]);

  while (queue.length > 0) {
    const { currentId, entityPath, relationPath } = queue.shift()!;
    const neighbors = adj.get(currentId) || [];
    for (const { neighborId, relationId } of neighbors) {
      if (neighborId === endEntityId) {
        return {
          entityIds: [...entityPath, neighborId],
          relationIds: [...relationPath, relationId],
        };
      }
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({
          currentId: neighborId,
          entityPath: [...entityPath, neighborId],
          relationPath: [...relationPath, relationId],
        });
      }
    }
  }

  return null;
}
