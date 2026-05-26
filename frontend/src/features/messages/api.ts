/**
 * Messages / Conversations API client.
 */
import { getApi, postApi } from '../shared/apiClient';

export interface MessageDto {
    id: number;
    conversationId: number;
    senderId: number;
    content: string;
    createdAt: string;
    sender?: { id: number; name: string; role: string };
    attachments?: Array<{ id: number; fileAssetId: number }>;
}

export interface ConversationDto {
    id: number;
    tenderId?: number | null;
    buyerId: number;
    sellerId: number;
    subject: string;
    lastMessageAt?: string | null;
    createdAt: string;
    updatedAt: string;
    tender?: { id: number; tenderId: string; title: string; status: string } | null;
    buyer?: { id: number; name: string; role: string };
    seller?: { id: number; name: string; role: string };
    messages?: MessageDto[];
}

export const fetchConversations = () => getApi<ConversationDto[]>('/api/conversations');
export const fetchConversation = (id: number) => getApi<ConversationDto>(`/api/conversations/${id}`);

export const createConversation = (data: {
    tenderId?: number; buyerId?: number; sellerId?: number;
    subject: string; initialMessage?: string; fileAssetIds?: number[];
}) => postApi<{ conversation: ConversationDto; message?: MessageDto }>('/api/conversations', data);

export const sendMessage = (conversationId: number, data: { content: string; fileAssetIds?: number[] }) =>
    postApi<MessageDto>(`/api/conversations/${conversationId}/messages`, data);
