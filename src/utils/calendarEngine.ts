import {
  CustomCalendar,
  FormattedCalendarDate,
  CalendarEra,
  CalendarMonth,
} from '../types/worldify';

export function getTotalDaysPerYear(calendar: CustomCalendar): number {
  const sum = (calendar.months || []).reduce((acc, m) => acc + Math.max(1, m.days), 0);
  return Math.max(1, sum);
}

export function resolveEraForYear(calendar: CustomCalendar, year: number): { era: CalendarEra; eraYear: number } {
  const sortedEras = [...(calendar.eras || [])].sort((a, b) => a.startYear - b.startYear);
  if (sortedEras.length === 0) {
    const fallbackEra: CalendarEra = {
      id: 'default-era',
      name: 'Common Reckoning',
      abbreviation: 'CR',
      startYear: 0,
      color: '#f59e0b',
      description: 'Default era',
    };
    return { era: fallbackEra, eraYear: year };
  }

  for (let i = sortedEras.length - 1; i >= 0; i--) {
    const era = sortedEras[i];
    if (year >= era.startYear && (era.endYear === undefined || year <= era.endYear)) {
      const eraYear =
        era.countsBackward && era.endYear !== undefined ? era.endYear - year + 1 : year - era.startYear + 1;
      return { era, eraYear };
    }
  }

  // If year is before the earliest era
  const firstEra = sortedEras[0];
  if (year < firstEra.startYear) {
    return {
      era: firstEra,
      eraYear: year - firstEra.startYear,
    };
  }

  const lastEra = sortedEras[sortedEras.length - 1];
  return {
    era: lastEra,
    eraYear: year - lastEra.startYear + 1,
  };
}

export function getMoonPhaseDetails(phaseRatio: number): { phaseName: string; phaseIcon: string } {
  const normalized = ((phaseRatio % 1) + 1) % 1;
  if (normalized < 0.0625 || normalized >= 0.9375) {
    return { phaseName: 'New Moon', phaseIcon: '🌑' };
  } else if (normalized < 0.1875) {
    return { phaseName: 'Waxing Crescent', phaseIcon: '🌒' };
  } else if (normalized < 0.3125) {
    return { phaseName: 'First Quarter', phaseIcon: '🌓' };
  } else if (normalized < 0.4375) {
    return { phaseName: 'Waxing Gibbous', phaseIcon: '🌔' };
  } else if (normalized < 0.5625) {
    return { phaseName: 'Full Moon', phaseIcon: '🌕' };
  } else if (normalized < 0.6875) {
    return { phaseName: 'Waning Gibbous', phaseIcon: '🌖' };
  } else if (normalized < 0.8125) {
    return { phaseName: 'Last Quarter', phaseIcon: '🌗' };
  } else {
    return { phaseName: 'Waning Crescent', phaseIcon: '🌘' };
  }
}

/**
 * Converts a global absolute tick into a local tick for the given CustomCalendar,
 * taking into account its relationship epoch offset and time scaling ratio.
 */
export function globalToCalendarTick(calendar: CustomCalendar, globalTick: number): number {
  const offset = calendar.relationship?.epochTickOffset || 0;
  const scale = calendar.relationship?.timeScale || 1.0;
  return (globalTick - offset) / (scale <= 0 ? 1 : scale);
}

/**
 * Converts a local calendar tick into a global absolute tick,
 * taking into account its relationship epoch offset and time scaling ratio.
 */
export function calendarToGlobalTick(calendar: CustomCalendar, localTick: number): number {
  const offset = calendar.relationship?.epochTickOffset || 0;
  const scale = calendar.relationship?.timeScale || 1.0;
  return localTick * (scale <= 0 ? 1 : scale) + offset;
}

/**
 * Converts an AbsoluteTick (measured in days since Project Epoch 0)
 * into a rich FormattedCalendarDate according to the given CustomCalendar.
 */
export function formatTickToDate(calendar: CustomCalendar, tick: number): FormattedCalendarDate {
  const localTick = globalToCalendarTick(calendar, tick);
  const daysPerYear = getTotalDaysPerYear(calendar);
  const wholeTick = Math.floor(localTick);

  const year = Math.floor(wholeTick / daysPerYear);
  let dayOfYear = ((wholeTick % daysPerYear) + daysPerYear) % daysPerYear; // 0-indexed within year

  const months = calendar.months || [];
  let monthIndex = 0;
  let selectedMonth: CalendarMonth = months[0] || {
    id: 'm1',
    name: 'Firstmonth',
    days: 30,
    season: 'Spring',
  };

  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    if (dayOfYear < m.days) {
      monthIndex = i;
      selectedMonth = m;
      break;
    }
    dayOfYear -= m.days;
  }

  const dayOfMonth = dayOfYear + 1;
  // Calendars without a week simply show no weekday.
  const weekdays = calendar.weekdays || [];
  const weekdayIndex =
    weekdays.length > 0 ? ((wholeTick % weekdays.length) + weekdays.length) % weekdays.length : 0;
  const weekdayName = selectedMonth.intercalary ? 'Festival Day' : weekdays[weekdayIndex] ?? '';

  const { era, eraYear } = resolveEraForYear(calendar, year);

  const moonPhases = (calendar.moons || []).map((moon) => {
    const period = Math.max(1, moon.periodDays);
    const ratio = (((tick + moon.phaseOffsetDays) % period) + period) % period / period;
    const { phaseName, phaseIcon } = getMoonPhaseDetails(ratio);
    return {
      moon,
      phaseRatio: ratio,
      phaseName,
      phaseIcon,
    };
  });

  const yearLabel = eraYear >= 0 ? `Year ${eraYear} ${era.abbreviation}` : `${Math.abs(eraYear)} Before ${era.abbreviation}`;
  const displayShort = `${dayOfMonth} ${selectedMonth.name}, ${eraYear} ${era.abbreviation}`;
  const displayFull = `${weekdayName ? `${weekdayName}, ` : ''}${dayOfMonth} ${selectedMonth.name} (${selectedMonth.season}) — ${yearLabel}`;

  return {
    tick,
    calendarId: calendar.id,
    calendarName: calendar.name,
    year,
    era,
    eraYear,
    monthIndex,
    month: selectedMonth,
    dayOfMonth,
    weekdayName,
    displayShort,
    displayFull,
    moonPhases,
  };
}

/**
 * Converts a calendar Year (relative to epoch 0), Month Index (0-based), and Day of Month (1-based)
 * into a local calendar tick (without relationship offset).
 */
export function dateComponentsToLocalTick(
  calendar: CustomCalendar,
  year: number,
  monthIndex: number,
  dayOfMonth: number
): number {
  const daysPerYear = getTotalDaysPerYear(calendar);
  let daysBeforeMonth = 0;
  for (let i = 0; i < Math.min(monthIndex, calendar.months.length); i++) {
    daysBeforeMonth += calendar.months[i].days;
  }
  return year * daysPerYear + daysBeforeMonth + Math.max(0, dayOfMonth - 1);
}

/**
 * Converts a calendar Year, Month Index, and Day of Month into an Absolute Global Tick,
 * automatically factoring in this calendar's relationship epoch offset and scaling.
 */
export function dateComponentsToTick(
  calendar: CustomCalendar,
  year: number,
  monthIndex: number,
  dayOfMonth: number
): number {
  const localTick = dateComponentsToLocalTick(calendar, year, monthIndex, dayOfMonth);
  return calendarToGlobalTick(calendar, localTick);
}

/**
 * Formats a duration in ticks (days) into a readable fantasy calendar duration string.
 */
export function formatTickDuration(calendar: CustomCalendar, deltaTicks: number): string {
  const abs = Math.abs(Math.round(deltaTicks));
  const daysPerYear = getTotalDaysPerYear(calendar);
  if (abs === 0) return 'Same day';
  const years = Math.floor(abs / daysPerYear);
  const remDays = abs % daysPerYear;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
  if (remDays > 0) parts.push(`${remDays} day${remDays > 1 ? 's' : ''}`);
  return parts.join(', ');
}

/**
 * Calculates the exact epochTickOffset needed so that when `refCalendar` is at its specified date,
 * `thisCalendar` will read its specified date.
 */
export function calculateEpochOffsetFromSyncAnchor(
  refCalendar: CustomCalendar,
  thisCalendar: CustomCalendar,
  refYear: number,
  refMonthIndex: number,
  refDay: number,
  thisYear: number,
  thisMonthIndex: number,
  thisDay: number,
  timeScale = 1.0
): number {
  const refGlobalTick = dateComponentsToTick(refCalendar, refYear, refMonthIndex, refDay);
  const thisLocalTick = dateComponentsToLocalTick(thisCalendar, thisYear, thisMonthIndex, thisDay);
  return Math.round(refGlobalTick - thisLocalTick * (timeScale <= 0 ? 1 : timeScale));
}

export interface CalendarPresetTemplate {
  id: string;
  name: string;
  description: string;
  calendar: Omit<CustomCalendar, 'id' | 'projectId'>;
}

export const CALENDAR_PRESETS: CalendarPresetTemplate[] = [
  {
    id: 'solar_365',
    name: 'Standard Solar (365 Days)',
    description: '12 months with 4 classic seasons, 7 weekdays, and a solitary white moon.',
    calendar: {
      name: 'Common Solar Reckoning',
      hoursPerDay: 24,
      epochName: 'Founding of the Realm',
      weekdays: ['Sunday', 'Moonday', 'Tewday', 'Wensday', 'Thursdae', 'Fryday', 'Saterday'],
      months: [
        { id: 'm1', name: 'Frostfall', days: 31, season: 'Winter' },
        { id: 'm2', name: 'Deepwinter', days: 28, season: 'Winter' },
        { id: 'm3', name: 'Springthaw', days: 31, season: 'Spring' },
        { id: 'm4', name: 'Raincall', days: 30, season: 'Spring' },
        { id: 'm5', name: 'Bloomtide', days: 31, season: 'Spring' },
        { id: 'm6', name: 'Midyear', days: 30, season: 'Summer' },
        { id: 'm7', name: 'Suncrest', days: 31, season: 'Summer' },
        { id: 'm8', name: 'Harvestsun', days: 31, season: 'Summer' },
        { id: 'm9', name: 'Goldleaf', days: 30, season: 'Autumn' },
        { id: 'm10', name: 'Duskwind', days: 31, season: 'Autumn' },
        { id: 'm11', name: 'Shadowfall', days: 30, season: 'Autumn' },
        { id: 'm12', name: 'Yulewind', days: 31, season: 'Winter' },
      ],
      eras: [
        { id: 'e1', name: 'Age of Myth', abbreviation: 'AM', startYear: -1000, endYear: -1, countsBackward: true, color: '#6366f1', description: 'Legendary prehistoric epoch before the First King.' },
        { id: 'e2', name: 'First Age', abbreviation: '1A', startYear: 0, endYear: 999, color: '#38bdf8', description: 'Epoch of construction, kingdom building and treaty.' },
        { id: 'e3', name: 'Common Era', abbreviation: 'CE', startYear: 1000, color: '#f59e0b', description: 'Current historical reckoning across civilized lands.' },
      ],
      moons: [
        { id: 'moon-luna', name: 'The Pale Maiden', color: '#e2e8f0', periodDays: 28, phaseOffsetDays: 0 },
      ],
    },
  },
  {
    id: 'lunar_dual',
    name: 'Dual-Moon Celestial (354 Days)',
    description: '12 lunar cycles of 29-30 days tracked by twin orbiting moons.',
    calendar: {
      name: 'Twin-Sister Lunar Reckoning',
      hoursPerDay: 26,
      epochName: 'Conjunction of the Twin Moons',
      weekdays: ['Moonday', 'Starday', 'Tideday', 'Windday', 'Nightfall', 'Restday'],
      months: [
        { id: 'lm1', name: 'First Crescent', days: 30, season: 'Spring' },
        { id: 'lm2', name: 'Silverwax', days: 29, season: 'Spring' },
        { id: 'lm3', name: 'Pearlmonth', days: 30, season: 'Spring' },
        { id: 'lm4', name: 'Bright Zenith', days: 29, season: 'Summer' },
        { id: 'lm5', name: 'Crimson Glow', days: 30, season: 'Summer' },
        { id: 'lm6', name: 'High Sky', days: 29, season: 'Summer' },
        { id: 'lm7', name: 'Shadowturn', days: 30, season: 'Autumn' },
        { id: 'lm8', name: 'Gravewax', days: 29, season: 'Autumn' },
        { id: 'lm9', name: 'Duskfell', days: 30, season: 'Autumn' },
        { id: 'lm10', name: 'Darkvoid', days: 29, season: 'Winter' },
        { id: 'lm11', name: 'Deep Shade', days: 30, season: 'Winter' },
        { id: 'lm12', name: 'Nightveil', days: 29, season: 'Winter' },
      ],
      eras: [
        { id: 'le1', name: 'First Conjunction', abbreviation: 'FC', startYear: 0, color: '#a855f7', description: 'Began when the twin moons aligned in perfect solar eclipse.' },
      ],
      moons: [
        { id: 'moon-silv', name: 'Lunaria (Silver Moon)', color: '#38bdf8', periodDays: 29.5, phaseOffsetDays: 0 },
        { id: 'moon-crim', name: 'Noctis (Blood Moon)', color: '#ef4444', periodDays: 44, phaseOffsetDays: 14 },
      ],
    },
  },
  {
    id: 'elven_solstice',
    name: 'Arcane Solstice (364 Days)',
    description: '6 seasonal epochs of 60 days, interspersed with 4 intercalary solstice festivals.',
    calendar: {
      name: 'High Elven Court Calendar',
      hoursPerDay: 24,
      epochName: 'Planting of the World Tree',
      weekdays: ['Dawntide', 'Sunbreeze', 'Twilight', 'Starveil', 'Dreamday'],
      months: [
        { id: 'em1', name: 'Awakening of Sap', days: 60, season: 'Spring' },
        { id: 'ef1', name: 'Vernal Solstice Feast', days: 1, season: 'Spring', intercalary: true },
        { id: 'em2', name: 'Crown of Blossoms', days: 60, season: 'Spring' },
        { id: 'ef2', name: 'Midsummer Sunfire', days: 1, season: 'Summer', intercalary: true },
        { id: 'em3', name: 'Golden Canopy', days: 60, season: 'Summer' },
        { id: 'em4', name: 'Amber Falling', days: 60, season: 'Autumn' },
        { id: 'ef3', name: 'Autumn Equinox Vigil', days: 1, season: 'Autumn', intercalary: true },
        { id: 'em5', name: 'Rime Whisper', days: 60, season: 'Winter' },
        { id: 'ef4', name: 'Yule Solstice Rest', days: 1, season: 'Winter', intercalary: true },
        { id: 'em6', name: 'Slumber of the Deep Earth', days: 60, season: 'Winter' },
      ],
      eras: [
        { id: 'ee1', name: 'First Bloom', abbreviation: 'FB', startYear: 0, endYear: 2999, color: '#10b981', description: 'Three millennia of unmarred flourishing.' },
        { id: 'ee2', name: 'Waning Starlight', abbreviation: 'WS', startYear: 3000, color: '#f59e0b', description: 'The present bittersweet age of mortal ascendancy.' },
      ],
      moons: [
        { id: 'moon-sylvan', name: 'Silvertwig', color: '#6ee7b7', periodDays: 32, phaseOffsetDays: 4 },
      ],
    },
  },
  {
    id: 'imperial_standard',
    name: 'Imperial Standard (360 Days)',
    description: '10 standardized decimal months of 36 days each, utilized across trade alliances and empires.',
    calendar: {
      name: 'Grand Imperial Standard',
      hoursPerDay: 24,
      epochName: 'Ascension of the First Emperor',
      weekdays: ['Primday', 'Secunday', 'Tertiday', 'Quarday', 'Quintday', 'Senday'],
      months: [
        { id: 'im1', name: 'Primus', days: 36, season: 'Spring' },
        { id: 'im2', name: 'Secundus', days: 36, season: 'Spring' },
        { id: 'im3', name: 'Tertius', days: 36, season: 'Spring' },
        { id: 'im4', name: 'Quartus', days: 36, season: 'Summer' },
        { id: 'im5', name: 'Quintus', days: 36, season: 'Summer' },
        { id: 'im6', name: 'Sextus', days: 36, season: 'Summer' },
        { id: 'im7', name: 'Septimus', days: 36, season: 'Autumn' },
        { id: 'im8', name: 'Octavus', days: 36, season: 'Autumn' },
        { id: 'im9', name: 'Nonus', days: 36, season: 'Winter' },
        { id: 'im10', name: 'Decimus', days: 36, season: 'Winter' },
      ],
      eras: [
        { id: 'ie1', name: 'Imperial Reign', abbreviation: 'IR', startYear: 1, color: '#f59e0b', description: 'Year 1 was marked by the coronation of Emperor Aurelius.' },
      ],
      moons: [
        { id: 'moon-imp', name: 'Astraea', color: '#fde047', periodDays: 36, phaseOffsetDays: 0 },
      ],
    },
  },
];

