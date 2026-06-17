import Link from 'next/link';
import { PackageSearch } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#0b2447]/5 text-[#0b2447]">
          <PackageSearch className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-black text-[#0b2447]">Page not found</h1>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
          The marketplace page you are looking for is not available.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-[#0b2447] px-4 text-sm font-bold text-white transition hover:bg-[#12335f]"
        >
          Back to Marketplace
        </Link>
      </section>
    </main>
  );
}
