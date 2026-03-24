(function initModelOptions(global) {
  global.MINDMAP_MODEL_OPTIONS = {
    defaultGenerateTemperature: 0.7,
    streamVersionTemperatureStep: 0.15,
    maxGenerateTemperature: 1.5,
    chatTemperature: 0.3,
    presetTemperatures: {
      detailed: 0.6,
      concise: 0.4,
      creative: 0.95,
    },
  };
})(globalThis);
