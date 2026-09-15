import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const port = 8000;

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/build.mjs', '--rebuild'], { cwd: root, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed with ${code}`))));
  });
}

function send(res, code, body, type = 'text/html; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

let devEvents = null;
let devMetrics = new Map();

async function loadDevEvents() {
  if (devEvents) return devEvents;
  const payload = JSON.parse(await fs.readFile(path.join(dist, 'site-data.json'), 'utf8'));
  devEvents = Array.isArray(payload.events) ? payload.events : [];
  const upcoming = devEvents
    .filter((event) => Date.parse(event.endsAtIso || event.startsAtIso || '') >= Date.now())
    .sort((left, right) => Date.parse(left.startsAtIso || '') - Date.parse(right.startsAtIso || ''));
  const sampleSaves = [41, 32, 28, 21, 17, 14, 11, 10];
  const sampleVisits = [840, 720, 610, 450, 390, 280, 210, 160];
  upcoming.forEach((event, index) => {
    devMetrics.set(String(event.id), {
      id: String(event.id),
      saveCount: sampleSaves[index] || (index % 17 === 0 ? 2 : 0),
      visitCount: sampleVisits[index] || (index % 11 === 0 ? 12 : 0)
    });
  });
  return devEvents;
}

async function handleDevMetrics(req, res) {
  const events = await loadDevEvents();
  if (req.method === 'GET') {
    const activities = [...devMetrics.values()];
    const visitRankIds = [...activities]
      .sort((left, right) => right.visitCount - left.visitCount || right.saveCount - left.saveCount)
      .map((activity) => String(activity.id));
    send(res, 200, JSON.stringify({
      ok: true,
      activities: activities.map((activity) => ({ id: activity.id, saveCount: activity.saveCount })),
      visitRankIds,
      generatedAt: new Date().toISOString()
    }), 'application/json; charset=utf-8');
    return;
  }
  if (req.method !== 'POST') {
    send(res, 405, JSON.stringify({ ok: false, error: 'method_not_allowed' }), 'application/json; charset=utf-8');
    return;
  }

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) {
      send(res, 413, JSON.stringify({ ok: false, error: 'payload_too_large' }), 'application/json; charset=utf-8');
      return;
    }
  }
  let id = '';
  try {
    id = String(JSON.parse(body)?.id || '');
  } catch {}
  if (!/^\d{1,12}$/.test(id) || !events.some((event) => String(event.id) === id)) {
    send(res, 400, JSON.stringify({ ok: false, error: 'invalid_event_id' }), 'application/json; charset=utf-8');
    return;
  }
  const activity = devMetrics.get(id) || { id, saveCount: 0, visitCount: 0 };
  activity.saveCount += 1;
  devMetrics.set(id, activity);
  send(res, 200, JSON.stringify({ ok: true, id, saveCount: activity.saveCount }), 'application/json; charset=utf-8');
}

const server = http.createServer(async (req, res) => {
  const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (urlPath === '/__mock_api/eventos/saves') {
    await handleDevMetrics(req, res);
    return;
  }
  let filePath = path.join(dist, urlPath === '/' ? 'index.html' : urlPath.slice(1));
  if (urlPath.endsWith('/')) filePath = path.join(dist, urlPath.slice(1), 'index.html');
  if (!path.extname(filePath)) filePath = path.join(filePath, 'index.html');

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const type = ext === '.css'
      ? 'text/css; charset=utf-8'
      : ext === '.js'
      ? 'application/javascript; charset=utf-8'
      : ext === '.json'
      ? 'application/json; charset=utf-8'
      : ext === '.svg'
      ? 'image/svg+xml'
      : ext === '.xml'
      ? 'application/xml; charset=utf-8'
      : 'text/html; charset=utf-8';
    send(res, 200, data, type);
  } catch {
    send(res, 404, 'Not found');
  }
});

await runBuild();
server.listen(port, '127.0.0.1', () => {
  console.log(`Dev server running at http://127.0.0.1:${port}`);
});
