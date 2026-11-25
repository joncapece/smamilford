// Works out which Mass times are still coming up, in the parish's time zone.

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const FALLBACK_TZ = 'America/New_York';

// Current date, weekday index (0 = Sunday) and minutes since midnight in the given time zone.
export function nowIn(timeZone = FALLBACK_TZ) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(new Date());
  } catch {
    return nowIn(FALLBACK_TZ);
  }
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday').toLowerCase().slice(0, 3);
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    dow: WEEKDAYS.findIndex((d) => d.startsWith(weekday)),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

// "9:00 AM", "5 PM", "4:30pm" -> minutes since midnight, or null if not understood.
export function parseTime(text) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m?\.?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const hours = (Number(m[1]) % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  return hours * 60 + Number(m[2] || 0);
}

// Everything the home page schedule needs: weekly Masses grouped by day (Sunday first),
// and one-time Masses that have not passed yet. Entries with neither a weekday nor a date are left out.
export function homeSchedule(items, timeZone) {
  const now = nowIn(timeZone);
  const byDay = WEEKDAYS.map(() => []);
  const special = [];
  for (const m of items) {
    const mins = parseTime(m.time) ?? 0;
    if (m.date) {
      const passed = m.date < now.date || (m.date === now.date && parseTime(m.time) !== null && parseTime(m.time) <= now.minutes);
      if (!passed) special.push({ m, when: m.date, mins });
    } else if (WEEKDAYS.includes(m.weekday)) {
      byDay[WEEKDAYS.indexOf(m.weekday)].push({ m, mins });
    }
  }
  const byTime = (a, b) => a.mins - b.mins;
  return {
    weekly: byDay
      .map((list, i) => ({ weekday: WEEKDAYS[i], masses: list.sort(byTime).map((x) => x.m) }))
      .filter((d) => d.masses.length),
    special: special.sort((a, b) => a.when.localeCompare(b.when) || byTime(a, b)).map((x) => x.m),
  };
}
