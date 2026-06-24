import { prebuiltAppConfig } from '@mlc-ai/web-llm';

const preferredBrowserModelIds = [
  'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Qwen3-0.6B-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'SmolLM2-1.7B-Instruct-q4f16_1-MLC'
];

const recordById = new Map(prebuiltAppConfig.model_list.map((record) => [record.model_id, record]));

function formatModelLabel(modelId) {
  return modelId
    .replace(/-q[0-9a-z_]+-MLC$/i, '')
    .replace(/-MLC$/i, '')
    .replace(/-/g, ' ');
}

export const browserModelRecords = preferredBrowserModelIds
  .map((modelId) => recordById.get(modelId))
  .filter(Boolean);

export const browserModelOptions = browserModelRecords.map((record) => ({
  name: record.model_id,
  label: formatModelLabel(record.model_id)
}));

export const defaultBrowserModel = browserModelOptions[0]?.name || '';

export const browserAppConfig = {
  ...prebuiltAppConfig,
  model_list: browserModelRecords
};
