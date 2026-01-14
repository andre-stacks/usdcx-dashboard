import './globals.css'

export const metadata = {
  title: 'USDCx Dashboard | Stacks Token Analytics',
  description: 'Real-time analytics dashboard for USDCx token on Stacks blockchain. Track supply, holders, transactions, and mint/burn activity.',
  openGraph: {
    title: 'USDCx Dashboard',
    description: 'Real-time analytics for USDCx on Stacks',
    type: 'website',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
