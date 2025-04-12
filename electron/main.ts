import { app, BrowserWindow, ipcMain } from "electron"
import path from "path"
import fs from "fs"
import { v4 as uuidv4 } from "uuid"

// Define the path to our local database file
const userDataPath = app.getPath("userData")
const dbPath = path.join(userDataPath, "orders.json")

// Ensure the database file exists
function ensureDatabase() {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify([]), "utf8")
    }
  } catch (error) {
    console.error("Error initializing database:", error)
  }
}

// Create the main application window
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In development, load from the dev server
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:3000")
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load from the built Next.js app
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"))
  }
}

// Initialize the app
app.whenReady().then(() => {
  ensureDatabase()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

// IPC handlers for database operations
ipcMain.handle("get-orders", async () => {
  try {
    const data = fs.readFileSync(dbPath, "utf8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Error reading orders:", error)
    return []
  }
})

ipcMain.handle("save-order", async (_, orderData) => {
  try {
    const data = fs.readFileSync(dbPath, "utf8")
    const orders = JSON.parse(data)

    const newOrder = {
      id: uuidv4(),
      ...orderData,
    }

    orders.push(newOrder)
    fs.writeFileSync(dbPath, JSON.stringify(orders, null, 2), "utf8")

    return { success: true, order: newOrder }
  } catch (error) {
    console.error("Error saving order:", error)
    return { success: false, error: "Failed to save order" }
  }
})

ipcMain.handle("update-order", async (_, updatedOrder) => {
  try {
    const data = fs.readFileSync(dbPath, "utf8")
    const orders = JSON.parse(data)

    const orderIndex = orders.findIndex((order: any) => order.id === updatedOrder.id)

    if (orderIndex === -1) {
      return { success: false, error: "Order not found" }
    }

    orders[orderIndex] = updatedOrder
    fs.writeFileSync(dbPath, JSON.stringify(orders, null, 2), "utf8")

    return { success: true, order: updatedOrder }
  } catch (error) {
    console.error("Error updating order:", error)
    return { success: false, error: "Failed to update order" }
  }
})

ipcMain.handle("delete-order", async (_, orderId) => {
  try {
    const data = fs.readFileSync(dbPath, "utf8")
    const orders = JSON.parse(data)

    const updatedOrders = orders.filter((order: any) => order.id !== orderId)
    fs.writeFileSync(dbPath, JSON.stringify(updatedOrders, null, 2), "utf8")

    return { success: true }
  } catch (error) {
    console.error("Error deleting order:", error)
    return { success: false, error: "Failed to delete order" }
  }
})
