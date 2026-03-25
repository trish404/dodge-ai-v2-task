import './globals.css'

export const metadata = {
  title: 'SAP O2C Graph Explorer',
  description: 'Interactive graph visualization and NL query interface for SAP Order-to-Cash data',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
