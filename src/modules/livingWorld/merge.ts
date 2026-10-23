/**
 * Living World merge rules.
 *
 * Canon = everything WITHOUT a branchId. A merged event loses its branch
 * association and becomes a canonical TimelineEvent; the branch layer keeps
 * its copy for history. Discarded branches are marked, never deleted.
 */
import { Project } from '../../types/worldify';
import { SimBranch, SimEvent, SimEffect } from './types';

export interface MergeConflict {
  eventId: string;
  eventTitle: string;
  reason: string;
}

/** Cheap contradiction scan: an event starring an entity canonically dead before the event's tick. */
export function findConflicts(project: Project, events: SimEvent[]): MergeConflict[] {
  const conflicts: MergeConflict[] = [];
  for (const ev of events) {
    for (const id of ev.entityIds) {
      const e = project.entities.find((x) => x.id === id);
      if (!e) continue;
      if (e.lifecycleEndTick !== undefined && e.lifecycleEndTick < ev.tick && !ev.effects.some((f) => f.kind === 'death' && f.entityId === e.title)) {
        conflicts.push({
          eventId: ev.id,
          eventTitle: ev.title,
          reason: `[[${e.title}]] canonically ended at tick ${e.lifecycleEndTick}, before this event's tick ${ev.tick}.`,
        });
      }
    }
  }
  return conflicts;
}

export function effectKindLabel(kind: SimEffect['kind']): string {
  const map: Record<SimEffect['kind'], string> = {
    temporal_state: 'status change',
    keyframe: 'movement',
    relation_start: 'new relation',
    relation_end: 'broken relation',
    death: 'death',
    birth: 'birth',
  };
  return map[kind];
}

export async function setBranchStatus(branch: SimBranch, status: SimBranch['status']): Promise<void> {
  const { putBranch } = await import('./simStore');
  await putBranch({ ...branch, status });
}
