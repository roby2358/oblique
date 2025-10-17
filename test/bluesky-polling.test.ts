import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Simple test for the polling functionality
describe('Bluesky Polling Module', () => {
  // Mock jQuery globally
  const mockJQuery = jest.fn(() => ({
    text: jest.fn().mockReturnThis(),
    addClass: jest.fn().mockReturnThis(),
    removeClass: jest.fn().mockReturnThis(),
    prop: jest.fn().mockReturnThis(),
    val: jest.fn().mockReturnThis(),
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).$ = mockJQuery;
    
    // Mock the panels module
    jest.doMock('../src/panels.js', () => ({
      getBlueskyClient: jest.fn(),
      getLLMClient: jest.fn(),
      getOrchestratorState: jest.fn(),
      setOrchestratorState: jest.fn(),
      updateStatus: jest.fn(),
      getConfig: jest.fn(),
    }));

    // Mock the orchestrator module
    jest.doMock('../src/drakidion/orchestrator.js', () => ({
      resumeWaitingTask: jest.fn(),
      addTask: jest.fn(),
    }));

    // Mock the task factory
    jest.doMock('../src/oblique-task-factory.js', () => ({
      createProcessNotificationTask: jest.fn(),
    }));
  });

  it('should create toggle handler function', async () => {
    const { createHandleTogglePolling } = await import('../src/bluesky-polling.js');
    const handleToggle = createHandleTogglePolling();
    
    expect(typeof handleToggle).toBe('function');
  });

  it('should handle toggle polling state changes', async () => {
    const { createHandleTogglePolling } = await import('../src/bluesky-polling.js');
    const handleToggle = createHandleTogglePolling();
    
    jest.useFakeTimers();
    
    // First call should start polling
    handleToggle();
    
    // Verify jQuery was called for UI updates
    expect(mockJQuery).toHaveBeenCalledWith('#toggle-polling');
    expect(mockJQuery).toHaveBeenCalledWith('#polling-status');
    
    jest.useRealTimers();
  });

  it('should create poll interval change handler function', async () => {
    const { createHandlePollIntervalChange } = await import('../src/bluesky-polling.js');
    const handleIntervalChange = createHandlePollIntervalChange();
    
    expect(typeof handleIntervalChange).toBe('function');
  });

  it('should validate poll interval input values', async () => {
    const { createHandlePollIntervalChange } = await import('../src/bluesky-polling.js');
    const handleIntervalChange = createHandlePollIntervalChange();
    
    // Mock jQuery to return different values for val() calls
    const mockVal = jest.fn();
    const mockJQueryInstance = {
      val: mockVal,
      text: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      prop: jest.fn().mockReturnThis(),
    };
    
    mockJQuery.mockReturnValue(mockJQueryInstance);

    // Test with invalid value (too low)
    mockVal.mockReturnValue('5');
    handleIntervalChange();
    expect(mockVal).toHaveBeenCalledTimes(2); // Once to get value, once to set corrected value
    expect(mockVal).toHaveBeenNthCalledWith(2, '10'); // Second call should set the corrected value

    // Reset mock
    mockVal.mockClear();

    // Test with invalid value (too high)
    mockVal.mockReturnValue('4000');
    handleIntervalChange();
    expect(mockVal).toHaveBeenCalledTimes(2); // Once to get value, once to set corrected value
    expect(mockVal).toHaveBeenNthCalledWith(2, '3600'); // Second call should set the corrected value
  });
});