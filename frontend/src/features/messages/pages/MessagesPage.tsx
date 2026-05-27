/**
 * MessagesPage — two-pane layout: conversations list + active thread.
 *
 * Routes: /buyer/messages, /seller/messages
 */
import { useState } from 'react';
import {
    ArrowLeft, FileText, Loader2, MessageSquare, Plus, RefreshCw, Send, X
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { toast } from 'sonner';
import { useConversation, useConversations, useCreateConversation, useSendMessage } from '../hooks';
import type { ConversationDto } from '../api';

export default function MessagesPage() {
    const { user } = useAuth();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const list = useConversations();

    const conversations = list.data || [];

    return (
        <div className="space-y-4">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Messaging</p>
                    <h1 className="text-2xl font-black text-slate-950">Messages</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Keep procurement communication on the platform — every message is logged.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => list.refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                        <RefreshCw className={`mr-2 h-4 w-4 ${list.isFetching ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    {user?.role !== 'admin' && (
                        <Button onClick={() => setShowCreate(true)} className="bg-[#12335f] text-white">
                            <Plus className="mr-2 h-4 w-4" /> New Conversation
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
                <ConversationList
                    conversations={conversations}
                    selectedId={selectedId}
                    isLoading={list.isLoading}
                    error={list.error}
                    onSelect={setSelectedId}
                    onRetry={() => list.refetch()}
                />

                <div className="lg:min-h-[600px]">
                    {selectedId ? (
                        <ConversationDetail id={selectedId} onBack={() => setSelectedId(null)} />
                    ) : (
                        <Card className="h-full"><CardContent className="flex flex-col items-center justify-center py-16">
                            <MessageSquare className="h-12 w-12 text-slate-300" />
                            <p className="mt-3 text-sm font-black uppercase text-slate-500 tracking-widest">Select a conversation</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">Or start a new one</p>
                        </CardContent></Card>
                    )}
                </div>
            </div>

            {showCreate && (
                <CreateConversationModal
                    onClose={() => setShowCreate(false)}
                    onCreated={(id) => { setShowCreate(false); setSelectedId(id); }}
                />
            )}
        </div>
    );
}

function ConversationList({ conversations, selectedId, isLoading, error, onSelect, onRetry }: {
    conversations: ConversationDto[];
    selectedId: number | null;
    isLoading: boolean;
    error: any;
    onSelect: (id: number) => void;
    onRetry: () => void;
}) {
    if (isLoading) return <Card><CardContent className="py-6"><LoadingState label="Loading..." /></CardContent></Card>;
    if (error) return <InlineError message={(error as Error).message} onRetry={onRetry} />;
    if (conversations.length === 0) return <Card><CardContent className="py-12"><EmptyState title="No messages" description="Start a conversation to chat with buyers/sellers." /></CardContent></Card>;

    return (
        <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-0 max-h-[700px] overflow-y-auto">
                <div className="divide-y divide-slate-100">
                    {conversations.map(c => {
                        const lastMsg = c.messages?.[0];
                        const isSelected = selectedId === c.id;
                        return (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => onSelect(c.id)}
                                className={`w-full text-left px-4 py-3 hover:bg-slate-50/60 transition ${isSelected ? 'bg-[#12335f]/5 border-l-2 border-[#12335f]' : ''}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs font-black text-slate-900 text-wrap-anywhere line-clamp-1">{c.subject}</p>
                                    {c.lastMessageAt && (
                                        <p className="text-[10px] text-slate-400 shrink-0">{formatRelative(c.lastMessageAt)}</p>
                                    )}
                                </div>
                                {c.tender && (
                                    <p className="mt-0.5 text-[10px] font-semibold text-blue-700">RE: {c.tender.tenderId} — {c.tender.title}</p>
                                )}
                                <p className="mt-1 text-[11px] text-slate-600 text-wrap-anywhere line-clamp-2">
                                    {lastMsg?.content || 'No messages yet'}
                                </p>
                            </button>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}

function ConversationDetail({ id, onBack }: { id: number; onBack: () => void }) {
    const { user } = useAuth();
    const { data: conv, isLoading, error, refetch } = useConversation(id);
    const sendMut = useSendMessage();
    const [content, setContent] = useState('');

    if (isLoading) return <LoadingState label="Loading conversation..." />;
    if (error) return <InlineError message={(error as Error).message} onRetry={() => refetch()} />;
    if (!conv) return null;

    const handleSend = async () => {
        if (content.trim().length < 1) return;
        await runWithToast(() => sendMut.mutateAsync({ id: conv.id, data: { content: content.trim() } }), {
            loading: 'Sending...', success: 'Message sent', error: 'Send failed'
        });
        setContent('');
    };

    return (
        <Card className="border-slate-200/80 shadow-sm h-full flex flex-col">
            <CardContent className="p-0 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <button onClick={onBack} className="lg:hidden inline-flex items-center text-[10px] font-black uppercase tracking-widest text-[#12335f] hover:underline">
                            <ArrowLeft className="mr-1 h-3 w-3" /> Back
                        </button>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                            <EntityIdLink label={`CON-${conv.id}`} id={conv.id} size="sm" onClick={() => { }} />
                            {conv.tender && <EntityIdLink label={conv.tender.tenderId} id={conv.tender.id} size="sm" onClick={() => { }} />}
                        </div>
                        <h2 className="mt-1 text-base font-black text-slate-950 text-wrap-anywhere">{conv.subject}</h2>
                        <p className="text-[10px] font-semibold text-slate-500">
                            With {conv.buyer?.id === Number(user?.id) ? conv.seller?.name : conv.buyer?.name}
                        </p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 max-h-[500px]">
                    {!conv.messages || conv.messages.length === 0 ? (
                        <p className="text-center py-8 text-xs font-semibold text-slate-500">No messages yet. Send the first one below.</p>
                    ) : (
                        <div className="space-y-3">
                            {conv.messages.map(m => {
                                const isMe = m.senderId === Number(user?.id);
                                return (
                                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-lg px-3 py-2 ${isMe ? 'bg-[#12335f] text-white' : 'bg-slate-100 text-slate-900'}`}>
                                            {!isMe && (
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">
                                                    {m.sender?.name || `User #${m.senderId}`}
                                                </p>
                                            )}
                                            <p className="text-xs font-semibold whitespace-pre-wrap text-wrap-anywhere">{m.content}</p>
                                            {m.attachments && m.attachments.length > 0 && (
                                                <div className={`mt-1 flex items-center gap-1 text-[10px] ${isMe ? 'text-white/70' : 'text-slate-500'}`}>
                                                    <FileText className="h-3 w-3" />
                                                    {m.attachments.length} attachment{m.attachments.length > 1 ? 's' : ''}
                                                </div>
                                            )}
                                            <p className={`mt-1 text-[10px] ${isMe ? 'text-white/60' : 'text-slate-400'}`}>
                                                {formatRelative(m.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-100 p-3 space-y-2">
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder="Type a message..."
                        rows={2}
                        maxLength={2000}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                void handleSend();
                            }
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                    />
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] text-slate-400">Ctrl+Enter to send · {content.length}/2000</p>
                        <Button onClick={handleSend} disabled={sendMut.isPending || content.trim().length < 1} className="bg-[#12335f] text-white">
                            {sendMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Send
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function CreateConversationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
    const { user } = useAuth();
    const [counterpartyId, setCounterpartyId] = useState<number | ''>('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const mut = useCreateConversation();

    const isBuyer = user?.role === 'buyer';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <h3 className="text-sm font-black uppercase tracking-widest">New Conversation</h3>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {isBuyer ? 'Seller User ID' : 'Buyer User ID'}
                        </label>
                        <input
                            type="number"
                            value={counterpartyId}
                            onChange={e => setCounterpartyId(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="e.g. 42"
                            className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-mono font-semibold"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Subject</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            placeholder="What is this about?"
                            maxLength={160}
                            className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">First Message (optional)</label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={3}
                            maxLength={2000}
                            className="w-full rounded border border-slate-200 px-3 py-2 text-xs font-semibold"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                if (!counterpartyId) { toast.error('Provide a counterparty ID'); return; }
                                if (subject.trim().length < 3) { toast.error('Subject required (≥3 chars)'); return; }
                                const payload = isBuyer
                                    ? { sellerId: counterpartyId as number, subject: subject.trim(), initialMessage: message.trim() || undefined }
                                    : { buyerId: counterpartyId as number, subject: subject.trim(), initialMessage: message.trim() || undefined };
                                const result = await runWithToast(() => mut.mutateAsync(payload), {
                                    loading: 'Creating...', success: 'Conversation created', error: 'Failed'
                                });
                                if (result?.conversation?.id) onCreated(result.conversation.id);
                            }}
                            disabled={mut.isPending}
                            className="bg-[#12335f] text-white"
                        >
                            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Start
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
