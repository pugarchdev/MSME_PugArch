import '../index.css';
import { Providers } from '@/providers/Providers';
import { Agentation } from 'agentation';
import http from 'http';

async function isAgentationReady(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'development') return false;
  return new Promise((resolve) => {
    const req = http.get('http://localhost:4747/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const hasAgentation = await isAgentationReady();

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.png" />
        <title>JsgSmile Portal | Jharsuguda Synergy for MSME and Industry Linkage Ecosystem</title>
      </head>
      <body>
        <Providers>
          {children}
          {hasAgentation && <Agentation endpoint="http://localhost:4747" />}
        </Providers>
      </body>
    </html>
  );
}
