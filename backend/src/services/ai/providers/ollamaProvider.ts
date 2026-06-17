import { AIProvider, GenerateInsightInput, GenerateInsightResult } from '../types.js';
import { SYSTEM_PROMPT, createUserPrompt } from '../prompts.js';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;

  constructor() {
    this.model = process.env.OLLAMA_MODEL || 'llama3.2';
    this.baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
  }

  async generateInsight(input: GenerateInsightInput): Promise<GenerateInsightResult> {
    const url = `${this.baseUrl}/api/chat`;

    // Local Ollama timeout safety of 15 seconds to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: createUserPrompt(input.question, input.dashboardData) }
          ],
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Ollama API request failed with status ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();
      const answer = data?.message?.content;

      if (!answer) {
        throw new Error('Ollama API returned an empty completion response.');
      }

      return {
        answer,
        provider: this.name,
        model: this.model
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Ollama API request timed out after 15 seconds.');
      }
      throw err;
    }
  }
}
