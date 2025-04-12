"use client"

import type React from "react"

import { useState, useEffect } from "react"
import {
  PlusCircle,
  MinusCircle,
  ShoppingCart,
  Trash2,
  Euro,
  History,
  Lock,
  Edit,
  Save,
  X,
  Smartphone,
  Check,
  Download,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Image from "next/image"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

// Import the database service
import {
  getOrdersClient,
  saveOrderClient,
  updateOrderClient,
  deleteOrderClient,
  setupSync,
  type Order,
} from "@/app/services/database"

// Add this import at the top with the other imports
import SyncDebugger from "@/app/components/sync-debugger"

// Update the MENU_ITEMS object to include donations
const MENU_ITEMS = {
  pasta: [
    { id: "spaghetti-bolognaise", name: "Spaghetti Bolognaise", price: 15 },
    { id: "veggie", name: "Veggie", price: 15 },
  ],
  kidsMenu: [
    { id: "kleine-bolognaise", name: "Kleine Bolognaise", price: 12 },
    { id: "kleine-veggie", name: "Kleine Veggie", price: 12 },
  ],
  takeAway: [
    { id: "grote-portie-takeaway", name: "Per grote portie", price: 12 },
    { id: "kleine-portie-takeaway", name: "Per kleine (kids) portie", price: 10 },
  ],
  desserts: [
    { id: "frisco-calippo", name: "Frisco, Calippo", price: 2.5 },
    { id: "taart", name: "Taart", price: 3.5 },
  ],
  extras: [
    { id: "saus-per-kg", name: "Saus per kg", price: 11 },
    { id: "tombola", name: "Tombola", price: 3 },
  ],
  jetons: [
    { id: "rode-jeton", name: "Rode Jeton", price: 3.5 },
    { id: "gele-jeton", name: "Gele Jeton", price: 2.5 },
  ],
  donations: [
    { id: "donation-5", name: "Donation", price: 5 },
    { id: "donation-10", name: "Donation", price: 10 },
    { id: "donation-20", name: "Donation", price: 20 },
    { id: "donation-custom", name: "Custom Donation", price: 0, isCustom: true },
  ],
}

// Common payment amounts for quick selection
const PAYMENT_AMOUNTS = [5, 10, 20, 50, 100]

// Admin password - in a real app, this would be securely stored
const ADMIN_PASSWORD = "admin123"

type CartItem = {
  id: string
  name: string
  price: number
  quantity: number
}

// Define the SyncStatus type
type SyncStatus = {
  lastSync: Date | null
  pendingChanges: number
}

export default function CashierSystem() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string>("pasta")
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [amountPaid, setAmountPaid] = useState<string>("")
  const [changeCalculated, setChangeCalculated] = useState<number | null>(null)
  // Removed dummy mode - always in client mode
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "payconiq">("cash")
  const [payconiqStatus, setPayconiqStatus] = useState<"pending" | "completed">("pending")
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true)

  // Admin state
  const [adminDialogOpen, setAdminDialogOpen] = useState(false)
  const [adminPassword, setAdminPassword] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminError, setAdminError] = useState("")
  const [adminOrdersOpen, setAdminOrdersOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editedItems, setEditedItems] = useState<CartItem[]>([])

  // Add state for custom donation amount
  const [customDonationAmount, setCustomDonationAmount] = useState<string>("")
  const [showCustomDonation, setShowCustomDonation] = useState(false)

  // Add a new state for the customer name:
  const [customerName, setCustomName] = useState<string>("")

  // Add state for sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSync: null,
    pendingChanges: 0,
  })

  // Add service worker registration
  useEffect(() => {
    // Load the service worker registration script
    const script = document.createElement("script")
    script.src = "/register-sw.js"
    script.async = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  // Setup sync and online status monitoring
  useEffect(() => {
    // Set up online/offline detection
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    // Setup periodic sync (every 5 minutes)
    const cleanupSync = setupSync(5)

    // Initial load of orders
    fetchOrders()

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      if (cleanupSync) cleanupSync()
    }
  }, [])

  // Fetch orders when history dialog or admin orders dialog opens
  useEffect(() => {
    if (orderHistoryOpen || adminOrdersOpen) {
      fetchOrders()
    }
  }, [orderHistoryOpen, adminOrdersOpen])

  // Reset payment method when checkout dialog opens
  useEffect(() => {
    if (checkoutOpen) {
      setPaymentMethod("cash")
      setPayconiqStatus("pending")
    }
  }, [checkoutOpen])

  // Fetch orders with sync
  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      // Get orders from the client-side service with sync
      const fetchedOrders = await getOrdersClient()

      // Count pending changes (orders not synced to cloud)
      const pendingChanges = fetchedOrders.filter((order) => !order.syncedToCloud).length

      // Update sync status
      setSyncStatus({
        lastSync: new Date(),
        pendingChanges,
      })

      // Sort by timestamp (newest first)
      fetchedOrders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      // Update state
      setOrders(fetchedOrders)
    } catch (error) {
      console.error("Failed to fetch orders:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const addToCart = (item: { id: string; name: string; price: number; isCustom?: boolean }) => {
    if (item.isCustom) {
      setShowCustomDonation(true)
    } else {
      setCart((prevCart) => {
        const existingItem = prevCart.find((cartItem) => cartItem.id === item.id)

        if (existingItem) {
          return prevCart.map((cartItem) =>
            cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem,
          )
        } else {
          return [...prevCart, { ...item, quantity: 1 }]
        }
      })
    }
  }

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === itemId)

      if (existingItem && existingItem.quantity > 1) {
        return prevCart.map((item) => (item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item))
      } else {
        return prevCart.filter((item) => item.id !== itemId)
      }
    })
  }

  const clearCart = () => {
    setCart([])
  }

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0)
  }

  const handleCheckout = () => {
    setAmountPaid("")
    setChangeCalculated(null)
    setCustomName("") // Add this line
    setCheckoutOpen(true)
  }

  const handlePaymentAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only numbers and decimal point
    const value = e.target.value.replace(/[^0-9.]/g, "")
    setAmountPaid(value)

    const paid = Number.parseFloat(value || "0")
    const total = calculateTotal()

    if (paid >= total) {
      setChangeCalculated(paid - total)
    } else {
      setChangeCalculated(null)
    }
  }

  const handleQuickAmount = (amount: number) => {
    setAmountPaid(amount.toString())
    const total = calculateTotal()
    setChangeCalculated(amount - total)
  }

  const handlePayconiqComplete = () => {
    setPayconiqStatus("completed")
  }

  // Modify the completeTransaction function to save with sync
  const completeTransaction = async () => {
    const total = calculateTotal()

    // Prepare order data based on payment method
    let orderData: any = {
      items: [...cart],
      total,
      paymentMethod,
      timestamp: new Date().toISOString(),
      customerName: customerName.trim() || undefined,
    }

    if (paymentMethod === "cash") {
      const paid = Number.parseFloat(amountPaid)
      const change = changeCalculated || 0
      orderData = {
        ...orderData,
        amountPaid: paid,
        change,
      }
    } else {
      // For Payconiq, the exact amount is paid
      orderData = {
        ...orderData,
        amountPaid: total,
        change: 0,
      }
    }

    try {
      // Save order using our client-side service with sync
      const result = await saveOrderClient(orderData)
      if (result.success) {
        // Update orders state with the new order
        setOrders((prevOrders) => [result.order!, ...prevOrders])

        // Update sync status
        setSyncStatus((prev) => ({
          ...prev,
          pendingChanges: isOnline ? prev.pendingChanges : prev.pendingChanges + 1,
        }))
      }
    } catch (error) {
      console.error("Failed to save order:", error)
    }

    setCheckoutOpen(false)
    clearCart()
  }

  // Admin functions
  const handleAdminLogin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdmin(true)
      setAdminError("")
      setAdminDialogOpen(false)
      setAdminOrdersOpen(true)
    } else {
      setAdminError("Incorrect password")
    }
  }

  const handleAdminLogout = () => {
    setIsAdmin(false)
    setAdminPassword("")
    setAdminOrdersOpen(false)
  }

  const startEditOrder = (order: Order) => {
    setEditingOrder(order)
    setEditedItems([...order.items])
  }

  const cancelEditOrder = () => {
    setEditingOrder(null)
    setEditedItems([])
  }

  const updateItemQuantity = (itemIndex: number, newQuantity: number) => {
    if (newQuantity < 1) return

    setEditedItems((prev) => {
      const updated = [...prev]
      updated[itemIndex] = { ...updated[itemIndex], quantity: newQuantity }
      return updated
    })
  }

  // Modify the saveEditedOrder function to update with sync
  const saveEditedOrder = async () => {
    if (!editingOrder) return

    // Calculate new total based on edited items
    const newTotal = editedItems.reduce((total, item) => total + item.price * item.quantity, 0)

    // Calculate new change based on new total
    const newChange = editingOrder.paymentMethod === "cash" ? editingOrder.amountPaid - newTotal : 0

    const updatedOrder = {
      ...editingOrder,
      items: editedItems,
      total: newTotal,
      change: newChange,
    }

    try {
      // Update order using our client-side service with sync
      const result = await updateOrderClient(updatedOrder)
      if (result.success) {
        setEditingOrder(null)
        setEditedItems([])
        fetchOrders() // Refresh orders list
      }
    } catch (error) {
      console.error("Failed to update order:", error)
    }
  }

  // Modify the handleDeleteOrder function to delete with sync
  const handleDeleteOrder = async (orderId: string) => {
    if (confirm("Are you sure you want to delete this order? This action cannot be undone.")) {
      try {
        // Delete order using our client-side service with sync
        const result = await deleteOrderClient(orderId)
        if (result.success) {
          fetchOrders() // Refresh orders list
        }
      } catch (error) {
        console.error("Failed to delete order:", error)
      }
    }
  }

  // Update the categories object to include donations
  const categories = {
    pasta: "Pasta",
    kidsMenu: "Voor de Kids",
    takeAway: "Take-Away",
    desserts: "Dessertjes",
    extras: "Extras",
    jetons: "Jetons",
    donations: "Donations",
  }

  // Add a function to handle custom donation
  const handleCustomDonation = () => {
    const amount = Number.parseFloat(customDonationAmount)
    if (!isNaN(amount) && amount > 0) {
      const customDonation = {
        id: `donation-custom-${Date.now()}`, // Create unique ID
        name: `Donation (€${amount.toFixed(2)})`,
        price: amount,
        quantity: 1,
      }
      setCart((prevCart) => [...prevCart, customDonation])
      setCustomDonationAmount("")
      setShowCustomDonation(false)
    }
  }

  // Function to download order history as PDF
  const downloadOrderHistoryAsPDF = () => {
    // Create a new PDF document
    const doc = new jsPDF()

    // Add title
    doc.setFontSize(18)
    doc.text("Chiro BMB - Order History", 14, 22)

    // Add date
    doc.setFontSize(11)
    doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 30)

    // Prepare data for the table
    const tableData = orders.map((order) => {
      const date = new Date(order.timestamp).toLocaleString()
      const orderId = order.id.substring(0, 8)
      const paymentMethod = order.paymentMethod === "cash" ? "Cash" : "Payconiq"
      const total = `€${order.total.toFixed(2)}`

      return [orderId, date, paymentMethod, total]
    })

    // Add the table with headers using the imported autoTable function
    autoTable(doc, {
      head: [["Order ID", "Date & Time", "Payment Method", "Total"]],
      body: tableData,
      startY: 35,
      headStyles: { fillColor: [76, 175, 158] },
      alternateRowStyles: { fillColor: [240, 240, 240] },
    })

    // Get the final Y position after the table
    const finalY = (doc as any).lastAutoTable.finalY || 35
    let yPos = finalY + 15

    orders.forEach((order, index) => {
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage()
        yPos = 20
      }

      // Order header
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text(`Order #${order.id.substring(0, 8)}${order.customerName ? ` - ${order.customerName}` : ""}`, 14, yPos)
      yPos += 7

      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      doc.text(`Date: ${new Date(order.timestamp).toLocaleString()}`, 14, yPos)
      yPos += 5

      doc.text(`Payment: ${order.paymentMethod === "cash" ? "Cash" : "Payconiq"}`, 14, yPos)
      yPos += 5

      if (order.paymentMethod === "cash") {
        doc.text(`Amount Paid: €${order.amountPaid.toFixed(2)} | Change: €${order.change.toFixed(2)}`, 14, yPos)
      } else {
        doc.text(`Amount Paid: €${order.total.toFixed(2)}`, 14, yPos)
      }
      yPos += 7

      // Items table
      const itemsData = order.items.map((item) => [
        item.name,
        `${item.quantity}`,
        `€${item.price.toFixed(2)}`,
        `€${(item.price * item.quantity).toFixed(2)}`,
      ])

      autoTable(doc, {
        head: [["Item", "Qty", "Price", "Subtotal"]],
        body: itemsData,
        startY: yPos,
        theme: "grid",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [248, 193, 86], textColor: [0, 0, 0] },
        margin: { left: 14 },
        tableWidth: 180,
      })

      // Update Y position for next order
      const itemsTableFinalY = (doc as any).lastAutoTable.finalY || yPos
      yPos = itemsTableFinalY + 15

      // Add a separator line between orders (except for the last one)
      if (index < orders.length - 1) {
        doc.setDrawColor(200, 200, 200)
        doc.line(14, yPos - 7, 196, yPos - 7)
      }
    })

    // Save the PDF
    doc.save("chiro-bmb-order-history.pdf")
  }

  // Function to download order history as Excel
  const downloadOrderHistoryAsExcel = () => {
    // Create a new workbook
    const wb = XLSX.utils.book_new()

    // Create a worksheet with order summary
    const summaryData = orders.map((order) => {
      return {
        "Order ID": order.id.substring(0, 8),
        Customer: order.customerName || "",
        Date: new Date(order.timestamp).toLocaleString(),
        "Payment Method": order.paymentMethod === "cash" ? "Cash" : "Payconiq",
        Total: order.total.toFixed(2),
        "Amount Paid": order.amountPaid.toFixed(2),
        Change: order.change.toFixed(2),
        Synced: order.syncedToCloud ? "Yes" : "No",
      }
    })

    const summaryWs = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, summaryWs, "Order Summary")

    // Create a detailed worksheet with all items
    const detailedData: any[] = []

    orders.forEach((order) => {
      // Add a row for each item in the order
      order.items.forEach((item) => {
        detailedData.push({
          "Order ID": order.id.substring(0, 8),
          Customer: order.customerName || "",
          Date: new Date(order.timestamp).toLocaleString(),
          Item: item.name,
          Quantity: item.quantity,
          Price: item.price.toFixed(2),
          Subtotal: (item.price * item.quantity).toFixed(2),
          "Payment Method": order.paymentMethod === "cash" ? "Cash" : "Payconiq",
          "Total Order Value": order.total.toFixed(2),
        })
      })

      // Add an empty row between orders for better readability
      detailedData.push({})
    })

    const detailedWs = XLSX.utils.json_to_sheet(detailedData)
    XLSX.utils.book_append_sheet(wb, detailedWs, "Order Details")

    // Generate the Excel file and trigger download
    XLSX.writeFile(wb, "chiro-bmb-order-history.xlsx")
  }

  // Add this function to the CashierSystem component, replacing the existing handleSync function:
  const handleSync = async () => {
    try {
      setIsLoading(true)
      // Import the function at the top of the file
      const { performFullSync } = await import("@/app/services/sync-service")

      // Perform the sync operation
      const result = await performFullSync()

      // After sync, immediately update the orders and sync status
      const updatedOrders = await getOrdersClient()

      // Sort by timestamp (newest first)
      updatedOrders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      // Update the orders state
      setOrders(updatedOrders)

      // Count pending changes after sync
      const pendingChanges = updatedOrders.filter((order) => !order.syncedToCloud).length

      // Update sync status
      setSyncStatus({
        lastSync: new Date(),
        pendingChanges,
      })

      // Show success message
      alert(`Sync complete! Uploaded: ${result.uploaded}, Downloaded: ${result.downloaded} orders`)
    } catch (error) {
      console.error("Sync failed:", error)
      alert("Sync failed. Check console for details.")
    } finally {
      setIsLoading(false)
    }
  }

  const totalAmount = calculateTotal()

  return (
    <div className="min-h-screen bg-[#f5f0e0] p-4 md:p-8 relative">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 text-center">
          <div className="flex justify-center gap-4 mb-4">
            <div className="relative w-[180px] h-[240px] overflow-hidden rounded-lg shadow-md">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/73cb9027-66c8-4a36-95da-1e99977f5a6e-XWwM5k6IOf7hUhoYULmZiWtIajMzw6.jpeg"
                alt="Pasta Menu 1"
                fill
                className="object-cover"
              />
            </div>
            <div className="relative w-[180px] h-[240px] overflow-hidden rounded-lg shadow-md">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/df8c3388-0264-45ad-9e9b-8bb0557e7bc4-rzRFaiivs3e3HHy6z9dLi8HroEwcv0.jpeg"
                alt="Pasta Menu 2"
                fill
                className="object-cover"
              />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-[#2c2c2c] mb-2">CHIRO BMB TOOL V1.2</h1>
          <h2 className="text-lg italic font-normal text-gray-500">Made By Caetano Monderen</h2>

          {/* Connection Status Indicator */}
          <div className="mt-2 flex items-center justify-center gap-2">
            {isOnline ? (
              <Badge className="bg-green-500 flex items-center gap-1">
                <Wifi className="h-3 w-3" /> Online
              </Badge>
            ) : (
              <Badge variant="outline" className="border-orange-500 text-orange-600 flex items-center gap-1">
                <WifiOff className="h-3 w-3" /> Offline
              </Badge>
            )}

            {syncStatus.pendingChanges > 0 && (
              <Badge variant="outline" className="border-blue-500 text-blue-600">
                {syncStatus.pendingChanges} change{syncStatus.pendingChanges !== 1 ? "s" : ""} pending sync
              </Badge>
            )}
            <Button onClick={handleSync} size="sm" variant="outline" className="ml-2">
              <RefreshCw className="h-3 w-3 mr-1" /> Force Sync
            </Button>
          </div>
        </header>

        {/* Mode Selection, Order History, and Admin */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              onClick={() => setOrderHistoryOpen(true)}
              className="flex items-center gap-2 flex-1 md:flex-none"
            >
              <History className="h-4 w-4" />
              Order History
            </Button>

            <Button
              variant={isAdmin ? "default" : "outline"}
              onClick={() => (isAdmin ? setAdminOrdersOpen(true) : setAdminDialogOpen(true))}
              className={`flex items-center gap-2 flex-1 md:flex-none ${isAdmin ? "bg-red-600 hover:bg-red-700" : ""}`}
            >
              <Lock className="h-4 w-4" />
              {isAdmin ? "Admin Panel" : "Admin"}
            </Button>

            {isAdmin && (
              <Button variant="outline" onClick={handleAdminLogout} className="flex items-center gap-2">
                <X className="h-4 w-4" />
                Exit Admin
              </Button>
            )}
          </div>
        </div>

        {/* Mode Description */}
        <div
          className={`p-4 rounded-md mb-6 ${
            isAdmin ? "bg-red-100 border border-red-300" : "bg-green-100 border border-green-300"
          }`}
        >
          {isAdmin ? (
            <p className="text-red-800">
              <span className="font-bold">Admin Mode:</span> You can view and modify all orders in the system.
            </p>
          ) : (
            <p className="text-green-800">
              <span className="font-bold">Client Mode:</span> All orders are saved locally and synced to the cloud when
              online.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Menu Section */}
          <div className="md:col-span-2">
            <Card className="bg-white shadow-lg">
              <CardHeader className="bg-[#4caf9e] text-white">
                <CardTitle>Menu</CardTitle>
                <CardDescription className="text-white/90">Select items to add to the order</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-wrap gap-2 mb-6">
                  {Object.entries(categories).map(([key, value]) => (
                    <Button
                      key={key}
                      variant={activeCategory === key ? "default" : "outline"}
                      onClick={() => setActiveCategory(key)}
                      className="mb-2"
                    >
                      {value}
                    </Button>
                  ))}
                </div>

                {/* Update the menu section to handle donations differently */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeCategory === "donations" ? (
                    <>
                      {MENU_ITEMS.donations.map((item) => (
                        <Card
                          key={item.id}
                          className={`bg-[#fff9e6] border-[#f8c156] ${item.isCustom ? "col-span-full" : ""}`}
                        >
                          <CardContent className="p-4 flex justify-between items-center">
                            <div>
                              <h3 className="font-medium">
                                {item.isCustom ? "Custom Donation" : `Donate €${item.price.toFixed(2)}`}
                              </h3>
                              {!item.isCustom && (
                                <p className="text-sm text-muted-foreground">Support Chiro Boortmeerbeek</p>
                              )}
                            </div>
                            {item.isCustom ? (
                              <Button
                                onClick={() => setShowCustomDonation(true)}
                                size="sm"
                                className="bg-[#f8c156] hover:bg-[#e6a93a] text-black"
                              >
                                <PlusCircle className="h-5 w-5 mr-1" /> Custom Amount
                              </Button>
                            ) : (
                              <Button
                                onClick={() => addToCart(item)}
                                size="sm"
                                className="bg-[#f8c156] hover:bg-[#e6a93a] text-black"
                              >
                                <PlusCircle className="h-5 w-5 mr-1" /> Add
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}

                      {/* Custom Donation Input */}
                      {showCustomDonation && (
                        <Card className="col-span-full bg-[#fff9e6] border-[#f8c156]">
                          <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row gap-3 items-center">
                              <div className="flex-grow w-full">
                                <label htmlFor="custom-donation" className="text-sm font-medium mb-1 block">
                                  Enter donation amount (€)
                                </label>
                                <div className="relative">
                                  <Euro className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    id="custom-donation"
                                    value={customDonationAmount}
                                    onChange={(e) => setCustomDonationAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                                    className="pl-9"
                                    placeholder="0.00"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 mt-4 sm:mt-0">
                                <Button variant="outline" onClick={() => setShowCustomDonation(false)}>
                                  Cancel
                                </Button>
                                <Button
                                  onClick={handleCustomDonation}
                                  disabled={!customDonationAmount || Number.parseFloat(customDonationAmount) <= 0}
                                  className="bg-[#f8c156] hover:bg-[#e6a93a] text-black"
                                >
                                  Add Donation
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  ) : (
                    MENU_ITEMS[activeCategory as keyof typeof MENU_ITEMS].map((item) => (
                      <Card key={item.id} className="bg-[#fff9e6] border-[#f8c156]">
                        <CardContent className="p-4 flex justify-between items-center">
                          <div>
                            <h3 className="font-medium">{item.name}</h3>
                            <p className="text-lg font-bold">€{item.price.toFixed(2)}</p>
                          </div>
                          <Button
                            onClick={() => addToCart(item)}
                            size="sm"
                            className="bg-[#f8c156] hover:bg-[#e6a93a] text-black"
                          >
                            <PlusCircle className="h-5 w-5 mr-1" /> Add
                          </Button>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Order Summary Section */}
          <div>
            <Card className="bg-white shadow-lg">
              <CardHeader className="bg-[#f8c156] text-black">
                <div className="flex justify-between items-center">
                  <CardTitle>Order Summary</CardTitle>
                  <ShoppingCart className="h-6 w-6" />
                </div>
                <CardDescription className="text-black/70">
                  Items in cart: {cart.reduce((total, item) => total + item.quantity, 0)}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {cart.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">No items in cart</p>
                ) : (
                  <div className="space-y-4">
                    {cart.map((item) => (
                      <div key={item.id} className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            €{item.price.toFixed(2)} x {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeFromCart(item.id)}
                          >
                            <MinusCircle className="h-4 w-4" />
                          </Button>
                          <Badge variant="outline" className="text-base px-3 py-1">
                            {item.quantity}
                          </Badge>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => addToCart(item)}>
                            <PlusCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              <Separator />
              <CardFooter className="p-6 flex-col gap-4">
                <div className="w-full flex justify-between items-center">
                  <p className="text-lg font-bold">Total:</p>
                  <p className="text-2xl font-bold">€{totalAmount.toFixed(2)}</p>
                </div>
                <div className="flex gap-2 w-full">
                  <Button variant="outline" className="flex-1" onClick={clearCart}>
                    <Trash2 className="h-4 w-4 mr-2" /> Clear
                  </Button>
                  <Button
                    className="flex-1 bg-[#4caf9e] hover:bg-[#3d9080]"
                    disabled={cart.length === 0}
                    onClick={handleCheckout}
                  >
                    Checkout
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>

        {/* Checkout Dialog */}
        <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Complete Payment</DialogTitle>
              <DialogDescription>Select payment method and complete the transaction.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Total Due:</h3>
                <p className="text-xl font-bold">€{totalAmount.toFixed(2)}</p>
              </div>

              {/* Add Customer Name Input */}
              <div className="space-y-2">
                <label htmlFor="customer-name" className="text-sm font-medium">
                  Customer Name (optional)
                </label>
                <Input
                  id="customer-name"
                  value={customerName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Enter customer name"
                />
              </div>

              <Separator />

              {/* Payment Method Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Method</label>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as "cash" | "payconiq")}
                  className="grid grid-cols-2 gap-4"
                >
                  <div>
                    <RadioGroupItem value="cash" id="cash" className="peer sr-only" />
                    <Label
                      htmlFor="cash"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <Euro className="mb-3 h-6 w-6" />
                      Cash
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="payconiq" id="payconiq" className="peer sr-only" />
                    <Label
                      htmlFor="payconiq"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-[#1dce4c] [&:has([data-state=checked])]:border-[#1dce4c]"
                    >
                      <Smartphone className="mb-3 h-6 w-6 text-[#1dce4c]" />
                      Payconiq
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Cash Payment Section */}
              {paymentMethod === "cash" && (
                <>
                  <div className="space-y-2">
                    <label htmlFor="amount-paid" className="text-sm font-medium">
                      Amount Received
                    </label>
                    <div className="relative">
                      <Euro className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="amount-paid"
                        value={amountPaid}
                        onChange={handlePaymentAmountChange}
                        className="pl-9"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Quick Amounts</label>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_AMOUNTS.map((amount) => (
                        <Button
                          key={amount}
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuickAmount(amount)}
                          className="flex-1"
                        >
                          €{amount}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {changeCalculated !== null && (
                    <div className="bg-[#e6f7f2] p-4 rounded-md border border-[#4caf9e]">
                      <h3 className="font-medium text-[#2c2c2c] mb-1">Change Due:</h3>
                      <p className="text-2xl font-bold text-[#4caf9e]">€{changeCalculated.toFixed(2)}</p>
                    </div>
                  )}
                </>
              )}

              {/* Payconiq Payment Section */}
              {paymentMethod === "payconiq" && (
                <div className="space-y-4">
                  {payconiqStatus === "pending" ? (
                    <div className="bg-[#f0f9f1] p-4 rounded-md border border-[#1dce4c] text-center">
                      <h3 className="font-medium text-[#1dce4c] mb-2">Payconiq Payment</h3>
                      <p className="text-sm text-gray-600 mb-4">Amount to be paid: €{totalAmount.toFixed(2)}</p>
                      <Button onClick={handlePayconiqComplete} className="bg-[#1dce4c] hover:bg-[#19b843] text-white">
                        <Check className="h-4 w-4 mr-2" /> Confirm Payment Received
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-[#f0f9f1] p-4 rounded-md border border-[#1dce4c] text-center">
                      <Check className="h-12 w-12 text-[#1dce4c] mx-auto mb-2" />
                      <h3 className="font-medium text-[#1dce4c] mb-1">Payment Successful!</h3>
                      <p className="text-sm text-gray-600">€{totalAmount.toFixed(2)} has been received via Payconiq</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
              <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={completeTransaction}
                disabled={
                  (paymentMethod === "cash" && changeCalculated === null) ||
                  (paymentMethod === "payconiq" && payconiqStatus === "pending")
                }
                className="bg-[#4caf9e] hover:bg-[#3d9080]"
              >
                Complete Transaction
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Order History Dialog */}
        <Dialog open={orderHistoryOpen} onOpenChange={setOrderHistoryOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Order History</DialogTitle>
              <DialogDescription>View all past client orders</DialogDescription>
            </DialogHeader>

            {/* Add Download buttons - fixed at the top */}
            <div className="flex justify-end mb-4 sticky top-0 bg-background pt-2 pb-2 z-10 gap-2">
              <Button onClick={downloadOrderHistoryAsExcel} variant="outline" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download as Excel
              </Button>
              <Button onClick={downloadOrderHistoryAsPDF} variant="outline" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download as PDF
              </Button>
            </div>

            {/* Make the orders list scrollable */}
            <div className="flex-1 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="text-center py-8">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No orders found</div>
              ) : (
                <div className="space-y-6">
                  {orders.map((order) => (
                    <Card key={order.id} className="bg-white">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg">
                              Order #{order.id.substring(0, 8)}
                              {order.customerName && ` - ${order.customerName}`}
                            </CardTitle>
                            <CardDescription>{new Date(order.timestamp).toLocaleString()}</CardDescription>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center justify-end gap-2 mb-1">
                              <p className="font-medium">Total: €{order.total.toFixed(2)}</p>
                              {order.paymentMethod === "payconiq" ? (
                                <Badge className="bg-[#1dce4c]">Payconiq</Badge>
                              ) : (
                                <Badge>Cash</Badge>
                              )}
                              {!order.syncedToCloud && (
                                <Badge variant="outline" className="border-blue-500 text-blue-600">
                                  Not synced
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {order.paymentMethod === "cash"
                                ? `Paid: €${order.amountPaid.toFixed(2)} | Change: €${order.change.toFixed(2)}`
                                : `Paid via Payconiq: €${order.total.toFixed(2)}`}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <h4 className="font-medium mb-2">Items:</h4>
                        <div className="space-y-1">
                          {order.items.map((item, index) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span>
                                {item.name} x{item.quantity}
                              </span>
                              <span>€{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="mt-4 border-t pt-4">
              <Button onClick={() => setOrderHistoryOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Admin Login Dialog */}
        <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Admin Access</DialogTitle>
              <DialogDescription>Enter the admin password to access admin features.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label htmlFor="admin-password" className="text-sm font-medium">
                  Admin Password
                </label>
                <Input
                  id="admin-password"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>

              {adminError && (
                <Alert variant="destructive">
                  <AlertDescription>{adminError}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAdminDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdminLogin} disabled={!adminPassword}>
                Login
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Admin Orders Dialog */}
        <Dialog
          open={adminOrdersOpen}
          onOpenChange={(open) => {
            if (!open) {
              cancelEditOrder()
            }
            setAdminOrdersOpen(open)
          }}
        >
          <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Admin: Order Management
              </DialogTitle>
              <DialogDescription>View, edit, or delete orders in the system</DialogDescription>
            </DialogHeader>

            {/* Add Download buttons - fixed at the top */}
            <div className="flex justify-end mb-4 sticky top-0 bg-background pt-2 pb-2 z-10 gap-2">
              <Button onClick={downloadOrderHistoryAsExcel} variant="outline" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download as Excel
              </Button>
              <Button onClick={downloadOrderHistoryAsPDF} variant="outline" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download as PDF
              </Button>
            </div>

            {/* Make the orders list scrollable */}
            <div className="flex-1 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="text-center py-8">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No orders found</div>
              ) : (
                <div className="space-y-6">
                  {orders.map((order) => (
                    <Card
                      key={order.id}
                      className={`bg-white ${editingOrder?.id === order.id ? "border-2 border-blue-500" : ""}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg">
                              Order #{order.id.substring(0, 8)}
                              {order.customerName && ` - ${order.customerName}`}
                            </CardTitle>
                            <CardDescription>{new Date(order.timestamp).toLocaleString()}</CardDescription>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center justify-end gap-2 mb-1">
                              <p className="font-medium">
                                Total: €
                                {editingOrder?.id === order.id
                                  ? editedItems
                                      .reduce((total, item) => total + item.price * item.quantity, 0)
                                      .toFixed(2)
                                  : order.total.toFixed(2)}
                              </p>
                              {order.paymentMethod === "payconiq" ? (
                                <Badge className="bg-[#1dce4c]">Payconiq</Badge>
                              ) : (
                                <Badge>Cash</Badge>
                              )}
                              {!order.syncedToCloud && (
                                <Badge variant="outline" className="border-blue-500 text-blue-600">
                                  Not synced
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {order.paymentMethod === "cash"
                                ? `Paid: €${order.amountPaid.toFixed(2)} | Change: €${
                                    editingOrder?.id === order.id
                                      ? (
                                          order.amountPaid -
                                          editedItems.reduce((total, item) => total + item.price * item.quantity, 0)
                                        ).toFixed(2)
                                      : order.change.toFixed(2)
                                  }`
                                : `Paid via Payconiq: €${
                                    editingOrder?.id === order.id
                                      ? editedItems
                                          .reduce((total, item) => total + item.price * item.quantity, 0)
                                          .toFixed(2)
                                      : order.total.toFixed(2)
                                  }`}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <h4 className="font-medium mb-2">Items:</h4>
                        {editingOrder?.id === order.id ? (
                          <div className="space-y-2">
                            {editedItems.map((item, index) => (
                              <div key={index} className="flex justify-between items-center">
                                <span>{item.name}</span>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => updateItemQuantity(index, item.quantity - 1)}
                                  >
                                    <MinusCircle className="h-3 w-3" />
                                  </Button>
                                  <Badge variant="outline" className="px-3 py-1">
                                    {item.quantity}
                                  </Badge>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => updateItemQuantity(index, item.quantity + 1)}
                                  >
                                    <PlusCircle className="h-3 w-3" />
                                  </Button>
                                  <span className="ml-4">€{(item.price * item.quantity).toFixed(2)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {order.items.map((item, index) => (
                              <div key={index} className="flex justify-between text-sm">
                                <span>
                                  {item.name} x{item.quantity}
                                </span>
                                <span>€{(item.price * item.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="flex justify-end gap-2">
                        {editingOrder?.id === order.id ? (
                          <>
                            <Button variant="outline" onClick={cancelEditOrder}>
                              Cancel
                            </Button>
                            <Button onClick={saveEditedOrder} className="bg-blue-600 hover:bg-blue-700">
                              <Save className="h-4 w-4 mr-2" /> Save Changes
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" onClick={() => startEditOrder(order)}>
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </Button>
                            <Button variant="destructive" onClick={() => handleDeleteOrder(order.id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </Button>
                          </>
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="mt-4 border-t pt-4">
              <Button onClick={() => setAdminOrdersOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Custom Donation Dialog */}
        <Dialog open={showCustomDonation} onOpenChange={setShowCustomDonation}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Enter Custom Donation Amount</DialogTitle>
              <DialogDescription>Please enter the amount you would like to donate.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="custom-donation-amount">Amount (€)</Label>
                <Input
                  type="number"
                  id="custom-donation-amount"
                  placeholder="0.00"
                  value={customDonationAmount}
                  onChange={(e) => setCustomDonationAmount(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCustomDonation(false)}>
                Cancel
              </Button>
              <Button onClick={handleCustomDonation} disabled={!customDonationAmount}>
                Add Donation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SyncDebugger />
      </div>
    </div>
  )
}
