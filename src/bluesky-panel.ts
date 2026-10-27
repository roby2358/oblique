// Bluesky Panel - UI functions for handling Bluesky interactions
import type { DrakidionTask } from './drakidion/drakidion-types.js';
import { getBlueskyAccounts, getJevClient, getLLMClient, getOrchestratorState, setOrchestratorState, updateStatus } from './panels.js';
import { createReplyTask } from './oblique-task-factory.js';
import * as Orchestrator from './drakidion/orchestrator.js';
import type { BlueskyMessage } from './types/index.js';
import { needsPostData, notificationRestraintReason } from './bluesky-polling.js';
import type { BlueskyClient } from './hooks/bluesky/bluesky-client.js';
import type { BlueskyAccount } from './bluesky-accounts.js';
import type { LLMClient } from './hooks/llm/llm-client.js';
import type { JevClient } from './hooks/jev/jev-client.js';

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
/**
 * The post data a notification names, or `null` when Bluesky will not give it up — a deleted
 * post, a blocked author, a URI it refuses. One notification's failure skips that
 * notification; it must not abort the rest of the batch (R-21). `null` travels on to the
 * restraint gate, which already treats unreadable post data as a deleted post.
 */
export const fetchPostData = async (blueskyClient: BlueskyClient, notif: BlueskyMessage): Promise<any> => {
  try {
    return await blueskyClient.getSinglePost(notif.uri);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.log(`Could not fetch the post for @${notif.author}: ${reason}`);
    return null;
  }
};

/**
 * One account's pass: the notifications it chose to answer, the reasons it declined the rest,
 * the tasks that earned, and the reason it failed if it did. Nothing is queued here — the
 * caller threads the orchestrator state — so a network that is down costs that account alone
 * and the others' replies still land (R-39).
 *
 * `declined` holds one reason per notification passed over, author-free so they can be
 * tallied; the console carries the author and the disposition one by one (D-25).
 */
export interface AccountCheck {
  account: BlueskyAccount;
  answered: BlueskyMessage[];
  declined: string[];
  tasks: DrakidionTask[];
  error: string | null;
}

/**
 * What one account's notifications earned: a task each for the ones to answer, a reason each
 * for the rest. Every restraint rule is asked with that account's own handle, because each
 * network knows Oblique by a different name (D-22).
 *
 * The post is fetched only once the cheap rules have passed: a like, repost or follow
 * notification's uri is that record and `getPostThread` answers 400 for it (R-8).
 */
const judgeNotifications = async (
  account: BlueskyAccount,
  notifications: BlueskyMessage[],
  llmClient: LLMClient,
  jevClient: JevClient | undefined,
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void
): Promise<{ answered: BlueskyMessage[]; declined: string[]; tasks: DrakidionTask[] }> => {
  const answered: BlueskyMessage[] = [];
  const declined: string[] = [];
  const tasks: DrakidionTask[] = [];

  for (const notif of notifications) {
    const postData = needsPostData(notif)
      ? await fetchPostData(account.client, notif)
      : null;
    const reason = notificationRestraintReason(notif, postData, account.handle);

    if (reason) {
      console.log(`Skipping @${notif.author}: ${reason}`);
      declined.push(reason);
      continue;
    }

    console.log(`\u2713 Answering @${notif.author}`);
    answered.push(notif);
    tasks.push(createReplyTask(notif, llmClient, jevClient, account.client, onWaitingTaskComplete));
  }

  return { answered, declined, tasks };
};

export const checkAccount = async (
  account: BlueskyAccount,
  llmClient: LLMClient,
  jevClient: JevClient | undefined,
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void,
  markAsSeen: boolean
): Promise<AccountCheck> => {
  try {
    await account.client.ensureAuth();

    // NOTIFICATION_BATCH. The window is all there is: there is no cursor and nothing is
    // remembered, so anything that falls past it is never asked for again (D-11).
    const notifications = await account.client.getNotifications(50, true);

    if (notifications.length === 0) {
      return { account, answered: [], declined: [], tasks: [], error: null };
    }

    // Once for the whole batch, before the loop, so a mid-loop failure cannot make the same
    // batch be reprocessed forever
    if (markAsSeen) {
      await account.client.markNotificationsAsSeen();
    }

    const judged = await judgeNotifications(account, notifications, llmClient, jevClient, onWaitingTaskComplete);

    return { account, ...judged, error: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Checking @${account.handle} failed: ${reason}`);
    return { account, answered: [], declined: [], tasks: [], error: reason };
  }
};

const plural = (count: number, noun: string): string => {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
};

/**
 * The reasons for passing a notification over, each with how many times it applied, most
 * frequent first. The reasons carry no author, so the same rule declining five notifications
 * is one row of five rather than five rows (D-25).
 */
export const tallyReasons = (declined: string[]): { reason: string; count: number }[] => {
  const counts = new Map<string, number>();

  for (const reason of declined) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
};

const renderDeclined = (declined: string[]): string => {
  if (declined.length === 0) {
    return '';
  }

  const rows = tallyReasons(declined)
    .map(({ reason, count }) => `<li><span class="declined-count">${count}</span>${escapeHtml(reason)}</li>`)
    .join('');

  return `<p class="declined-head">Passed over ${plural(declined.length, 'notification')}:</p><ul class="declined-list">${rows}</ul>`;
};

/**
 * One account's section of the panel: a box for each notification it is answering, then the
 * reasons it passed the rest over. Only the answered ones get a box — the declined ones are
 * a count against a reason here and a line each in the console (D-25).
 */
const renderAccountCheck = (check: AccountCheck): string => {
  const header = `<h4 class="bluesky-account">@${escapeHtml(check.account.handle)}</h4>`;

  if (check.error) {
    return `${header}<p class="error">Error: ${escapeHtml(check.error)}</p>`;
  }

  if (check.answered.length === 0 && check.declined.length === 0) {
    return `${header}<p>No new notifications.</p>`;
  }

  const answeredHtml = check.answered.map(renderNotificationAsHtml).join('');
  const summary = check.answered.length === 0
    ? 'Nothing to answer this pass'
    : `✓ Replying to ${plural(check.answered.length, 'notification')}`;

  return `${header}${answeredHtml}<p class="success">${summary}</p>${renderDeclined(check.declined)}`;
};

export const checkNotifications = async () => {
  const accounts = getBlueskyAccounts();
  const llmClient = getLLMClient();
  const jevClient = getJevClient();
  let orchestratorState = getOrchestratorState();

  if (accounts.length === 0) {
    $('#bluesky-posts').html('<p class="error">Bluesky not configured. Please add credentials to config.json</p>');
    return;
  }

  if (!llmClient) {
    $('#bluesky-posts').html('<p class="error">LLM not configured. Please add OpenRouter API key to config.json</p>');
    return;
  }

  disableCheckButton();
  $('#bluesky-posts').html('<p>Loading notifications...</p>');

  const onWaitingTaskComplete = createOnWaitingTaskComplete(orchestratorState, setOrchestratorState, updateStatus);
  const markAsSeen = $('#mark-as-seen').prop('checked');

  // One account at a time, all of them into the one queue (D-22)
  const checks: AccountCheck[] = [];
  for (const account of accounts) {
    checks.push(await checkAccount(account, llmClient, jevClient, onWaitingTaskComplete, markAsSeen));
  }

  for (const check of checks) {
    for (const task of check.tasks) {
      orchestratorState = Orchestrator.addTask(orchestratorState, task);
    }
  }

  setOrchestratorState(orchestratorState);
  updateStatus();

  $('#bluesky-posts').html(checks.map(renderAccountCheck).join(''));

  enableCheckButton();
};

// Helper function to get poll interval from UI
const getPollIntervalSeconds = (): number => {
  const input = $('#poll-interval');
  const value = parseInt(input.val() as string, 10);
  // Validate and return default if invalid
  if (isNaN(value) || value < 10 || value > 3600) {
    return 120; // POLL_DEFAULT_S
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
