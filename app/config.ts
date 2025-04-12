// Configuration for the application
const config = {
  // Data directory for storing orders
  dataDir: process.env.NEXT_PUBLIC_DATA_DIR || "./data",

  // Sync interval in minutes
  syncIntervalMinutes: 5,

  // Version number
  version: "1.2.0",

  // Feature flags
  features: {
    // Enable cloud sync
    cloudSync: true,

    // Enable offline mode
    offlineMode: true,

    // Enable debug tools
    debugTools: true,
  },
}

export default config
