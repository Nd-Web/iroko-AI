import * as React from 'react'
import { cn } from '@/lib/utils'

interface IrokoLogoProps {
  /** Show the "Iroko AI" wordmark next to the mark */
  withWordmark?: boolean
  /** Size of the square mark in px */
  size?: number
  className?: string
}

/**
 * Iroko AI brand mark.
 * A stylized iroko tree (the sacred Nigerian tree) formed from ascending
 * leaves, paired with a spark node — symbolising an AI rooted in Nigeria.
 */
export function IrokoLogo({
  withWordmark = false,
  size = 32,
  className,
}: IrokoLogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Iroko AI"
      >
        <defs>
          <linearGradient id="iroko-leaf" x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.46 0.13 156)" />
            <stop offset="1" stopColor="oklch(0.62 0.15 152)" />
          </linearGradient>
          <linearGradient id="iroko-gold" x1="24" y1="4" x2="24" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.82 0.16 85)" />
            <stop offset="1" stopColor="oklch(0.72 0.16 70)" />
          </linearGradient>
        </defs>
        {/* rounded badge */}
        <rect width="48" height="48" rx="13" fill="url(#iroko-leaf)" />
        {/* trunk */}
        <path d="M23.2 40V27.5h1.6V40h-1.6Z" fill="oklch(0.96 0.02 90)" />
        {/* ascending leaves (canopy) */}
        <path
          d="M24 6c2.4 3 3.6 5.7 3.6 8.2 0 2.2-1 4.2-3.6 5.6-2.6-1.4-3.6-3.4-3.6-5.6 0-2.5 1.2-5.2 3.6-8.2Z"
          fill="url(#iroko-gold)"
        />
        <path
          d="M14.5 16.5c3.2 1.2 5.4 2.9 6.7 5 .9 1.5 1.1 3.2.4 4.9-2.5.6-4.5-.1-6-1.7-1.8-1.9-2.6-4.6-2.1-8.2Z"
          fill="oklch(0.93 0.04 130)"
        />
        <path
          d="M33.5 16.5c-3.2 1.2-5.4 2.9-6.7 5-.9 1.5-1.1 3.2-.4 4.9 2.5.6 4.5-.1 6-1.7 1.8-1.9 2.6-4.6 2.1-8.2Z"
          fill="oklch(0.93 0.04 130)"
        />
        {/* spark node */}
        <circle cx="24" cy="14.2" r="2.1" fill="oklch(0.99 0.02 90)" />
      </svg>
      {withWordmark && (
        <span className="font-semibold tracking-tight text-[1.05rem] leading-none">
          Iroko<span className="text-primary"> AI</span>
        </span>
      )}
    </div>
  )
}
