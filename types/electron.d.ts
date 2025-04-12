interface ElectronAPI {
  getOrders: () => Promise<any[]>
  saveOrder: (order: any) => Promise<{ success: boolean; order?: any; error?: string }>
  updateOrder: (order: any) => Promise<{ success: boolean; order?: any; error?: string }>
  deleteOrder: (orderId: string) => Promise<{ success: boolean; error?: string }>
  isElectron: boolean
}

interface Window {
  electronAPI?: ElectronAPI
}
