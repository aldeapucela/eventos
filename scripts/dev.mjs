import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const port = 4173;

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

const server = http.createServer(async (req, res) => {
  const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
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
