// Bluesky accounts — the networks Oblique signs in to and polls
import { BlueskyClient } from './hooks/bluesky/bluesky-client.js';

/**
 * The config sections that each name a Bluesky account. Oblique signs in to every one that is
 * filled in and polls them all into the one task queue, so a third network is one entry here
 * plus its section in `config.json` — not a branch anywhere else (D-22).
 */
const ACCOUNT_SECTIONS = ['bluesky', 'delvetown'];

/** Everything a section must carry before a client can be built from it. */
const ACCOUNT_FIELDS = ['handle', 'password', 'service', 'appview', 'lexicon'];

export interface BlueskyAccount {
  /** The config section it came from. Labels the account in the panel and the log. */
  name: string;
  /** The bot's own handle on this network, without a leading @. */
  handle: string;
  client: BlueskyClient;
}

/**
 * Normalize a Bluesky handle by removing any leading @ symbol
 * @param handle - The handle to normalize (may be undefined, null, or empty)
 * @returns The normalized handle without leading @
 */
export const normalizeHandle = (handle: string | undefined | null): string => {
  return (handle || '').replace(/^@/, '');
};

/** A section nobody filled in. Not an account, and not a mistake either. */
const isBlank = (section: any): boolean => {
  return !section || ACCOUNT_FIELDS.every(field => !section[field]);
};

const missingFields = (section: any): string[] => {
  return ACCOUNT_FIELDS.filter(field => !section[field]);
};

/**
 * One account from one config section, or `null` when the section cannot make one. A half
 * filled in section is a typo rather than an intention, so it is named in the log instead of
 * being passed over the way a blank one is.
 */
const buildAccount = (name: string, section: any): BlueskyAccount | null => {
  const missing = missingFields(section);

  if (missing.length > 0) {
    console.warn(`Ignoring the "${name}" account: config.json is missing ${missing.join(', ')}`);
    return null;
  }

  return {
    name,
    handle: normalizeHandle(section.handle),
    client: new BlueskyClient({
      handle: section.handle,
      appPassword: section.password,
      service: section.service,
      appview: section.appview,
      lexicon: section.lexicon,
    }),
  };
};

/**
 * Every account `config` configures, in the order the sections are listed above. None of them
 * is an error: the page then says Bluesky is unconfigured and creates no task (R-38).
 */
export const createAccounts = (config: any): BlueskyAccount[] => {
  const accounts: BlueskyAccount[] = [];

  for (const name of ACCOUNT_SECTIONS) {
    const section = config[name];

    if (isBlank(section)) {
      continue;
    }

    const account = buildAccount(name, section);

    if (account) {
      accounts.push(account);
    }
  }

  return accounts;
};
