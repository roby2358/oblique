Oblique is a project to create an online bot which answers only obliquely. It is characterized as an agent-like process that combines a queue, a stack, and a pending map. It has 

For now, oblique lives in memory, but there will be hooks to save its artifacts in persistent storage.

It will be written in Typescript to run from the command line initially. Later it will be deployed in the net.

Oblique will consist of:
- A hook to send requests to various LLM APIs
- A hook to receive and send requests to Bluesky
- a queue for processing sequential tasks
- a map for storing pending tasks (like pending LLM API calls)
- a map of stacks to track ongoing user actions

## Proposed Project Structure

```
oblique/
├── src/
│   ├── index.ts                 # Main entry point, CLI interface
│   ├── core/
│   │   ├── agent.ts             # Core agent orchestrator
│   │   ├── queue.ts             # Sequential task queue implementation
│   │   ├── pending-map.ts       # Pending tasks map (for async operations)
│   │   └── user-stack-map.ts    # User action stacks tracker
│   ├── hooks/
│   │   ├── llm/
│   │   │   ├── llm-client.ts    # Abstract LLM client interface
│   │   │   ├── openai.ts        # OpenAI implementation
│   │   │   ├── anthropic.ts     # Anthropic implementation
│   │   │   └── index.ts         # LLM hook exports
│   │   └── bluesky/
│   │       ├── bluesky-client.ts # Bluesky API client
│   │       └── index.ts         # Bluesky hook exports
│   ├── prompts/
│   │   └── oblique.ts           # Oblique response generation prompts
│   ├── storage/
│   │   ├── storage-interface.ts # Abstract storage interface
│   │   └── memory-storage.ts    # In-memory implementation
│   ├── types/
│   │   └── index.ts             # Shared TypeScript types and interfaces
│   └── utils/
│       └── index.ts             # Utility functions
├── test/
│   ├── core/
│   ├── hooks/
│   └── integration/
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example                 # Template for API keys and config
└── README.md
```

### Key Design Principles
- **Functional approach**: Favor pure functions and immutable data structures where possible
- **Modular hooks**: LLM and Bluesky integrations are pluggable and replaceable
- **Type safety**: Full TypeScript types throughout
- **Testability**: Unit tests for all core functionality
- **Extensibility**: Storage layer can be swapped from memory to persistent storage

