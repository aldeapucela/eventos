import fs from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_BASE_URL = 'https://eventos.aldeapucela.org';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function requiredArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument: --${key}`);
  }
  return value;
}

function toAbsoluteUrl(assetPath) {
  const normalized = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `${PUBLIC_BASE_URL}${normalized}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = requiredArg(args, 'mode');
  const output = requiredArg(args, 'output');
  const storyPath = requiredArg(args, 'story-path');
  const postPath = requiredArg(args, 'post-path');

  const payload = {
    mode,
    generatedAt: new Date().toISOString(),
    success: true,
    storyUrl: toAbsoluteUrl(storyPath),
    postUrl: toAbsoluteUrl(postPath),
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
