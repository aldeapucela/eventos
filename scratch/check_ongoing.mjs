import fs from 'node:fs/promises';
import path from 'node:path';

async function run() {
  const index = JSON.parse(await fs.readFile('cache/index.json', 'utf8'));
  const events = [];
  for (const topicId in index.topics) {
    const data = JSON.parse(await fs.readFile(`cache/data/${topicId}.json`, 'utf8'));
    events.push(data);
  }

  const now = new Date('2026-05-04T17:48:32+02:00');

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function spansMultipleDays(starts, ends) {
    return !sameDay(starts, ends);
  }

  const ongoing = events.filter((event) => {
    if (!event.startsAt || !event.endsAt) return false;

    const starts = new Date(event.startsAt);
    const ends = new Date(event.endsAt);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) return false;
    if (!spansMultipleDays(starts, ends)) return false;

    return starts <= now && ends >= now;
  }).sort((a, b) => {
    const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aEnd - bEnd;
  });

  console.log('Ongoing events found:', ongoing.length);
  ongoing.forEach((e, i) => {
    console.log(`${i}: [${e.id}] ${e.title} (Ends: ${e.endsAt})`);
  });

  const event1066 = ongoing.find(e => e.id === 1066);
  if (event1066) {
    console.log('\nEvent 1066 is in ongoing list at index:', ongoing.indexOf(event1066));
  } else {
    console.log('\nEvent 1066 NOT found in ongoing list');
    const e1066 = events.find(e => e.id === 1066);
    if (e1066) {
        const starts = new Date(e1066.startsAt);
        const ends = new Date(e1066.endsAt);
        console.log('1066 data:', {
            startsAt: e1066.startsAt,
            endsAt: e1066.endsAt,
            startsLeNow: starts <= now,
            endsGeNow: ends >= now,
            spansMultipleDays: spansMultipleDays(starts, ends)
        });
    }
  }
}

run();
