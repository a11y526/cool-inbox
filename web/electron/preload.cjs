// PC 앱에서만 쓰는 기능을 화면에 알려 준다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  openAttachment: (key, name) => ipcRenderer.invoke('open-attachment', key, name),
});
