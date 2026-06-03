import '../index.css';
import { Providers } from '@/providers/Providers';
import { Agentation } from 'agentation';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.png" />
        <title>JsgSmile Portal | Jharsuguda Synergy for MSME and Industry Linkage Ecosystem</title>
      </head>
      <body>
        <Providers>
          {children}
          {process.env.NODE_ENV === "development" && <Agentation endpoint="http://localhost:4747" />}
        </Providers>
      </body>
    </html>
  );
}
