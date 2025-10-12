// Observer Panel - UI functions for displaying orchestrator state
import type { OrchestratorState } from './core/drakidion-types.js';
import * as Orchestrator from './core/orchestrator.js';

declare const $: any;

export const updateObserverPanel = (orchestratorState: OrchestratorState | undefined) => {
  if (!orchestratorState) {
    $('#observer-queue-size').text('-');
    $('#observer-waiting-size').text('-');
    $('#observer-timestamp').text('Not initialized');
    $('#task-list').empty();
    return;
  }
  
  const status = Orchestrator.getStatus(orchestratorState);
  const now = new Date().toLocaleString();
  
  $('#observer-queue-size').text(status.queueSize);
  $('#observer-waiting-size').text(status.waitingSize);
  $('#observer-timestamp').text(now);
  
  // Update task list
  updateTaskList(orchestratorState);
};

const updateTaskList = (orchestratorState: OrchestratorState) => {
  const $taskList = $('#task-list');
  $taskList.empty();
  
  if (!orchestratorState || !orchestratorState.taskMap.tasks.size) {
    $taskList.append('<div style="color: var(--text-secondary); padding: 1rem; text-align: center;">No tasks</div>');
    return;
  }
  
  // Get all tasks and sort by taskId (most recent first)
  const tasks = Array.from(orchestratorState.taskMap.tasks.values())
    .sort((a, b) => b.taskId.localeCompare(a.taskId));
  
  tasks.forEach(task => {
    const $item = $('<div>')
      .addClass('task-item')
      .attr('data-task-id', task.taskId);
    
    const $description = $('<div>')
      .addClass('task-item-description')
      .text(task.description);
    
    const $status = $('<div>')
      .addClass('task-item-status')
      .addClass(`status-${task.status}`)
      .text(`${task.status} (${task.version})`);
    
    $item.append($description).append($status);
    
    $item.on('click', () => {
      $('.task-item').removeClass('selected');
      $item.addClass('selected');
      displayTaskDetails(task);
    });
    
    $taskList.append($item);
  });
};

const displayTaskDetails = (task: any) => {
  // Create a serializable version of the task (without functions)
  const taskDetails = {
    taskId: task.taskId,
    version: task.version,
    status: task.status,
    description: task.description,
    work: task.work,
    conversation: task.conversation,
    retryCount: task.retryCount,
  };
  
  const json = JSON.stringify(taskDetails, null, 2);
  $('#task-detail').text(json);
};

