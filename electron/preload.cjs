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
  listRepos: (cwd) => ipcRenderer.invoke('github:list-repos', cwd),
  getWorkspaceRepo: (cwd) => ipcRenderer.invoke('github:get-workspace-repo', cwd)
});

contextBridge.exposeInMainWorld('workspace', {
  getContext: (cwd) => ipcRenderer.invoke('workspace:get-context', cwd),
  chooseDirectory: () => ipcRenderer.invoke('workspace:choose-directory')
});

contextBridge.exposeInMainWorld('git', {
  status: (cwd) => ipcRenderer.invoke('git:status', cwd),
  diff: (cwd) => ipcRenderer.invoke('git:diff', cwd),
  log: (cwd) => ipcRenderer.invoke('git:log', cwd)
});
