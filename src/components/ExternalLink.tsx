'use client'

// ExternalLink — forces links to open in the system browser / new tab
// Works reliably inside mobile WebViews where target="_blank" alone can fail
export default function ExternalLink({
  href,
  children,
  className,
  'aria-label': ariaLabel,
}: {
  href: string
  children: React.ReactNode
  className?: string
  'aria-label'?: string
}) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    // _system opens in the system browser on iOS/Android WebViews
    // Fallback to _blank for desktop browsers
    const w = window.open(href, /Mobi|Android/i.test(navigator.userAgent) ? '_system' : '_blank', 'noopener,noreferrer')
    if (!w) {
      // Fallback if popup blocked — navigate normally
      window.location.href = href
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className={className}
      aria-label={ariaLabel}
      rel="noopener noreferrer"
    >
      {children}
    </a>
  )
}
