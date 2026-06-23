const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ollama', {
  listModels: () => ipcRenderer.invoke('ollama:list-models'),
  preloadModel: (model) => ipcRenderer.invoke('ollama:preload-model', model),
  chat: (payload) => ipcRenderer.invoke('ollama:chat', payload),
  cancel: (requestId) => ipcRenderer.invoke('ollama:cancel', requestId),
  onChunk: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ollama:chat-chunk', listener);
    return () => ipcRenderer.removeListener('ollama:chat-chunk', listener);
  },
  onDone: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ollama:chat-done', listener);
    return () => ipcRenderer.removeListener('ollama:chat-done', listener);
  },
  onError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ollama:chat-error', listener);
    return () => ipcRenderer.removeListener('ollama:chat-error', listener);
  }
});

contextBridge.exposeInMainWorld('github', {
  listRepos: () => ipcRenderer.invoke('github:list-repos'),
  getWorkspaceRepo: () => ipcRenderer.invoke('github:get-workspace-repo')
});

contextBridge.exposeInMainWorld('workspace', {
  getContext: () => ipcRenderer.invoke('workspace:get-context')
});

contextBridge.exposeInMainWorld('git', {
  status: () => ipcRenderer.invoke('git:status'),
  diff: () => ipcRenderer.invoke('git:diff'),
  log: () => ipcRenderer.invoke('git:log')
});
