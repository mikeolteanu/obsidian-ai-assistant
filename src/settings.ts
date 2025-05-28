export const OAI_IMAGE_CAPABLE_MODELS = [
	"openai/gpt-4o",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano",
  "openai/o4-mini-high",
  "openai/o3",
  "openai/gpt-4o-search-preview",
  "x-ai/grok-3-beta",
  "x-ai/grok-3-mini-beta",
  "deepseek/deepseek-chat-v3-0324",
  "deepseek/deepseek-r1",
  "google/gemini-2.0-flash-lite-001",
  "google/gemini-2.5-flash-preview",
  "google/gemini-2.5-flash-preview-05-20",
  "google/gemini-2.5-flash-preview-05-20:thinking",
  "google/gemini-2.5-pro-preview",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.7-sonnet",
  "anthropic/claude-3.5-haiku",
];

export const DEFAULT_OAI_IMAGE_MODEL = "openai/gpt-4o";

// LLM_MODELS is now the primary source for text generation models
export const LLM_MODELS = {
  "openai/gpt-4o": "gpt-4o",
  "openai/gpt-4.1": "gpt-4.1",
  "openai/gpt-4.1-mini": "gpt-4.1 mini",
  "openai/gpt-4.1-nano": "gpt-4.1 nano",
  "openai/o4-mini-high": "gpt o4-mini-high",
  "openai/o3": "gpt o3",
  "openai/gpt-4o-search-preview": "gpt-4o Search Enabled",
  "x-ai/grok-3-beta": "grok 3",
  "x-ai/grok-3-mini-beta": "grok 3 mini",
  "deepseek/deepseek-chat-v3-0324": "Deepseek v3",
  "deepseek/deepseek-r1": "Deepseek r1",
  "google/gemini-2.0-flash-lite-001": "Gemini 2.0 Flash Lite",
  "google/gemini-2.5-flash-preview": "Gemini 2.5 Flash",
  "google/gemini-2.5-flash-preview-05-20": "Gemini 2.5 Flash May20",
  "google/gemini-2.5-flash-preview-05-20:thinking": "Gemini 2.5 Flash May20 Thinking",
  "google/gemini-2.5-pro-preview": "Gemini 2.5 Pro May",
  "inception/mercury-coder-small-beta": "Inception Diffusion Fast",
  "perplexity/sonar-deep-research": "Perplexity Deep Research (Expensive)",
  "perplexity/sonar-pro": "Perplexity Sonar Pro",
  "perplexity/sonar-reasoning-pro": "Perplexity Sonar Pro Reasoning",
  "perplexity/sonar": "Perplexity Sonar",
  "anthropic/claude-3.5-sonnet": "Claude 3.5 Sonnet",
  "anthropic/claude-3.7-sonnet": "Claude 3.7 Sonnet",
  "anthropic/claude-3.5-haiku": "Claude 3 Haiku"
};


export const ALL_IMAGE_MODELS = {
	"dall-e-3": "dall-e-3",
	"dall-e-2": "dall-e-2",
};

export const DEFAULT_IMAGE_MODEL = "dall-e-3";

export const DEFAULT_MAX_TOKENS = 64000; // Updated default

export const DEFAULT_WHISPER_MODEL = "gpt-4o-mini-transcribe";
