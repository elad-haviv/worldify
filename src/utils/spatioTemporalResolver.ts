import {
  Entity,
  WorldMap,
  MapZone,
  Project,
  Story,
  CustomCalendar,
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
 */
export function resolveEntityTemporalStatus(
  entity: Entity,
  tick: number,
  calendar?: CustomCalendar
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

  // Find active temporal state override
  const sortedStates = [...(entity.temporalStates || [])].sort(
    (a, b) => a.fromTick - b.fromTick
  );
  let activeState = undefined;
  for (const st of sortedStates) {
    if (tick >= st.fromTick && (st.toTick === undefined || tick <= st.toTick)) {
      activeState = st;
    }
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
  };
}

/**
 * Resolves all Entity positions on a specific WorldMap at a given AbsoluteTick.
 */
export function resolveEntityMapPositionsAtTick(
  project: Project,
  map: WorldMap,
  tick: number
): ResolvedEntityPosition[] {
  const calendar = project.calendars.find((c) => c.id === project.activeCalendarId);
  const results: ResolvedEntityPosition[] = [];

  for (const entity of project.entities) {
    const mapKeyframes = (entity.spatialKeyframes || [])
      .filter((kf) => kf.mapId === map.id)
      .sort((a, b) => a.tick - b.tick);

    if (mapKeyframes.length === 0) continue;

    const { lifecycleState, ageYears, activeTitle } = resolveEntityTemporalStatus(
      entity,
      tick,
      calendar
    );

    // If entity is not yet born/created at this tick, don't show on map unless user wants ghosts
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

    // If tick is before even the first keyframe and entity has a start tick after tick, skip
    if (tick < mapKeyframes[0].tick && entity.lifecycleStartTick === undefined) {
      // Still show at first keyframe if within reasonable window, or skip if strictly future
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
      // Check if there is a next keyframe we should smoothly interpolate toward if they are close
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

  // Track last scene appearance of each entity to check travel speed and time ordering
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

      // 1. Check birth/creation tick
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

      // 2. Check death/destruction tick
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

      // 3. Check travel distance & speed from previous scene
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
