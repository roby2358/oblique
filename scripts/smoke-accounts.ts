// Live, read-only check that every account in config.json can actually be reached.
//
// The unit suite cannot answer this: it never signs in, so "both networks answer" is a claim
// no test makes (R-38, R-39). Run it after changing an account's service, appview or lexicon.
// It reads and never writes — no post, no like, nothing marked as seen.
//
//   just cc-smoke
import { readFileSync } from 'node:fs';
import { createAccounts } from '../src/bluesky-accounts.js';
import { isRepliableNotification } from '../src/bluesky-polling.js';

// Resolved against the working directory, not this file: the recipe compiles to a scratch
// directory first, which moves the file but not the root it is run from.
const config = JSON.parse(readFileSync('config.json', 'utf8'));
const accounts = createAccounts(config);

if (accounts.length === 0) {
  console.error('No account configured in config.json');
  process.exit(1);
}

let failed = 0;

for (const account of accounts) {
  console.log(`\n=== ${account.name}: @${account.handle}`);
  console.log(`    ${account.client.serviceUrl()}`);

  try {
    await account.client.ensureAuth();
    const notifications = await account.client.getNotifications(25, false);

    const reasons: { [key: string]: number } = {};
    for (const notification of notifications) {
      reasons[notification.reason] = (reasons[notification.reason] ?? 0) + 1;
    }
    console.log(`    authenticated; ${notifications.length} notifications ${JSON.stringify(reasons)}`);

    const repliable = notifications.find(isRepliableNotification);

    if (!repliable) {
      console.log('    nothing repliable to read a thread for');
      continue;
    }

    const thread = await account.client.getSinglePost(repliable.uri);
    console.log(`    thread for @${repliable.author}: ${thread.data.thread.$type}`);
    console.log(`    text: ${JSON.stringify(repliable.text.slice(0, 80))}`);
  } catch (error) {
    failed++;
    console.error(`    FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(failed === 0 ? '\nAll accounts reachable.' : `\n${failed} account(s) unreachable.`);
process.exit(failed === 0 ? 0 : 1);
