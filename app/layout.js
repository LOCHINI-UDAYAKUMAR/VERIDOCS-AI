import './globals.css';
import { AuthProvider } from '../components/AuthProvider';
import Navbar from '../components/Navbar';

export const metadata = {
  title: 'VeriDocs AI — Document Trust & Verification Platform',
  description: 'AI-assisted document verification, forgery detection, and tamper-proof integrity ledger.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main className="max-w-6xl mx-auto px-5 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
