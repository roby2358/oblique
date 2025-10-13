// Chat Panel - UI functions for handling chat interactions
import * as Orchestrator from './drakidion/orchestrator.js';
import * as TaskMapOps from './drakidion/task-map.js';
import * as TaskFactories from './drakidion/task-factories.js';
import { createObliquePrompt } from './prompts/oblique.js';
import { getOrchestratorState, setOrchestratorState, getLLMClient, addMessage, updateStatus } from './panels.js';

declare const $: any;

export const createHandleSendMessage = () => {
  return async () => {
    const $messageInput = $('#message-input');
    const message = ($messageInput.val() as string).trim();
    if (!message) return;

    $messageInput.val('');
    $messageInput.prop('disabled', true);
    $('#send-button').prop('disabled', true);

    addMessage(message, 'user');

    try {
      const llmClient = getLLMClient();
      if (!llmClient) {
        addMessage('⚠️ LLM client not configured', 'system');
        $messageInput.prop('disabled', false);
        $('#send-button').prop('disabled', false);
        $messageInput.focus();
        return;
      }

      // Create task for processing the message with completion handler
      const task = TaskFactories.createObliqueMessageTask(
        message,
        llmClient,
        createObliquePrompt,
        (taskId, result, error) => {
          // Handle LLM response completion
          let orchestratorState = getOrchestratorState();
          if (error) {
            orchestratorState = Orchestrator.errorWaitingTask(orchestratorState, taskId, error);
          } else {
            orchestratorState = Orchestrator.resumeWaitingTask(orchestratorState, taskId, result);
          }
          setOrchestratorState(orchestratorState);
          
          // Get the completed task and extract response
          const completedTask = TaskMapOps.getTask(orchestratorState.taskMap, taskId);
          const response = completedTask?.work || '[No response received]';
          
          // Display response
          if (completedTask?.status === 'succeeded') {
            addMessage(response, 'oblique');
          } else {
            addMessage(response, 'system');
          }
          
          // Re-enable input
          $messageInput.prop('disabled', false);
          $('#send-button').prop('disabled', false);
          $messageInput.focus();
          updateStatus();
        }
      );

      // Add task to orchestrator (adds to waitingMap using taskId)
      let orchestratorState = getOrchestratorState();
      orchestratorState = Orchestrator.addTask(orchestratorState, task);
      setOrchestratorState(orchestratorState);
      
      updateStatus();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addMessage(`Error: ${errorMsg}`, 'system');
      $messageInput.prop('disabled', false);
      $('#send-button').prop('disabled', false);
      $messageInput.focus();
    }
  };
};

