// Teaching the AT Protocol SDK an application's lexicon
//
// `@atproto/api` validates every call against a registry of lexicons it ships with, and
// refuses an NSID it has never heard of before the request leaves the page. It ships
// Bluesky's. A network with its own lexicon — delve.town's `town.delve.*`, a fork of
// `app.bsky.*` under another name — has to be fetched and registered first (D-23).
import type { BskyAgent } from '@atproto/api';

/** Lexicons `@atproto/api` already carries. Nothing is fetched for these. */
const BUNDLED_PREFIXES = ['app.bsky'];

/** Where an authority publishes its lexicon, one `com.atproto.lexicon.schema` record each. */
const SCHEMA_COLLECTION = 'com.atproto.lexicon.schema';

const PLC_DIRECTORY = 'https://plc.directory';

const RECORD_PAGE = 100;

export const isBundledLexicon = (prefix: string): boolean => {
  return BUNDLED_PREFIXES.includes(prefix);
};

/**
 * The handle that publishes a lexicon, by the NSID authority rule: the segments of an NSID
 * are the authority's domain reversed, so `town.delve` is published by `delve.town`.
 */
export const lexiconAuthority = (prefix: string): string => {
  return prefix.split('.').reverse().join('.');
};

const getJson = async (url: string): Promise<any> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }

  return response.json();
};

/** The PDS that holds a DID's repository, from its DID document. */
const resolvePds = async (did: string): Promise<string> => {
  const url = did.startsWith('did:web:')
    ? `https://${did.slice('did:web:'.length)}/.well-known/did.json`
    : `${PLC_DIRECTORY}/${did}`;

  const document = await getJson(url);
  const pds = document.service?.find((entry: any) => entry.id === '#atproto_pds');

  if (!pds) {
    throw new Error(`${did} names no PDS`);
  }

  return pds.serviceEndpoint;
};

/** Every lexicon document the authority publishes, following the cursor to the end. */
const fetchSchemas = async (pds: string, did: string): Promise<any[]> => {
  const documents: any[] = [];
  let cursor: string | undefined = undefined;

  do {
    const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', SCHEMA_COLLECTION);
    url.searchParams.set('limit', String(RECORD_PAGE));
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const page = await getJson(url.toString());

    for (const record of page.records) {
      // The $type is the record's, not the lexicon's; addLexicon wants the document itself
      const { $type, ...document } = record.value;
      documents.push(document);
    }

    cursor = page.cursor;
  } while (cursor);

  return documents;
};

/**
 * Register `prefix`'s lexicon with `agent`, so calls to its NSIDs are no longer refused as
 * unknown. A bundled prefix needs nothing. Anything else is resolved from the authority the
 * NSID itself names and read from that authority's own repository, so a further network is
 * its prefix and no other configuration (R-40).
 *
 * @param agent - The agent to teach; registration is per agent, so per account
 * @param prefix - The lexicon's NSID prefix, e.g. `town.delve`
 * @param resolverService - A PDS that will resolve the authority's handle to a DID
 */
export const registerLexicon = async (
  agent: BskyAgent,
  prefix: string,
  resolverService: string
): Promise<number> => {
  if (isBundledLexicon(prefix)) {
    return 0;
  }

  const authority = lexiconAuthority(prefix);
  const resolved = await getJson(
    `${resolverService}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(authority)}`
  );
  const pds = await resolvePds(resolved.did);
  const documents = await fetchSchemas(pds, resolved.did);

  for (const document of documents) {
    (agent.api.xrpc as any).baseClient.addLexicon(document);
  }

  console.log(`Registered ${documents.length} ${prefix}.* lexicons from @${authority}`);

  return documents.length;
};
