// Configuration management module
//
// config.json is the whole configuration. There are no defaults in code: every value the
// page needs lives in that one file, and config-example.json is the template to copy.

// Hold config at module level
let config: any = {};

export const getConfig = () => config;

/**
 * Load /config.json.
 * @returns The parsed file, or an empty object when it is missing, non-OK or malformed —
 *          in which case the page loads unconfigured and says so.
 */
export const loadConfig = async (): Promise<Record<string, any>> => {
  try {
    const response = await fetch('/config.json');

    if (!response.ok) {
      console.warn(`Could not load config.json (${response.status}); the page is unconfigured`);
      return {};
    }

    return await response.json();
  } catch (error) {
    console.warn('Could not load config.json; the page is unconfigured:', error);
    return {};
  }
};

/**
 * Initialize configuration - loads config and sets the module-level variable
 */
export const initializeConfig = async (): Promise<void> => {
  config = await loadConfig();
};
