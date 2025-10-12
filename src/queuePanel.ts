// Queue Panel - UI functions for displaying task queue
import type { OrchestratorState } from './drakidion/drakidion-types.js';
import * as Orchestrator from './drakidion/orchestrator.js';
import * as TaskMapOps from './drakidion/task-map.js';

declare const $: any;

const formatDate = (date: Date | undefined): string => {
  if (!date) return '';
  return date.toLocaleTimeString();
};

export const updateQueuePanel = (orchestratorState: OrchestratorState | undefined) => {
  if (!orchestratorState) {
    $('#queue-length').text('-');
    $('#queue-task-list').empty();
    return;
  }
  
  const status = Orchestrator.getStatus(orchestratorState);
  
  $('#queue-length').text(status.queueSize);
  
  // Update task list
  updateQueueTaskList(orchestratorState);
};

const updateQueueTaskList = (orchestratorState: OrchestratorState) => {
  const $taskList = $('#queue-task-list');
  $taskList.empty();
  
  const queuedTaskIds = orchestratorState.taskQueue.taskIds;
  
  if (queuedTaskIds.length === 0) {
    $taskList.append('<div style="color: var(--text-secondary); padding: 1rem; text-align: center;">No tasks in queue</div>');
    return;
  }
  
  // Get tasks in queue order
  queuedTaskIds.forEach(taskId => {
    const task = TaskMapOps.getTask(orchestratorState.taskMap, taskId);
    
    if (!task) return;
    
    const $item = $('<div>')
      .addClass('task-item')
      .attr('data-task-id', task.taskId);
    
    const $description = $('<div>')
      .addClass('task-item-description')
      .text(task.description);
    
    // Build status line with dates
    let statusText = `${task.status} (${task.version})`;
    if (task.createdAt) {
      statusText += ` • ${formatDate(task.createdAt)}`;
    }
    if (task.doneAt) {
      statusText += ` → ${formatDate(task.doneAt)}`;
    }
    
    const $status = $('<div>')
      .addClass('task-item-status')
      .addClass(`status-${task.status}`)
      .text(statusText);
    
    $item.append($description).append($status);
    
    $item.on('click', () => {
      $('.task-item').removeClass('selected');
      $item.addClass('selected');
      displayQueueTaskDetails(task);
    });
    
    $taskList.append($item);
  });
};

const displayQueueTaskDetails = (task: any) => {
  // Create a serializable version of the task (without functions)
  const taskDetails = {
    taskId: task.taskId,
    version: task.version,
    status: task.status,
    description: task.description,
    work: task.work,
    conversation: task.conversation,
    retryCount: task.retryCount,
    createdAt: task.createdAt,
    doneAt: task.doneAt,
  };
  
  const json = JSON.stringify(taskDetails, null, 2);
  $('#queue-task-detail').text(json);
};

