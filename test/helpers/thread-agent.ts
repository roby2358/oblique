/**
 * An agent mock for the thread reads, shared by the client and threading suites.
 *
 * `BlueskyClient` asks the AppView through `api.xrpc.call(nsid, params)` so the NSID can
 * follow the account's lexicon. These suites are about the params and the responses, not
 * about which network it is, so the mock routes that call to a plain `getPostThread` spy and
 * every assertion is written against that.
 */
export const threadAgent = (getPostThread: any) => {
  const agent: any = {
    getPostThread,
    api: { xrpc: { call: (_nsid: string, params: any) => getPostThread(params) } },
  };
  return agent;
};
