import { AIProvider, GenerateInsightInput, GenerateInsightResult } from '../types.js';
import { SYSTEM_PROMPT, createUserPrompt } from '../prompts.js';

export class NvidiaProvider implements AIProvider {
  readonly name = 'nvidia';
  readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    this.apiKey = process.env.NVIDIA_API_KEY;
    this.model = process.env.NVIDIA_MODEL || 'minimaxai/minimax-m3';
    this.baseUrl = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
    this.timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 20000);
  }

  async generateInsight(input: GenerateInsightInput): Promise<GenerateInsightResult> {
    if (!this.apiKey) {
      throw new Error('NVIDIA_API_KEY is not configured.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: createUserPrompt(input.question, input.dashboardData) }
          ],
          max_tokens: 1024,
          temperature: 0.7,
          top_p: 0.95,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage = errorBody?.detail || errorBody?.message || errorBody?.error?.message || errorBody?.error || response.statusText;
        throw new Error(`NVIDIA API request failed with status ${response.status}: ${errorMessage}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      const answer = Array.isArray(content)
        ? content.map((part: { text?: string }) => part?.text || '').join('').trim()
        : typeof content === 'string'
          ? content.trim()
          : '';

      if (!answer) {
        const finishReason = data?.choices?.[0]?.finish_reason;
        throw new Error(`NVIDIA API returned an empty completion response${finishReason ? ` (${finishReason})` : ''}.`);
      }

      return {
        answer,
        provider: this.name,
        model: this.model
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`NVIDIA API request timed out after ${Math.round(this.timeoutMs / 1000)} seconds.`);
      }
      throw err;
    }
  }
}
