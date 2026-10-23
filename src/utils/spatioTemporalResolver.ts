import {
  Entity,
  WorldMap,
  MapZone,
  Project,
  Story,
  CustomCalendar,
  SimBranch,
  TimelineEvent,
  BranchOverlayRecord,
  WorldRuleEntry,
} from '../types/worldify';
import { getTotalDaysPerYear, formatTickToDate } from './calendarEngine';

export interface ResolvedEntityPosition {
  entity: Entity;
  x: number;
  y: number;
  isMoving: boolean;
  progress?: number;
  pathId?: string;
  statusNote?: string;
  lifecycleState: 'unborn' | 'active' | 'ended';
  ageYears?: number;
  activeTitle: string;
  activeStatus?: string;
  trailPoints?: Array<{ x: number; y: number; tick: number; isBranch?: boolean }>;
}

export interface ContinuityIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  sceneId: string;
  sceneTitle: string;
  entityId?: string;
  entityTitle?: string;
  message: string;
  detail: string;
}

/**
 * Checks whether a record belongs to Canon (no branchId) or an active branch ancestry.
 */
export function isRecordVisibleInBranch(
  recordBranchId: string | undefined,
  allowedBranchIds?: Set<string>
): boolean {
  if (!recordBranchId) return true; // Canon is always visible
  if (!allowedBranchIds) return false;
  return allowedBranchIds.has(recordBranchId);
}

/**
 * Computes the set of ancestor branch IDs (including the target branch itself)
 * and their maximum valid tick cutoff (forkedAtTick of the child).
 */
export function getBranchAncestryCutoffs(
  branchId: string | null,
  allBranches: SimBranch[]
): Map<string, number> {
  const cutoffs = new Map<string, number>();
  if (!branchId) return cutoffs;

  const byId = new Map(allBranches.map((b) => [b.id, b]));
  let current = byId.get(branchId);
  let childForkTick = Infinity;

  while (current) {
    cutoffs.set(current.id, childForkTick);
    childForkTick = current.forkedAtTick;
    current = current.parentBranchId ? byId.get(current.parentBranchId) : undefined;
  }

  return cutoffs;
}

/**
 * Constructs a composite Project view for a specific SimBranch by layering
 * the branch's (and its ancestors') events, temporal states, spatial keyframes,
 * relations, and zone snapshots on top of Canon.
 */
export function buildBranchWorldView(
  project: Project,
  activeBranch: SimBranch | null,
  allBranches: SimBranch[],
  branchEvents: TimelineEvent[],
  branchOverlays: BranchOverlayRecord[]
): Project {
  if (!activeBranch) return project;

  const cutoffs = getBranchAncestryCutoffs(activeBranch.id, allBranches);

  const isOverlayActive = (branchId: string | undefined, tick: number) => {
    if (!branchId) return true;
    const maxTick = cutoffs.get(branchId);
    return maxTick !== undefined && tick <= maxTick;
  };

  const validOverlays = branchOverlays.filter((o) => isOverlayActive(o.branchId, o.tick));

  // Layer entity temporalStates and spatialKeyframes
  const entities = project.entities.map((ent) => {
    const extraStates = validOverlays
      .filter((o) => o.kind === 'temporal_state' && o.entityId === ent.id && o.temporalState)
      .map((o) => ({ ...o.temporalState!, branchId: o.branchId }));
    const extraKeyframes = validOverlays
      .filter((o) => o.kind === 'spatial_keyframe' && o.entityId === ent.id && o.spatialKeyframe)
      .map((o) => ({ ...o.spatialKeyframe!, branchId: o.branchId }));

    // Check if an overlay marked the entity as deceased in this branch
    const deathState = extraStates.find(
      (s) =>
        s.status &&
        (s.status.toLowerCase().includes('dead') ||
          s.status.toLowerCase().includes('deceased') ||
          s.status.toLowerCase().includes('killed') ||
          s.status.toLowerCase().includes('fallen') ||
          s.status.includes('מת') ||
          s.status.includes('נהרג') ||
          s.status.includes('נפל'))
    );

    return {
      ...ent,
      lifecycleEndTick:
        deathState && (ent.lifecycleEndTick === undefined || deathState.fromTick < ent.lifecycleEndTick)
          ? deathState.fromTick
          : ent.lifecycleEndTick,
      temporalStates: [...(ent.temporalStates || []).filter((s) => !s.branchId), ...extraStates],
      spatialKeyframes: [...(ent.spatialKeyframes || []).filter((k) => !k.branchId), ...extraKeyframes],
    };
  });

  // Layer relations
  const extraRelations = validOverlays
    .filter((o) => o.kind === 'relation' && o.relation)
    .map((o) => ({ ...o.relation!, branchId: o.branchId }));

  // Layer events
  const activeBranchEvents = branchEvents.filter((ev) =>
    isOverlayActive(ev.branchId, ev.startTick)
  );

  // Layer map zone snapshots
  const maps = project.maps.map((m) => {
    const zoneOverlays = validOverlays.filter(
      (o) => o.kind === 'zone_snapshot' && o.mapId === m.id && o.zoneSnapshot
    );
    if (zoneOverlays.length === 0) return m;
    return {
      ...m,
      zones: m.zones.map((z) => {
        const snaps = zoneOverlays
          .filter((o) => o.zoneId === z.id && o.zoneSnapshot)
          .map((o) => o.zoneSnapshot!);
        if (snaps.length === 0) return z;
        return {
          ...z,
          temporalSnapshots: [...(z.temporalSnapshots || []), ...snaps],
        };
      }),
    };
  });

  return {
    ...project,
    currentTick: activeBranch.currentTick,
    entities,
    relations: [...project.relations.filter((r) => !r.branchId), ...extraRelations],
    timelineEvents: [
      ...project.timelineEvents.filter((e) => !e.branchId),
      ...activeBranchEvents,
    ].sort((a, b) => a.startTick - b.startTick),
    maps,
  };
}

/**
 * Interpolates a coordinate along a polyline path given t in [0, 1].
 */
export function interpolateAlongPolyline(
  points: [number, number][],
  t: number
): [number, number] {
  if (points.length === 0) return [500, 500];
  if (points.length === 1 || t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];

  // Calculate segment lengths
  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    const len = Math.hypot(dx, dy);
    segLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return points[0];

  const targetDist = t * totalLength;
  let accumulated = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (accumulated + segLen >= targetDist) {
      const localT = segLen > 0 ? (targetDist - accumulated) / segLen : 0;
      const x = points[i][0] + (points[i + 1][0] - points[i][0]) * localT;
      const y = points[i][1] + (points[i + 1][1] - points[i][1]) * localT;
      return [x, y];
    }
    accumulated += segLen;
  }

  return points[points.length - 1];
}

/**
 * Resolves an Entity's lifecycle state, age, and temporal status at a given tick.
 * Supports an optional branch filter (`allowedBranchIds`).
 */
export function resolveEntityTemporalStatus(
  entity: Entity,
  tick: number,
  calendar?: CustomCalendar,
  allowedBranchIds?: Set<string>
) {
  let lifecycleState: 'unborn' | 'active' | 'ended' = 'active';
  if (entity.lifecycleStartTick !== undefined && tick < entity.lifecycleStartTick) {
    lifecycleState = 'unborn';
  } else if (entity.lifecycleEndTick !== undefined && tick > entity.lifecycleEndTick) {
    lifecycleState = 'ended';
  }

  let ageYears: number | undefined;
  if (entity.lifecycleStartTick !== undefined && tick >= entity.lifecycleStartTick) {
    const effectiveTick =
      entity.lifecycleEndTick !== undefined ? Math.min(tick, entity.lifecycleEndTick) : tick;
    const daysPerYear = calendar ? getTotalDaysPerYear(calendar) : 360;
    ageYears = Math.floor((effectiveTick - entity.lifecycleStartTick) / daysPerYear);
  }

  // Find active temporal state override (filtering by branch visibility if provided)
  const visibleStates = (entity.temporalStates || []).filter((st) =>
    allowedBranchIds ? isRecordVisibleInBranch(st.branchId, allowedBranchIds) : true
  );
  const sortedStates = [...visibleStates].sort((a, b) => a.fromTick - b.fromTick);
  let activeState = undefined;
  for (const st of sortedStates) {
    if (tick >= st.fromTick && (st.toTick === undefined || tick <= st.toTick)) {
      activeState = st;
    }
  }

  // Check if activeState marks death
  if (
    activeState?.status &&
    (activeState.status.toLowerCase().includes('dead') ||
      activeState.status.toLowerCase().includes('deceased') ||
      activeState.status.toLowerCase().includes('killed') ||
      activeState.status.toLowerCase().includes('fallen') ||
      activeState.status.includes('מת') ||
      activeState.status.includes('נהרג'))
  ) {
    lifecycleState = 'ended';
  }

  return {
    lifecycleState,
    ageYears,
    activeTitle: activeState?.titleOverride || entity.title,
    activeStatus:
      activeState?.status ||
      (lifecycleState === 'unborn'
        ? 'Not Yet Born / Created'
        : lifecycleState === 'ended'
          ? 'Deceased / Destroyed'
          : 'Active'),
    activeNotes: activeState?.notes,
    activeAllegianceId: activeState?.allegianceEntityId,
  };
}

/**
 * Resolves all Entity positions on a specific WorldMap at a given AbsoluteTick.
 * Also computes recent movement trail points (`trailPoints`) for Living World visualization.
 */
export function resolveEntityMapPositionsAtTick(
  project: Project,
  map: WorldMap,
  tick: number,
  allowedBranchIds?: Set<string>
): ResolvedEntityPosition[] {
  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId);
  const results: ResolvedEntityPosition[] = [];

  for (const entity of project.entities) {
    const mapKeyframes = (entity.spatialKeyframes || [])
      .filter(
        (kf) =>
          kf.mapId === map.id &&
          (allowedBranchIds ? isRecordVisibleInBranch(kf.branchId, allowedBranchIds) : true)
      )
      .sort((a, b) => a.tick - b.tick);

    if (mapKeyframes.length === 0) continue;

    const { lifecycleState, ageYears, activeTitle, activeStatus } = resolveEntityTemporalStatus(
      entity,
      tick,
      calendar,
      allowedBranchIds
    );

    // If entity is not yet born/created at this tick, don't show on map
    if (lifecycleState === 'unborn') continue;

    // Find the active keyframe or interpolate between keyframes
    let chosenKf = mapKeyframes[0];
    for (const kf of mapKeyframes) {
      if (kf.tick <= tick) {
        chosenKf = kf;
      } else {
        break;
      }
    }

    let x = chosenKf.x;
    let y = chosenKf.y;
    let isMoving = false;
    let progress = 0;

    if (chosenKf.endTick !== undefined && chosenKf.endTick > chosenKf.tick) {
      if (tick >= chosenKf.tick && tick <= chosenKf.endTick) {
        isMoving = true;
        progress = (tick - chosenKf.tick) / (chosenKf.endTick - chosenKf.tick);
        if (chosenKf.pathId) {
          const pathObj = map.paths.find((p) => p.id === chosenKf.pathId);
          if (pathObj && pathObj.points.length >= 2) {
            [x, y] = interpolateAlongPolyline(pathObj.points, progress);
          } else if (chosenKf.endX !== undefined && chosenKf.endY !== undefined) {
            x = chosenKf.x + (chosenKf.endX - chosenKf.x) * progress;
            y = chosenKf.y + (chosenKf.endY - chosenKf.y) * progress;
          }
        } else if (chosenKf.endX !== undefined && chosenKf.endY !== undefined) {
          x = chosenKf.x + (chosenKf.endX - chosenKf.x) * progress;
          y = chosenKf.y + (chosenKf.endY - chosenKf.y) * progress;
        }
      } else if (tick > chosenKf.endTick) {
        if (chosenKf.pathId) {
          const pathObj = map.paths.find((p) => p.id === chosenKf.pathId);
          if (pathObj && pathObj.points.length >= 2) {
            [x, y] = pathObj.points[pathObj.points.length - 1];
          } else if (chosenKf.endX !== undefined && chosenKf.endY !== undefined) {
            x = chosenKf.endX;
            y = chosenKf.endY;
          }
        } else if (chosenKf.endX !== undefined && chosenKf.endY !== undefined) {
          x = chosenKf.endX;
          y = chosenKf.endY;
        }
      }
    } else {
      const idx = mapKeyframes.indexOf(chosenKf);
      if (idx >= 0 && idx < mapKeyframes.length - 1) {
        const nextKf = mapKeyframes[idx + 1];
        if (chosenKf.pathId && tick > chosenKf.tick && tick < nextKf.tick) {
          isMoving = true;
          progress = (tick - chosenKf.tick) / (nextKf.tick - chosenKf.tick);
          const pathObj = map.paths.find((p) => p.id === chosenKf.pathId);
          if (pathObj && pathObj.points.length >= 2) {
            [x, y] = interpolateAlongPolyline(pathObj.points, progress);
          }
        }
      }
    }

    // Build trail points up to current tick (up to last 6 keyframes)
    const pastKeyframes = mapKeyframes.filter((kf) => kf.tick <= tick).slice(-6);
    const trailPoints = pastKeyframes.map((kf) => ({
      x: kf.x,
      y: kf.y,
      tick: kf.tick,
      isBranch: Boolean(kf.branchId),
    }));
    if (trailPoints.length > 0) {
      const last = trailPoints[trailPoints.length - 1];
      if (Math.hypot(last.x - x, last.y - y) > 2) {
        trailPoints.push({ x, y, tick, isBranch: Boolean(chosenKf.branchId) });
      }
    }

    results.push({
      entity,
      x,
      y,
      isMoving,
      progress,
      pathId: chosenKf.pathId,
      statusNote: chosenKf.statusNote,
      lifecycleState,
      ageYears,
      activeTitle,
      activeStatus,
      trailPoints,
    });
  }

  return results;
}

/**
 * Resolves the active polygon vertices and label of a MapZone at a given tick.
 */
export function resolveZoneAtTick(
  zone: MapZone,
  tick: number
): { active: boolean; points: [number, number][]; name: string } {
  if (zone.validFromTick !== undefined && tick < zone.validFromTick) {
    return { active: false, points: zone.points, name: zone.name };
  }
  if (zone.validToTick !== undefined && tick > zone.validToTick) {
    return { active: false, points: zone.points, name: zone.name };
  }

  let points = zone.points;
  let name = zone.name;

  if (zone.temporalSnapshots && zone.temporalSnapshots.length > 0) {
    const sorted = [...zone.temporalSnapshots].sort((a, b) => a.fromTick - b.fromTick);
    for (const snap of sorted) {
      if (tick >= snap.fromTick && (snap.toTick === undefined || tick <= snap.toTick)) {
        points = snap.points;
        if (snap.labelOverride) name = snap.labelOverride;
      }
    }
  }

  return { active: true, points, name };
}

/**
 * Audits a Story across the project's entities, calendar, and maps to detect
 * temporal anachronisms and impossible spatial travel speeds.
 */
export function auditStoryContinuity(project: Project, story: Story): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId);

  const allScenes = story.chapters
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((ch) => ch.scenes.slice().sort((a, b) => a.order - b.order));

  const lastAppearance = new Map<
    string,
    { sceneTitle: string; tick: number; mapId?: string; x?: number; y?: number }
  >();

  for (const scene of allScenes) {
    const involvedIds = new Set<string>(scene.participatingEntityIds);
    if (scene.povEntityId) involvedIds.add(scene.povEntityId);

    for (const entityId of involvedIds) {
      const entity = project.entities.find((e) => e.id === entityId);
      if (!entity) continue;

      if (entity.lifecycleStartTick !== undefined && scene.startTick < entity.lifecycleStartTick) {
        const birthDate = calendar
          ? formatTickToDate(calendar, entity.lifecycleStartTick).displayShort
          : `Tick ${entity.lifecycleStartTick}`;
        const sceneDate = calendar
          ? formatTickToDate(calendar, scene.startTick).displayShort
          : `Tick ${scene.startTick}`;
        issues.push({
          id: `unborn-${scene.id}-${entity.id}`,
          severity: 'error',
          sceneId: scene.id,
          sceneTitle: scene.title,
          entityId: entity.id,
          entityTitle: entity.title,
          message: `${entity.title} does not exist yet at this scene's timestamp.`,
          detail: `Scene takes place on ${sceneDate}, but ${entity.title} is recorded as born/created on ${birthDate}.`,
        });
      }

      if (entity.lifecycleEndTick !== undefined && scene.startTick > entity.lifecycleEndTick) {
        const deathDate = calendar
          ? formatTickToDate(calendar, entity.lifecycleEndTick).displayShort
          : `Tick ${entity.lifecycleEndTick}`;
        const sceneDate = calendar
          ? formatTickToDate(calendar, scene.startTick).displayShort
          : `Tick ${scene.startTick}`;
        issues.push({
          id: `deceased-${scene.id}-${entity.id}`,
          severity: 'error',
          sceneId: scene.id,
          sceneTitle: scene.title,
          entityId: entity.id,
          entityTitle: entity.title,
          message: `${entity.title} is already deceased/destroyed before this scene.`,
          detail: `Scene takes place on ${sceneDate}, after ${entity.title}'s recorded end on ${deathDate}.`,
        });
      }

      const prev = lastAppearance.get(entity.id);
      if (
        prev &&
        prev.mapId &&
        scene.mapId &&
        prev.mapId === scene.mapId &&
        prev.x !== undefined &&
        prev.y !== undefined &&
        scene.locationX !== undefined &&
        scene.locationY !== undefined
      ) {
        const map = project.maps.find((m) => m.id === scene.mapId);
        if (map) {
          const distNormalized = Math.hypot(scene.locationX - prev.x, scene.locationY - prev.y);
          const distanceUnits = (distNormalized / 1000) * map.totalWidthUnits;
          const elapsedDays = Math.max(0.1, Math.abs(scene.startTick - prev.tick));
          const speedPerDay = distanceUnits / elapsedDays;

          if (distanceUnits > 100 && speedPerDay > 85) {
            issues.push({
              id: `travel-${scene.id}-${entity.id}`,
              severity: 'warning',
              sceneId: scene.id,
              sceneTitle: scene.title,
              entityId: entity.id,
              entityTitle: entity.title,
              message: `Fast travel alert for ${entity.title} (${Math.round(distanceUnits)} ${map.scaleUnit} in ${Math.round(elapsedDays)}d).`,
              detail: `Between "${prev.sceneTitle}" and "${scene.title}", ${entity.title} travels ~${Math.round(distanceUnits)} ${map.scaleUnit} (~${Math.round(speedPerDay)} ${map.scaleUnit}/day). Ensure magical transport or airship is accounted for.`,
            });
          }
        }
      }

      lastAppearance.set(entity.id, {
        sceneTitle: scene.title,
        tick: scene.endTick ?? scene.startTick,
        mapId: scene.mapId,
        x: scene.locationX,
        y: scene.locationY,
      });
    }
  }

  return issues;
}

/**
 * Audits simulation branch events against entity mortality, spatial travel limits,
 * simultaneous conflicting locations, and hard WorldRuleEntry constraints.
 */
export function auditBranchEventsContinuity(
  projectView: Project,
  candidateEvents: TimelineEvent[],
  worldRules: WorldRuleEntry[] = []
): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  const calendar = projectView.calendars.find((c) => c.id === projectView.activeCalendarId);

  // Track entity locations within the same tick to prevent being in two places at once
  const tickEntityLocation = new Map<string, { eventTitle: string; x: number; y: number }>();

  for (const ev of candidateEvents) {
    // 1. Check hard world rules against event title & summary
    for (const rule of worldRules.filter((r) => r.enforcement === 'hard')) {
      const ruleLower = rule.ruleText.toLowerCase();
      const textLower = `${ev.title} ${ev.summary}`.toLowerCase();
      // If rule defines explicit forbidden terms (e.g. "אסור: תחיית מתים" or "forbidden: resurrection")
      const forbiddenMatch = ruleLower.match(/(?:אסור|forbidden|never|לעולם לא)[:\s]+([^.;,\n]+)/i);
      if (forbiddenMatch) {
        const keyword = forbiddenMatch[1].trim().toLowerCase();
        if (keyword.length >= 3 && textLower.includes(keyword)) {
          issues.push({
            id: `rule-${ev.id}-${rule.id}`,
            severity: 'error',
            sceneId: ev.id,
            sceneTitle: ev.title,
            message: `Hard world-law violation (${rule.title})`,
            detail: `The event "${ev.title}" violates the hard law: "${rule.ruleText}".`,
          });
        }
      }
    }

    for (const entityId of ev.linkedEntityIds) {
      const entity = projectView.entities.find((e) => e.id === entityId);
      if (!entity) continue;

      const statusAtStart = resolveEntityTemporalStatus(entity, ev.startTick - 0.01, calendar);

      // 2. Dead entities cannot act or speak (unless the event itself is a memorial)
      if (statusAtStart.lifecycleState === 'ended' && ev.category !== 'birth_death') {
        const spoke = ev.dialogues?.some((d) => d.speakerId === entity.id);
        issues.push({
          id: `sim-dead-${ev.id}-${entity.id}`,
          severity: 'error',
          sceneId: ev.id,
          sceneTitle: ev.title,
          entityId: entity.id,
          entityTitle: entity.title,
          message: `A deceased character (${entity.title}) acts or speaks in the event.`,
          detail: `${entity.title} is already dead at tick ${ev.startTick}${spoke ? ' (appears in dialogue)' : ''}. The dead do not speak or act.`,
        });
      }

      // 3. Unborn entities cannot act
      if (statusAtStart.lifecycleState === 'unborn' && ev.category !== 'birth_death') {
        issues.push({
          id: `sim-unborn-${ev.id}-${entity.id}`,
          severity: 'error',
          sceneId: ev.id,
          sceneTitle: ev.title,
          entityId: entity.id,
          entityTitle: entity.title,
          message: `${entity.title} is not yet born/created at tick ${ev.startTick}.`,
          detail: `The canonical birth/creation date is tick ${entity.lifecycleStartTick}.`,
        });
      }

      // 4. Simultaneous two-places-at-once check & travel speed check
      if (ev.mapX !== undefined && ev.mapY !== undefined) {
        const locKey = `${entity.id}:${ev.startTick}`;
        const existingLoc = tickEntityLocation.get(locKey);
        if (existingLoc && Math.hypot(existingLoc.x - ev.mapX, existingLoc.y - ev.mapY) > 120) {
          issues.push({
            id: `sim-dual-loc-${ev.id}-${entity.id}`,
            severity: 'error',
            sceneId: ev.id,
            sceneTitle: ev.title,
            entityId: entity.id,
            entityTitle: entity.title,
            message: `${entity.title} is in two distant places at the same time.`,
            detail: `Appears both in "${existingLoc.eventTitle}" and in "${ev.title}" at the same tick.`,
          });
        } else {
          tickEntityLocation.set(locKey, { eventTitle: ev.title, x: ev.mapX, y: ev.mapY });
        }

        // Check travel speed from latest keyframe
        const prevKf = (entity.spatialKeyframes || [])
          .filter((k) => k.tick < ev.startTick && (!ev.mapId || k.mapId === ev.mapId))
          .sort((a, b) => b.tick - a.tick)[0];
        if (prevKf) {
          const map = projectView.maps.find((m) => m.id === prevKf.mapId);
          if (map) {
            const distNorm = Math.hypot(ev.mapX - prevKf.x, ev.mapY - prevKf.y);
            const distUnits = (distNorm / 1000) * map.totalWidthUnits;
            const days = Math.max(1, ev.startTick - prevKf.tick);
            const speed = distUnits / days;
            if (distUnits > 150 && speed > 100) {
              issues.push({
                id: `sim-speed-${ev.id}-${entity.id}`,
                severity: 'warning',
                sceneId: ev.id,
                sceneTitle: ev.title,
                entityId: entity.id,
                entityTitle: entity.title,
                message: `Excessive travel speed for ${entity.title} (${Math.round(distUnits)} ${map.scaleUnit} in ${days} days).`,
                detail: `An explanation or a location fix is required (e.g. a magic portal or shorter distance).`,
              });
            }
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Checks if merging a branch TimelineEvent into Canon contradicts any existing
 * canonical TimelineEvents, StoryScenes, or Entity lifecycle bounds.
 */
export function detectCanonContradictionsForMerge(
  canonProject: Project,
  branchEvent: TimelineEvent
): string[] {
  const contradictions: string[] = [];
  const calendar = canonProject.calendars.find((c) => c.id === canonProject.activeCalendarId);

  // Check if this event kills an entity that appears alive in later canonical events or stories
  const fatalEffects = (branchEvent.effects || []).filter(
    (ef) =>
      ef.type === 'update_status' &&
      ef.status &&
      (ef.status.toLowerCase().includes('dead') ||
        ef.status.toLowerCase().includes('deceased') ||
        ef.status.toLowerCase().includes('killed') ||
        ef.status.toLowerCase().includes('fallen') ||
        ef.status.includes('מת') ||
        ef.status.includes('נהרג'))
  );

  for (const eff of fatalEffects) {
    if (!eff.entityId) continue;
    const ent = canonProject.entities.find((e) => e.id === eff.entityId);
    if (!ent) continue;

    // 1. Canonical death tick mismatch
    if (
      ent.lifecycleEndTick !== undefined &&
      Math.abs(ent.lifecycleEndTick - branchEvent.startTick) > 5
    ) {
      const canonDeath = calendar
        ? formatTickToDate(calendar, ent.lifecycleEndTick).displayShort
        : `Tick ${ent.lifecycleEndTick}`;
      contradictions.push(
        `The wiki page of [[${ent.title}]] sets the canonical death/end at ${canonDeath}, while the branch event kills them at tick ${branchEvent.startTick}.`
      );
    }

    // 2. Appears in later canonical TimelineEvents
    const laterCanonEvents = canonProject.timelineEvents.filter(
      (ce) =>
        !ce.branchId &&
        ce.startTick > branchEvent.startTick &&
        ce.linkedEntityIds.includes(ent.id)
    );
    for (const lce of laterCanonEvents) {
      contradictions.push(
        `[[${ent.title}]] dies in this event, but appears in a later canonical event: "${lce.title}" (tick ${lce.startTick}).`
      );
    }

    // 3. Appears in later canonical StoryScenes
    for (const story of canonProject.stories) {
      for (const ch of story.chapters) {
        for (const sc of ch.scenes) {
          if (
            sc.startTick > branchEvent.startTick &&
            (sc.participatingEntityIds.includes(ent.id) || sc.povEntityId === ent.id)
          ) {
            contradictions.push(
              `[[${ent.title}]] dies in this event, but participates in a later canonical scene: "${sc.title}" in the story "${story.title}" (tick ${sc.startTick}).`
            );
          }
        }
      }
    }
  }

  // Check if any linked entity is not yet born or already dead in Canon at branchEvent.startTick
  for (const entityId of branchEvent.linkedEntityIds) {
    const ent = canonProject.entities.find((e) => e.id === entityId);
    if (!ent) continue;
    if (ent.lifecycleEndTick !== undefined && branchEvent.startTick > ent.lifecycleEndTick) {
      contradictions.push(
        `[[${ent.title}]] is already dead in canon (tick ${ent.lifecycleEndTick}) before the event's time (${branchEvent.startTick}).`
      );
    }
    if (ent.lifecycleStartTick !== undefined && branchEvent.startTick < ent.lifecycleStartTick) {
      contradictions.push(
        `[[${ent.title}]] is not yet born in canon (birth tick ${ent.lifecycleStartTick}) at the event's time (${branchEvent.startTick}).`
      );
    }
  }

  return contradictions;
}
