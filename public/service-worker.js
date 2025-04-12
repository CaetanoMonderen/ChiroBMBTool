// Service Worker for Chiro BMB Cashier System
const CACHE_NAME = "chiro-bmb-cashier-v1.2"

// Files to cache
const filesToCache = [
  "/",
  "/index.html",
  "/_next/static/chunks/main.js",
  "/_next/static/chunks/webpack.js",
  "/_next/static/chunks/pages/_app.js",
  "/_next/static/chunks/pages/index.js",
  "/duck.svg",
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/73cb9027-66c8-4a36-95da-1e99977f5a6e-XWwM5k6IOf7hUhoYULmZiWtIajMzw6.jpeg",
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/df8c3388-0264-45ad-9e9b-8bb0557e7bc4-rzRFaiivs3e3HHy6z9dLi8HroEwcv0.jpeg",
]

// Install event - cache files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache")
      return cache.addAll(filesToCache)
    }),
  )
})

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
})

// Fetch event - serve from cache or network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response
      }

      // Clone the request
      const fetchRequest = event.request.clone()

      return fetch(fetchRequest)
        .then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response
          }

          // Clone the response
          const responseToCache = response.clone()

          // Add to cache
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })

          return response
        })
        .catch(() => {
          // If fetch fails (offline), try to serve the offline page
          if (event.request.mode === "navigate") {
            return caches.match("/")
          }
        })
    }),
  )
})
