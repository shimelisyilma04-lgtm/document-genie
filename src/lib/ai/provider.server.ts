/**
 * Modular AI service.
 *
 * Every AI call in OmniParse goes through an `AiProvider`. The default
 * implementation talks to the Lovable AI Gateway (OpenAI-compatible).
 * To add another provider later, implement `AiProvider` and register it in
 * `getAiProvider()` — no call site needs to change.
 *
 * Server-only: never import this from client code.
 */

export const CHAT_MODEL = "openai/gpt-5.6-sol";
export const VISION_MODEL = "openai/gpt-5.6-sol";

export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image_url"; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export type ChatRequest = {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
};

export type ChatResult = {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export class AiServiceError extends Error {
  code: "rate_limited" | "no_credits" | "bad_request" | "upstream" | "misconfigured";
  status: number;

  constructor(
    code: AiServiceError["code"],
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "AiServiceError";
    this.code = code;
    this.status = status;
  }
}

export interface AiProvider {
  readonly id: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function createLovableGatewayProvider(apiKey: string): AiProvider {
  return {
    id: "lovable-ai-gateway",
    async chat({ model, messages, temperature }: ChatRequest): Promise<ChatResult> {
      const selectedModel = model ?? CHAT_MODEL;
      const body: Record<string, unknown> = {
        model: selectedModel,
        messages,
        // GPT-5.6 family: reasoning must be explicitly disabled for fast,
        // predictable document answers.
        reasoning_effort: "none",
      };
      if (typeof temperature === "number") body["temperature"] = temperature;

      let response: Response;
      try {
        response = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new AiServiceError("upstream", "The AI service is unreachable. Please try again.", 503);
      }

      if (!response.ok) {
        const detail = await response.text();
        console.error(`AI gateway error [${response.status}]: ${detail}`);
        if (response.status === 429) {
          throw new AiServiceError(
            "rate_limited",
            "The AI service is busy right now. Please retry in a moment.",
            429,
          );
        }
        if (response.status === 402) {
          throw new AiServiceError(
            "no_credits",
            "AI credits are exhausted for this workspace. Add credits to continue.",
            402,
          );
        }
        if (response.status === 400) {
          throw new AiServiceError("bad_request", "The AI request was rejected.", 400);
        }
        throw new AiServiceError("upstream", "The AI service failed to respond.", 502);
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };

      const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) {
        throw new AiServiceError("upstream", "The AI service returned an empty response.", 502);
      }

      return {
        text,
        model: payload.model ?? selectedModel,
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
      };
    },
  };
}

export function getAiProvider(): AiProvider {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new AiServiceError("misconfigured", "The AI service is not configured.", 500);
  }
  return createLovableGatewayProvider(apiKey);
}
