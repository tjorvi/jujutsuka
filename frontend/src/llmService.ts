// Simple LLM service for browser-based OpenAI API calls
// Mimics litellm's simplicity but works in the browser

export interface LLMConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_MODEL = 'gpt-5-nano'; // Fast and cheap, good for summaries
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

class LLMService {
  private config: LLMConfig | null = null;

  setConfig(config: LLMConfig) {
    this.config = config;
  }

  getConfig(): LLMConfig | null {
    return this.config;
  }

  async complete(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    if (!this.config?.apiKey) {
      throw new Error('LLM API key not configured. Please set it in settings.');
    }

    const model = this.config.model || DEFAULT_MODEL;
    const baseURL = this.config.baseURL || DEFAULT_BASE_URL;

    // Build request body - some models don't support temperature or have restrictions
    const body: {
      model: string;
      messages: ChatMessage[];
      max_completion_tokens: number;
      temperature?: number;
    } = {
      model,
      messages,
      max_completion_tokens: options?.maxTokens ?? 500,
    };

    // Only include temperature for models that support it (not GPT-5, o-series)
    if (!model.startsWith('gpt-5') && !model.startsWith('o')) {
      body.temperature = options?.temperature ?? 0.7;
    }

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  async summarizeDiff(filePath: string, diff: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a code review assistant. For each diff, provide: 1) A short one-line summary (max 10 words), 2) A brief explanation (1-2 sentences) of what changed and why it matters.',
      },
      {
        role: 'user',
        content: `Summarize this diff for ${filePath}:\n\n${diff}`,
      },
    ];

    return this.complete(messages, { maxTokens: 1000 });
  }

  async explainDiffHunk(
    filePath: string,
    hunk: { readonly header: string; readonly lines: readonly string[] },
  ): Promise<string> {
    const diffSnippet = [hunk.header, ...hunk.lines].join('\n');
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: [
          'You are a senior engineer helping a teammate understand a diff hunk.',
          'Provide a concise explanation that covers:',
          '- What behavior changed',
          '- Why the change matters or what it likely fixes/enables',
          '- Any notable risks or follow-up considerations',
          'Keep the response under 120 words.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Explain this diff hunk from ${filePath}:\n\n${diffSnippet}`,
      },
    ];

    return this.complete(messages, { maxTokens: 500 });
  }
}

export const llmService = new LLMService();

// LocalStorage helpers for API key
const STORAGE_KEY = 'openai_api_key';
const MODEL_STORAGE_KEY = 'openai_model';

export function saveAPIKey(apiKey: string) {
  localStorage.setItem(STORAGE_KEY, apiKey);
  llmService.setConfig({
    apiKey,
    model: loadModel(),
  });
}

export function loadAPIKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearAPIKey() {
  localStorage.removeItem(STORAGE_KEY);
  llmService.setConfig({ apiKey: '' });
}

export function saveModel(model: string) {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
  const apiKey = loadAPIKey();
  if (apiKey) {
    llmService.setConfig({ apiKey, model });
  }
}

export function loadModel(): string | undefined {
  return localStorage.getItem(MODEL_STORAGE_KEY) || undefined;
}

// Initialize on module load
const storedKey = loadAPIKey();
const storedModel = loadModel();
if (storedKey) {
  llmService.setConfig({
    apiKey: storedKey,
    model: storedModel,
  });
}
