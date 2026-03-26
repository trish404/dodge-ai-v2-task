import './globals.css'

export const metadata = {
  title: 'SAP O2C Graph Explorer',
  description: 'Interactive graph visualization and NL query interface for SAP Order-to-Cash data',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ height: '100%', background: '#0d1117' }}>
      <body style={{ height: '100%', margin: 0, padding: 0, background: '#0d1117', color: '#e2e8f0' }}>
        {children}
      </body>
    </html>
  )
}
