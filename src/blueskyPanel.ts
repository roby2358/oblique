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

// Get the ignore list from config or return empty array
const getIgnoreList = (): string[] => {
  try {
    // Try to get from config, fallback to empty array
    const config = JSON.parse(localStorage.getItem('oblique-config') || '{}');
    return config.ignoreList || [];
  } catch {
    return [];
  }
};

// Get Oblique's current handle from config
const getObliqueHandle = (): string | null => {
  try {
    const config = JSON.parse(localStorage.getItem('oblique-config') || '{}');
    return config.bluesky?.handle || null;
  } catch {
    return null;
  }
};

// Check if text contains a direct mention of the handle
const containsDirectMention = (text: string, handle: string): boolean => {
  if (!handle) return false;
  
  // Remove @ symbol if present and create case-insensitive regex
  const cleanHandle = handle.replace('@', '');
  const mentionRegex = new RegExp(`@${cleanHandle}\\b`, 'i');
  return mentionRegex.test(text);
};

// Check if a single notification should be responded to based on response rules
const shouldRespondToNotification = (
  notification: BlueskyMessage,
  ignoreList: string[],
  hasReplies: boolean = false
): boolean => {
  const obliqueHandle = getObliqueHandle();

  // Rule 1: Check if author is in ignore list
  if (ignoreList.includes(notification.author)) {
    console.log(`Skipping @${notification.author}: Author is in ignore list`);
    return false;
  }

  // Rule 2: Check if it's a direct mention OR no one has replied
  const isDirectMention = obliqueHandle ? containsDirectMention(notification.text, obliqueHandle) : false;
  
  if (!isDirectMention && hasReplies) {
    console.log(`Skipping @${notification.author}: Someone already replied to this post`);
    return false;
  }

  return true;
};

// UI helper functions
const disableCheckButton = () => {
  $('#check-bluesky').prop('disabled', true).text('Checking...');
};

const enableCheckButton = () => {
  $('#check-bluesky').prop('disabled', false).text('Check');
};

// Callback functions for task management
const createOnTaskCreated = (orchestratorState: any, setOrchestratorState: (state: any) => void, updateStatus: () => void) => {
  return (task: DrakidionTask) => {
    orchestratorState = Orchestrator.addTask(orchestratorState, task);
    setOrchestratorState(orchestratorState);
    updateStatus();
  };
};

const createOnWaitingTaskComplete = (orchestratorState: any, setOrchestratorState: (state: any) => void, updateStatus: () => void) => {
  return (taskId: string, successorTask: DrakidionTask) => {
    orchestratorState = Orchestrator.resumeWaitingTask(orchestratorState, taskId, successorTask);
    setOrchestratorState(orchestratorState);
    updateStatus();
  };
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

    disableCheckButton();
    $('#bluesky-posts').html('<p>Loading notifications...</p>');

    try {
      // Authenticate if not already
      if (!blueskyClient.isAuthenticated()) {
        await blueskyClient.authenticate();
      }

      // Get unread notifications only (unreadOnly = true by default)
      const notifications = await blueskyClient.getNotifications(3, true);

      // Guard condition: exit early if no notifications
      if (notifications.length === 0) {
        $('#bluesky-posts').html('<p>No new notifications.</p>');
        enableCheckButton();
        return;
      }

      // Display notifications
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

        // Filter notifications based on response rules and create tasks
        const ignoreList = getIgnoreList();
        let tasksCreated = 0;
        const onTaskCreated = createOnTaskCreated(orchestratorState, setOrchestratorState, updateStatus);
        const onWaitingTaskComplete = createOnWaitingTaskComplete(orchestratorState, setOrchestratorState, updateStatus);

        // Iterate through each notification and check if we should respond
        for (const notif of notifications) {
          // Check if anyone has replied to this post (for non-direct mentions)
          const obliqueHandle = getObliqueHandle();
          const isDirectMention = obliqueHandle ? containsDirectMention(notif.text, obliqueHandle) : false;
          let hasReplies = false;
          
          if (!isDirectMention) {
            try {
              hasReplies = await blueskyClient.hasRepliesToPost(notif);
            } catch (error) {
              console.warn(`Error checking replies for ${notif.author}:`, error);
              hasReplies = true; // Skip to be safe if we can't check
            }
          }

          const shouldRespond = shouldRespondToNotification(notif, ignoreList, hasReplies);

          if (shouldRespond) {
            const task = createProcessNotificationTask(
              notif,
              llmClient,
              blueskyClient,
              onTaskCreated,
              onWaitingTaskComplete
            );
            
            orchestratorState = Orchestrator.addTask(orchestratorState, task);
            tasksCreated++;
          }
        }


        // Update the global state
        setOrchestratorState(orchestratorState);
        updateStatus();

        // Show success message
        const totalNotifications = notifications.length;
        const filteredCount = totalNotifications - tasksCreated;
        
        let successMessage = `✓ Created ${tasksCreated} task${tasksCreated === 1 ? '' : 's'} to reply to notification${tasksCreated === 1 ? '' : 's'}`;
        if (filteredCount > 0) {
          successMessage += ` (${filteredCount} notification${filteredCount === 1 ? '' : 's'} filtered out)`;
        }
        $('#bluesky-posts').append(`<p class="success">${successMessage}</p>`);

      // Mark as seen if checkbox is checked
      const markAsSeen = $('#mark-as-seen').prop('checked');
      if (markAsSeen && notifications.length > 0) {
        await blueskyClient.markNotificationsAsSeen();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      $('#bluesky-posts').html(`<p class="error">Error: ${errorMsg}</p>`);
    }

    enableCheckButton();
  };
};

