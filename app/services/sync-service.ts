"use client"

import { v4 as uuidv4 } from "uuid"
import { saveOrder, getOrders, deleteOrder } from "@/app/actions"

// Type for order
export type Order = {
  id: string
  items: any[]
  total: number
  amountPaid: number
  change: number
  paymentMethod: "cash" | "payconiq"
  timestamp: string
  customerName?: string
  syncedToCloud?: boolean
  lastModified?: string
  version?: number // Add version for conflict resolution
}

// Check if we're online
const isOnline = () => {
  return typeof navigator !== "undefined" && navigator.onLine
}

// Get all orders from localStorage with backup recovery
export const getLocalOrders = (): Order[] => {
  if (typeof window === "undefined") return []

  try {
    // Try to get orders from localStorage
    const savedOrders = localStorage.getItem("chiro-bmb-orders")
    if (savedOrders) {
      const orders = JSON.parse(savedOrders)
      return orders
    }
  } catch (error) {
    console.error("Failed to parse orders from localStorage:", error)

    // Try to recover from backup if main storage fails
    try {
      const backupOrders = localStorage.getItem("chiro-bmb-orders-backup")
      if (backupOrders) {
        console.log("Recovered orders from backup storage")
        return JSON.parse(backupOrders)
      }
    } catch (backupError) {
      console.error("Failed to recover from backup storage:", backupError)
    }
  }

  return []
}

// Save orders to localStorage with backup
export const saveLocalOrders = (orders: Order[]) => {
  if (typeof window === "undefined") return

  try {
    // First, create a backup of existing data before overwriting
    const currentData = localStorage.getItem("chiro-bmb-orders")
    if (currentData) {
      localStorage.setItem("chiro-bmb-orders-backup", currentData)
    }

    // Now save the new data
    localStorage.setItem("chiro-bmb-orders", JSON.stringify(orders))

    // If successful, also update the backup with the latest data
    localStorage.setItem("chiro-bmb-orders-backup", JSON.stringify(orders))
  } catch (error) {
    console.error("Failed to save orders to localStorage:", error)
    // If we can't save to localStorage, we'll rely on the previous backup
  }
}

// Sync a single order to the cloud with conflict resolution
export const syncOrderToCloud = async (order: Order): Promise<boolean> => {
  if (!isOnline()) return false

  try {
    console.log(`Attempting to sync order ${order.id.substring(0, 8)} to cloud...`)

    // Important: We need to create a clean version of the order without the syncedToCloud property
    const { syncedToCloud, lastModified, ...cleanOrder } = order

    // Add version if not present
    if (cleanOrder.version === undefined) {
      cleanOrder.version = 1
    }

    // Save to cloud - use the server action directly
    await saveOrder(cleanOrder)

    console.log(`Order ${order.id.substring(0, 8)} successfully synced to cloud`)
    return true
  } catch (error) {
    console.error(`Failed to sync order ${order.id.substring(0, 8)} to cloud:`, error)
    return false
  }
}

// Sync all local orders to the cloud
export const syncLocalOrdersToCloud = async (): Promise<number> => {
  if (!isOnline()) return 0

  const localOrders = getLocalOrders()
  let syncedCount = 0
  const updatedLocalOrders = [...localOrders] // Create a copy to update

  console.log(`Found ${localOrders.length} orders in local storage`)

  // Force sync all orders that are not marked as synced
  for (let i = 0; i < localOrders.length; i++) {
    const order = localOrders[i]

    // Only sync orders that aren't already synced
    if (!order.syncedToCloud) {
      const success = await syncOrderToCloud(order)

      if (success) {
        // Update the order in our copy to mark it as synced
        updatedLocalOrders[i] = {
          ...updatedLocalOrders[i],
          syncedToCloud: true,
          lastModified: new Date().toISOString(),
          version: (updatedLocalOrders[i].version || 0) + 1,
        }
        syncedCount++
      }
    }
  }

  // Save all updated orders back to localStorage at once
  if (syncedCount > 0) {
    saveLocalOrders(updatedLocalOrders)
  }

  return syncedCount
}

// Sync cloud orders to local storage with conflict resolution
export const syncCloudOrdersToLocal = async (): Promise<number> => {
  if (!isOnline()) return 0

  try {
    // Get orders from the cloud
    const cloudOrders = await getOrders()
    console.log(`Found ${cloudOrders.length} orders in the cloud`)

    // Get local orders
    const localOrders = getLocalOrders()

    // Create a map of local orders by ID for quick lookup
    const localOrderMap = new Map(localOrders.map((order) => [order.id, order]))

    let addedCount = 0
    let updatedCount = 0
    const updatedLocalOrders = [...localOrders] // Create a copy to update

    // Process cloud orders
    for (const cloudOrder of cloudOrders) {
      const localOrder = localOrderMap.get(cloudOrder.id)

      if (!localOrder) {
        // Case 1: Order exists in cloud but not locally - add it
        const syncedOrder = {
          ...cloudOrder,
          syncedToCloud: true,
          lastModified: new Date().toISOString(),
          version: cloudOrder.version || 1,
        }
        updatedLocalOrders.push(syncedOrder)
        addedCount++
      } else {
        // Case 2: Order exists both in cloud and locally - handle conflict

        // Use version for conflict resolution if available
        const cloudVersion = cloudOrder.version || 0
        const localVersion = localOrder.version || 0

        // If cloud version is newer or if local is not synced but older
        if (
          cloudVersion > localVersion ||
          (!localOrder.syncedToCloud &&
            new Date(cloudOrder.lastModified || cloudOrder.timestamp) >
              new Date(localOrder.lastModified || localOrder.timestamp))
        ) {
          // Cloud version wins - update local
          const mergedOrder = {
            ...cloudOrder,
            syncedToCloud: true,
            lastModified: new Date().toISOString(),
            version: Math.max(cloudVersion, localVersion) + 1,
          }

          // Find and update the order in our local copy
          const orderIndex = updatedLocalOrders.findIndex((o) => o.id === cloudOrder.id)
          if (orderIndex >= 0) {
            updatedLocalOrders[orderIndex] = mergedOrder
            updatedCount++
          }
        }
      }
    }

    if (addedCount > 0 || updatedCount > 0) {
      // Save the updated local orders
      saveLocalOrders(updatedLocalOrders)
      console.log(`Added ${addedCount} new orders, updated ${updatedCount} existing orders`)
    }

    return addedCount + updatedCount
  } catch (error) {
    console.error("Failed to sync cloud orders to local:", error)
    return 0
  }
}

// Full two-way sync with transaction-like behavior
export const performFullSync = async (): Promise<{ uploaded: number; downloaded: number }> => {
  console.log("Starting full sync process...")

  if (!isOnline()) {
    console.log("Cannot sync - device is offline")
    return { uploaded: 0, downloaded: 0 }
  }

  try {
    // First sync local to cloud
    console.log("Syncing local orders to cloud...")
    const uploaded = await syncLocalOrdersToCloud()
    console.log(`Uploaded ${uploaded} orders to cloud`)

    // Then sync cloud to local
    console.log("Syncing cloud orders to local...")
    const downloaded = await syncCloudOrdersToLocal()
    console.log(`Downloaded ${downloaded} orders from cloud`)

    console.log("Full sync completed successfully")
    return { uploaded, downloaded }
  } catch (error) {
    console.error("Error during full sync:", error)
    return { uploaded: 0, downloaded: 0 }
  }
}

// Save a new order (locally and to cloud if online)
export const saveOrderWithSync = async (
  orderData: Omit<Order, "id" | "syncedToCloud" | "version">,
): Promise<{ success: boolean; order?: Order }> => {
  // Generate a unique ID using UUID v4
  const orderId = uuidv4()

  // Create the new order with metadata
  const newOrder: Order = {
    id: orderId,
    ...orderData,
    syncedToCloud: false,
    lastModified: new Date().toISOString(),
    version: 1,
  }

  // Save to localStorage
  const localOrders = getLocalOrders()

  // Check for duplicate IDs (extremely unlikely with UUID v4, but just to be safe)
  if (localOrders.some((order) => order.id === orderId)) {
    console.error("Duplicate order ID detected, regenerating...")
    return saveOrderWithSync(orderData) // Recursively try again with a new ID
  }

  // Add the new order to the beginning of the array
  localOrders.unshift(newOrder)
  saveLocalOrders(localOrders)

  // Try to sync to cloud if online
  if (isOnline()) {
    try {
      // Important: We need to create a clean version of the order without the syncedToCloud property
      const { syncedToCloud, lastModified, ...cleanOrder } = newOrder

      // Save to cloud
      await saveOrder(cleanOrder)

      // Update the order to mark it as synced
      const updatedOrders = localOrders.map((o) =>
        o.id === newOrder.id ? { ...o, syncedToCloud: true, lastModified: new Date().toISOString() } : o,
      )
      saveLocalOrders(updatedOrders)

      // Update the newOrder reference to reflect it's synced
      newOrder.syncedToCloud = true
    } catch (error) {
      console.error("Failed to save order to cloud:", error)
      // Order is still saved locally, will sync later
    }
  }

  return { success: true, order: newOrder }
}

// Update an existing order with optimistic concurrency control
export const updateOrderWithSync = async (updatedOrder: Order): Promise<{ success: boolean; order?: Order }> => {
  // Mark as modified and not synced
  const orderToUpdate: Order = {
    ...updatedOrder,
    syncedToCloud: false,
    lastModified: new Date().toISOString(),
    version: (updatedOrder.version || 0) + 1,
  }

  // Update in localStorage
  const localOrders = getLocalOrders()

  // Find the order index
  const orderIndex = localOrders.findIndex((o) => o.id === orderToUpdate.id)

  // If order doesn't exist locally, return error
  if (orderIndex === -1) {
    console.error(`Order with ID ${orderToUpdate.id} not found in local storage`)
    return { success: false }
  }

  // Update the order
  const updatedOrders = [...localOrders]
  updatedOrders[orderIndex] = orderToUpdate
  saveLocalOrders(updatedOrders)

  // Try to sync to cloud if online
  if (isOnline()) {
    try {
      // Important: We need to create a clean version of the order without the syncedToCloud property
      const { syncedToCloud, lastModified, ...cleanOrder } = orderToUpdate

      // Save to cloud
      await saveOrder(cleanOrder)

      // Update the order to mark it as synced
      const syncedOrder = { ...orderToUpdate, syncedToCloud: true, lastModified: new Date().toISOString() }
      const syncedOrders = updatedOrders.map((o) => (o.id === orderToUpdate.id ? syncedOrder : o))
      saveLocalOrders(syncedOrders)

      // Update the orderToUpdate reference to reflect it's synced
      orderToUpdate.syncedToCloud = true
    } catch (error) {
      console.error("Failed to update order in cloud:", error)
      // Order is still updated locally, will sync later
    }
  }

  return { success: true, order: orderToUpdate }
}

// Delete an order (admin only) with safeguards
export const deleteOrderWithSync = async (orderId: string): Promise<{ success: boolean }> => {
  // Get current orders
  const localOrders = getLocalOrders()

  // Check if order exists
  const orderExists = localOrders.some((o) => o.id === orderId)
  if (!orderExists) {
    console.error(`Order with ID ${orderId} not found in local storage`)
    return { success: false }
  }

  // Instead of immediately deleting, move to a "deleted" array for recovery if needed
  try {
    // Get deleted orders array or initialize if it doesn't exist
    let deletedOrders = []
    const savedDeletedOrders = localStorage.getItem("chiro-bmb-deleted-orders")
    if (savedDeletedOrders) {
      deletedOrders = JSON.parse(savedDeletedOrders)
    }

    // Find the order to delete and add to deleted orders
    const orderToDelete = localOrders.find((o) => o.id === orderId)
    if (orderToDelete) {
      deletedOrders.push({
        ...orderToDelete,
        deletedAt: new Date().toISOString(),
      })

      // Save deleted orders
      localStorage.setItem("chiro-bmb-deleted-orders", JSON.stringify(deletedOrders))
    }
  } catch (error) {
    console.error("Failed to save to deleted orders:", error)
    // Continue with deletion even if we can't save to deleted orders
  }

  // Remove from active orders
  const updatedOrders = localOrders.filter((o) => o.id !== orderId)
  saveLocalOrders(updatedOrders)

  // Try to delete from cloud if online
  if (isOnline()) {
    try {
      await deleteOrder(orderId)
    } catch (error) {
      console.error("Failed to delete order from cloud:", error)
      // Order is still deleted locally
    }
  }

  return { success: true }
}

// Get all orders with sync and integrity check
export const getOrdersWithSync = async (): Promise<Order[]> => {
  // Try to sync with cloud first if online
  if (isOnline()) {
    try {
      await performFullSync()
    } catch (error) {
      console.error("Error during sync in getOrdersWithSync:", error)
      // Continue with local orders even if sync fails
    }
  }

  // Get local orders
  const localOrders = getLocalOrders()

  // Perform integrity check - ensure no duplicate IDs
  const seenIds = new Set<string>()
  const validOrders: Order[] = []

  for (const order of localOrders) {
    if (!seenIds.has(order.id)) {
      seenIds.add(order.id)
      validOrders.push(order)
    } else {
      console.error(`Duplicate order ID detected: ${order.id}. Keeping only the first occurrence.`)
    }
  }

  // If we found and removed duplicates, save the cleaned list
  if (validOrders.length !== localOrders.length) {
    console.log(`Removed ${localOrders.length - validOrders.length} duplicate orders`)
    saveLocalOrders(validOrders)
  }

  return validOrders
}

// Setup periodic sync with error handling
export const setupPeriodicSync = (intervalMinutes = 5) => {
  if (typeof window === "undefined") return

  // Perform initial sync
  performFullSync().catch((error) => {
    console.error("Error during initial sync:", error)
  })

  // Set up periodic sync
  const intervalId = setInterval(
    () => {
      if (isOnline()) {
        performFullSync().catch((error) => {
          console.error("Error during periodic sync:", error)
        })
      }
    },
    intervalMinutes * 60 * 1000,
  )

  // Set up online/offline event listeners
  const handleOnline = () => {
    console.log("Back online, syncing...")
    performFullSync().catch((error) => {
      console.error("Error during online sync:", error)
    })
  }

  window.addEventListener("online", handleOnline)

  return () => {
    clearInterval(intervalId)
    window.removeEventListener("online", handleOnline)
  }
}

// Add a recovery function to restore accidentally deleted orders
export const recoverDeletedOrder = async (orderId: string): Promise<{ success: boolean; order?: Order }> => {
  try {
    // Get deleted orders
    const savedDeletedOrders = localStorage.getItem("chiro-bmb-deleted-orders")
    if (!savedDeletedOrders) {
      return { success: false }
    }

    const deletedOrders = JSON.parse(savedDeletedOrders)

    // Find the deleted order
    const orderIndex = deletedOrders.findIndex((o: any) => o.id === orderId)
    if (orderIndex === -1) {
      return { success: false }
    }

    // Get the order to recover
    const orderToRecover = deletedOrders[orderIndex]

    // Remove from deleted orders
    deletedOrders.splice(orderIndex, 1)
    localStorage.setItem("chiro-bmb-deleted-orders", JSON.stringify(deletedOrders))

    // Add back to active orders
    const localOrders = getLocalOrders()

    // Make sure it's not already in active orders (shouldn't happen, but just in case)
    if (localOrders.some((o) => o.id === orderId)) {
      return { success: false }
    }

    // Add to active orders
    const recoveredOrder = {
      ...orderToRecover,
      syncedToCloud: false,
      lastModified: new Date().toISOString(),
      version: (orderToRecover.version || 0) + 1,
    }

    localOrders.push(recoveredOrder)
    saveLocalOrders(localOrders)

    // Try to sync to cloud
    if (isOnline()) {
      try {
        const { syncedToCloud, lastModified, deletedAt, ...cleanOrder } = recoveredOrder
        await saveOrder(cleanOrder)

        // Mark as synced
        recoveredOrder.syncedToCloud = true

        // Update in local storage
        const updatedOrders = localOrders.map((o) => (o.id === orderId ? { ...o, syncedToCloud: true } : o))
        saveLocalOrders(updatedOrders)
      } catch (error) {
        console.error("Failed to sync recovered order to cloud:", error)
        // Order is still recovered locally
      }
    }

    return { success: true, order: recoveredOrder }
  } catch (error) {
    console.error("Error recovering deleted order:", error)
    return { success: false }
  }
}
