// Chat Panel - UI functions for handling chat interactions
import * as Orchestrator from './drakidion/orchestrator.js';
import { createObliqueMessageTask } from './oblique-task-factory.js';
import { systemPrompt, obliquePrompt } from './prompts/oblique.js';
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

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: obliquePrompt(message) },
      ];

      // Create task for processing the message with completion handler
      const task = createObliqueMessageTask(
        llmClient,
        messages,
        (taskId, successorTask) => {
          // Handle LLM response completion
          let orchestratorState = getOrchestratorState();
          orchestratorState = Orchestrator.resumeWaitingTask(orchestratorState, taskId, successorTask);
          setOrchestratorState(orchestratorState);
          
          // Extract response from successor task
          const response = successorTask.work || '[No response received]';
          
          // Display response
          if (successorTask.status === 'succeeded') {
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

