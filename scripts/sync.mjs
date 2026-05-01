import { syncEvents } from './sync-lib.mjs';

syncEvents().catch((error) => {
  console.error(error);
  process.exit(1);
});
