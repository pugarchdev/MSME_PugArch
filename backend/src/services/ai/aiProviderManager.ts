import { AIProvider } from './types.js';
import { NvidiaProvider } from './providers/nvidiaProvider.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { OllamaProvider } from './providers/ollamaProvider.js';

export class AIProviderManager {
  private readonly providers: Map<string, AIProvider> = new Map();
  private readonly priorityOrder: string[];

  constructor() {
    // Instantiate all available providers
    const nvidia = new NvidiaProvider();
    const gemini = new GeminiProvider();
    const ollama = new OllamaProvider();

    this.providers.set(nvidia.name, nvidia);
    this.providers.set(gemini.name, gemini);
    this.providers.set(ollama.name, ollama);

    // Read and parse provider priority
    const priorityEnv = process.env.AI_PROVIDER_PRIORITY || 'gemini,nvidia,ollama';
    this.priorityOrder = priorityEnv
      .split(',')
      .map(p => p.trim().toLowerCase())
      .filter(p => this.providers.has(p));
  }

  /**
   * Returns a list of initialized AIProviders in their priority order.
   */
  getPrioritizedProviders(): AIProvider[] {
    const list: AIProvider[] = [];
    for (const name of this.priorityOrder) {
      const provider = this.providers.get(name);
      if (provider) {
        list.push(provider);
      }
    }
    return list;
  }
}

export const aiProviderManager = new AIProviderManager();
