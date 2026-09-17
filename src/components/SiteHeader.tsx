'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: '征途', short: '征途' },
  { href: '/articles', label: '剧情', short: '剧情' },
  { href: '/notes', label: '关卡', short: '关卡' },
  { href: '/toilet', label: '马桶里', short: '马桶里' },
  { href: '/fate', label: '命运抽了下你', short: '命运签' },
  { href: '/interact', label: '互动', short: '互动' },
]

export default function SiteHeader() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[1000]">
      <div className="pointer-events-auto flex h-16 items-center justify-between gap-3 border-b border-gold/15 bg-ink/70 px-4 backdrop-blur-md sm:px-8">
        <Link
          href="/"
          className="shrink-0 font-serif text-sm tracking-[0.18em] text-gold-bright transition-colors hover:text-white sm:text-lg sm:tracking-[0.32em]"
        >
          呕心小世界
        </Link>

        <nav className="flex items-center gap-3 text-[13px] sm:gap-9 sm:text-[15px]">
          {navItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative whitespace-nowrap py-1 transition-colors ${
                  active ? 'text-gold-bright' : 'text-mute hover:text-paper'
                }`}
              >
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
                {active && (
                  <span className="absolute -bottom-[1px] left-1/2 h-px w-5 -translate-x-1/2 bg-gold" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
