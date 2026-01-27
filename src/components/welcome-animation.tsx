'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

export function WelcomeAnimation() {
  const [visible, setVisible] = useState(false)
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    // Verificar se deve mostrar
    if (typeof window !== 'undefined') {
      const shouldShow = sessionStorage.getItem('showWelcomeAnimation')

      if (shouldShow === 'true') {
        sessionStorage.removeItem('showWelcomeAnimation')
        setVisible(true)

        // Começar fade out após 1.5s
        const fadeStart = setTimeout(() => {
          setOpacity(0)
        }, 1500)

        // Esconder completamente após 2.5s
        const hideTimer = setTimeout(() => {
          setVisible(false)
        }, 2500)

        return () => {
          clearTimeout(fadeStart)
          clearTimeout(hideTimer)
        }
      }
    }
  }, [])

  if (!visible) return null

  return (
    <div
      style={{ opacity, transition: 'opacity 1s ease-out' }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-white"
    >
      <Image
        src="/images/welcome-animation.png"
        alt="Financial Doctor"
        width={900}
        height={450}
        className="max-w-[90vw] h-auto"
        priority
      />
    </div>
  )
}
