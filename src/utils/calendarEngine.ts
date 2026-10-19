import {
  CustomCalendar,
  FormattedCalendarDate,
  CalendarEra,
  CalendarMonth,
} from '../types/worldify';

export function getTotalDaysPerYear(calendar: CustomCalendar): number {
  const sum = calendar.months.reduce((acc, m) => acc + Math.max(1, m.days), 0);
  return Math.max(1, sum);
}

export function resolveEraForYear(calendar: CustomCalendar, year: number): { era: CalendarEra; eraYear: number } {
  const sortedEras = [...calendar.eras].sort((a, b) => a.startYear - b.startYear);
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
      const eraYear = year - era.startYear + 1;
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
 * Converts an AbsoluteTick (measured in days since Project Epoch 0)
 * into a rich FormattedCalendarDate according to the given CustomCalendar.
 */
export function formatTickToDate(calendar: CustomCalendar, tick: number): FormattedCalendarDate {
  const daysPerYear = getTotalDaysPerYear(calendar);
  const wholeTick = Math.floor(tick);

  const year = Math.floor(wholeTick / daysPerYear);
  let dayOfYear = ((wholeTick % daysPerYear) + daysPerYear) % daysPerYear; // 0-indexed within year

  let monthIndex = 0;
  let selectedMonth: CalendarMonth = calendar.months[0] || {
    id: 'm1',
    name: 'Firstmonth',
    days: 30,
    season: 'Spring',
  };

  for (let i = 0; i < calendar.months.length; i++) {
    const m = calendar.months[i];
    if (dayOfYear < m.days) {
      monthIndex = i;
      selectedMonth = m;
      break;
    }
    dayOfYear -= m.days;
  }

  const dayOfMonth = dayOfYear + 1;
  const weekdays = calendar.weekdays.length > 0 ? calendar.weekdays : ['Firstday'];
  const weekdayIndex = ((wholeTick % weekdays.length) + weekdays.length) % weekdays.length;
  const weekdayName = selectedMonth.intercalary ? 'Festival Day' : weekdays[weekdayIndex];

  const { era, eraYear } = resolveEraForYear(calendar, year);

  const moonPhases = calendar.moons.map((moon) => {
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
  const displayFull = `${weekdayName}, ${dayOfMonth} ${selectedMonth.name} (${selectedMonth.season}) — ${yearLabel}`;

  return {
    tick,
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
 * into an AbsoluteTick.
 */
export function dateComponentsToTick(
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
