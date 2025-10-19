/**
 * Deep merge utility for objects
 * Recursively merges config objects into defaults, preserving nested structures
 * @param defaults The default object to merge into
 * @param config The configuration object to merge from
 * @returns The merged object
 */
export const deepMerge = (defaults: any, config: any): any => {
  for (const key in config) {
    if (config[key] !== null && typeof config[key] === 'object' && !Array.isArray(config[key])) {
      // Recursively merge nested objects
      defaults[key] = deepMerge(defaults[key] || {}, config[key]);
    } else {
      // Assign primitive values, arrays, or null directly
      defaults[key] = config[key];
    }
  }
  
  return defaults;
};
