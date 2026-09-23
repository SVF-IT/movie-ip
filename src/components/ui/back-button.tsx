'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Back control that returns to wherever the user actually came from.
 *
 * Every back button used to be a Link to a fixed route, so a movie opened from
 * the rights dashboard sent the user to /movies on the way out — losing the
 * dashboard's tab, filters and scroll position.
 *
 * `fallbackHref` is still required: it is used when there is no in-app history
 * to go back to (a deep link, a fresh tab, a page opened from an email), where
 * router.back() would either do nothing or leave the app entirely.
 */
export function BackButton({
  fallbackHref,
  label = 'Back',
  className,
  size = 'sm',
  iconClassName = 'h-3.5 w-3.5',
}: {
  /** Where to go when this page was opened directly, with no history behind it. */
  fallbackHref: string
  /** Omit to render an icon-only button. */
  label?: string | null
  className?: string
  size?: 'sm' | 'default' | 'lg' | 'icon'
  iconClassName?: string
}) {
  const router = useRouter()
  // history.length is only readable on the client, and the first render must
  // match the server's, so this starts false and settles after mount.
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    // length > 1 means this tab has somewhere to return to. It counts entries
    // from other origins too, which is why the fallback stays a real route.
    setCanGoBack(window.history.length > 1)
  }, [])

  const handleClick = () => {
    if (canGoBack) router.back()
    else router.push(fallbackHref)
  }

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleClick}
      className={cn(
        'text-(--text-faint) hover:text-(--text) hover:bg-(--hover) gap-1.5 h-8',
        className
      )}
      aria-label={label ?? 'Go back'}
    >
      <ArrowLeft className={iconClassName} />
      {label}
    </Button>
  )
}
