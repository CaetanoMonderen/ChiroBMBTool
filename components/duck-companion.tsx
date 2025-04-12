"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"

export default function DuckCompanion() {
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const [direction, setDirection] = useState({ x: 1, y: 0 })
  const [isMoving, setIsMoving] = useState(true)
  const [isQuacking, setIsQuacking] = useState(false)
  const duckRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number>(0)

  // Set up the duck's movement
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const moveInterval = setInterval(() => {
      // Change direction randomly
      if (Math.random() < 0.05) {
        const newDirection = {
          x: Math.random() * 2 - 1,
          y: Math.random() * 2 - 1,
        }
        setDirection(newDirection)
      }

      // Pause randomly
      if (Math.random() < 0.01) {
        setIsMoving(false)
        setTimeout(() => setIsMoving(true), Math.random() * 3000 + 1000)
      }

      // Quack randomly
      if (Math.random() < 0.005 && !isQuacking) {
        setIsQuacking(true)
        setTimeout(() => setIsQuacking(false), 1000)
      }
    }, 500)

    return () => {
      clearInterval(moveInterval)
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [isQuacking])

  // Handle the actual animation
  useEffect(() => {
    if (!isMoving) return

    const animate = () => {
      setPosition((prev) => {
        const duck = duckRef.current
        const container = containerRef.current
        if (!duck || !container) return prev

        // Get boundaries
        const duckRect = duck.getBoundingClientRect()
        const containerRect = {
          width: window.innerWidth,
          height: document.body.scrollHeight,
        }

        // Calculate new position
        let newX = prev.x + direction.x * 2
        let newY = prev.y + direction.y * 2

        // Bounce off edges
        if (newX < 0 || newX > containerRect.width - duckRect.width) {
          setDirection((prev) => ({ ...prev, x: -prev.x }))
          newX = prev.x
        }

        if (newY < 0 || newY > containerRect.height - duckRect.height) {
          setDirection((prev) => ({ ...prev, y: -prev.y }))
          newY = prev.y
        }

        return { x: newX, y: newY }
      })

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [direction, isMoving])

  // Handle duck click
  const handleDuckClick = () => {
    setIsQuacking(true)
    setTimeout(() => setIsQuacking(false), 1000)
  }

  return (
    <div ref={containerRef} className="duck-container">
      <div
        ref={duckRef}
        className={`duck-companion ${direction.x < 0 ? "flip" : ""} ${isQuacking ? "quacking" : ""}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
        onClick={handleDuckClick}
      >
        <Image src="/duck.svg" alt="Duck companion" width={40} height={40} className="duck-image" />
        {isQuacking && <div className="quack-bubble">Quack!</div>}
      </div>
      <style jsx>{`
        .duck-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1000;
          overflow: hidden;
        }
        .duck-companion {
          position: fixed;
          cursor: pointer;
          pointer-events: auto;
          transition: transform 0.2s ease;
          z-index: 1000;
        }
        .duck-companion:hover {
          transform: scale(1.2);
        }
        .duck-companion.flip {
          transform: scaleX(-1);
        }
        .duck-companion.flip:hover {
          transform: scale(1.2) scaleX(-1);
        }
        .quack-bubble {
          position: absolute;
          top: -30px;
          left: 20px;
          background-color: white;
          border: 2px solid #f8c156;
          border-radius: 12px;
          padding: 4px 8px;
          font-size: 12px;
          font-weight: bold;
          white-space: nowrap;
          animation: pop 0.3s ease-out;
        }
        .quack-bubble:after {
          content: '';
          position: absolute;
          bottom: -8px;
          left: 10px;
          border-width: 8px 8px 0;
          border-style: solid;
          border-color: white transparent;
        }
        .quack-bubble:before {
          content: '';
          position: absolute;
          bottom: -10px;
          left: 8px;
          border-width: 10px 10px 0;
          border-style: solid;
          border-color: #f8c156 transparent;
        }
        @keyframes pop {
          0% { transform: scale(0); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
