"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RefreshCw, Database, AlertTriangle, Cloud, ArrowUpToLine, Info, Server, Shield } from "lucide-react"
import { getOrders } from "@/app/actions"
import { performFullSync, getLocalOrders, saveLocalOrders } from "@/app/services/sync-service"
import config from "@/app/config"

export default function SyncDebugger() {
  const [localOrders, setLocalOrders] = useState<any[]>([])
  const [cloudOrders, setCloudOrders] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoadingLocal, setIsLoadingLocal] = useState(false)
  const [isLoadingCloud, setIsLoadingCloud] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ uploaded: number; downloaded: number } | null>(null)
  const [activeTab, setActiveTab] = useState("local")
  const [syncLog, setSyncLog] = useState<string[]>([])
  const [serverInfo, setServerInfo] = useState<{
    dataDir: string
    isWritable: boolean
    ordersCount: number
  } | null>(null)
  const [integrityCheckResult, setIntegrityCheckResult] = useState<{
    duplicates: number
    corrupted: number
    fixed: boolean
  } | null>(null)

  // Check local storage for orders
  const checkLocalStorage = () => {
    setIsLoadingLocal(true)
    try {
      const savedOrders = localStorage.getItem("chiro-bmb-orders")
      if (savedOrders) {
        const orders = JSON.parse(savedOrders)
        setLocalOrders(orders)
      } else {
        setLocalOrders([])
      }
    } catch (error) {
      console.error("Failed to parse orders from localStorage:", error)
      setLocalOrders([])
    } finally {
      setIsLoadingLocal(false)
    }
  }

  // Fetch orders from cloud storage
  const fetchCloudOrders = async () => {
    setIsLoadingCloud(true)
    try {
      const orders = await getOrders()
      setCloudOrders(orders)
      addToSyncLog(`Fetched ${orders.length} orders from cloud storage`)

      // Get server info
      setServerInfo({
        dataDir: config.dataDir,
        isWritable: true, // Assume writable if we got orders
        ordersCount: orders.length,
      })
    } catch (error) {
      console.error("Failed to fetch orders from cloud:", error)
      setCloudOrders([])
      addToSyncLog("Failed to fetch orders from cloud")

      // Update server info with error
      setServerInfo({
        dataDir: config.dataDir,
        isWritable: false,
        ordersCount: 0,
      })
    } finally {
      setIsLoadingCloud(false)
    }
  }

  // Reset sync status for all local orders
  const resetSyncStatus = () => {
    try {
      const savedOrders = localStorage.getItem("chiro-bmb-orders")
      if (savedOrders) {
        const orders = JSON.parse(savedOrders)
        // Mark all orders as not synced
        const updatedOrders = orders.map((order: any) => ({
          ...order,
          syncedToCloud: false,
          lastModified: new Date().toISOString(),
        }))
        localStorage.setItem("chiro-bmb-orders", JSON.stringify(updatedOrders))
        setLocalOrders(updatedOrders)
        addToSyncLog(`Reset sync status for ${orders.length} orders`)
        alert("All orders marked for sync. Try syncing now.")
      }
    } catch (error) {
      console.error("Failed to reset sync status:", error)
      addToSyncLog("Failed to reset sync status")
      alert("Error resetting sync status.")
    }
  }

  // Force mark all orders as synced
  const forceMarkAllSynced = () => {
    try {
      const savedOrders = localStorage.getItem("chiro-bmb-orders")
      if (savedOrders) {
        const orders = JSON.parse(savedOrders)
        // Mark all orders as synced
        const updatedOrders = orders.map((order: any) => ({
          ...order,
          syncedToCloud: true,
          lastModified: new Date().toISOString(),
        }))
        localStorage.setItem("chiro-bmb-orders", JSON.stringify(updatedOrders))
        setLocalOrders(updatedOrders)
        addToSyncLog(`Marked ${orders.length} orders as synced`)
        alert("All orders marked as synced.")
      }
    } catch (error) {
      console.error("Failed to mark orders as synced:", error)
      addToSyncLog("Failed to mark orders as synced")
      alert("Error updating sync status.")
    }
  }

  // Force sync all orders
  const forceSyncNow = async () => {
    setIsSyncing(true)
    addToSyncLog("Starting force sync...")

    try {
      const result = await performFullSync()
      setSyncResult(result)
      addToSyncLog(`Sync complete! Uploaded: ${result.uploaded}, Downloaded: ${result.downloaded} orders`)

      // Refresh both local and cloud data
      checkLocalStorage()
      fetchCloudOrders()
    } catch (error) {
      console.error("Sync failed:", error)
      addToSyncLog("Sync failed. See console for details.")
    } finally {
      setIsSyncing(false)
    }
  }

  // Run data integrity check
  const runIntegrityCheck = () => {
    try {
      addToSyncLog("Running data integrity check...")

      // Get orders from local storage
      const orders = getLocalOrders()

      // Check for duplicates
      const idMap = new Map()
      let duplicateCount = 0

      for (const order of orders) {
        if (idMap.has(order.id)) {
          duplicateCount++
        } else {
          idMap.set(order.id, order)
        }
      }

      // Check for corrupted data
      let corruptedCount = 0
      const validOrders = orders.filter((order) => {
        // Basic validation
        const isValid =
          order &&
          typeof order === "object" &&
          order.id &&
          Array.isArray(order.items) &&
          typeof order.total === "number" &&
          typeof order.timestamp === "string"

        if (!isValid) corruptedCount++
        return isValid
      })

      // If we found issues, fix them
      if (duplicateCount > 0 || corruptedCount > 0) {
        // Remove duplicates by using the Map values
        const deduplicatedOrders = Array.from(idMap.values())

        // Save the fixed orders
        saveLocalOrders(deduplicatedOrders)

        setIntegrityCheckResult({
          duplicates: duplicateCount,
          corrupted: corruptedCount,
          fixed: true,
        })

        addToSyncLog(`Fixed ${duplicateCount} duplicate orders and ${corruptedCount} corrupted orders`)

        // Update local orders display
        setLocalOrders(deduplicatedOrders)
      } else {
        setIntegrityCheckResult({
          duplicates: 0,
          corrupted: 0,
          fixed: false,
        })

        addToSyncLog("Data integrity check passed - no issues found")
      }
    } catch (error) {
      console.error("Error during integrity check:", error)
      addToSyncLog("Error during integrity check. See console for details.")
    }
  }

  // Add a message to the sync log
  const addToSyncLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setSyncLog((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)])
  }

  // Load data when tab changes
  useEffect(() => {
    if (isOpen) {
      if (activeTab === "local") {
        checkLocalStorage()
      } else if (activeTab === "cloud") {
        fetchCloudOrders()
      }
    }
  }, [activeTab, isOpen])

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-4 right-4 z-50 bg-white"
        onClick={() => setIsOpen(true)}
      >
        <Database className="h-4 w-4 mr-2" />
        Debug Sync
      </Button>
    )
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-96 max-h-[80vh] overflow-auto shadow-xl">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium">Sync Debugger</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            ×
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="local" className="flex-1">
              <Database className="h-3 w-3 mr-1" /> Local Storage
            </TabsTrigger>
            <TabsTrigger value="cloud" className="flex-1">
              <Cloud className="h-3 w-3 mr-1" /> Cloud Storage
            </TabsTrigger>
            <TabsTrigger value="tools" className="flex-1">
              Tools
            </TabsTrigger>
          </TabsList>

          {/* Local Storage Tab */}
          <TabsContent value="local" className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={checkLocalStorage} disabled={isLoadingLocal}>
                <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingLocal ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" variant="outline" onClick={forceSyncNow} disabled={isSyncing} className="ml-auto">
                <ArrowUpToLine className={`h-3 w-3 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                Force Sync Now
              </Button>
            </div>

            <div>
              <h3 className="font-medium mb-2 flex items-center">
                <Database className="h-3 w-3 mr-1" /> Local Orders: {localOrders.length}
              </h3>

              {localOrders.length === 0 ? (
                <p className="text-muted-foreground italic">No orders found in local storage</p>
              ) : (
                <div className="space-y-2">
                  {localOrders.map((order, index) => (
                    <div key={index} className="border rounded p-2 bg-gray-50">
                      <div className="flex justify-between">
                        <span className="font-medium">Order #{order.id.substring(0, 8)}</span>
                        <div>
                          {order.syncedToCloud ? (
                            <Badge variant="outline" className="border-green-500 text-green-600 text-[10px]">
                              Synced
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-blue-500 text-blue-600 text-[10px]">
                              Not synced
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-muted-foreground mt-1">
                        <div>Total: €{order.total.toFixed(2)}</div>
                        <div>Date: {new Date(order.timestamp).toLocaleString()}</div>
                        {order.lastModified && (
                          <div>Last Modified: {new Date(order.lastModified).toLocaleString()}</div>
                        )}
                        {order.version && <div>Version: {order.version}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Cloud Storage Tab */}
          <TabsContent value="cloud" className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={fetchCloudOrders} disabled={isLoadingCloud}>
                <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingCloud ? "animate-spin" : ""}`} />
                Fetch Cloud Orders
              </Button>
            </div>

            {/* Server Info */}
            {serverInfo && (
              <div className="bg-gray-100 p-2 rounded text-xs">
                <h4 className="font-medium mb-1 flex items-center">
                  <Server className="h-3 w-3 mr-1" /> Server Info:
                </h4>
                <div className="space-y-1">
                  <div>Data Directory: {serverInfo.dataDir}</div>
                  <div>
                    Status:{" "}
                    {serverInfo.isWritable ? (
                      <span className="text-green-600">Writable</span>
                    ) : (
                      <span className="text-red-600">Not Writable</span>
                    )}
                  </div>
                  <div>Orders Count: {serverInfo.ordersCount}</div>
                </div>
              </div>
            )}

            <div>
              <h3 className="font-medium mb-2 flex items-center">
                <Cloud className="h-3 w-3 mr-1" /> Cloud Orders: {cloudOrders.length}
              </h3>

              {isLoadingCloud ? (
                <div className="text-center py-2">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1" />
                  <p>Loading cloud orders...</p>
                </div>
              ) : cloudOrders.length === 0 ? (
                <p className="text-muted-foreground italic">No orders found in cloud storage</p>
              ) : (
                <div className="space-y-2">
                  {cloudOrders.map((order, index) => (
                    <div key={index} className="border rounded p-2 bg-blue-50">
                      <div className="flex justify-between">
                        <span className="font-medium">Order #{order.id.substring(0, 8)}</span>
                        <Badge variant="outline" className="border-blue-500 text-blue-600 text-[10px]">
                          Cloud
                        </Badge>
                      </div>
                      <div className="text-muted-foreground mt-1">
                        <div>Total: €{order.total.toFixed(2)}</div>
                        <div>Date: {new Date(order.timestamp).toLocaleString()}</div>
                        {order.version && <div>Version: {order.version}</div>}
                        {/* Check if this order exists in local storage */}
                        {localOrders.some((localOrder) => localOrder.id === order.id) ? (
                          <div className="text-green-600 text-[10px] mt-1">✓ Also in local storage</div>
                        ) : (
                          <div className="text-orange-600 text-[10px] mt-1">! Not in local storage</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-4">
            <div className="space-y-2">
              <Button
                size="sm"
                variant="outline"
                onClick={runIntegrityCheck}
                className="w-full bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
              >
                <Shield className="h-3 w-3 mr-1" />
                Run Data Integrity Check
              </Button>

              {integrityCheckResult && (
                <div
                  className={`p-2 rounded border ${
                    integrityCheckResult.duplicates > 0 || integrityCheckResult.corrupted > 0
                      ? "bg-amber-50 border-amber-200"
                      : "bg-green-50 border-green-200"
                  }`}
                >
                  <p className="font-medium">Integrity Check Results:</p>
                  <p>Duplicate orders: {integrityCheckResult.duplicates}</p>
                  <p>Corrupted orders: {integrityCheckResult.corrupted}</p>
                  {integrityCheckResult.fixed && <p className="text-green-600">✓ Issues have been fixed</p>}
                  {!integrityCheckResult.fixed &&
                    integrityCheckResult.duplicates === 0 &&
                    integrityCheckResult.corrupted === 0 && <p className="text-green-600">✓ No issues found</p>}
                </div>
              )}

              <Separator className="my-2" />

              <Button
                size="sm"
                variant="outline"
                onClick={resetSyncStatus}
                className="w-full bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Reset Sync Status (Mark All as Not Synced)
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={forceMarkAllSynced}
                className="w-full bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
              >
                <ArrowUpToLine className="h-3 w-3 mr-1" />
                Force Mark All as Synced
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={forceSyncNow}
                disabled={isSyncing}
                className="w-full bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                Force Full Sync Now
              </Button>

              <Separator className="my-2" />

              <div className="p-2 bg-gray-100 rounded text-xs">
                <p className="font-medium mb-1 flex items-center">
                  <Info className="h-3 w-3 mr-1" /> Sync Troubleshooting:
                </p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Run "Data Integrity Check" to find and fix duplicate or corrupted orders</li>
                  <li>Check if orders exist in both local and cloud storage</li>
                  <li>If "Changes pending sync" won't disappear, try "Force Mark All as Synced"</li>
                  <li>If orders aren't uploading, try "Reset Sync Status" then sync again</li>
                  <li>Make sure you're online and have a stable connection</li>
                  <li>If cloud storage shows "Not Writable", the server may not have write permissions</li>
                </ol>
              </div>

              {syncResult && (
                <div className="p-2 bg-blue-50 rounded border border-blue-200">
                  <p className="font-medium">Last Sync Result:</p>
                  <p>Uploaded: {syncResult.uploaded} orders</p>
                  <p>Downloaded: {syncResult.downloaded} orders</p>
                </div>
              )}

              <Separator className="my-2" />

              <div>
                <h4 className="font-medium mb-1">Sync Log:</h4>
                <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded text-[10px] font-mono">
                  {syncLog.length === 0 ? (
                    <p className="text-muted-foreground italic">No sync activity logged</p>
                  ) : (
                    syncLog.map((log, index) => (
                      <div key={index} className="mb-1">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
