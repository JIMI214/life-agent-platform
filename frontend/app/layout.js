import './style.css';
import PwaRegister from './pwa-register';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Life Agent | 멀티모달 개인 생활 관리 플랫폼',
  description: 'Context-aware multimodal personal life management AI Agent platform. 멀티모달 AI Agent 기반 개인 생활 통합 관리 플랫폼.',
  applicationName: 'Life Agent',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  openGraph: { title: 'Life Agent', description: 'Context-aware multimodal personal life agent platform', type: 'website' },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b1220' };
export default function RootLayout({ children }) {
  return <html lang="ko"><body><PwaRegister />{children}</body></html>;
}
