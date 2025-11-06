// Bluesky Panel - UI functions for handling Bluesky interactions
import type { DrakidionTask } from './drakidion/drakidion-types.js';
import { getBlueskyClient, getLLMClient, getOrchestratorState, setOrchestratorState, updateStatus } from './panels.js';
import { createReplyTask } from './oblique-task-factory.js';
import * as Orchestrator from './drakidion/orchestrator.js';
import type { BlueskyMessage } from './types/index.js';
import { shouldRespondToNotification } from './bluesky-polling.js';

declare const $: any;

// Polling state management
let pollingInterval: NodeJS.Timeout | null = null;
let isPolling = false;

// Callback functions for task management
const createOnWaitingTaskComplete = (orchestratorState: any, setOrchestratorState: (state: any) => void, updateStatus: () => void) => {
  return (taskId: string, successorTask: DrakidionTask) => {
    orchestratorState = Orchestrator.resumeWaitingTask(orchestratorState, taskId, successorTask);
    setOrchestratorState(orchestratorState);
    updateStatus();
  };
};

// UI helper functions
const disableCheckButton = () => {
  $('#check-bluesky').prop('disabled', true).text('Checking...');
};

const enableCheckButton = () => {
  $('#check-bluesky').prop('disabled', false).text('Check');
};

const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const renderNotificationAsHtml = (notif: BlueskyMessage): string => {
  const date = new Date(notif.createdAt).toLocaleString();
  return `
    <div class="bluesky-post">
      <div class="post-author">@${notif.author}</div>
      <div class="post-text">${escapeHtml(notif.text)}</div>
      <div class="post-date">${date}</div>
    </div>
  `;
};

// Polling UI functions
const updatePollingStatus = (nextCheckTime?: Date) => {
  if (isPolling) {
    $('#toggle-polling').text('Stop Polling').addClass('active');
    $('#polling-status').removeClass('hidden');
    $('#poll-interval').prop('disabled', true); // Disable input when polling
    if (nextCheckTime) {
      const timeStr = nextCheckTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      $('#next-check').text(`Next check: ${timeStr}`);
    }
  } else {
    $('#toggle-polling').text('Start Polling').removeClass('active');
    $('#polling-status').addClass('hidden');
    $('#poll-interval').prop('disabled', false); // Enable input when not polling
  }
};

const formatTimeUntilNext = (targetTime: Date): string => {
  const now = new Date();
  const diffMs = targetTime.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'Now';
  
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  
  if (diffMinutes > 0) {
    return `${diffMinutes}m ${diffSeconds % 60}s`;
  } else {
    return `${diffSeconds}s`;
  }
};

const updateCountdown = (nextCheckTime: Date) => {
  const updateTimer = () => {
    if (!isPolling) return;
    
    const timeStr = formatTimeUntilNext(nextCheckTime);
    $('#next-check').text(`Next check: ${timeStr}`);
    
    if (nextCheckTime.getTime() > Date.now()) {
      setTimeout(updateTimer, 1000);
    }
  };
  updateTimer();
};

// Main notification checking logic (shared between manual and polling)
export const checkNotifications = async () => {
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
    await blueskyClient.ensureAuth();

    // Get unread notifications only (unreadOnly = true by default)
    const notifications = await blueskyClient.getNotifications(3, true);
    
    // Guard condition: exit early if no notifications
    if (notifications.length === 0) {
      $('#bluesky-posts').html('<p>No new notifications.</p>');
      enableCheckButton();
      return;
    }

    // Display notifications
    const postsHtml = notifications.map(renderNotificationAsHtml).join('');
    $('#bluesky-posts').html(postsHtml);

    // Filter notifications based on response rules and create tasks
    let tasksCreated = 0;
    const onWaitingTaskComplete = createOnWaitingTaskComplete(orchestratorState, setOrchestratorState, updateStatus);
    const markAsSeen = $('#mark-as-seen').prop('checked');

    // Mark notifications as seen if requested (do this once for all notifications)
    if (markAsSeen && notifications.length > 0) {
      await blueskyClient.markNotificationsAsSeen();
    }

    // Iterate through each notification and check if we should respond
    for (const notif of notifications) {
      const postData = await blueskyClient.getSinglePost(notif.uri);
      
      if (!shouldRespondToNotification(notif, postData)) {
        continue;
      }
      
      // Create and add task
      const task = createReplyTask(
        notif,
        llmClient,
        blueskyClient,
        onWaitingTaskComplete
      );
      
      orchestratorState = Orchestrator.addTask(orchestratorState, task);
      tasksCreated++;
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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    $('#bluesky-posts').html(`<p class="error">Error: ${errorMsg}</p>`);
  }

  enableCheckButton();
};

// Helper function to get poll interval from UI
const getPollIntervalSeconds = (): number => {
  const input = $('#poll-interval');
  const value = parseInt(input.val() as string, 10);
  // Validate and return default if invalid
  if (isNaN(value) || value < 10 || value > 3600) {
    return 60; // Default to 60 seconds
  }
  return value;
};

// Polling control functions
const startPolling = () => {
  if (isPolling) return;
  
  isPolling = true;
  const pollIntervalSeconds = getPollIntervalSeconds();
  const POLLING_INTERVAL_MS = pollIntervalSeconds * 1000;
  
  const scheduleNextCheck = () => {
    const nextCheckTime = new Date(Date.now() + POLLING_INTERVAL_MS);
    updatePollingStatus(nextCheckTime);
    updateCountdown(nextCheckTime);
    
    pollingInterval = setTimeout(async () => {
      if (isPolling) {
        await checkNotifications(); // Show output during polling
        scheduleNextCheck();
      }
    }, POLLING_INTERVAL_MS);
  };
  
  scheduleNextCheck();
};

const stopPolling = () => {
  if (!isPolling) return;
  
  isPolling = false;
  if (pollingInterval) {
    clearTimeout(pollingInterval);
    pollingInterval = null;
  }
  updatePollingStatus();
};

// Export polling control
export const createHandleTogglePolling = () => {
  return () => {
    if (isPolling) {
      stopPolling();
    } else {
      startPolling();
    }
  };
};

// Export polling state getter
export const getPollingState = () => ({
  isPolling,
  hasInterval: pollingInterval !== null
});

// Export poll interval change handler
export const createHandlePollIntervalChange = () => {
  return () => {
    const input = $('#poll-interval');
    const value = parseInt(input.val() as string, 10);
    
    // Validate input
    if (isNaN(value) || value < 10) {
      input.val('10'); // Set minimum value
    } else if (value > 3600) {
      input.val('3600'); // Set maximum value
    }
  };
};

export const createHandleCheckBluesky = () => {
  return async () => {
    await checkNotifications();
  };
};
