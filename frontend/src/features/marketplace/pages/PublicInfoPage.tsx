'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ChevronRight,
  Copyright,
  ExternalLink,
  FileText,
  HelpCircle,
  Home,
  Link2,
  Mail,
  Phone,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { MarketplaceHeader } from '../components/MarketplaceHeader';

type PageKey =
  | 'contact'
  | 'feedback'
  | 'sitemap'
  | 'faqs'
  | 'terms'
  | 'policies'
  | 'copyright'
  | 'hyperlinks'
  | 'disclaimer'
  | 'caution';

const routeToPage: Record<string, PageKey> = {
  '/contact-us': 'contact',
  '/feedback': 'feedback',
  '/sitemap': 'sitemap',
  '/faqs': 'faqs',
  '/faq': 'faqs',
  '/terms-of-use': 'terms',
  '/terms-and-conditions': 'terms',
  '/website-policies': 'policies',
  '/privacy-policy': 'policies',
  '/copyright': 'copyright',
  '/copyrights': 'copyright',
  '/copyright-policy': 'copyright',
  '/hyperlinks': 'hyperlinks',
  '/hyperlinking-policy': 'hyperlinks',
  '/disclaimer': 'disclaimer',
  '/caution-notice': 'caution',
  '/caution-notices': 'caution',
};

const pageTitles: Record<PageKey, string> = {
  contact: 'Contact Us',
  feedback: 'Feedback',
  sitemap: 'Sitemap',
  faqs: 'Frequently Asked Questions (FAQs)',
  terms: 'Terms of Use',
  policies: 'Website Policies',
  copyright: 'Copyright Policy',
  hyperlinks: 'Hyperlinking Policy',
  disclaimer: 'Disclaimer',
  caution: 'Caution Notice',
};

const policyTabs = [
  { key: 'policies' as const, href: '/website-policies', label: 'Privacy Policy' },
  { key: 'copyright' as const, href: '/copyright', label: 'Copyright' },
  { key: 'disclaimer' as const, href: '/disclaimer', label: 'Disclaimer' },
  { key: 'caution' as const, href: '/caution-notice', label: 'Caution Notice' },
  { key: 'hyperlinks' as const, href: '/hyperlinking-policy', label: 'Hyperlinking Policy' },
];

const footerGroups = [
  {
    title: 'Web Info',
    links: [
      ['Terms of Use', '/terms-of-use'],
      ['Website Policies', '/website-policies'],
      ['Copyright', '/copyright'],
      ['Disclaimer', '/disclaimer'],
      ['Hyperlinking Policy', '/hyperlinking-policy'],
      ['Caution Notice', '/caution-notice'],
      ['Sitemap', '/sitemap'],
    ],
  },
  {
    title: 'Marketplace',
    links: [
      ['Browse Products', '/marketplace/products'],
      ['Browse Services', '/marketplace/services'],
      ['Verified Sellers', '/marketplace/sellers'],
      ['Open Bids', '/bids'],
      ['Public Tenders', '/tenders'],
    ],
  },
  {
    title: 'Registration',
    links: [
      ['Buyer Registration', '/buyer/register'],
      ['Seller Registration', '/seller/register'],
      ['SHG Registration', '/hershg/register'],
      ['Login', '/login'],
      ['Forgot Password', '/forgot-password'],
    ],
  },
  {
    title: 'Need Help?',
    links: [
      ['FAQs', '/faqs'],
      ['Feedback', '/feedback'],
      ['Contact Us', '/contact-us'],
      ['Help Center', '/help'],
      ['User Guide', '/user-guide'],
    ],
  },
];

const faqGroups = [
  {
    tab: 'Buyers',
    sections: [
      {
        title: 'Registration',
        items: [
          ['How do buyers register on JsgSmile?', 'Buyers can register from the Buyer Registration page, complete organisation details, verify contact information, and submit required KYC or onboarding information.'],
          ['Can a private company buyer use this portal?', 'Yes. The portal supports government-style procurement controls for private buyers, MSMEs, large industries, SHGs, and local procurement teams.'],
        ],
      },
      {
        title: 'Procurement Modes',
        items: [
          ['Which procurement route should I choose?', 'Use Direct Purchase for known low-value buying, RFQ for quotation collection, Tender/e-Bid for formal bidding, and Reverse Auction after technical qualification.'],
          ['Can I save a procurement as draft?', 'Yes. The procurement creation flow supports draft-style intake so uncertain details can be completed before publishing.'],
        ],
      },
      {
        title: 'Order Management',
        items: [
          ['Where can I track orders?', 'After login, buyers can track orders, deliveries, invoices, GRN, payments, disputes, and seller messages from the buyer workspace.'],
        ],
      },
    ],
  },
  {
    tab: 'Sellers',
    sections: [
      {
        title: 'Seller Onboarding',
        items: [
          ['How do sellers list products or services?', 'Verified sellers can add products and services from the seller catalogue after onboarding approval.'],
          ['Can MSME sellers participate in bids?', 'Yes. Eligible sellers can view opportunities, submit bids, respond to RFQs, and participate in procurement workflows.'],
        ],
      },
      {
        title: 'Payments',
        items: [
          ['How are payment details handled?', 'Payment status, invoices, escrow references, and transaction history are available in authenticated seller and buyer workspaces.'],
        ],
      },
    ],
  },
  {
    tab: 'SHG',
    sections: [
      {
        title: 'HerSHG Support',
        items: [
          ['Can SHGs register?', 'Yes. Women SHGs and local groups can register through the HerSHG registration flow and manage products, documents, orders, and support.'],
        ],
      },
    ],
  },
  {
    tab: 'Support',
    sections: [
      {
        title: 'Incidents',
        items: [
          ['How do I report suspicious activity?', 'Use Contact Us or Feedback, and do not share OTP, password, Aadhaar, bank credentials, or login details with anyone claiming unofficial portal support.'],
          ['What if I entered wrong data?', 'Use the relevant profile, onboarding, procurement, or catalogue edit workflow. For locked records, contact the helpdesk.'],
        ],
      },
    ],
  },
];

const sitemapGroups = [
  {
    title: 'Home',
    links: [
      ['Marketplace Home', '/'],
      ['Products', '/marketplace/products'],
      ['Services', '/marketplace/services'],
      ['Verified Sellers', '/marketplace/sellers'],
      ['Open Bids', '/bids'],
      ['Tenders', '/tenders'],
    ],
  },
  {
    title: 'Buyer',
    links: [
      ['Buyer Registration', '/buyer/register'],
      ['Create Procurement', '/buyer/procurement/create'],
      ['RFQ', '/buyer/rfq'],
      ['Direct Purchase', '/buyer/direct-purchase'],
      ['Buyer Tenders', '/buyer/tenders'],
      ['Saved Suppliers', '/buyer/saved-suppliers'],
    ],
  },
  {
    title: 'Seller',
    links: [
      ['Seller Registration', '/seller/register'],
      ['Seller Opportunities', '/seller/opportunities'],
      ['Catalogue', '/seller/catalogue'],
      ['Seller RFQ', '/seller/rfq'],
      ['Orders', '/seller/orders'],
      ['Invoices', '/seller/invoices'],
    ],
  },
  {
    title: 'Help And Policies',
    links: [
      ['Contact Us', '/contact-us'],
      ['Feedback', '/feedback'],
      ['FAQs', '/faqs'],
      ['Terms of Use', '/terms-of-use'],
      ['Website Policies', '/website-policies'],
      ['Copyright', '/copyright'],
      ['Disclaimer', '/disclaimer'],
      ['Hyperlinking Policy', '/hyperlinking-policy'],
      ['Caution Notice', '/caution-notice'],
    ],
  },
];

export default function PublicInfoPage() {
  const pathname = usePathname() || '/contact-us';
  const page = routeToPage[pathname] || 'contact';
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <MarketplaceHeader user={user} />
      <main id="main-content" className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:py-10 2xl:px-8">
        <Breadcrumb title={pageTitles[page]} />
        {page === 'contact' && <ContactPage />}
        {page === 'feedback' && <FeedbackPage />}
        {page === 'sitemap' && <SitemapPage />}
        {page === 'faqs' && <FaqPage />}
        {page === 'terms' && <TermsPage />}
        {['policies', 'copyright', 'hyperlinks', 'disclaimer', 'caution'].includes(page) && <PolicyPage page={page} />}
      </main>
      {/* <PortalFooterStrip /> */}
      <MarketplaceFooter />
    </div>
  );
}

function Breadcrumb({ title }: { title: string }) {
  return (
    <div className="mb-7 border-b border-slate-200 pb-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
        <Link href="/" className="hover:text-[#0b2447]">Home</Link>
        <ChevronRight className="h-4 w-4 text-slate-300" />
        <span className="text-[#c56a10]">{title}</span>
      </div>
    </div>
  );
}

function ContactPage() {
  const cards = [
    {
      icon: HelpCircle,
      title: 'FAQs',
      body: 'Find quick answers for buyer registration, seller onboarding, procurement creation, order tracking, payments, and platform usage.',
      links: [['Visit FAQ Section', '/faqs']],
    },
    {
      icon: FileText,
      title: 'User Guides',
      body: 'Refer to JsgSmile training material and module documentation for buyer, seller, admin, and SHG workflows.',
      links: [['Open User Guide', '/user-guide'], ['Open Help Center', '/help']],
    },
    {
      icon: Phone,
      title: 'Support',
      body: 'For login, onboarding, catalogue, procurement, bid, payment, or delivery support, contact the helpdesk during working hours.',
      details: ['Email: support@jsgsmile.in', 'Toll free: 1800-XXX-XXXX', 'Working hours: 9:00 AM - 6:00 PM, Monday to Saturday', 'Address: District MSME Facilitation Cell, Jharsuguda, Odisha'],
    },
    {
      icon: Ticket,
      title: 'Ticket And Grievance',
      body: 'Raise an issue with clear reference number, registered email/mobile, organisation name, and screenshot wherever applicable.',
      links: [['Send Feedback', '/feedback'], ['Contact Helpdesk', 'mailto:support@jsgsmile.in']],
    },
    {
      icon: ShieldCheck,
      title: 'KYC And Verification',
      body: 'For Aadhaar, mobile, email, Udyam, GST, PAN, buyer, seller, or SHG verification issues, use official portal channels only.',
      details: ['Never share OTPs or passwords.', 'Use only the JsgSmile portal URL shared by the district administration.', 'Report suspicious calls or links immediately.'],
    },
    {
      icon: Mail,
      title: 'Legal Notices',
      body: 'For notices, statutory communication, data requests, or formal correspondence, write to the Web Information Manager.',
      details: ['Web Information Manager: info@jsgsmile.in', 'Legal correspondence: legal@jsgsmile.in'],
    },
  ];

  return (
    <section>
      <h1 className="text-2xl font-black text-slate-900">Contact Us</h1>
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
        JsgSmile support helps buyers, MSME sellers, SHGs, large industries, and administrators use the marketplace and procurement workflows safely.
      </p>
      <div className="mt-8 grid gap-x-16 gap-y-8 lg:grid-cols-2">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <article key={card.title} className="grid gap-4 sm:grid-cols-[180px_1fr]">
              <div className="flex h-28 items-center justify-center rounded-md bg-slate-50 text-[#d97b1f]">
                <div className="text-center">
                  <Icon className="mx-auto h-9 w-9" />
                  <p className="mt-2 text-sm font-black uppercase">{card.title}</p>
                </div>
              </div>
              <div className="text-sm font-semibold leading-6 text-slate-600">
                <p>{card.body}</p>
                {card.details && (
                  <ul className="mt-3 space-y-1">
                    {card.details.map(item => <li key={item}>{item}</li>)}
                  </ul>
                )}
                {card.links && (
                  <div className="mt-3 space-y-1">
                    {card.links.map(([label, href]) => (
                      <Link key={label} href={href} className="block font-black text-[#176b87] hover:underline">
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FeedbackPage() {
  const [topic, setTopic] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [comments, setComments] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    toast.success('Thank you. Your feedback has been recorded for review.');
    setTopic('');
    setName('');
    setEmail('');
    setMobile('');
    setComments('');
  };

  return (
    <section className="mx-auto max-w-2xl">
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
        <div className="bg-[#0b3a75] px-4 py-3 text-base font-bold text-white">Feedback</div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <FormField label="Feedback Topic" required>
            <select value={topic} onChange={event => setTopic(event.target.value)} required className={inputClass}>
              <option value="">--Select--</option>
              <option>Buyer Registration</option>
              <option>Seller Registration</option>
              <option>SHG Registration</option>
              <option>Procurement / Tender</option>
              <option>Marketplace Catalogue</option>
              <option>Payment / Invoice</option>
              <option>Technical Issue</option>
              <option>Suggestion</option>
            </select>
          </FormField>
          <FormField label="Full Name" required>
            <input value={name} onChange={event => setName(event.target.value)} required className={inputClass} placeholder="Full Name" />
          </FormField>
          <FormField label="Email Address" required>
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} required className={inputClass} placeholder="Email Address" />
          </FormField>
          <FormField label="Mobile Number" required>
            <input value={mobile} onChange={event => setMobile(event.target.value)} required className={inputClass} placeholder="Mobile Number" />
          </FormField>
          <FormField label="Comments" required>
            <textarea value={comments} onChange={event => setComments(event.target.value)} required rows={6} className={inputClass} placeholder="Your feedback here" />
          </FormField>
          <div className="flex justify-end">
            <button type="submit" className="inline-flex items-center gap-2 rounded-md bg-[#f58220] px-8 py-3 text-sm font-black text-white hover:bg-[#d96e15]">
              Submit <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function SitemapPage() {
  return (
    <section>
      <h1 className="text-2xl font-black text-slate-900">Sitemap</h1>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col items-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-black text-[#176b87]">
            <Home className="h-4 w-4" /> Home
          </Link>
          <div className="mt-5 grid w-full gap-6 md:grid-cols-2 xl:grid-cols-4">
            {sitemapGroups.map(group => (
              <div key={group.title} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <h2 className="border-b border-slate-200 pb-2 text-center text-sm font-black uppercase text-slate-900">{group.title}</h2>
                <ul className="mt-3 space-y-2 text-center">
                  {group.links.map(([label, href]) => (
                    <li key={label}>
                      <Link href={href} className="text-sm font-bold text-[#176b87] hover:underline">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqPage() {
  const [activeTab, setActiveTab] = useState(faqGroups[0].tab);
  const [query, setQuery] = useState('');
  const group = faqGroups.find(item => item.tab === activeTab) || faqGroups[0];
  const sections = useMemo(() => {
    if (!query.trim()) return group.sections;
    const needle = query.toLowerCase();
    return group.sections
      .map(section => ({
        ...section,
        items: section.items.filter(([question, answer]) => `${question} ${answer}`.toLowerCase().includes(needle)),
      }))
      .filter(section => section.items.length > 0);
  }, [group, query]);

  return (
    <section>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-black text-slate-900">Frequently Asked Questions (FAQs)</h1>
        <div className="flex h-11 w-full max-w-md items-center border border-slate-300 bg-white">
          <input value={query} onChange={event => setQuery(event.target.value)} className="h-full min-w-0 flex-1 px-4 text-sm font-semibold outline-none" placeholder="Enter your query here" />
          <Search className="mx-3 h-5 w-5 text-slate-500" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-8 border-b border-slate-200">
        {faqGroups.map(item => (
          <button key={item.tab} type="button" onClick={() => setActiveTab(item.tab)} className={`border-b-4 px-2 pb-3 text-sm font-bold ${activeTab === item.tab ? 'border-[#0b3a75] text-slate-900' : 'border-transparent text-slate-500'}`}>
            {item.tab}
          </button>
        ))}
      </div>
      <div className="divide-y divide-slate-200">
        {sections.map(section => (
          <FaqSection key={section.title} title={section.title} items={section.items} />
        ))}
        {sections.length === 0 && <p className="py-8 text-sm font-semibold text-slate-500">No FAQs match your search.</p>}
      </div>
    </section>
  );
}

function FaqSection({ title, items }: { title: string; items: string[][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between py-5 text-left text-base font-black text-slate-800">
        {title}
        <span className="text-2xl font-light">{open ? '-' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-4 pb-5">
          {items.map(([question, answer]) => (
            <div key={question} className="rounded-md bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">{question}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TermsPage() {
  const rows = [
    ['General Terms of Use', 'TYPE : HTML', '/terms-of-use'],
    ['Buyer and Seller Marketplace Terms', 'TYPE : HTML', '/user-guide'],
    ['Procurement and Bid Participation Terms', 'TYPE : HTML', '/buyer/publish-bid'],
    ['Website Policies', 'TYPE : HTML', '/website-policies'],
    ['Disclaimer and Limitation of Liability', 'TYPE : HTML', '/disclaimer'],
    ['Caution Notice for Stakeholders', 'TYPE : HTML', '/caution-notice'],
  ];

  return (
    <section>
      <h1 className="text-2xl font-black text-slate-900">Terms and Conditions</h1>
      <div className="mt-8 overflow-hidden rounded-md border border-slate-300">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-[#0b3a75] text-white">
            <tr>
              <th className="px-4 py-3 font-black">Title</th>
              <th className="px-4 py-3 font-black">Details</th>
              <th className="px-4 py-3 font-black">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map(([title, details, href]) => (
              <tr key={title} className="odd:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-700">{title}</td>
                <td className="px-4 py-3 font-semibold text-slate-600">{details}</td>
                <td className="px-4 py-3">
                  <Link href={href} className="inline-flex items-center gap-1 text-[#176b87] hover:underline">
                    View <ExternalLink className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-8 max-w-5xl space-y-4 text-sm font-semibold leading-7 text-slate-700">
        <p>Use of JsgSmile is subject to lawful, responsible and authorised activity by buyers, sellers, SHGs, administrators, and other stakeholders.</p>
        <p>Procurement, catalogue, bid, order, payment, KYC, notification, and support workflows must be used only with accurate information and valid authority from the concerned organisation.</p>
        <p>JsgSmile may update these terms, workflows, help material, and policies from time to time to improve security, compliance, and service delivery.</p>
      </div>
    </section>
  );
}

function PolicyPage({ page }: { page: PageKey }) {
  return (
    <section>
      <h1 className="mb-8 text-2xl font-black text-slate-900">Website Policies</h1>
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit overflow-hidden rounded-sm bg-slate-50">
          {policyTabs.map(tab => (
            <Link key={tab.href} href={tab.href} className={`block px-4 py-4 text-sm font-black ${page === tab.key ? 'bg-[#0b3a75] text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
              {tab.label}
            </Link>
          ))}
        </aside>
        <article className="max-w-5xl text-sm font-semibold leading-7 text-slate-700">
          {page === 'policies' && <PrivacyPolicy />}
          {page === 'copyright' && <CopyrightPolicy />}
          {page === 'disclaimer' && <DisclaimerPolicy />}
          {page === 'caution' && <CautionNotice />}
          {page === 'hyperlinks' && <HyperlinkPolicy />}
        </article>
      </div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <ContentBlock icon={ShieldCheck} title="Privacy Policy">
      <p>JsgSmile collects information necessary to provide marketplace, procurement, onboarding, verification, notification, support, reporting, and administrative services.</p>
      <p>Information may include organisation profile, user identity details, contact details, role and permission data, onboarding documents, KYC references, procurement records, bids, catalogue entries, communication logs, and support requests.</p>
      <p>Data is used for account management, procurement processing, seller-buyer discovery, compliance checks, fraud prevention, grievance resolution, platform analytics, and service improvement.</p>
      <p>Users must provide accurate information and must not upload confidential third-party data unless authorised. Sensitive credentials such as OTPs and passwords should never be shared with support staff or other users.</p>
      <p>Reasonable technical and organisational safeguards are applied. However, users are responsible for device security, password confidentiality, and authorised use of their accounts.</p>
    </ContentBlock>
  );
}

function CopyrightPolicy() {
  return (
    <ContentBlock icon={Copyright} title="Copyright Policy">
      <ol className="list-decimal space-y-3 pl-5">
        <li>Content published on JsgSmile may not be reproduced fully or partially without permission, except for lawful personal, internal, or reference use with proper acknowledgement.</li>
        <li>Logos, trademarks, portal design, documents, icons, workflow screens, and service marks belong to their respective owners and must not be misused.</li>
        <li>Seller-uploaded product content, images, brochures, and service descriptions remain the responsibility of the uploading organisation.</li>
        <li>Any copyright concern may be reported to the Web Information Manager with clear ownership details and supporting evidence.</li>
      </ol>
    </ContentBlock>
  );
}

function DisclaimerPolicy() {
  return (
    <ContentBlock icon={ShieldAlert} title="Disclaimer and Limitation of Liability">
      <p>The portal, information, marketplace records, procurement records, and support content are provided for facilitation and workflow management. Availability, accuracy, and completeness may depend on data submitted by users and connected services.</p>
      <p>JsgSmile does not independently warrant every seller claim, buyer requirement, product specification, service description, price, stock status, or third-party document uploaded by users.</p>
      <p>Transactions, procurement decisions, payments, inspections, delivery acceptance, warranties, and commercial commitments remain between the concerned buyer, seller, service provider, SHG, or organisation, subject to applicable platform workflow and law.</p>
      <p>Users should verify documents, specifications, prices, delivery terms, and legal eligibility before entering into commercial commitments.</p>
    </ContentBlock>
  );
}

function CautionNotice() {
  return (
    <ContentBlock icon={AlertTriangle} title="Caution Notice for all Stakeholders of JsgSmile">
      <p>Stakeholders are advised to use only the official JsgSmile portal links communicated by authorised district or portal administrators.</p>
      <p>Be cautious of fraudulent websites, messages, calls, social-media pages, payment links, job offers, seller verification claims, or procurement award claims using similar names, logos, or designs.</p>
      <p>Do not share OTP, password, Aadhaar number, PAN, bank details, login credentials, payment credentials, or digital signature credentials with any person claiming to provide unofficial support.</p>
      <p>If suspicious activity is noticed, stop the transaction immediately and report it through Contact Us or Feedback with screenshots and contact details.</p>
    </ContentBlock>
  );
}

function HyperlinkPolicy() {
  return (
    <ContentBlock icon={Link2} title="Hyperlinking Policy">
      <h2 className="text-base font-black text-slate-900">Links to external websites and portals</h2>
      <p>JsgSmile may include links to government, marketplace, payment, training, document, or support portals for user convenience. External links do not imply endorsement of third-party content, availability, accuracy, or security.</p>
      <h2 className="mt-6 text-base font-black text-slate-900">Links to JsgSmile from other websites</h2>
      <p>Direct links to public JsgSmile pages are generally permitted if they open in a full browser window and do not misrepresent affiliation, ownership, approval, or endorsement.</p>
      <p>JsgSmile pages must not be framed, mirrored, altered, or embedded in a way that may mislead users or capture credentials. Any misleading hyperlinking may be subject to corrective or legal action.</p>
    </ContentBlock>
  );
}

function ContentBlock({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#0b3a75] text-white">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-2xl font-black text-slate-900">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}{required && <span className="text-red-600"> *</span>}
      </span>
      {children}
    </label>
  );
}

function PortalFooterStrip() {
  return (
    <section className="mt-12 border-t border-slate-200 bg-white py-8">
      <div className="mx-auto grid max-w-[1680px] gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4 2xl:px-8">
        {footerGroups.map(group => (
          <div key={group.title}>
            <h3 className="text-sm font-black uppercase text-slate-900">{group.title}</h3>
            <ul className="mt-4 space-y-2">
              {group.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-xs font-semibold text-slate-500 hover:text-[#0b3a75]">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-5xl px-4 text-center text-[11px] font-semibold leading-5 text-slate-500">
        JsgSmile is designed for MSME, SHG, buyer, seller, and industry linkage workflows. Best viewed on modern browsers with a secure connection.
      </p>
    </section>
  );
}

const inputClass = 'h-11 w-full rounded-sm border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#0b3a75] focus:ring-2 focus:ring-[#0b3a75]/15';
