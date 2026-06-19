import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    Archive,
    ArrowLeft,
    BellOff,
    CheckCheck,
    FileText,
    MessageSquare,
    Paperclip,
    Plus,
    RefreshCw,
    Search,
    Send,
    ShieldCheck,
    UploadCloud,
    UserRound,
    X
} from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Badge, Card, CardContent } from '../../../components/ui/card';
import { Input, Select } from '../../../components/ui/input';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { uploadDeliveryFile as uploadMessageFile, type UploadedFileAsset } from '../../delivery/upload';
import {
    useArchiveConversation,
    useConversation,
    useConversations,
    useCreateConversation,
    useMarkConversationRead,
    useMessageUserSearch,
    useMuteConversation,
    useSendMessage,
    useUnreadMessageCount
} from '../hooks';
import type { ConversationDto, MessageDto, MessageUserDto } from '../api';

const roleLabel = (role?: string) => (role || 'user').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const isAdminRole = (role?: string) => role === 'admin' || role === 'master_admin';
const MAX_MESSAGE_ATTACHMENT_SIZE = 20 * 1024 * 1024;

const formatFileSize = (size?: number) => {
    if (!size) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const roleBadgeClass = (role?: string) => {
    if (role === 'admin' || role === 'master_admin') return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    if (role === 'buyer') return 'border-blue-200 bg-blue-50 text-blue-700';
    if (role === 'seller') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
};

const routeForRole = (role?: string) => {
    if (role === 'seller') return '/seller/messages';
    if (isAdminRole(role)) return '/admin/messages';
    return '/buyer/messages';
};

export default function MessagesPage() {
    const { user } = useAuth();
    const router = useRouter();
    const pathname = usePathname() || routeForRole(user?.role);
    const searchParams = useSearchParams();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const queryInitializedRef = useRef(false);
    const list = useConversations();
    const unread = useUnreadMessageCount();

    const conversations = list.data || [];
    const initialModalValues = useMemo(() => {
        const sellerId = searchParams?.get('sellerId') || '';
        const buyerId = searchParams?.get('buyerId') || '';
        const counterpartyId = searchParams?.get('counterpartyId') || '';
        const conversationId = Number(searchParams?.get('conversationId') || searchParams?.get('id') || 0);
        return {
            conversationId: Number.isFinite(conversationId) && conversationId > 0 ? conversationId : null,
            counterpartyId: user?.role === 'buyer' ? (sellerId || counterpartyId) : (buyerId || counterpartyId),
            recipientRole: sellerId ? 'seller' : buyerId ? 'buyer' : searchParams?.get('role') || '',
            subject: searchParams?.get('subject') || '',
            message: searchParams?.get('message') || '',
        };
    }, [searchParams, user?.role]);

    useEffect(() => {
        if (!initialModalValues.conversationId) return;
        setSelectedId(initialModalValues.conversationId);
    }, [initialModalValues.conversationId]);

    useEffect(() => {
        if (!user || queryInitializedRef.current || initialModalValues.conversationId) return;
        if (!initialModalValues.counterpartyId) return;
        queryInitializedRef.current = true;
        setShowCreate(true);
    }, [initialModalValues.counterpartyId, initialModalValues.conversationId, user]);

    const handleCreated = (id: number) => {
        setShowCreate(false);
        setSelectedId(id);
        if (searchParams?.toString()) router.replace(pathname);
    };

    return (
        <div className="space-y-4">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Communication control</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-black text-slate-950">Messages</h1>
                        {isAdminRole(user?.role) && (
                            <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700">
                                <ShieldCheck className="mr-1 h-3 w-3" /> Admin Console
                            </Badge>
                        )}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Procurement communication register.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={unread.data?.unreadCount ? 'warning' : 'default'} className="h-9 rounded-lg px-3">
                        {unread.data?.unreadCount || 0} unread
                    </Badge>
                    <Button variant="outline" onClick={() => list.refetch()} className="h-10 text-xs font-black uppercase">
                        <RefreshCw className={`mr-2 h-4 w-4 ${list.isFetching ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button onClick={() => setShowCreate(true)} className="bg-[#12335f] text-white">
                        <Plus className="mr-2 h-4 w-4" /> New Message
                    </Button>
                </div>
            </div>

            <div className="grid min-h-[680px] gap-3 xl:grid-cols-[380px_1fr]">
                <ConversationList
                    conversations={conversations}
                    selectedId={selectedId}
                    currentUserId={Number(user?.id || 0)}
                    isLoading={list.isLoading}
                    error={list.error}
                    onSelect={setSelectedId}
                    onRetry={() => list.refetch()}
                />

                <div className="min-h-[620px]">
                    {selectedId ? (
                        <ConversationDetail id={selectedId} onBack={() => setSelectedId(null)} />
                    ) : (
                        <Card className="h-full">
                            <CardContent className="flex h-full min-h-[620px] flex-col items-center justify-center py-16 text-center">
                                <MessageSquare className="h-12 w-12 text-slate-300" />
                                <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-500">Select a conversation</p>
                                <p className="mt-1 max-w-sm text-xs font-semibold text-slate-400">Conversation activity appears here.</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {showCreate && (
                <CreateConversationModal
                    key={`${initialModalValues.counterpartyId}-${initialModalValues.subject}-${initialModalValues.recipientRole}`}
                    initialCounterpartyId={initialModalValues.counterpartyId}
                    initialRecipientRole={initialModalValues.recipientRole}
                    initialSubject={initialModalValues.subject}
                    initialMessage={initialModalValues.message}
                    onClose={() => setShowCreate(false)}
                    onCreated={handleCreated}
                />
            )}
        </div>
    );
}

function ConversationList({
    conversations,
    selectedId,
    currentUserId,
    isLoading,
    error,
    onSelect,
    onRetry
}: {
    conversations: ConversationDto[];
    selectedId: number | null;
    currentUserId: number;
    isLoading: boolean;
    error: any;
    onSelect: (id: number) => void;
    onRetry: () => void;
}) {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('active');
    const [role, setRole] = useState('all');

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        return conversations.filter(conversation => {
            const isArchived = conversation.status === 'archived';
            if (status === 'active' && isArchived) return false;
            if (status === 'archived' && !isArchived) return false;
            const parties = [conversation.buyer, conversation.seller].filter(Boolean) as MessageUserDto[];
            if (role !== 'all' && !parties.some(user => user.role === role)) return false;
            if (!term) return true;
            const haystack = [
                conversation.subject,
                conversation.tender?.tenderId,
                conversation.tender?.title,
                conversation.messages?.[0]?.content,
                ...parties.map(user => `${user.name} ${user.email || ''} ${user.role}`)
            ].join(' ').toLowerCase();
            return haystack.includes(term);
        });
    }, [conversations, query, role, status]);

    if (isLoading) return <Card><CardContent className="py-6"><LoadingState label="Loading conversations..." /></CardContent></Card>;
    if (error) return <InlineError message={(error as Error).message} onRetry={onRetry} />;

    return (
        <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
                <div className="space-y-3 border-b border-slate-100 p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Search subject, user, tender..."
                            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <select value={status} onChange={event => setStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold">
                            <option value="active">Active</option>
                            <option value="archived">Archived</option>
                            <option value="all">All Status</option>
                        </select>
                        <select value={role} onChange={event => setRole(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold">
                            <option value="all">All Roles</option>
                            <option value="buyer">Buyer</option>
                            <option value="seller">Seller</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div className="p-6">
                        <EmptyState title="No conversations found" description="No records match the current filters." />
                    </div>
                ) : (
                    <div className="max-h-[610px] divide-y divide-slate-100 overflow-y-auto">
                        {filtered.map(conversation => {
                            const lastMessage = conversation.messages?.[0];
                            const isSelected = selectedId === conversation.id;
                            const counterpart = conversation.buyerId === currentUserId ? conversation.seller : conversation.buyer;
                            return (
                                <button
                                    key={conversation.id}
                                    type="button"
                                    onClick={() => onSelect(conversation.id)}
                                    className={`w-full px-4 py-3 text-left transition hover:bg-slate-50/70 ${isSelected ? 'border-l-2 border-[#12335f] bg-[#12335f]/5' : ''}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="line-clamp-1 text-xs font-black text-slate-900 text-wrap-anywhere">{conversation.subject}</p>
                                        <div className="flex shrink-0 items-center gap-1">
                                            {Boolean(conversation.unreadCount) && (
                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">{conversation.unreadCount}</span>
                                            )}
                                            {conversation.lastMessageAt && <p className="text-[10px] text-slate-400">{formatRelative(conversation.lastMessageAt)}</p>}
                                        </div>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        {conversation.status === 'archived' && <Badge className="border-slate-200 bg-slate-50 text-slate-500">Archived</Badge>}
                                        {counterpart && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${roleBadgeClass(counterpart.role)}`}>{roleLabel(counterpart.role)}</span>}
                                        {conversation.tender && <span className="text-[10px] font-bold text-blue-700">RE: {conversation.tender.tenderId}</span>}
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 text-wrap-anywhere">
                                        {lastMessage ? `${lastMessage.sender?.name || 'User'}: ${lastMessage.content || `${lastMessage.attachments?.length || 0} attachment(s)`}` : 'No messages yet'}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function ConversationDetail({ id, onBack }: { id: number; onBack: () => void }) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { data: conversation, isLoading, error, refetch } = useConversation(id);
    const sendMut = useSendMessage();
    const markRead = useMarkConversationRead();
    const archive = useArchiveConversation();
    const mute = useMuteConversation();
    const [content, setContent] = useState('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploadedAttachments, setUploadedAttachments] = useState<UploadedFileAsset[]>([]);
    const [uploadingFiles, setUploadingFiles] = useState<Array<{ id: string; name: string; progress: number }>>([]);
    const [uploadError, setUploadError] = useState<string | null>(null);

    useEffect(() => {
        if (conversation?.id && conversation.unreadCount) {
            markRead.mutate(conversation.id);
        }
    }, [conversation?.id, conversation?.unreadCount]);

    if (isLoading) return <LoadingState label="Loading conversation..." />;
    if (error) return <InlineError message={(error as Error).message} onRetry={() => refetch()} />;
    if (!conversation) return null;

    const buyer = conversation.buyer;
    const seller = conversation.seller;
    const counterpart = conversation.buyerId === Number(user?.id) ? seller : buyer;
    const hasComposerContent = content.trim().length > 0 || uploadedAttachments.length > 0;
    const isUploading = uploadingFiles.length > 0;

    const handleAttachmentFiles = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) return;
        setUploadError(null);

        for (const file of files) {
            if (file.size > MAX_MESSAGE_ATTACHMENT_SIZE) {
                setUploadError(`${file.name} is larger than 20 MB`);
                continue;
            }

            const uploadId = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
            setUploadingFiles(current => [...current, { id: uploadId, name: file.name, progress: 0 }]);
            try {
                const uploaded = await uploadMessageFile(file, {
                    entityType: 'message',
                    onProgress: percent => {
                        setUploadingFiles(current => current.map(item => item.id === uploadId ? { ...item, progress: percent } : item));
                    }
                });
                setUploadedAttachments(current => [...current, uploaded]);
            } catch (err) {
                setUploadError(err instanceof Error ? err.message : `Unable to upload ${file.name}`);
            } finally {
                setUploadingFiles(current => current.filter(item => item.id !== uploadId));
            }
        }
    };

    const handleSend = async () => {
        const messageText = content.trim();
        if (!messageText && uploadedAttachments.length === 0) return;
        if (isUploading) return;
        const attachmentsToSend = uploadedAttachments;
        const fileAssetIds = attachmentsToSend.map(attachment => attachment.id).filter(value => Number.isFinite(value) && value > 0);
        const optimisticId = -Date.now();
        const optimisticMessage: MessageDto = {
            id: optimisticId,
            conversationId: conversation.id,
            senderId: Number(user?.id),
            content: messageText,
            status: 'sending',
            createdAt: new Date().toISOString(),
            sender: user ? { id: Number(user.id), name: user.name || 'You', email: user.email, role: user.role } : undefined,
            attachments: attachmentsToSend.map((attachment, index) => ({
                id: -(index + 1),
                fileAssetId: attachment.id,
                fileAsset: {
                    id: attachment.id,
                    originalName: attachment.originalName,
                    mimeType: attachment.mimeType,
                    size: attachment.size
                }
            })),
            pending: true,
        };
        setContent('');
        setUploadedAttachments([]);
        queryClient.setQueryData<ConversationDto>(['conversations', 'detail', conversation.id], current => current ? ({
            ...current,
            lastMessageAt: optimisticMessage.createdAt,
            messages: [...(current.messages || []), optimisticMessage],
        }) : current);

        try {
            const saved = await sendMut.mutateAsync({ id: conversation.id, data: { content: messageText, fileAssetIds } });
            const assetsById = new Map(attachmentsToSend.map(attachment => [attachment.id, attachment]));
            const enrichedSaved: MessageDto = {
                ...saved,
                attachments: saved.attachments?.map(attachment => ({
                    ...attachment,
                    fileAsset: attachment.fileAsset || assetsById.get(attachment.fileAssetId)
                }))
            };
            queryClient.setQueryData<ConversationDto>(['conversations', 'detail', conversation.id], current => current ? ({
                ...current,
                lastMessageAt: enrichedSaved.createdAt || optimisticMessage.createdAt,
                messages: (current.messages || []).map(message => message.id === optimisticId ? enrichedSaved : message),
            }) : current);
        } catch (err) {
            queryClient.setQueryData<ConversationDto>(['conversations', 'detail', conversation.id], current => current ? ({
                ...current,
                messages: (current.messages || []).filter(message => message.id !== optimisticId),
            }) : current);
            setContent(messageText);
            setUploadedAttachments(attachmentsToSend);
            toast.error(err instanceof Error ? err.message : 'Unable to send message');
        }
    };

    return (
        <Card className="flex h-full min-h-[620px] flex-col border-slate-200/80 shadow-sm">
            <CardContent className="flex flex-1 flex-col p-0">
                <div className="border-b border-slate-100 px-4 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                            <button onClick={onBack} className="mb-1 inline-flex items-center text-[10px] font-black uppercase tracking-widest text-[#12335f] hover:underline xl:hidden">
                                <ArrowLeft className="mr-1 h-3 w-3" /> Back
                            </button>
                            <div className="flex flex-wrap items-center gap-2">
                                <EntityIdLink label={`CON-${conversation.id}`} id={conversation.id} size="sm" onClick={() => undefined} />
                                {conversation.tender && <EntityIdLink label={conversation.tender.tenderId} id={conversation.tender.id} size="sm" onClick={() => undefined} />}
                                {conversation.status === 'archived' && <Badge>Archived</Badge>}
                            </div>
                            <h2 className="mt-2 text-base font-black text-slate-950 text-wrap-anywhere">{conversation.subject}</h2>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                                <ParticipantPill user={buyer} label="Buyer" />
                                <ParticipantPill user={seller} label="Seller / Support" />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => runWithToast(() => markRead.mutateAsync(conversation.id), { loading: 'Marking...', success: 'Marked read', error: 'Unable to mark read' })}>
                                <CheckCheck className="mr-2 h-4 w-4" /> Read
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => runWithToast(() => mute.mutateAsync({ id: conversation.id, muted: !conversation.muted }), { loading: 'Updating...', success: conversation.muted ? 'Unmuted' : 'Muted', error: 'Unable to update mute setting' })}>
                                <BellOff className="mr-2 h-4 w-4" /> {conversation.muted ? 'Unmute' : 'Mute'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => runWithToast(() => archive.mutateAsync(conversation.id), { loading: 'Archiving...', success: 'Archived', error: 'Unable to archive' })}>
                                <Archive className="mr-2 h-4 w-4" /> Archive
                            </Button>
                        </div>
                    </div>
                    {conversation.tender && (
                        <div className="mt-3 grid gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs font-semibold text-blue-900 md:grid-cols-3">
                            <span>Tender: {conversation.tender.title}</span>
                            <span>Status: {conversation.tender.status}</span>
                            <span>Last activity: {conversation.lastMessageAt ? formatDateTime(conversation.lastMessageAt) : formatDateTime(conversation.createdAt)}</span>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {!conversation.messages?.length ? (
                        <p className="py-8 text-center text-xs font-semibold text-slate-500">No messages yet. Send the first one below.</p>
                    ) : (
                        <div className="space-y-4">
                            {conversation.messages.map(message => {
                                const isMe = message.senderId === Number(user?.id);
                                return (
                                    <div key={message.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[86%] rounded-lg border px-3 py-2 shadow-sm ${isMe ? 'border-[#12335f] bg-[#12335f] text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
                                            <div className="mb-1 flex flex-wrap items-center gap-2">
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${isMe ? 'text-white/80' : 'text-slate-500'}`}>
                                                    {isMe ? 'You' : message.sender?.name || `User #${message.senderId}`}
                                                </span>
                                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${isMe ? 'border-white/20 bg-white/10 text-white/80' : roleBadgeClass(message.sender?.role)}`}>
                                                    {roleLabel(message.sender?.role)}
                                                </span>
                                                <span className={`text-[10px] ${isMe ? 'text-white/60' : 'text-slate-400'}`}>
                                                    {message.pending ? 'sending...' : formatDateTime(message.createdAt)}
                                                </span>
                                            </div>
                                            {message.content ? (
                                                <p className="whitespace-pre-wrap text-xs font-semibold leading-5 text-wrap-anywhere">{message.content}</p>
                                            ) : null}
                                            {Boolean(message.attachments?.length) && (
                                                <div className="mt-2 space-y-1">
                                                    {message.attachments!.map(attachment => (
                                                        <div key={attachment.id} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-[10px] font-bold ${isMe ? 'border-white/20 bg-white/10 text-white/85' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                                            <FileText className="h-3 w-3" />
                                                            <span className="min-w-0 truncate">{attachment.fileAsset?.originalName || `File asset #${attachment.fileAssetId}`}</span>
                                                            {attachment.fileAsset?.size ? <span className={isMe ? 'text-white/55' : 'text-slate-400'}>{formatFileSize(attachment.fileAsset.size)}</span> : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className={`mt-1 text-right text-[10px] ${isMe ? 'text-white/60' : 'text-slate-400'}`}>
                                                {message.status || 'sent'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-100 p-3">
                    <div className="grid gap-2 lg:grid-cols-[1fr_240px]">
                        <textarea
                            value={content}
                            onChange={event => setContent(event.target.value)}
                            placeholder={`Message ${counterpart?.name || 'participant'}...`}
                            rows={3}
                            maxLength={2000}
                            onKeyDown={event => {
                                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                                    event.preventDefault();
                                    void handleSend();
                                }
                            }}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                        />
                        <div className="space-y-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={handleAttachmentFiles}
                                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                            />
                            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={sendMut.isPending || isUploading} className="h-10 w-full">
                                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
                                Attach Files
                            </Button>
                            <Button onClick={handleSend} disabled={!hasComposerContent || sendMut.isPending || isUploading} className="h-10 w-full bg-[#12335f] text-white">
                                {sendMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Send
                            </Button>
                        </div>
                    </div>
                    {(uploadedAttachments.length > 0 || uploadingFiles.length > 0 || uploadError) && (
                        <div className="mt-3 space-y-2">
                            {uploadError && (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                                    {uploadError}
                                </div>
                            )}
                            {uploadingFiles.map(file => (
                                <div key={file.id} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                                    <div className="flex items-center justify-between gap-3 text-xs font-bold text-blue-900">
                                        <span className="min-w-0 truncate">{file.name}</span>
                                        <span>{file.progress}%</span>
                                    </div>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                                        <div className="h-full rounded-full bg-[#12335f]" style={{ width: `${Math.max(4, file.progress)}%` }} />
                                    </div>
                                </div>
                            ))}
                            {uploadedAttachments.map(attachment => (
                                <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-700">
                                        <UploadCloud className="h-4 w-4 shrink-0 text-emerald-600" />
                                        <span className="min-w-0 truncate">{attachment.originalName || `File asset #${attachment.id}`}</span>
                                        {attachment.size ? <span className="shrink-0 text-slate-400">{formatFileSize(attachment.size)}</span> : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setUploadedAttachments(current => current.filter(item => item.id !== attachment.id))}
                                        className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-600"
                                        aria-label="Remove attachment"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function ParticipantPill({ user, label }: { user?: MessageUserDto; label: string }) {
    if (!user) return null;
    return (
        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
            <UserRound className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
            <span className="text-xs font-black text-slate-800">{user.name}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${roleBadgeClass(user.role)}`}>{roleLabel(user.role)}</span>
        </span>
    );
}

function CreateConversationModal({
    onClose,
    onCreated,
    initialCounterpartyId = '',
    initialRecipientRole = '',
    initialSubject = '',
    initialMessage = '',
}: {
    onClose: () => void;
    onCreated: (id: number) => void;
    initialCounterpartyId?: string;
    initialRecipientRole?: string;
    initialSubject?: string;
    initialMessage?: string;
}) {
    const { user } = useAuth();
    const [recipientRole, setRecipientRole] = useState(initialRecipientRole || (user?.role === 'buyer' ? 'seller' : 'buyer'));
    const [counterpartyId, setCounterpartyId] = useState<number | ''>(() => {
        const id = Number(initialCounterpartyId);
        return Number.isFinite(id) && id > 0 ? id : '';
    });
    const [query, setQuery] = useState('');
    const [subject, setSubject] = useState(initialSubject);
    const [message, setMessage] = useState(initialMessage);
    const mut = useCreateConversation();
    const canSearchUsers = isAdminRole(user?.role);
    const users = useMessageUserSearch({ q: query, role: recipientRole }, canSearchUsers);

    const payloadForRole = () => {
        if (!counterpartyId) return null;
        if (recipientRole === 'seller') return { sellerId: counterpartyId as number, subject: subject.trim(), initialMessage: message.trim() || undefined };
        return { buyerId: counterpartyId as number, subject: subject.trim(), initialMessage: message.trim() || undefined };
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">New Role-Based Message</h3>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-[1fr_260px]">
                    <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Select label="Recipient Role" value={recipientRole} onChange={event => setRecipientRole(event.target.value)}>
                                <option value="buyer">Buyer</option>
                                <option value="seller">Seller</option>
                                {isAdminRole(user?.role) && <option value="admin">Admin</option>}
                            </Select>
                            <Input
                                label="Recipient User ID"
                                type="number"
                                value={counterpartyId}
                                onChange={event => setCounterpartyId(event.target.value === '' ? '' : Number(event.target.value))}
                                placeholder="e.g. 42"
                            />
                        </div>
                        <Input
                            label="Subject"
                            value={subject}
                            onChange={event => setSubject(event.target.value)}
                            placeholder="Tender clarification, delivery issue, support note..."
                            maxLength={160}
                        />
                        <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">First Message</label>
                            <textarea
                                value={message}
                                onChange={event => setMessage(event.target.value)}
                                rows={5}
                                maxLength={2000}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                            />
                            <p className="text-right text-[10px] text-slate-400">{message.length}/2000</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {canSearchUsers ? (
                            <>
                                <Input
                                    label="Find User"
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    placeholder="Name, email, mobile"
                                />
                                <div className="max-h-[230px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
                                    {users.isLoading ? (
                                        <div className="py-4 text-center text-xs font-semibold text-slate-400">Searching...</div>
                                    ) : users.data?.length ? (
                                        users.data.map(candidate => (
                                            <button
                                                key={candidate.id}
                                                type="button"
                                                onClick={() => {
                                                    setCounterpartyId(candidate.id);
                                                    setRecipientRole(candidate.role);
                                                }}
                                                className={`w-full rounded-lg border px-3 py-2 text-left transition hover:bg-slate-50 ${counterpartyId === candidate.id ? 'border-[#12335f] bg-[#12335f]/5' : 'border-slate-200'}`}
                                            >
                                                <p className="text-xs font-black text-slate-900">{candidate.name}</p>
                                                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{candidate.email}</p>
                                                <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${roleBadgeClass(candidate.role)}`}>{roleLabel(candidate.role)}</span>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="py-4 text-center text-xs font-semibold text-slate-400">No matching users</div>
                                    )}
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        onClick={async () => {
                            const payload = payloadForRole();
                            if (!payload) { toast.error('Select a recipient'); return; }
                            if (subject.trim().length < 3) { toast.error('Subject required'); return; }
                            try {
                                const result = await runWithToast(() => mut.mutateAsync(payload), {
                                    loading: 'Creating conversation...',
                                    success: 'Conversation created',
                                    error: err => err instanceof Error ? err.message : 'Unable to create conversation'
                                });
                                if (result?.conversation?.id) onCreated(result.conversation.id);
                            } catch {
                                // runWithToast already surfaces the API message.
                            }
                        }}
                        disabled={mut.isPending}
                        className="bg-[#12335f] text-white"
                    >
                        {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Start Conversation
                    </Button>
                </div>
            </div>
        </div>
    );
}
