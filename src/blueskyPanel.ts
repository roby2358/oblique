// Bluesky Panel - UI functions for handling Bluesky interactions
import type { BlueskyMessage } from './types/index.js';
import type { DrakidionTask } from './drakidion/drakidion-types.js';
import { getBlueskyClient, getLLMClient, getOrchestratorState, setOrchestratorState, updateStatus } from './panels.js';
import { createProcessNotificationTask } from './oblique-task-factory.js';
import * as Orchestrator from './drakidion/orchestrator.js';

declare const $: any;

const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export const createHandleCheckBluesky = () => {
  return async () => {
    const blueskyClient = getBlueskyClient();
    const llmClient = getLLMClient();
    let orchestratorState = getOrchestratorState();
    
    if (!blueskyClient) {
      $('#bluesky-posts').html('<p class="error">Bluesky not configured. Please add credentials to config.json</p>');
      return;
    }

    if (!llmClient) {
      $('#bluesky-posts').html('<p class="error">LLM not configured. Please add OpenRouter API key to config.json</p>');
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
      const notifications = await blueskyClient.getNotifications(3, true);

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

        // Create tasks for each notification
        const onTaskCreated = (task: DrakidionTask) => {
          orchestratorState = Orchestrator.addTask(orchestratorState, task);
          setOrchestratorState(orchestratorState);
          updateStatus();
        };

        const onWaitingTaskComplete = (taskId: string, result?: any, error?: any) => {
          if (error) {
            orchestratorState = Orchestrator.errorWaitingTask(orchestratorState, taskId, error);
          } else {
            orchestratorState = Orchestrator.resumeWaitingTask(orchestratorState, taskId, result);
          }
          setOrchestratorState(orchestratorState);
          updateStatus();
        };

        notifications.forEach((notif: BlueskyMessage) => {
          const task = createProcessNotificationTask(
            notif,
            llmClient,
            blueskyClient,
            onTaskCreated,
            onWaitingTaskComplete
          );
          
          orchestratorState = Orchestrator.addTask(orchestratorState, task);
        });

        // Update the global state
        setOrchestratorState(orchestratorState);
        updateStatus();

        // Show success message
        const tasksCreated = notifications.length;
        $('#bluesky-posts').append(`<p class="success">✓ Created ${tasksCreated} task${tasksCreated === 1 ? '' : 's'} to reply to notification${tasksCreated === 1 ? '' : 's'}</p>`);

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

