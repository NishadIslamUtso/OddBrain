// AI ASSistant - Model config - uses existing qwen2.5:3b directly
export const MODELS = [
  {
    id: "qwen2.5:3b",
    name: "qwen2.5:3b (Local - your existing model)",
    provider: "ollama",
    host: "http://127.0.0.1:11434",
    context: 32768,
    capabilities: {
      text: true,
      vision: false,
      tools: false,
      files: true,
      audio: false
    },
    default: true,
    description: "Your existing local model, no download needed. Small baseline, uses 8GB RAM, 4GB VRAM."
  },
  {
    id: "qwen3-vl:4b",
    name: "qwen3-vl:4b (Local vision - optional)",
    provider: "ollama",
    host: "http://127.0.0.1:11434",
    context: 32768,
    capabilities: {
      text: true,
      vision: true,
      tools: false,
      files: true
    },
    description: "Optional 3.3GB vision model, tight on 8GB RAM"
  }
];

export const DEFAULT_MODEL = "qwen2.5:3b";