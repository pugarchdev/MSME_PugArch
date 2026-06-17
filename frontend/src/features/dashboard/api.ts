import { api, readJsonResponse, unwrapApiData } from '../../lib/api';

export interface AIInsightResponse {
  success: boolean;
  answer?: string;
  provider?: string;
  model?: string;
  fallback?: boolean;
  error?: string;
  message?: string;
  code?: string;
  errorCode?: string;
  instruction?: string;
}

export const dashboardAiApi = {
  generateMsmeInsight: async (question: string, dashboardData: Record<string, any>): Promise<AIInsightResponse> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await api.post('/api/ai/msme-insight', { question, dashboardData }, { headers });
    const body = await readJsonResponse(res);
    return {
      ...body,
      error: body?.error || body?.message || body?.instruction,
      code: body?.code || body?.errorCode
    };
  }
};
