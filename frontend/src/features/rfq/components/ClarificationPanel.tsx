'use client';

import React, { useState } from 'react';
import { HelpCircle, MessageSquare, Send, Loader2, Lock, Globe, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { useClarifications, useAskClarification, useReplyClarification, type ClarificationKind } from '../hooks';

const formatWhen = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

interface ClarificationPanelProps {
  /** QuoteRequest id (kind='quote-request') OR BuyerRequirement id (kind='requirement'). */
  quoteRequestId?: number;
  /** Which backend entity the thread hangs off. Defaults to quote-request. */
  kind?: ClarificationKind;
  /** Current viewer role: sellers ask, buyers answer. */
  role: 'seller' | 'buyer';
  /** When the RFQ deadline has passed the backend blocks new questions. */
  deadlinePassed?: boolean;
}

export default function ClarificationPanel({ quoteRequestId, kind = 'quote-request', role, deadlinePassed }: ClarificationPanelProps) {
  const { data: clarifications = [], isLoading } = useClarifications(quoteRequestId, kind);
  const ask = useAskClarification(quoteRequestId, kind);
  const reply = useReplyClarification(quoteRequestId, kind);

  const [question, setQuestion] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});

  if (!quoteRequestId) return null;

  const submitQuestion = () => {
    const text = question.trim();
    if (text.length < 3) {
      toast.error('Question must be at least 3 characters.');
      return;
    }
    ask.mutate({ question: text, visibility }, {
      onSuccess: () => { setQuestion(''); toast.success('Question sent to the buyer.'); },
      onError: (err: any) => toast.error(err?.message || 'Failed to send question.'),
    });
  };

  const submitReply = (clarId: number) => {
    const text = (replyDrafts[clarId] || '').trim();
    if (text.length < 1) {
      toast.error('Reply cannot be empty.');
      return;
    }
    reply.mutate({ clarId, response: text }, {
      onSuccess: () => {
        setReplyDrafts(prev => { const n = { ...prev }; delete n[clarId]; return n; });
        toast.success('Reply sent.');
      },
      onError: (err: any) => toast.error(err?.message || 'Failed to send reply.'),
    });
  };

  return (
    <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2 pb-3.5 border-b border-slate-100">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <MessageSquare className="h-4 w-4" />
        </div>
        <h2 className="text-base font-black text-slate-900 uppercase tracking-wider">
          Clarifications & Q&amp;A
        </h2>
        <span className="ml-auto text-[10px] font-black uppercase bg-[#12335f]/5 text-[#12335f] px-2.5 py-1 rounded-full border border-[#12335f]/10">
          {clarifications.length} {clarifications.length === 1 ? 'Thread' : 'Threads'}
        </span>
      </div>

      {/* Ask box — sellers only */}
      {role === 'seller' && (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4 space-y-3">
          {deadlinePassed ? (
            <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> The clarification window has closed for this RFQ.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Ask the buyer a question</span>
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="e.g. Can the delivery timeline be extended by a week for bulk quantities?"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 resize-none"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('PUBLIC')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition',
                      visibility === 'PUBLIC' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    )}
                  >
                    <Globe className="h-3 w-3" /> Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('PRIVATE')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition',
                      visibility === 'PRIVATE' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    )}
                  >
                    <Lock className="h-3 w-3" /> Private
                  </button>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {visibility === 'PUBLIC' ? 'Answer visible to all bidders' : 'Answer visible only to you'}
                  </span>
                </div>
                <Button
                  type="button"
                  onClick={submitQuestion}
                  disabled={ask.isPending || question.trim().length < 3}
                  className="h-9 rounded-xl bg-[#12335f] px-4 text-xs font-black uppercase text-white hover:bg-[#0b2447] flex items-center gap-1.5"
                >
                  {ask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {ask.isPending ? 'Sending' : 'Send Question'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Thread list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : clarifications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <HelpCircle className="h-8 w-8 text-slate-300" />
          <p className="text-xs font-bold text-slate-500">No clarifications yet.</p>
          <p className="text-[11px] font-semibold text-slate-400">
            {role === 'seller' ? 'Ask the buyer a question above to start a thread.' : 'Seller questions will appear here for you to answer.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {clarifications.map((c, idx) => (
            <div key={c.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-xs">
              {/* Question */}
              <div className="flex items-start gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-500">Q{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-slate-900 break-words">{c.question}</p>
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase border',
                      c.visibility === 'PUBLIC' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    )}>
                      {c.visibility === 'PUBLIC' ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                      {c.visibility}
                    </span>
                  </div>
                  {c.askedAt && <p className="mt-0.5 text-[10px] font-semibold text-slate-400">Asked {formatWhen(c.askedAt)}</p>}
                </div>
              </div>

              {/* Answer or reply box */}
              {c.response ? (
                <div className="mt-3 ml-8 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> Buyer Response
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-700 leading-relaxed break-words whitespace-pre-wrap">{c.response}</p>
                  {c.answeredAt && <p className="mt-1 text-[10px] font-semibold text-slate-400">Answered {formatWhen(c.answeredAt)}</p>}
                </div>
              ) : role === 'buyer' ? (
                <div className="mt-3 ml-8 space-y-2">
                  <textarea
                    value={replyDrafts[c.id] || ''}
                    onChange={e => setReplyDrafts(prev => ({ ...prev, [c.id]: e.target.value }))}
                    rows={2}
                    maxLength={3000}
                    placeholder="Type your answer…"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 resize-none"
                  />
                  <Button
                    type="button"
                    onClick={() => submitReply(c.id)}
                    disabled={reply.isPending || !(replyDrafts[c.id] || '').trim()}
                    className="h-8 rounded-lg bg-emerald-600 px-3 text-[11px] font-black uppercase text-white hover:bg-emerald-700 flex items-center gap-1.5"
                  >
                    {reply.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Answer
                  </Button>
                </div>
              ) : (
                <p className="mt-3 ml-8 text-[11px] font-semibold text-amber-600 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Awaiting buyer response…
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
