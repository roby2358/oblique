// Bluesky Panel - UI functions for handling Bluesky interactions
import { checkNotifications } from './bluesky-polling.js';

declare const $: any;


export const createHandleCheckBluesky = () => {
  return async () => {
    await checkNotifications();
  };
};

