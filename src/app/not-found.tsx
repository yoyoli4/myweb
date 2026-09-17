import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <p className="font-serif text-5xl text-gold-bright">404</p>
      <p className="mt-4 text-sm text-mute">这一关还没解锁，走错片场了。</p>
      <Link
        href="/"
        className="mt-8 rounded-full border border-gold/30 px-7 py-2.5 text-xs tracking-[0.3em] text-gold-bright transition-colors hover:border-gold hover:bg-gold/10"
      >
        回到征途
      </Link>
    </main>
  )
}
