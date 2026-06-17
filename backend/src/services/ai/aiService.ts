import { aiProviderManager } from './aiProviderManager.js';
import { portalFallback } from './portalFallback.js';
import { GenerateInsightInput, GenerateInsightResult } from './types.js';

export class AIService {
  async generateInsight(input: GenerateInsightInput): Promise<GenerateInsightResult> {
    if (portalFallback.shouldAnswerBeforeProvider(input)) {
      return portalFallback.answer(input);
    }

    const providers = aiProviderManager.getPrioritizedProviders();

    if (providers.length === 0) {
      return portalFallback.answer(input);
    }

    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of providers) {
      try {
        console.log(`[AIService] Trying AI Provider: ${provider.name} with model: ${provider.model}`);
        const result = await provider.generateInsight(input);
        console.log(`[AIService] Successfully generated insight using: ${provider.name}`);
        return result;
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.warn(`[AIService] Provider ${provider.name} failed: ${errMsg}`);
        errors.push({ provider: provider.name, error: errMsg });
      }
    }

    // If all providers failed, throw a detailed error combining all failures
    const summary = errors.map(e => `${e.provider}: ${e.error}`).join(' | ');
    console.warn(`[AIService] Falling back to portal rules after provider failures: ${summary}`);
    return portalFallback.answer(input);
  }
}

export const aiService = new AIService();
