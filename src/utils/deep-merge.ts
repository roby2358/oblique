/**
 * Deep merge utility for objects
 * Recursively merges values objects into target, preserving nested structures
 * @param target The target object to merge into
 * @param values The values object to merge from
 * @returns The merged object
 */
export const deepMerge = (target: any, values: any): any => {
  for (const key in values) {
    if (values[key] !== null && typeof values[key] === 'object' && !Array.isArray(values[key])) {
      // Recursively merge nested objects
      target[key] = deepMerge(target[key] || {}, values[key]);
    } else {
      // Assign primitive values, arrays, or null directly
      target[key] = values[key];
    }
  }
  
  return target;
};
