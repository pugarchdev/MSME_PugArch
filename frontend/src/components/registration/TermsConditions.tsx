import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Menu,
  MoreVertical,
  Printer,
  RotateCcw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface TermsConditionsProps {
  onAccept: () => void;
  onBack: () => void;
  role: 'buyer' | 'seller';
}

const pages = Array.from({ length: 8 }, (_, i) => i + 1);

export default function TermsConditions({ onAccept, onBack, role }: TermsConditionsProps) {
  const [accepted, setAccepted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transitionState, setTransitionState] = useState<'idle' | 'back' | 'accept'>('idle');
  const isTransitioning = transitionState !== 'idle';

  const handleBack = () => {
    if (isTransitioning) return;
    setTransitionState('back');
    window.setTimeout(onBack, 450);
  };

  const handleAccept = () => {
    if (!accepted || isTransitioning) return;
    setTransitionState('accept');
    window.setTimeout(onAccept, 650);
  };

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1600px] transition-all duration-300',
        isFullscreen && 'fixed inset-0 z-50 max-w-none overflow-y-auto bg-white p-3 sm:p-4 md:p-8'
      )}
    >
      {isTransitioning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/25 backdrop-blur-[2px]">
          <div className="flex min-w-64 flex-col items-center gap-4 rounded-xl border border-white/40 bg-white px-8 py-7 text-center shadow-2xl">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute h-full w-full animate-ping rounded-full bg-blue-500/20" />
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30">
                <Loader2 className="h-6 w-6 animate-spin" />
              </span>
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-slate-900">
                {transitionState === 'accept' ? 'Preparing Registration' : 'Returning to Pre-requisites'}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Please wait...</p>
            </div>
          </div>
        </div>
      )}

      <section
        className={cn(
          'rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-100 sm:p-4 md:p-9',
          isFullscreen && 'flex h-full flex-col'
        )}
      >
        <div className="mb-4 flex flex-col gap-4 md:mb-7 md:flex-row md:items-center md:justify-between">
          
          <h3 className="text-sm font-black tracking-tight text-slate-800 uppercase sm:text-base md:text-2xl underline decoration-blue-500 decoration-4 underline-offset-8">
            General Terms & Conditions (GTC)
          </h3>
          <div className="hidden h-10 w-[92px] md:block" />
        </div>

        <div className={cn('overflow-hidden rounded-xl border border-slate-300 bg-[#262626] shadow-inner', isFullscreen && 'min-h-0 flex-1')}>
          <PdfToolbar role={role} />

          <div className={cn('grid bg-[#242424] md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)]', isFullscreen ? 'h-[calc(100dvh-180px)] min-h-[200px]' : 'h-[40dvh] min-h-[300px] md:h-[450px]')}>
            <aside className="hidden overflow-y-auto border-r border-slate-700 bg-[#262626] px-4 py-6 md:block no-scrollbar">
              <div className="space-y-6">
                {pages.map((page) => (
                  <button key={page} className="mx-auto block w-full text-center text-white transition-all hover:scale-105 active:scale-95">
                    <div
                      className={cn(
                        'mx-auto aspect-[3/4] w-28 bg-white p-1.5 shadow-md ring-1 transition-colors',
                        page === 1 ? 'ring-blue-500' : 'ring-slate-600'
                      )}
                    >
                      <MiniPage faded={page !== 1} />
                    </div>
                    <span className="mt-2 block text-[10px] font-black uppercase tracking-widest text-slate-500 ">Page {page}</span>
                  </button>
                ))}
              </div>
            </aside>

            <main className="overflow-y-auto bg-slate-100/50 px-2 py-6 sm:px-4 md:px-8 lg:px-12 scroll-smooth">
              <article className="mx-auto min-h-full max-w-[850px] bg-white px-6 py-8 shadow-xl shadow-slate-300/50 font-serif text-[13px] leading-relaxed text-slate-900 sm:text-[14px] md:py-10 md:text-[15px] border border-slate-100">
                <div className="mb-12 border-b-2 border-slate-900 pb-8 text-center">
                   <h1 className="text-base font-black uppercase tracking-tight sm:text-2xl">MSME-PugArch</h1>
                   <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-500 ">PugArch MSME Marketplace</p>
                </div>

                <p className="text-center font-bold leading-snug underline underline-offset-4">
                  Track / Domain Specific STC of Particular Service including its SLA
                  <br />
                  (Service Level Agreement) and BID/Reverse Auction Specific Additional
                  <br />
                  Terms and Conditions (ATC) as applicable.
                </p>

                <p className="mt-8 text-justify first-letter:text-3xl first-letter:font-black first-letter:mr-3 first-letter:float-left first-letter:text-blue-600">
                  MSME PugArch is the National Public Procurement Portal; an end-to-end online
                  Marketplace for Central and State Government Ministries / Departments, Central & State Public Sector
                  Undertakings and autonomous institutions for procurement of common use goods & services.
                </p>

                <p className="mt-6 text-justify">
                  This portal is adapted for PugArch MSME Marketplace registration and onboarding. The terms below
                  govern participation for {role === 'seller' ? 'sellers, service providers' : 'buyers, procurement users'} and
                  authorized representatives using the platform.
                </p>

                <section className="mt-10 space-y-6">
                  <h3 className="text-base font-black uppercase tracking-tight  border-l-4 border-blue-600 pl-4">2. General Terms and Definitions:</h3>
                  <div className="space-y-4 ml-4">
                    <p className="text-justify">
                      a. <strong>&ldquo;APPLICABLE LAWS&rdquo;</strong> shall mean any statute, law, ordinance, notification,
                      rule, regulation, judgment, order, decree, bye-law, approval, directive, guideline, policy or other
                      governmental restriction as may be in effect.
                    </p>
                    <p className="text-justify">
                      b. <strong>&ldquo;USER&rdquo;</strong> shall mean the individual or organization registering on behalf of a
                      competent buyer or seller entity and accepting responsibility for the accuracy of all information
                      submitted during sign up.
                    </p>
                  </div>
                </section>

                <section className="mt-10 space-y-6">
                  <h3 className="text-base font-black uppercase tracking-tight  border-l-4 border-blue-600 pl-4">3. Registration and Verification:</h3>
                  <p className="ml-4 text-justify">
                    Users agree that identity, email, mobile number, Aadhaar, PAN, business registration and other
                    submitted details may be verified through appropriate authorities or approved verification services.
                    Any misrepresentation may lead to rejection, suspension or further action as applicable.
                  </p>
                </section>

                <section className="mt-10 space-y-6">
                  <h3 className="text-base font-black uppercase tracking-tight  border-l-4 border-blue-600 pl-4">4. Procurement Guidelines:</h3>
                  <p className="ml-4 text-justify">
                    The platform ensures that all procurement activities conducted through the MSME Marketplace 
                    comply with the General Financial Rules (GFR), 2017 and any specific guidelines issued by 
                    competent authorities. The platform provides tools for comparative 
                    analysis and selection, but the final responsibility for procurement decisions rests with 
                    the User organization.
                  </p>
                </section>

                <section className="mt-10 space-y-6">
                  <h3 className="text-base font-black uppercase tracking-tight  border-l-4 border-blue-600 pl-4">5. Code of Conduct:</h3>
                  <p className="ml-4 text-justify">
                    All users are expected to maintain the highest standards of integrity and transparency. 
                    Collusion, price manipulation, or any fraudulent activity is strictly prohibited and will 
                    result in immediate termination of access and possible legal action.
                  </p>
                </section>

                <section className="mt-10 space-y-6">
                  <h3 className="text-base font-black uppercase tracking-tight  border-l-4 border-blue-600 pl-4">6. Data Privacy and Security:</h3>
                  <p className="ml-4 text-justify">
                    We value your data privacy. All sensitive information including PAN, Aadhaar (masked), 
                    and Bank Details are stored using industry-standard encryption. By using this portal, 
                    you consent to the collection and processing of data as per our Privacy Policy.
                  </p>
                </section>

                <section className="mt-10 space-y-6">
                  <h3 className="text-base font-black uppercase tracking-tight  border-l-4 border-blue-600 pl-4">7. Liability and Indemnity:</h3>
                  <p className="ml-4 text-justify">
                    The portal provides a marketplace interface and shall not be held liable for defaults 
                    by third-party service providers. Users agree to indemnify and hold PugArch harmless 
                    from any claims arising out of inaccurate data submission or breach of these terms.
                  </p>
                </section>

                <div className="mt-16 pt-8 border-t-2 border-slate-100 text-center text-slate-400 font-bold  uppercase text-xs">
                  End of Terms & Conditions Document
                </div>
              </article>
            </main>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-6 md:mt-10 md:flex-row md:items-center md:justify-between bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
          <label className="flex cursor-pointer items-start gap-4 text-slate-800 group">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                id="terms-checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="peer h-6 w-6 cursor-pointer appearance-none rounded-lg border-2 border-slate-300 transition-all checked:bg-blue-600 checked:border-blue-600 hover:border-blue-400"
              />
              <Check className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black uppercase tracking-tight  group-hover:text-blue-600 transition-colors">* Acceptance of Terms</span>
              <span className="text-xs font-bold text-slate-500 ">I have read and agree to the Terms & Conditions of MSME-PugArch</span>
            </div>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:justify-end">
            <button
              type="button"
              onClick={handleBack}
              disabled={isTransitioning}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {transitionState === 'back' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
              Back
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen((value) => !value)}
              disabled={isTransitioning}
              className="h-12 rounded-xl px-6 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all "
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}
            </button>
            <Button
              onClick={handleAccept}
              disabled={!accepted || isTransitioning}
              className={cn(
                'h-14 w-full rounded-xl px-12 text-xs font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 sm:w-auto',
                accepted
                  ? 'bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              )}
            >
              <span className="inline-flex items-center justify-center gap-2">
                {transitionState === 'accept' && <Loader2 className="h-4 w-4 animate-spin" />}
                {transitionState === 'accept' ? 'Preparing...' : 'Proceed to Registration'}
              </span>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PdfToolbar({ role }: { role: 'buyer' | 'seller' }) {
  return (
    <div className="flex min-h-14 items-center gap-2 bg-[#323639] px-3 py-2 text-white sm:h-[56px] sm:gap-3 sm:px-5 sm:py-0 border-b border-[#202124]">
      <div className="flex items-center gap-4">
        <Menu className="h-5 w-5 shrink-0 text-slate-300 hover:text-white cursor-pointer" />
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="hidden h-5 w-5 shrink-0 text-blue-400 sm:block" />
          <span className="truncate text-xs font-bold uppercase tracking-tight text-slate-200">
            GTC_4.0_{role === 'buyer' ? 'Buyer' : 'Seller'}_Registration.pdf
          </span>
        </div>
      </div>
      
      <div className="flex-1 flex justify-center">
        <div className="hidden items-center gap-3 text-xs font-bold md:flex bg-[#202124] px-3 py-1.5 rounded-lg border border-slate-700">
          <input type="text" value="1" readOnly className="w-8 bg-transparent text-center focus:outline-none" />
          <span className="text-slate-500">/</span>
          <span className="text-slate-400 tracking-tighter">54</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-slate-300">
        <div className="hidden items-center gap-4 border-r border-slate-700 pr-4 lg:flex">
          <ZoomOut className="h-4 w-4 hover:text-white cursor-pointer" />
          <div className="bg-[#202124] px-2 py-1 text-[10px] font-black rounded border border-slate-700">100%</div>
          <ZoomIn className="h-4 w-4 hover:text-white cursor-pointer" />
        </div>
        
        <div className="flex items-center gap-4">
          <RotateCcw className="hidden h-4 w-4 sm:block hover:text-white cursor-pointer" />
          <a 
            href="/terms_and_conditions.pdf" 
            download="MSME_Marketplace_Terms_Conditions.pdf"
            className="transition-colors hover:text-white"
            title="Download PDF"
          >
            <Download className="h-4 w-4" />
          </a>
          <Printer className="hidden h-4 w-4 sm:block hover:text-white cursor-pointer" />
          <Maximize2 className="h-4 w-4 hover:text-white cursor-pointer" />
        </div>
      </div>
    </div>
  );
}

function MiniPage({ faded }: { faded: boolean }) {
  return (
    <div className={cn('h-full space-y-1.5 p-2', faded && 'opacity-40')}>
      <div className="mx-auto mb-2 h-1 w-1/2 bg-slate-300" />
      {Array.from({ length: 16 }).map((_, index) => (
        <div
          key={index}
          className={cn('h-1 bg-slate-400', index % 5 === 0 ? 'w-3/4' : index % 3 === 0 ? 'w-10/12' : 'w-full')}
        />
      ))}
      <div className="mt-3 space-y-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-1 w-full bg-slate-300" />
        ))}
      </div>
    </div>
  );
}
