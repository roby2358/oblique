// DRAKIDION Demo - Example usage
import * as DRAKIDION from '../core/drakidion.js';
import type { DrakidionTask } from '../core/drakidion-types.js';

/**
 * Simple demo showing DRAKIDION task orchestration
 */
export const runSimpleDemo = async () => {
  console.log('=== DRAKIDION Simple Demo ===');
  
  // Create orchestrator
  const state = DRAKIDION.Orchestrator.createOrchestrator();
  
  // Create a simple increment task
  const task = DRAKIDION.TaskFactories.createIncrementTask(0);
  console.log('Created task:', task.taskId);
  
  // Add to orchestrator
  DRAKIDION.Orchestrator.addTask(state, task);
  
  // Process all tasks
  console.log('Processing tasks...');
  await DRAKIDION.Orchestrator.processAllTasks(state);
  
  // Check final status
  const status = DRAKIDION.Orchestrator.getStatus(state);
  console.log('Final status:', status);
  
  // Get the completed task
  const completedTask = DRAKIDION.TaskMapOps.getTask(state.taskMap, task.taskId);
  console.log('Completed work:', completedTask?.work);
  
  console.log('=== Demo Complete ===\n');
};

/**
 * Demo showing retry logic
 */
export const runRetryDemo = async () => {
  console.log('=== DRAKIDION Retry Demo ===');
  
  const state = DRAKIDION.Orchestrator.createOrchestrator();
  
  let attempts = 0;
  const operation = async () => {
    attempts++;
    console.log(`Attempt ${attempts}`);
    
    if (attempts < 3) {
      throw new Error('Temporary failure');
    }
    
    return 'Success after retries!';
  };
  
  const task = DRAKIDION.TaskFactories.createRetryTask(operation, 3);
  DRAKIDION.Orchestrator.addTask(state, task);
  
  console.log('Processing with retries...');
  await DRAKIDION.Orchestrator.processAllTasks(state);
  
  const completedTask = DRAKIDION.TaskMapOps.getTask(state.taskMap, task.taskId);
  console.log('Final result:', completedTask?.work);
  console.log('Status:', completedTask?.status);
  
  console.log('=== Retry Demo Complete ===\n');
};

/**
 * Demo showing task chain
 */
export const runChainDemo = async () => {
  console.log('=== DRAKIDION Chain Demo ===');
  
  const state = DRAKIDION.Orchestrator.createOrchestrator();
  
  const operations = [
    async () => {
      console.log('Step 1: Fetching data...');
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'Data fetched';
    },
    async () => {
      console.log('Step 2: Processing data...');
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'Data processed';
    },
    async () => {
      console.log('Step 3: Saving results...');
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'Results saved';
    },
  ];
  
  const task = DRAKIDION.TaskFactories.createTaskChain(operations);
  DRAKIDION.Orchestrator.addTask(state, task);
  
  console.log('Processing chain...');
  await DRAKIDION.Orchestrator.processAllTasks(state);
  
  const completedTask = DRAKIDION.TaskMapOps.getTask(state.taskMap, task.taskId);
  console.log('Chain result:');
  console.log(completedTask?.work);
  
  console.log('=== Chain Demo Complete ===\n');
};

/**
 * Demo showing waiting/callback pattern
 */
export const runCallbackDemo = async () => {
  console.log('=== DRAKIDION Callback Demo ===');
  
  const state = DRAKIDION.Orchestrator.createOrchestrator();
  
  let completionResult: any = null;
  
  const task = DRAKIDION.TaskFactories.createWaitingTask(
    undefined,
    (result) => {
      console.log('Callback invoked with result:', result);
      completionResult = result;
    }
  );
  
  console.log('Created waiting task:', task.taskId);
  DRAKIDION.Orchestrator.addTask(state, task);
  
  // Simulate async response arriving after delay
  setTimeout(() => {
    console.log('Async response arrived');
    
    // Get correlationId from waitingMap
    const correlations = DRAKIDION.WaitingMapOps.getAllCorrelations(state.waitingMap);
    const [correlationId] = correlations[0] || [];
    
    if (correlationId) {
      DRAKIDION.Orchestrator.resumeWaitingTask(state, correlationId, { data: 'async data' });
      
      // Process any resulting tasks
      DRAKIDION.Orchestrator.processAllTasks(state).then(() => {
        console.log('Completion result:', completionResult);
        console.log('=== Callback Demo Complete ===\n');
      });
    }
  }, 500);
};

/**
 * Demo showing custom task factory
 */
export const runCustomTaskDemo = async () => {
  console.log('=== DRAKIDION Custom Task Demo ===');
  
  // Create custom task factory
  const createGreetingTask = (name: string): DrakidionTask => {
    const taskId = DRAKIDION.generateTaskId();
    
    return {
      taskId,
      version: 1,
      status: 'ready',
      work: '',
      process: async () => {
        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const greeting = `Hello, ${name}! Welcome to DRAKIDION.`;
        
        return {
          taskId,
          version: 2,
          status: 'succeeded',
          work: greeting,
          process: async () => {
            throw new Error('Task already completed');
          },
        };
      },
    };
  };
  
  const state = DRAKIDION.Orchestrator.createOrchestrator();
  
  const task = createGreetingTask('World');
  DRAKIDION.Orchestrator.addTask(state, task);
  
  console.log('Processing custom task...');
  await DRAKIDION.Orchestrator.processAllTasks(state);
  
  const completedTask = DRAKIDION.TaskMapOps.getTask(state.taskMap, task.taskId);
  console.log('Greeting:', completedTask?.work);
  
  console.log('=== Custom Task Demo Complete ===\n');
};

/**
 * Run all demos
 */
export const runAllDemos = async () => {
  await runSimpleDemo();
  await runRetryDemo();
  await runChainDemo();
  await runCustomTaskDemo();
  // Skip callback demo in batch run (it uses setTimeout)
  console.log('All demos complete!');
};

// For Node.js testing
if (typeof window === 'undefined') {
  // Running in Node.js
  runAllDemos().catch(console.error);
}

