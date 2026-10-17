import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('Configure Panel', () => {
  let addMessageMock: jest.Mock;
  let initializeOrchestratorMock: jest.Mock;
  let fieldValues: Record<string, string>;
  let config: any;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    fieldValues = {
      '#api-key': 'sk-or-v1-new',
      '#model': 'anthropic/claude-sonnet-4',
    };

    config = {
      openrouter: {
        apiKey: 'sk-or-v1-old',
        model: 'anthropic/claude-3.5-haiku',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      },
    };

    (global as any).$ = jest.fn((selector: string) => ({
      val: jest.fn(() => fieldValues[selector]),
    }));

    addMessageMock = jest.fn();
    initializeOrchestratorMock = jest.fn();

    await jest.unstable_mockModule('../src/panels.js', () => ({
      addMessage: addMessageMock,
      initializeOrchestrator: initializeOrchestratorMock,
    }));

    await jest.unstable_mockModule('../src/config.js', () => ({
      getConfig: jest.fn(() => config),
    }));
  });

  it('carries the existing baseUrl over to the new openrouter config', async () => {
    const { createHandleConfigure } = await import('../src/configurePanel.js');

    createHandleConfigure()();

    expect(config.openrouter).toEqual({
      apiKey: 'sk-or-v1-new',
      model: 'anthropic/claude-sonnet-4',
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    });
    expect(initializeOrchestratorMock).toHaveBeenCalledWith(config);
  });

  it('saves even when no config has been loaded yet', async () => {
    config = {};
    const { createHandleConfigure } = await import('../src/configurePanel.js');

    createHandleConfigure()();

    expect(config.openrouter).toEqual({
      apiKey: 'sk-or-v1-new',
      model: 'anthropic/claude-sonnet-4',
      baseUrl: undefined,
    });
  });

  it('rejects an empty API key and leaves the config alone', async () => {
    fieldValues['#api-key'] = '   ';
    const { createHandleConfigure } = await import('../src/configurePanel.js');

    createHandleConfigure()();

    expect(config.openrouter.apiKey).toBe('sk-or-v1-old');
    expect(initializeOrchestratorMock).not.toHaveBeenCalled();
    expect(addMessageMock).toHaveBeenCalledWith('❌ API key is required', 'system');
  });
});
