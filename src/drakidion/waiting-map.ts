// WaitingMap - maps correlationId to taskId for tasks with status='waiting'
import type { WaitingMap } from './drakidion-types.js';

/**
 * Create a new WaitingMap
 */
export const createWaitingMap = (): WaitingMap => ({
  correlations: new Map(),
});

/**
 * Add a correlation (correlationId -> taskId)
 */
export const addCorrelation = (map: WaitingMap, correlationId: string, taskId: string): WaitingMap => {
  map.correlations.set(correlationId, taskId);
  return map;
};

/**
 * Get taskId by correlationId
 */
export const getTaskId = (map: WaitingMap, correlationId: string): string | undefined => {
  return map.correlations.get(correlationId);
};

/**
 * Remove a correlation
 */
export const removeCorrelation = (map: WaitingMap, correlationId: string): WaitingMap => {
  map.correlations.delete(correlationId);
  return map;
};

/**
 * Check if a correlationId exists
 */
export const hasCorrelation = (map: WaitingMap, correlationId: string): boolean => {
  return map.correlations.has(correlationId);
};

/**
 * Get all correlationIds
 */
export const getAllCorrelationIds = (map: WaitingMap): string[] => {
  return Array.from(map.correlations.keys());
};

/**
 * Get all correlations as [correlationId, taskId] pairs
 */
export const getAllCorrelations = (map: WaitingMap): [string, string][] => {
  return Array.from(map.correlations.entries());
};

/**
 * Get the number of waiting tasks
 */
export const size = (map: WaitingMap): number => {
  return map.correlations.size;
};

/**
 * Clear all correlations
 */
export const clear = (map: WaitingMap): WaitingMap => {
  map.correlations.clear();
  return map;
};

/**
 * Remove correlations by taskId (reverse lookup and remove)
 */
export const removeByTaskId = (map: WaitingMap, taskId: string): WaitingMap => {
  const correlationsToRemove: string[] = [];
  
  for (const [corrId, tId] of map.correlations.entries()) {
    if (tId === taskId) {
      correlationsToRemove.push(corrId);
    }
  }
  
  for (const corrId of correlationsToRemove) {
    map.correlations.delete(corrId);
  }
  
  return map;
};

