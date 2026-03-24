import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../shared/ai-config/default-prompt.js';
import '../../shared/ai-config/detailed-prompt.js';
import '../../shared/ai-config/concise-prompt.js';
import '../../shared/ai-config/creative-prompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

let localEnvLoaded = false;

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  const isWrappedInSingleQuotes = value.startsWith("'") && value.endsWith("'");
  const isWrappedInDoubleQuotes = value.startsWith('"') && value.endsWith('"');

  if (isWrappedInSingleQuotes || isWrappedInDoubleQuotes) {
    const unwrapped = value.slice(1, -1);
    return isWrappedInDoubleQuotes
      ? unwrapped.replace(/\\n/g, '\n').replace(/\\r/g, '\r')
      : unwrapped;
  }

  return value;
}

function loadLocalEnvFiles() {
  if (localEnvLoaded) return;
  localEnvLoaded = true;

  const protectedKeys = new Set(Object.keys(process.env));
  const envFileNames = ['.env', '.env.local'];

  for (const fileName of envFileNames) {
    const filePath = path.join(PROJECT_ROOT, fileName);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const normalized = trimmed.startsWith('export ')
        ? trimmed.slice(7).trim()
        : trimmed;
      const separatorIndex = normalized.indexOf('=');

      if (separatorIndex <= 0) continue;

      const key = normalized.slice(0, separatorIndex).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

      const rawValue = normalized.slice(separatorIndex + 1);
      if (!protectedKeys.has(key) || process.env[key] == null) {
        process.env[key] = parseEnvValue(rawValue);
      }
    }
  }
}

function readPositiveIntEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOpenAIBaseUrl(rawBaseUrl) {
  const fallback = 'https://api.openai.com/v1';
  const candidate = (typeof rawBaseUrl === 'string' && rawBaseUrl.trim())
    ? rawBaseUrl.trim()
    : fallback;

  try {
    const url = new URL(candidate);
    let pathname = url.pathname.replace(/\/+$/, '');

    if (!pathname) {
      pathname = '/v1';
    }

    url.pathname = pathname;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

loadLocalEnvFiles();

export function buildOpenAIUrl(baseUrl, endpointPath) {
  return `${baseUrl.replace(/\/+$/, '')}/${endpointPath.replace(/^\/+/, '')}`;
}

export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL);
  const defaultModel = process.env.OPENAI_MODEL || 'claude-sonnet-4-6';
  const sharedMaxTokens = readPositiveIntEnv('OPENAI_MAX_TOKENS');
  const generateMaxTokens = readPositiveIntEnv('OPENAI_GENERATE_MAX_TOKENS') ?? sharedMaxTokens;
  const chatMaxTokens = readPositiveIntEnv('OPENAI_CHAT_MAX_TOKENS') ?? sharedMaxTokens;
  const maxCustomPromptLength = readPositiveIntEnv('API_MAX_CUSTOM_PROMPT_LENGTH') ?? 30_000;
  const maxCurrentMarkdownLength = readPositiveIntEnv('API_MAX_CURRENT_MARKDOWN_LENGTH') ?? 20_000;
  const maxChatHistoryLength = readPositiveIntEnv('API_MAX_CHAT_HISTORY_LENGTH') ?? 10_000;
  const trustedMaxCustomPromptLength = readPositiveIntEnv('API_TRUSTED_MAX_CUSTOM_PROMPT_LENGTH')
    ?? Math.max(maxCustomPromptLength, 60_000);
  const trustedMaxCurrentMarkdownLength = readPositiveIntEnv('API_TRUSTED_MAX_CURRENT_MARKDOWN_LENGTH')
    ?? Math.max(maxCurrentMarkdownLength, 40_000);
  const trustedMaxChatHistoryLength = readPositiveIntEnv('API_TRUSTED_MAX_CHAT_HISTORY_LENGTH')
    ?? Math.max(maxChatHistoryLength, 20_000);

  return {
    apiKey,
    baseUrl,
    defaultModel,
    generateMaxTokens,
    chatMaxTokens,
    maxCustomPromptLength,
    maxCurrentMarkdownLength,
    maxChatHistoryLength,
    trustedMaxCustomPromptLength,
    trustedMaxCurrentMarkdownLength,
    trustedMaxChatHistoryLength,
  };
}

export function getBodySizeLimits(config, isTrustedRequest = false) {
  if (isTrustedRequest) {
    return {
      maxCustomPromptLength: config.trustedMaxCustomPromptLength,
      maxCurrentMarkdownLength: config.trustedMaxCurrentMarkdownLength,
      maxChatHistoryLength: config.trustedMaxChatHistoryLength,
    };
  }

  return {
    maxCustomPromptLength: config.maxCustomPromptLength,
    maxCurrentMarkdownLength: config.maxCurrentMarkdownLength,
    maxChatHistoryLength: config.maxChatHistoryLength,
  };
}

export function resolveModel(userModel, defaultModel) {
  return (userModel && typeof userModel === 'string' && userModel.trim())
    ? userModel.trim()
    : defaultModel;
}

export const DEFAULT_SYSTEM_PROMPT = globalThis.MINDMAP_SHARED_PROMPTS?.DEFAULT_SYSTEM_PROMPT || '';
