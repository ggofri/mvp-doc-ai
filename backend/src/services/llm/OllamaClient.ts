import { getToolUsageLogger } from './ToolUsageLogger';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2:3b';
const DEFAULT_MAX_ITERATIONS = 3;
const REQUEST_TIMEOUT_MS = 120000;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_SERVER_ERROR = 500;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
const DEFAULT_STREAMING = false;
const DEFAULT_TEMPERATURE = 0.1;
const LARGE_PROMPT_THRESHOLD = 10000;
const HTTP_STATUS_OK = 200;

const OLLAMA_API_CHAT_ENDPOINT = '/api/chat';
const OLLAMA_API_TAGS_ENDPOINT = '/api/tags';

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: string | Record<string, any>;
    };
  }>;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaTool[];
  format?: 'json';
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

function buildChatUrl(baseUrl: string): string {
  return `${baseUrl}${OLLAMA_API_CHAT_ENDPOINT}`;
}

function buildTagsUrl(baseUrl: string): string {
  return `${baseUrl}${OLLAMA_API_TAGS_ENDPOINT}`;
}

function createTimeoutController(): { controller: AbortController; timeoutId: NodeJS.Timeout } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { controller, timeoutId };
}

function parseToolArguments(args: string | Record<string, any>): any {
  return typeof args === 'string' ? JSON.parse(args) : args;
}

function createErrorResponse(error: any): string {
  return JSON.stringify({ error: String(error) });
}

export class OllamaClient {
  private baseUrl: string;
  private model: string;
  private toolUsageLogger = getToolUsageLogger();
  private currentDocumentId?: number;

  constructor(baseUrl: string = DEFAULT_BASE_URL, model: string = DEFAULT_MODEL) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  setCurrentDocumentId(documentId: number): void {
    this.currentDocumentId = documentId;
  }

  async chat(request: Omit<OllamaChatRequest, 'model'>): Promise<OllamaChatResponse> {
    const url = buildChatUrl(this.baseUrl);

    try {
      const { controller, timeoutId } = createTimeoutController();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          model: this.model,
          stream: DEFAULT_STREAMING,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();

        if (response.status === HTTP_STATUS_NOT_FOUND) {
          throw new Error(`Ollama model '${this.model}' not found. Run: ollama pull ${this.model}`);
        } else if (response.status === HTTP_STATUS_SERVER_ERROR) {
          throw new Error(`Ollama server error: ${error}. The model may be crashed or corrupted.`);
        } else if (response.status === HTTP_STATUS_SERVICE_UNAVAILABLE) {
          throw new Error(`Ollama service unavailable. Check if Ollama is running: ollama serve`);
        }

        throw new Error(`Ollama API error: ${response.status} ${error}`);
      }

      const data = await response.json() as OllamaChatResponse;

      if (!data || !data.message) {
        throw new Error('Invalid response from Ollama API: missing message field');
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Ollama API request timeout after 2 minutes. The model may be overloaded or stuck.');
        } else if (error.message.includes('ECONNREFUSED')) {
          throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. Ensure Ollama is running: ollama serve`);
        } else if (error.message.includes('ETIMEDOUT') || error.message.includes('ENOTFOUND')) {
          throw new Error(`Network error connecting to Ollama at ${this.baseUrl}. Check your network and Ollama configuration.`);
        }
      }

      throw error;
    }
  }

  async chatWithTools(
    messages: OllamaMessage[],
    tools: OllamaTool[],
    toolHandler: (toolName: string, args: any) => Promise<string>,
    options?: { maxIterations?: number; format?: 'json' }
  ): Promise<{ response: OllamaMessage; toolUsed: boolean; iterations: number }> {
    const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const currentMessages = [...messages];
    let toolUsed = false;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const result = await this.chat({
        messages: currentMessages,
        tools,
        format: options?.format,
      });

      const assistantMessage = result.message;

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        toolUsed = true;

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = parseToolArguments(toolCall.function.arguments);

          console.log(`LLM called tool: ${toolName}`, toolArgs);

          const toolStartTime = Date.now();
          let toolResult: string;
          let success = true;

          try {
            toolResult = await toolHandler(toolName, toolArgs);
          } catch (error) {
            success = false;
            toolResult = createErrorResponse(error);
            console.error(`Tool ${toolName} failed:`, error);
          }

          const toolDuration = Date.now() - toolStartTime;

          if (this.currentDocumentId) {
            try {
              await this.toolUsageLogger.log({
                documentId: this.currentDocumentId,
                toolName,
                toolArgs: JSON.stringify(toolArgs),
                toolResult,
                success,
                duration: toolDuration,
              });
            } catch (logError) {
              console.error('Failed to log tool usage:', logError);
            }
          }

          currentMessages.push(assistantMessage);
          currentMessages.push({
            role: 'tool',
            content: toolResult,
          });
        }
      } else {
        return {
          response: assistantMessage,
          toolUsed,
          iterations,
        };
      }
    }

    throw new Error(`Max tool iterations (${maxIterations}) exceeded`);
  }

  async simpleChat(
    systemPrompt: string,
    userPrompt: string,
    options?: { format?: 'json'; temperature?: number }
  ): Promise<string> {
    if (!systemPrompt || systemPrompt.trim().length === 0) {
      throw new Error('System prompt cannot be empty');
    }

    if (!userPrompt || userPrompt.trim().length === 0) {
      throw new Error('User prompt cannot be empty');
    }

    const totalPromptSize = systemPrompt.length + userPrompt.length;
    if (totalPromptSize > LARGE_PROMPT_THRESHOLD) {
      console.warn(`Warning: Large prompt size (${totalPromptSize} chars). This may cause slower inference.`);
    }

    try {
      const result = await this.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        format: options?.format,
        options: {
          temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
        },
      });

      if (!result.message.content || result.message.content.trim().length === 0) {
        throw new Error('Ollama returned empty response. The model may have failed to generate output.');
      }

      return result.message.content;
    } catch (error) {
      console.error('Simple chat error:', error);

      if (error instanceof Error) {
        throw new Error(`LLM inference failed: ${error.message}`);
      }

      throw new Error('LLM inference failed with unknown error');
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(buildTagsUrl(this.baseUrl));
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(buildTagsUrl(this.baseUrl));
    const data = await response.json() as { models: Array<{ name: string }> };
    return data.models.map((m: any) => m.name);
  }
}

let ollamaClient: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!ollamaClient) {
    const url = process.env.OLLAMA_URL || DEFAULT_BASE_URL;
    const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;
    ollamaClient = new OllamaClient(url, model);
  }
  return ollamaClient;
}
