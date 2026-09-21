import { polishParagraphs, buildPolishPrompt, PolishContext } from '../translator';

export interface PolishInput {
  chapterNumber: number;
  titleEn: string;
  titleThDraft: string;
  paragraphsEn: string[];
  paragraphsThDraft: string[];
  context?: {
    novelTitle?: string;
    genre?: string;
    glossary: Array<{ termEn: string; termTh: string; category?: string | null }>;
  };
  onProgress?: (currentBatch: number, totalBatches: number) => void;
}

export interface PolishResult {
  titleTh: string;
  paragraphsTh: string[];
  failedBatches: number;
  totalBatches: number;
  providerName: string;
  modelName: string;
}

export interface LLMHealth {
  online: boolean;
  modelLoaded: boolean;
  modelName: string;
  vramMB?: number;
}

export interface ILLMProvider {
  name: string;
  readonly modelName: string;
  polish(input: PolishInput): Promise<PolishResult>;
  healthCheck(): Promise<LLMHealth>;
}

/**
 * Ollama Provider Implementation
 * Model-agnostic: Reads model name from OLLAMA_MODEL (default: qwen2.5:7b)
 */
export class OllamaProvider implements ILLMProvider {
  public readonly name = 'ollama';

  public get modelName(): string {
    return process.env.OLLAMA_MODEL || 'qwen2.5:7b';
  }

  public get baseUrl(): string {
    return (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  }

  async polish(input: PolishInput): Promise<PolishResult> {
    const enWithTitle = [input.titleEn, ...input.paragraphsEn];
    const thWithTitle = [input.titleThDraft, ...input.paragraphsThDraft];

    const result = await polishParagraphs(
      enWithTitle,
      thWithTitle,
      input.context,
      input.onProgress
    );

    let titleTh = input.titleThDraft;
    let paragraphsTh = input.paragraphsThDraft;

    if (result.paragraphs.length > 0) {
      titleTh = result.paragraphs[0];
      paragraphsTh = result.paragraphs.slice(1);
    }

    return {
      titleTh,
      paragraphsTh,
      failedBatches: result.failedBatches,
      totalBatches: result.totalBatches,
      providerName: this.name,
      modelName: this.modelName,
    };
  }

  async healthCheck(): Promise<LLMHealth> {
    try {
      // 1. Check if Ollama daemon is reachable
      const tagsRes = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!tagsRes.ok) {
        return { online: false, modelLoaded: false, modelName: this.modelName };
      }

      // 2. Check running processes in VRAM
      let modelLoaded = false;
      let vramMB = 0;

      try {
        const psRes = await fetch(`${this.baseUrl}/api/ps`, {
          signal: AbortSignal.timeout(5000),
        });

        if (psRes.ok) {
          const psData = await psRes.json();
          const runningModels = Array.isArray(psData.models) ? psData.models : [];
          const target = runningModels.find(
            (m: any) =>
              m.name === this.modelName ||
              m.name === `${this.modelName}:latest` ||
              m.model === this.modelName
          );

          if (target) {
            modelLoaded = true;
            vramMB = Math.round((target.size_vram || target.size || 0) / (1024 * 1024));
          } else if (runningModels.length > 0) {
            // Some model is loaded
            modelLoaded = true;
            vramMB = Math.round((runningModels[0].size_vram || runningModels[0].size || 0) / (1024 * 1024));
          }
        }
      } catch {}

      return {
        online: true,
        modelLoaded,
        modelName: this.modelName,
        vramMB,
      };
    } catch {
      return { online: false, modelLoaded: false, modelName: this.modelName };
    }
  }
}

/**
 * Gemini Provider Implementation (Cloud Fallback)
 */
export class GeminiProvider implements ILLMProvider {
  public readonly name = 'gemini';

  public get modelName(): string {
    return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  async polish(input: PolishInput): Promise<PolishResult> {
    const enWithTitle = [input.titleEn, ...input.paragraphsEn];
    const thWithTitle = [input.titleThDraft, ...input.paragraphsThDraft];

    const result = await polishParagraphs(
      enWithTitle,
      thWithTitle,
      input.context,
      input.onProgress
    );

    let titleTh = input.titleThDraft;
    let paragraphsTh = input.paragraphsThDraft;

    if (result.paragraphs.length > 0) {
      titleTh = result.paragraphs[0];
      paragraphsTh = result.paragraphs.slice(1);
    }

    return {
      titleTh,
      paragraphsTh,
      failedBatches: result.failedBatches,
      totalBatches: result.totalBatches,
      providerName: this.name,
      modelName: this.modelName,
    };
  }

  async healthCheck(): Promise<LLMHealth> {
    const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE');
    return {
      online: hasKey,
      modelLoaded: hasKey,
      modelName: this.modelName,
    };
  }
}

/**
 * Provider Factory
 */
export function getLLMProvider(): ILLMProvider {
  const provider = (process.env.AI_PROVIDER || 'ollama').toLowerCase();
  if (provider === 'gemini') {
    return new GeminiProvider();
  }
  return new OllamaProvider();
}
