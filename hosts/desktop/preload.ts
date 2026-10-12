import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('voyage',{invoke:(method:string,payload:any={})=>ipcRenderer.invoke('workbench',method,payload)});
