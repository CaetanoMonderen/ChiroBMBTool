"use client"
import {
  saveOrderWithSync,
  updateOrderWithSync,
  deleteOrderWithSync,
  getOrdersWithSync,
  setupPeriodicSync,
  recoverDeletedOrder,
  getLocalOrders,
  saveLocalOrders,
  type Order,
} from "./sync-service"

// Export the Order type
export type { Order }

// Get all orders
export async function getOrdersClient(): Promise<Order[]> {
  return await getOrdersWithSync()
}

// Save a new order
export async function saveOrderClient(orderData: Omit<Order, "id">): Promise<{ success: boolean; order?: Order }> {
  return await saveOrderWithSync(orderData)
}

// Update an existing order
export async function updateOrderClient(updatedOrder: Order): Promise<{ success: boolean; order?: Order }> {
  return await updateOrderWithSync(updatedOrder)
}

// Delete an order
export async function deleteOrderClient(orderId: string): Promise<{ success: boolean }> {
  return await deleteOrderWithSync(orderId)
}

// Setup sync
export function setupSync(intervalMinutes = 5) {
  return setupPeriodicSync(intervalMinutes)
}

// Recover a deleted order
export async function recoverOrder(orderId: string): Promise<{ success: boolean; order?: Order }> {
  return await recoverDeletedOrder(orderId)
}

// Export functions for data integrity
export { getLocalOrders, saveLocalOrders }
