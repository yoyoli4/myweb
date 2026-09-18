import type { Metadata } from 'next'
import './globals.css'
import SiteHeader from '@/components/SiteHeader'
import TicketGate from '@/components/TicketGate'
import ClickSound from '@/components/ClickSound'
import VinylPlayer from '@/components/VinylPlayer'

export const metadata: Metadata = {
  title: {
    default: '呕心小世界',
    template: '%s · 呕心小世界',
  },
  description: '我的个人生活记录：去过的地方、写过的字、随手记下的日常。',
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%230A0710'/%3E%3Ccircle cx='16' cy='16' r='5' fill='%23E3CB8F'/%3E%3C/svg%3E",
        type: 'image/svg+xml',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500&family=Noto+Serif+SC:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-ink text-paper antialiased">
        <TicketGate />
        <ClickSound />
        <SiteHeader />
        {children}
        <VinylPlayer />
      </body>
    </html>
  )
}
