/**
 * Messages / Conversations API client.
 */
import { getApi, patchApi, postApi } from '../shared/apiClient';

export type MessageRole = 'buyer' | 'seller' | 'admin' | 'master_admin' | 'financier' | 'shg' | string;

export interface MessageUserDto {
    id: number;
    name: string;
    email?: string;
    role: MessageRole;
    organization?: { id: number; organizationName?: string; name?: string } | null;
    company?: { id: number; name?: string; portalDisplayName?: string } | null;
}

export interface MessageDto {
    id: number;
    conversationId: number;
    senderId: number;
    content: string;
    status?: string;
    createdAt: string;
    sender?: MessageUserDto;
    attachments?: Array<{ id: number; fileAssetId: number; fileAsset?: { id: number; originalName?: string; mimeType?: string; size?: number } }>;
    pending?: boolean;
}

export interface ConversationDto {
    id: number;
    tenderId?: number | null;
    buyerId: number;
    sellerId: number;
    subject: string;
    status?: string;
    lastMessageAt?: string | null;
    createdAt: string;
    updatedAt: string;
    tender?: { id: number; tenderId: string; title: string; status: string } | null;
    buyer?: MessageUserDto;
    seller?: MessageUserDto;
    messages?: MessageDto[];
    unreadCount?: number;
    muted?: boolean;
}

export const fetchConversations = () => getApi<ConversationDto[]>('/api/conversations');
export const fetchConversation = (id: number) => getApi<ConversationDto>(`/api/conversations/${id}`);

export const createConversation = (data: {
    tenderId?: number; buyerId?: number; sellerId?: number;
    subject: string; initialMessage?: string; fileAssetIds?: number[];
}) => postApi<{ conversation: ConversationDto; message?: MessageDto }>('/api/conversations', data);

export const sendMessage = (conversationId: number, data: { content?: string; fileAssetIds?: number[] }) =>
    postApi<MessageDto>(`/api/conversations/${conversationId}/messages`, data);

export const markConversationRead = (conversationId: number) =>
    patchApi<{ success: boolean; readCount: number }>(`/api/conversations/${conversationId}/read`, {});

export const archiveConversation = (conversationId: number) =>
    patchApi<ConversationDto>(`/api/conversations/${conversationId}/archive`, {});

export const muteConversation = (conversationId: number, muted: boolean) =>
    patchApi<{ success: boolean; muted: boolean }>(`/api/conversations/${conversationId}/mute`, { muted });

export const fetchUnreadMessageCount = () => getApi<{ unreadCount: number }>('/api/messages/unread-count');

export const searchMessageUsers = (params: { q?: string; role?: string }) => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.role && params.role !== 'all') query.set('role', params.role);
    return getApi<MessageUserDto[]>(`/api/messages/users/search${query.toString() ? `?${query}` : ''}`);
};
