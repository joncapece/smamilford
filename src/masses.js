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

function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The next Masses to come, in order. Weekly Masses show their next occurrence;
// one-time Masses show until they pass. Entries with neither a weekday nor a date are left out.
export function upcomingMasses(items, timeZone, limit = 6) {
  const now = nowIn(timeZone);
  const found = [];
  for (const m of items) {
    const mins = parseTime(m.time);
    if (m.date) {
      if (m.date < now.date) continue;
      if (m.date === now.date && mins !== null && mins <= now.minutes) continue;
      found.push({ m, when: m.date, mins: mins ?? 0 });
    } else if (WEEKDAYS.includes(m.weekday)) {
      let diff = (WEEKDAYS.indexOf(m.weekday) - now.dow + 7) % 7;
      if (diff === 0 && mins !== null && mins <= now.minutes) diff = 7;
      found.push({ m, when: addDays(now.date, diff), mins: mins ?? 0 });
    }
  }
  found.sort((a, b) => a.when.localeCompare(b.when) || a.mins - b.mins);
  return found.slice(0, limit).map((x) => x.m);
}
