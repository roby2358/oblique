// Tests for WaitingMap
import * as WaitingMapOps from '../../src/core/waiting-map.js';

describe('WaitingMap', () => {
  describe('createWaitingMap', () => {
    it('should create an empty waiting map', () => {
      const map = WaitingMapOps.createWaitingMap();
      expect(WaitingMapOps.size(map)).toBe(0);
    });
  });
  
  describe('addCorrelation', () => {
    it('should add a correlation', () => {
      const map = WaitingMapOps.createWaitingMap();
      
      WaitingMapOps.addCorrelation(map, 'xcorr1', 'task1');
      
      expect(WaitingMapOps.hasCorrelation(map, 'xcorr1')).toBe(true);
      expect(WaitingMapOps.size(map)).toBe(1);
    });
    
    it('should replace existing correlation with same correlationId', () => {
      const map = WaitingMapOps.createWaitingMap();
      
      WaitingMapOps.addCorrelation(map, 'xcorr1', 'task1');
      WaitingMapOps.addCorrelation(map, 'xcorr1', 'task2');
      
      expect(WaitingMapOps.getTaskId(map, 'xcorr1')).toBe('task2');
      expect(WaitingMapOps.size(map)).toBe(1);
    });
  });
  
  describe('getTaskId', () => {
    it('should retrieve taskId by correlationId', () => {
      const map = WaitingMapOps.createWaitingMap();
      
      WaitingMapOps.addCorrelation(map, 'xcorr1', 'task1');
      
      expect(WaitingMapOps.getTaskId(map, 'xcorr1')).toBe('task1');
    });
    
    it('should return undefined for non-existent correlationId', () => {
      const map = WaitingMapOps.createWaitingMap();
      expect(WaitingMapOps.getTaskId(map, 'nonexistent')).toBeUndefined();
    });
  });
  
  describe('removeCorrelation', () => {
    it('should remove a correlation', () => {
      const map = WaitingMapOps.createWaitingMap();
      
      WaitingMapOps.addCorrelation(map, 'xcorr1', 'task1');
      WaitingMapOps.removeCorrelation(map, 'xcorr1');
      
      expect(WaitingMapOps.hasCorrelation(map, 'xcorr1')).toBe(false);
      expect(WaitingMapOps.size(map)).toBe(0);
    });
  });
  
  describe('getAllCorrelationIds', () => {
    it('should return all correlationIds', () => {
      const map = WaitingMapOps.createWaitingMap();
      
      WaitingMapOps.addCorrelation(map, 'xcorr1', 'task1');
      WaitingMapOps.addCorrelation(map, 'xcorr2', 'task2');
      
      const corrIds = WaitingMapOps.getAllCorrelationIds(map);
      expect(corrIds).toHaveLength(2);
      expect(corrIds).toContain('xcorr1');
      expect(corrIds).toContain('xcorr2');
    });
  });
  
  describe('getAllCorrelations', () => {
    it('should return all correlations as [corrId, taskId] pairs', () => {
      const map = WaitingMapOps.createWaitingMap();
      
      WaitingMapOps.addCorrelation(map, 'xcorr1', 'task1');
      WaitingMapOps.addCorrelation(map, 'xcorr2', 'task2');
      
      const correlations = WaitingMapOps.getAllCorrelations(map);
      expect(correlations).toHaveLength(2);
      expect(correlations).toContainEqual(['xcorr1', 'task1']);
      expect(correlations).toContainEqual(['xcorr2', 'task2']);
    });
  });
  
  describe('removeByTaskId', () => {
    it('should remove correlations by taskId', () => {
      const map = WaitingMapOps.createWaitingMap();
      
      WaitingMapOps.addCorrelation(map, 'xcorr1', 'task1');
      WaitingMapOps.addCorrelation(map, 'xcorr2', 'task1');
      WaitingMapOps.addCorrelation(map, 'xcorr3', 'task2');
      
      WaitingMapOps.removeByTaskId(map, 'task1');
      
      expect(WaitingMapOps.size(map)).toBe(1);
      expect(WaitingMapOps.hasCorrelation(map, 'xcorr1')).toBe(false);
      expect(WaitingMapOps.hasCorrelation(map, 'xcorr2')).toBe(false);
      expect(WaitingMapOps.hasCorrelation(map, 'xcorr3')).toBe(true);
    });
  });
  
  describe('clear', () => {
    it('should remove all correlations', () => {
      const map = WaitingMapOps.createWaitingMap();
      
      WaitingMapOps.addCorrelation(map, 'xcorr1', 'task1');
      WaitingMapOps.addCorrelation(map, 'xcorr2', 'task2');
      
      WaitingMapOps.clear(map);
      
      expect(WaitingMapOps.size(map)).toBe(0);
    });
  });
});

