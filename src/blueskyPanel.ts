// Bluesky Panel - UI functions for handling Bluesky interactions
import type { BlueskyMessage } from './types/index.js';
import { getBlueskyClient } from './panels.js';

declare const $: any;

const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export const createHandleCheckBluesky = () => {
  return async () => {
    const blueskyClient = getBlueskyClient();
    
    if (!blueskyClient) {
      $('#bluesky-posts').html('<p class="error">Bluesky not configured. Please add credentials to config.json</p>');
      return;
    }

    $('#check-bluesky').prop('disabled', true).text('Checking...');
    $('#bluesky-posts').html('<p>Loading notifications...</p>');

    try {
      // Authenticate if not already
      if (!blueskyClient.isAuthenticated()) {
        await blueskyClient.authenticate();
      }

      // Get unread notifications only (unreadOnly = true by default)
      const notifications = await blueskyClient.getNotifications(25, true);

      // Display notifications
      if (notifications.length === 0) {
        $('#bluesky-posts').html('<p>No new notifications.</p>');
      } else {
        const postsHtml = notifications.map((notif: BlueskyMessage) => {
          const date = new Date(notif.createdAt).toLocaleString();
          return `
            <div class="bluesky-post">
              <div class="post-author">@${notif.author}</div>
              <div class="post-text">${escapeHtml(notif.text)}</div>
              <div class="post-date">${date}</div>
            </div>
          `;
        }).join('');
        $('#bluesky-posts').html(postsHtml);

        // Mark as seen if checkbox is checked
        const markAsSeen = $('#mark-as-seen').prop('checked');
        if (markAsSeen && notifications.length > 0) {
          await blueskyClient.markNotificationsAsSeen();
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      $('#bluesky-posts').html(`<p class="error">Error: ${errorMsg}</p>`);
    }

    $('#check-bluesky').prop('disabled', false).text('Check');
  };
};

