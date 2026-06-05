import './globals.css'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sarvam Tutor Bot',
  description: 'AI-powered multilingual tutor using Sarvam APIs',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
