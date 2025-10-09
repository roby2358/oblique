import { describe, it, expect } from '@jest/globals';
import * as UserStackMap from '../../src/core/user-stack-map.js';
import type { UserAction } from '../../src/types/index.js';

describe('UserStackMap', () => {
  const createTestAction = (actionId: string, userId: string): UserAction => ({
    actionId,
    userId,
    action: 'test_action',
    timestamp: new Date(),
  });

  describe('createUserStackMap', () => {
    it('should create an empty user stack map', () => {
      const map = UserStackMap.createUserStackMap();
      expect(UserStackMap.getAllUserIds(map)).toHaveLength(0);
    });
  });

  describe('pushAction', () => {
    it('should push an action to user stack', () => {
      const map = UserStackMap.createUserStackMap();
      const action = createTestAction('action-1', 'user-1');
      const newMap = UserStackMap.pushAction(map, 'user-1', action);
      
      expect(UserStackMap.hasStack(newMap, 'user-1')).toBe(true);
      const stack = UserStackMap.getStack(newMap, 'user-1');
      expect(stack).toHaveLength(1);
      expect(stack[0]).toEqual(action);
    });

    it('should preserve immutability', () => {
      const map = UserStackMap.createUserStackMap();
      const action = createTestAction('action-1', 'user-1');
      const newMap = UserStackMap.pushAction(map, 'user-1', action);
      
      expect(UserStackMap.hasStack(map, 'user-1')).toBe(false);
      expect(UserStackMap.hasStack(newMap, 'user-1')).toBe(true);
    });

    it('should maintain stack order (LIFO)', () => {
      let map = UserStackMap.createUserStackMap();
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-1', 'user-1'));
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-2', 'user-1'));
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-3', 'user-1'));
      
      const stack = UserStackMap.getStack(map, 'user-1');
      expect(stack.map(a => a.actionId)).toEqual(['action-1', 'action-2', 'action-3']);
    });

    it('should handle multiple users independently', () => {
      let map = UserStackMap.createUserStackMap();
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-1', 'user-1'));
      map = UserStackMap.pushAction(map, 'user-2', createTestAction('action-2', 'user-2'));
      
      expect(UserStackMap.getStack(map, 'user-1')).toHaveLength(1);
      expect(UserStackMap.getStack(map, 'user-2')).toHaveLength(1);
      expect(UserStackMap.getAllUserIds(map)).toHaveLength(2);
    });
  });

  describe('popAction', () => {
    it('should pop the most recent action', () => {
      let map = UserStackMap.createUserStackMap();
      const action1 = createTestAction('action-1', 'user-1');
      const action2 = createTestAction('action-2', 'user-1');
      
      map = UserStackMap.pushAction(map, 'user-1', action1);
      map = UserStackMap.pushAction(map, 'user-1', action2);
      
      const [popped, newMap] = UserStackMap.popAction(map, 'user-1');
      
      expect(popped).toEqual(action2);
      expect(UserStackMap.getStack(newMap, 'user-1')).toHaveLength(1);
    });

    it('should return undefined for empty stack', () => {
      const map = UserStackMap.createUserStackMap();
      const [action, newMap] = UserStackMap.popAction(map, 'user-1');
      
      expect(action).toBeUndefined();
      expect(UserStackMap.hasStack(newMap, 'user-1')).toBe(false);
    });

    it('should remove user from map when stack becomes empty', () => {
      let map = UserStackMap.createUserStackMap();
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-1', 'user-1'));
      
      const [, newMap] = UserStackMap.popAction(map, 'user-1');
      
      expect(UserStackMap.hasStack(newMap, 'user-1')).toBe(false);
      expect(UserStackMap.getAllUserIds(newMap)).toHaveLength(0);
    });
  });

  describe('peekAction', () => {
    it('should return the most recent action without removing it', () => {
      let map = UserStackMap.createUserStackMap();
      const action = createTestAction('action-1', 'user-1');
      map = UserStackMap.pushAction(map, 'user-1', action);
      
      const peeked = UserStackMap.peekAction(map, 'user-1');
      
      expect(peeked).toEqual(action);
      expect(UserStackMap.getStack(map, 'user-1')).toHaveLength(1);
    });

    it('should return undefined for empty stack', () => {
      const map = UserStackMap.createUserStackMap();
      expect(UserStackMap.peekAction(map, 'user-1')).toBeUndefined();
    });
  });

  describe('clearStack', () => {
    it('should remove all actions for a user', () => {
      let map = UserStackMap.createUserStackMap();
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-1', 'user-1'));
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-2', 'user-1'));
      
      const newMap = UserStackMap.clearStack(map, 'user-1');
      
      expect(UserStackMap.hasStack(newMap, 'user-1')).toBe(false);
    });

    it('should handle clearing nonexistent stack', () => {
      const map = UserStackMap.createUserStackMap();
      const newMap = UserStackMap.clearStack(map, 'nonexistent');
      
      expect(UserStackMap.getAllUserIds(newMap)).toHaveLength(0);
    });
  });

  describe('getStack', () => {
    it('should return user stack', () => {
      let map = UserStackMap.createUserStackMap();
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-1', 'user-1'));
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-2', 'user-1'));
      
      const stack = UserStackMap.getStack(map, 'user-1');
      expect(stack).toHaveLength(2);
    });

    it('should return empty array for nonexistent user', () => {
      const map = UserStackMap.createUserStackMap();
      expect(UserStackMap.getStack(map, 'nonexistent')).toEqual([]);
    });
  });

  describe('getAllUserIds', () => {
    it('should return all user ids with active stacks', () => {
      let map = UserStackMap.createUserStackMap();
      map = UserStackMap.pushAction(map, 'user-1', createTestAction('action-1', 'user-1'));
      map = UserStackMap.pushAction(map, 'user-2', createTestAction('action-2', 'user-2'));
      map = UserStackMap.pushAction(map, 'user-3', createTestAction('action-3', 'user-3'));
      
      const userIds = UserStackMap.getAllUserIds(map);
      expect(userIds).toHaveLength(3);
      expect(userIds.sort()).toEqual(['user-1', 'user-2', 'user-3']);
    });
  });
});

