import { contextBridge, ipcRenderer } from "electron"

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  getOrders: () => ipcRenderer.invoke("get-orders"),
  saveOrder: (order: any) => ipcRenderer.invoke("save-order", order),
  updateOrder: (order: any) => ipcRenderer.invoke("update-order", order),
  deleteOrder: (orderId: string) => ipcRenderer.invoke("delete-order", orderId),
  isElectron: true,
})
