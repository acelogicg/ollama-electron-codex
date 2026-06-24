import { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { browserAppConfig, browserModelOptions, defaultBrowserModel } from './browserModels.js';

export { browserModelOptions, defaultBrowserModel };

export function createBrowserEngine(initProgressCallback) {
  const worker = new Worker(new URL('./workers/webllm.worker.js', import.meta.url), { type: 'module' });
  const engine = new WebWorkerMLCEngine(worker, {
    appConfig: browserAppConfig,
    initProgressCallback
  });

  engine.setAppConfig(browserAppConfig);

  return { worker, engine };
}
