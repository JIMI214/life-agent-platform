import './style.css';
import './apple-ui.css';
import PwaRegister from './pwa-register';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Life Agent | Context-aware Multimodal Personal Life Management',
  description: 'Context-aware multimodal personal life management AI Agent platform.',
  applicationName: 'Life Agent',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  openGraph: { title: 'Life Agent', description: 'Context-aware multimodal personal life agent platform', type: 'website' },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#000000' };
export default function RootLayout({ children }) {
  return <html lang="ko"><body><PwaRegister />{children}</body></html>;
}
