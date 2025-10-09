// User action stacks tracker
import type { UserAction, UserId } from '../types/index.js';

export interface UserStackMap {
  readonly stacks: ReadonlyMap<UserId, ReadonlyArray<UserAction>>;
}

export const createUserStackMap = (): UserStackMap => ({
  stacks: new Map(),
});

export const pushAction = (map: UserStackMap, userId: UserId, action: UserAction): UserStackMap => {
  const currentStack = map.stacks.get(userId) || [];
  const newStacks = new Map(map.stacks);
  newStacks.set(userId, [...currentStack, action]);
  return { stacks: newStacks };
};

export const popAction = (map: UserStackMap, userId: UserId): [UserAction | undefined, UserStackMap] => {
  const currentStack = map.stacks.get(userId) || [];
  if (currentStack.length === 0) {
    return [undefined, map];
  }
  
  const newStack = currentStack.slice(0, -1);
  const popped = currentStack[currentStack.length - 1];
  const newStacks = new Map(map.stacks);
  
  if (newStack.length === 0) {
    newStacks.delete(userId);
  } else {
    newStacks.set(userId, newStack);
  }
  
  return [popped, { stacks: newStacks }];
};

export const peekAction = (map: UserStackMap, userId: UserId): UserAction | undefined => {
  const stack = map.stacks.get(userId);
  if (!stack || stack.length === 0) {
    return undefined;
  }
  return stack[stack.length - 1];
};

export const getStack = (map: UserStackMap, userId: UserId): ReadonlyArray<UserAction> => {
  return map.stacks.get(userId) || [];
};

export const hasStack = (map: UserStackMap, userId: UserId): boolean => {
  return map.stacks.has(userId) && (map.stacks.get(userId)?.length ?? 0) > 0;
};

export const clearStack = (map: UserStackMap, userId: UserId): UserStackMap => {
  const newStacks = new Map(map.stacks);
  newStacks.delete(userId);
  return { stacks: newStacks };
};

export const getAllUserIds = (map: UserStackMap): UserId[] => {
  return Array.from(map.stacks.keys());
};

