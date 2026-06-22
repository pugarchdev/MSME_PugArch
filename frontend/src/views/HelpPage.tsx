'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, CheckCircle2, ClipboardList, FileText, HelpCircle, Mail, MessageSquare, Phone, ShieldCheck } from 'lucide-react';

const procedures = [
    ['Buyer registration', 'Create account, complete organization profile, upload GST/PAN/Udyam or applicable authorization documents, and wait for portal verification.'],
    ['Procurement creation', 'Select procurement type, add category, quantity, unit, budget, delivery, payment terms, specifications, and supporting documents before publishing.'],
    ['Supplier participation', 'Verified sellers discover opportunities, submit quotations or bids, and keep responses traceable through the platform.'],
    ['Evaluation and award', 'Buyer compares compliant responses, records approval, issues order, and tracks delivery and payment milestones.'],
    ['Dispute and grievance', 'Raise a dispute with order references and documents. The portal records timeline, comments, evidence, and resolution status.'],
];

const standards = [
    'Use clear item descriptions, measurable specifications, quantity, unit, delivery location, and expected delivery date.',
    'Attach technical specifications, terms, drawings, quality requirements, and compliance documents where applicable.',
    'Keep all supplier communication inside Messages so the procurement record remains auditable.',
    'Do not share passwords, OTPs, or bank credentials through chat, attachments, phone, or email.',
    'Use registered organization details only. Mismatched GST/PAN/Udyam information may delay verification.',
];

export default function HelpPage() {
    return (
        <div className="min-h-dvh bg-slate-50">
            <div className="brand-tricolor-strip w-full" />
            <main className="mx-auto max-w-7xl px-4 py-8">
                <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">MSME Portal Helpdesk</p>
                            <h1 className="mt-2 text-3xl font-black text-slate-950">Help, Standard Procedure and User Support</h1>
                            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                                Official guidance for buyers, sellers, administrators, and SHG users to complete portal workflows with proper documentation, traceability, and grievance support.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <a href="tel:18001234567" className="inline-flex h-10 items-center gap-2 rounded-md bg-[#12335f] px-4 text-xs font-black uppercase tracking-wide text-white hover:bg-[#0b2447]">
                                <Phone className="h-4 w-4" /> 1800-123-4567
                            </a>
                            <a href="mailto:support@jsgsmile.in" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-[#12335f] hover:bg-slate-50">
                                <Mail className="h-4 w-4" /> support@jsgsmile.in
                            </a>
                        </div>
                    </div>
                </section>

                <section className="mt-5 grid gap-4 lg:grid-cols-3">
                    <QuickCard icon={ClipboardList} title="Buyer Procedure" href="/buyer/create-procurement" text="Create procurement with category, quantity, unit, budget, delivery, payment terms, and specifications." />
                    <QuickCard icon={MessageSquare} title="Messages" href="/buyer/messages" text="Use secure platform messaging for quote requests, supplier clarification, and audit records." />
                    <QuickCard icon={BookOpen} title="User Guide" href="/user-guide" text="Open the detailed portal manual for role-specific screens and process notes." />
                </section>

                <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2">
                            <FileText className="h-5 w-5 text-[#12335f]" />
                            <h2 className="text-lg font-black text-slate-950">Standard Operating Procedure</h2>
                        </div>
                        <div className="space-y-3">
                            {procedures.map(([title, text], index) => (
                                <div key={title} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[44px_1fr]">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-sm font-black text-[#12335f] shadow-sm">{index + 1}</div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900">{title}</h3>
                                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-[#12335f]" />
                                <h2 className="text-lg font-black text-slate-950">Documentation Standards</h2>
                            </div>
                            <div className="space-y-2">
                                {standards.map((item) => (
                                    <div key={item} className="flex items-start gap-2 rounded-md bg-slate-50 p-3">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                        <p className="text-xs font-semibold leading-5 text-slate-600">{item}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="mb-3 flex items-center gap-2">
                                <HelpCircle className="h-5 w-5 text-[#12335f]" />
                                <h2 className="text-lg font-black text-slate-950">Support Escalation</h2>
                            </div>
                            <dl className="space-y-3 text-sm">
                                <div>
                                    <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">Level 1</dt>
                                    <dd className="font-semibold text-slate-700">Helpdesk checks login, document upload, catalogue, cart, messages, and procurement workflow issues.</dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">Level 2</dt>
                                    <dd className="font-semibold text-slate-700">Portal administrator reviews verification, approvals, account access, and process exceptions.</dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">Level 3</dt>
                                    <dd className="font-semibold text-slate-700">Grievance/dispute route records evidence, comments, assigned officer, and final resolution.</dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

function QuickCard({ icon: Icon, title, text, href }: { icon: any; title: string; text: string; href: string }) {
    return (
        <Link href={href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#12335f]/30 hover:shadow-md">
            <Icon className="h-6 w-6 text-[#12335f]" />
            <h2 className="mt-3 text-base font-black text-slate-950">{title}</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{text}</p>
        </Link>
    );
}
