const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lmstudio', {
  listModels: (baseUrl) => ipcRenderer.invoke('lmstudio:list-models', baseUrl),
  listTools: () => ipcRenderer.invoke('lmstudio:list-tools'),
  suggestTips: (payload) => ipcRenderer.invoke('lmstudio:suggest-tips', payload),
  preloadModel: (model, baseUrl) => ipcRenderer.invoke('lmstudio:preload-model', { model, baseUrl }),
  chat: (payload) => ipcRenderer.invoke('lmstudio:chat', payload),
  agentRun: (payload) => ipcRenderer.invoke('lmstudio:agent', payload),
  cancel: (requestId) => ipcRenderer.invoke('lmstudio:cancel', requestId),
  onTool: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('lmstudio:agent-tool', listener);
    return () => ipcRenderer.removeListener('lmstudio:agent-tool', listener);
  },
  onChunk: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('lmstudio:chat-chunk', listener);
    return () => ipcRenderer.removeListener('lmstudio:chat-chunk', listener);
  },
  onDone: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('lmstudio:chat-done', listener);
    return () => ipcRenderer.removeListener('lmstudio:chat-done', listener);
  },
  onError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('lmstudio:chat-error', listener);
    return () => ipcRenderer.removeListener('lmstudio:chat-error', listener);
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
