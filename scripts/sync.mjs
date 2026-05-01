import { syncEvents } from './sync-lib.mjs';

const rebuild = process.argv.includes('--rebuild');

syncEvents({ rebuild }).catch((error) => {
  console.error(error);
  process.exit(1);
});
