"use server"

import { promises as fs } from "fs"
import path from "path"
import { v4 as uuidv4 } from "uuid"

// Define the path to our "database" file - with fallbacks for different environments
const getDbPath = () => {
  // For Vercel deployment or other environments where process.cwd() might not be writable
  const dataDir = process.env.NEXT_PUBLIC_DATA_DIR || path.join(process.cwd(), "data")
  return path.join(dataDir, "orders.json")
}

// Get backup database path
const getBackupDbPath = () => {
  const dataDir = process.env.NEXT_PUBLIC_DATA_DIR || path.join(process.cwd(), "data")
  return path.join(dataDir, "orders.backup.json")
}

// Ensure the data directory exists
async function ensureDirectoryExists() {
  try {
    const dataDir = path.dirname(getDbPath())
    await fs.mkdir(dataDir, { recursive: true })
  } catch (error) {
    console.error("Error creating data directory:", error)
    // Continue anyway, as the error might be due to permissions
    // and we'll handle file access errors separately
  }
}

// Create a backup of the database
async function backupDatabase() {
  try {
    const dbPath = getDbPath()
    const backupPath = getBackupDbPath()

    // Check if the main database exists
    try {
      await fs.access(dbPath)

      // Read the current database
      const data = await fs.readFile(dbPath, "utf8")

      // Write to backup
      await fs.writeFile(backupPath, data, "utf8")
      console.log("Database backup created successfully")
    } catch (error) {
      console.error("Error accessing database for backup:", error)
    }
  } catch (error) {
    console.error("Error creating database backup:", error)
  }
}

// Restore from backup if main database is corrupted
async function restoreFromBackup() {
  try {
    const dbPath = getDbPath()
    const backupPath = getBackupDbPath()

    // Check if backup exists
    try {
      await fs.access(backupPath)

      // Read the backup
      const data = await fs.readFile(backupPath, "utf8")

      // Write to main database
      await fs.writeFile(dbPath, data, "utf8")
      console.log("Database restored from backup successfully")
      return true
    } catch (error) {
      console.error("Error accessing backup for restore:", error)
      return false
    }
  } catch (error) {
    console.error("Error restoring from backup:", error)
    return false
  }
}

// Initialize the database file if it doesn't exist
async function initializeDatabase() {
  await ensureDirectoryExists()

  try {
    const dbPath = getDbPath()
    await fs.access(dbPath)
  } catch (error) {
    try {
      // File doesn't exist, create it with an empty array
      await fs.writeFile(getDbPath(), JSON.stringify([]), "utf8")
    } catch (writeError) {
      console.error("Error initializing database file:", writeError)
      // Return an empty array if we can't write to the file
      return []
    }
  }
}

// Read orders with validation and error recovery
async function readOrdersWithRecovery() {
  try {
    const data = await fs.readFile(getDbPath(), "utf8")

    try {
      // Try to parse the JSON
      const orders = JSON.parse(data)

      // Validate that it's an array
      if (!Array.isArray(orders)) {
        throw new Error("Orders data is not an array")
      }

      // Create a backup after successful read
      await backupDatabase()

      return orders
    } catch (parseError) {
      console.error("Error parsing orders JSON:", parseError)

      // Try to restore from backup
      const restored = await restoreFromBackup()
      if (restored) {
        // Try reading again
        const backupData = await fs.readFile(getDbPath(), "utf8")
        return JSON.parse(backupData)
      }

      // If restore failed, return empty array
      return []
    }
  } catch (readError) {
    console.error("Error reading orders file:", readError)

    // Try to restore from backup
    const restored = await restoreFromBackup()
    if (restored) {
      // Try reading again
      const backupData = await fs.readFile(getDbPath(), "utf8")
      return JSON.parse(backupData)
    }

    // If we can't read the file and restore failed, use a memory-based fallback
    if (global.inMemoryOrders === undefined) {
      global.inMemoryOrders = []
    }

    return global.inMemoryOrders
  }
}

// Write orders with validation and backup
async function writeOrdersWithBackup(orders: any[]) {
  // Validate that orders is an array
  if (!Array.isArray(orders)) {
    console.error("Cannot write orders: not an array")
    return false
  }

  try {
    // Create a backup before writing
    await backupDatabase()

    // Write the orders
    await fs.writeFile(getDbPath(), JSON.stringify(orders, null, 2), "utf8")

    // Update in-memory fallback
    global.inMemoryOrders = orders

    return true
  } catch (writeError) {
    console.error("Error writing orders to file:", writeError)

    // Update in-memory fallback even if file write fails
    global.inMemoryOrders = orders

    return false
  }
}

// Get all orders from the database with error handling
export async function getOrders() {
  try {
    await initializeDatabase()
    return await readOrdersWithRecovery()
  } catch (error) {
    console.error("Unexpected error in getOrders:", error)
    return []
  }
}

// Save a new order to the database with error handling and conflict resolution
export async function saveOrder(orderData: any) {
  try {
    await initializeDatabase()

    // Read existing orders
    const orders = await readOrdersWithRecovery()

    // Check if this order already exists (by ID)
    const existingOrderIndex = orders.findIndex((order: any) => order.id === orderData.id)

    if (existingOrderIndex >= 0) {
      // Update existing order with version check
      const existingOrder = orders[existingOrderIndex]

      // If incoming order has version, use it for conflict resolution
      if (orderData.version !== undefined && existingOrder.version !== undefined) {
        // Only update if incoming version is higher
        if (orderData.version > existingOrder.version) {
          orders[existingOrderIndex] = {
            ...orderData,
            version: orderData.version,
          }
          console.log(`Updated existing order with ID: ${orderData.id} (version ${orderData.version})`)
        } else {
          console.log(
            `Skipped update for order ${orderData.id}: incoming version ${orderData.version} <= existing version ${existingOrder.version}`,
          )
        }
      } else {
        // No version info, just update
        orders[existingOrderIndex] = orderData
        console.log(`Updated existing order with ID: ${orderData.id} (no version)`)
      }
    } else {
      // Create a new order with a unique ID if not provided
      const newOrder = {
        id: orderData.id || uuidv4(),
        ...orderData,
        version: orderData.version || 1,
      }

      // Add the new order to the array
      orders.push(newOrder)
      console.log(`Added new order with ID: ${newOrder.id}`)
    }

    // Write the updated orders
    await writeOrdersWithBackup(orders)

    return { success: true, order: orderData }
  } catch (error) {
    console.error("Unexpected error in saveOrder:", error)
    throw new Error("Failed to save order")
  }
}

// Update an existing order with error handling and optimistic concurrency
export async function updateOrder(updatedOrder: any) {
  try {
    await initializeDatabase()

    // Read existing orders
    const orders = await readOrdersWithRecovery()

    // Find the order to update
    const orderIndex = orders.findIndex((order: any) => order.id === updatedOrder.id)

    if (orderIndex === -1) {
      throw new Error("Order not found")
    }

    // Get existing order
    const existingOrder = orders[orderIndex]

    // Check version if available
    if (updatedOrder.version !== undefined && existingOrder.version !== undefined) {
      // Only update if incoming version is higher
      if (updatedOrder.version > existingOrder.version) {
        orders[orderIndex] = updatedOrder
        console.log(`Updated order ${updatedOrder.id} (version ${updatedOrder.version})`)
      } else {
        console.log(
          `Skipped update for order ${updatedOrder.id}: incoming version ${updatedOrder.version} <= existing version ${existingOrder.version}`,
        )
        return { success: false, error: "Conflict: newer version exists" }
      }
    } else {
      // No version info, just update
      orders[orderIndex] = updatedOrder
    }

    // Write the updated orders
    await writeOrdersWithBackup(orders)

    return { success: true, order: updatedOrder }
  } catch (error) {
    console.error("Unexpected error in updateOrder:", error)
    throw new Error("Failed to update order")
  }
}

// Delete an order with error handling and soft delete
export async function deleteOrder(orderId: string) {
  try {
    await initializeDatabase()

    // Read existing orders
    const orders = await readOrdersWithRecovery()

    // Find the order to delete
    const orderToDelete = orders.find((order: any) => order.id === orderId)

    if (!orderToDelete) {
      console.log(`Order with ID ${orderId} not found for deletion`)
      return { success: false, error: "Order not found" }
    }

    // Store deleted order in a separate collection for potential recovery
    try {
      const deletedOrdersPath = path.join(path.dirname(getDbPath()), "deleted-orders.json")

      let deletedOrders = []
      try {
        // Try to read existing deleted orders
        const data = await fs.readFile(deletedOrdersPath, "utf8")
        deletedOrders = JSON.parse(data)
      } catch (error) {
        // File doesn't exist or can't be read, start with empty array
        deletedOrders = []
      }

      // Add the order to deleted orders with timestamp
      deletedOrders.push({
        ...orderToDelete,
        deletedAt: new Date().toISOString(),
      })

      // Write deleted orders
      await fs.writeFile(deletedOrdersPath, JSON.stringify(deletedOrders, null, 2), "utf8")
    } catch (error) {
      console.error("Error saving deleted order:", error)
      // Continue with deletion even if we can't save deleted order
    }

    // Filter out the order to delete
    const updatedOrders = orders.filter((order: any) => order.id !== orderId)

    // Write the updated orders
    await writeOrdersWithBackup(updatedOrders)

    return { success: true }
  } catch (error) {
    console.error("Unexpected error in deleteOrder:", error)
    throw new Error("Failed to delete order")
  }
}

// Add a type declaration for the global object
declare global {
  var inMemoryOrders: any[] | undefined
}
