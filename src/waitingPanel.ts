// Waiting Panel - UI functions for displaying waiting tasks
import type { OrchestratorState } from './drakidion/drakidion-types.js';
import * as Orchestrator from './drakidion/orchestrator.js';
import * as TaskMapOps from './drakidion/task-map.js';
import { getOrchestratorState } from './panels.js';

declare const $: any;

const formatDate = (date: Date | undefined): string => {
  if (!date) return '';
  return date.toLocaleTimeString();
};

export const updateWaitingPanel = () => {
  const orchestratorState = getOrchestratorState();
  if (!orchestratorState) {
    $('#waiting-size').text('-');
    $('#waiting-task-list').empty();
    return;
  }
  
  const status = Orchestrator.getStatus(orchestratorState);
  
  $('#waiting-size').text(status.waitingSize);
  
  // Update task list
  updateWaitingTaskList(orchestratorState);
};

const updateWaitingTaskList = (orchestratorState: OrchestratorState) => {
  const $taskList = $('#waiting-task-list');
  $taskList.empty();
  
  // Get task IDs from waitingMap
  const waitingTaskIds = Array.from(orchestratorState.waitingMap.correlations.values());
  
  if (waitingTaskIds.length === 0) {
    $taskList.append('<div style="color: var(--text-secondary); padding: 1rem; text-align: center;">No waiting tasks</div>');
    return;
  }
  
  // Get tasks from taskMap
  waitingTaskIds.forEach(taskId => {
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
      displayWaitingTaskDetails(task);
    });
    
    $taskList.append($item);
  });
};

const displayWaitingTaskDetails = (task: any) => {
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
  $('#waiting-task-detail').text(json);
};

