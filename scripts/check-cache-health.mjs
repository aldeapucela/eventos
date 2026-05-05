import fs from 'node:fs/promises';
import path from 'node:path';

function countTopics(index) {
  return Object.keys(index?.topics || {}).length;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const beforePath = process.argv[2];
  const afterPath = process.argv[3];

  if (!beforePath || !afterPath) {
    throw new Error('Usage: node scripts/check-cache-health.mjs <before-index.json> <after-index.json>');
  }

  const beforeIndex = await readJson(path.resolve(beforePath));
  const afterIndex = await readJson(path.resolve(afterPath));

  const beforeCount = countTopics(beforeIndex);
  const afterCount = countTopics(afterIndex);

  console.log(`cache-topics-before=${beforeCount}`);
  console.log(`cache-topics-after=${afterCount}`);

  if (!beforeIndex || beforeCount === 0) {
    console.log('No previous cache index to compare; accepting current cache state.');
    return;
  }

  if (!afterIndex) {
    throw new Error('Current cache index is missing after build.');
  }

  if (afterCount < beforeCount) {
    throw new Error(`Cache index shrank from ${beforeCount} topics to ${afterCount}. Refusing to deploy/cache degraded state.`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
