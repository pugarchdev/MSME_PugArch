import { AIProvider, GenerateInsightInput, GenerateInsightResult } from '../types.js';
import { SYSTEM_PROMPT, createUserPrompt } from '../prompts.js';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    this.timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 20000);
  }

  async generateInsight(input: GenerateInsightInput): Promise<GenerateInsightResult> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: createUserPrompt(input.question, input.dashboardData) }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage = errorBody?.error?.message || response.statusText;
        throw new Error(`Gemini API request failed with status ${response.status}: ${errorMessage}`);
      }

      const data = await response.json();
      const answer = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part?.text || '')
        .join('')
        .trim();

      if (!answer) {
        const finishReason = data?.candidates?.[0]?.finishReason;
        throw new Error(`Gemini API returned an empty completion response${finishReason ? ` (${finishReason})` : ''}.`);
      }

      return {
        answer,
        provider: this.name,
        model: this.model
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Gemini API request timed out after ${Math.round(this.timeoutMs / 1000)} seconds.`);
      }
      throw err;
    }
  }
}
