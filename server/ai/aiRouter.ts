import { GoogleGenAI } from '@google/genai';
import { decryptSecret, validateOutboundUrl } from '../cryptoVault.ts';
import { getDb, getWorkspaceSettings, logActivity } from '../db.ts';
import type {
  AIProviderConfig,
  AITaskAssignment,
  AITaskKey,
  AIUsageLog,
} from '../../src/types/commerce.ts';

function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const lower = modelId.toLowerCase();
  let inRatePer1M = 0.25;
  let outRatePer1M = 1.0;

  if (lower.includes('carbon') || lower.includes('neon') || lower.includes('opus') || lower.includes('gpt-4o') && !lower.includes('mini')) {
    inRatePer1M = 2.5;
    outRatePer1M = 10.0;
  } else if (lower.includes('claude-3-5-sonnet') || lower.includes('claude-3-7-sonnet') || lower.includes('gpt-4.1')) {
    inRatePer1M = 3.0;
    outRatePer1M = 15.0;
  } else if (lower.includes('deepseek')) {
    inRatePer1M = 0.27;
    outRatePer1M = 1.1;
  } else if (lower.includes('flash-lite') || lower.includes('mini') || lower.includes('haiku')) {
    inRatePer1M = 0.1;
    outRatePer1M = 0.4;
  }

  const cost = (inputTokens / 1_000_000) * inRatePer1M + (outputTokens / 1_000_000) * outRatePer1M;
  return Math.round(cost * 100000) / 100000;
}

export function listAIProviders(): AIProviderConfig[] {
  const db = getDb();
  const hasGeminiEnv = Boolean(process.env.GEMINI_API_KEY?.trim());
  const rows = db.prepare('SELECT payload FROM ai_providers ORDER BY name ASC').all() as Array<{
    payload: string;
  }>;
  return rows.map((r) => {
    const p = JSON.parse(r.payload) as AIProviderConfig;
    if (p.type === 'gemini') {
      p.hasCredentials = hasGeminiEnv;
      p.credentialSource = hasGeminiEnv ? 'server_env' : 'none';
      if (hasGeminiEnv && p.connectionStatus === 'unconfigured') {
        p.connectionStatus = 'connected';
      }
    }
    return p;
  });
}

export function getAIProvider(id: string): AIProviderConfig | null {
  const all = listAIProviders();
  return all.find((p) => p.id === id) || null;
}

export function saveAIProvider(provider: AIProviderConfig): AIProviderConfig {
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO ai_providers (id, name, type, enabled, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(
    provider.id,
    provider.name,
    provider.type,
    provider.enabled ? 1 : 0,
    JSON.stringify(provider)
  );
  return provider;
}

export function listTaskAssignments(): AITaskAssignment[] {
  const db = getDb();
  const rows = db.prepare('SELECT payload FROM ai_task_assignments').all() as Array<{
    payload: string;
  }>;
  return rows.map((r) => JSON.parse(r.payload) as AITaskAssignment);
}

export function saveTaskAssignment(assignment: AITaskAssignment): AITaskAssignment {
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO ai_task_assignments (task_key, payload) VALUES (?, ?)'
  ).run(assignment.taskKey, JSON.stringify(assignment));
  return assignment;
}

export function listAIUsageLogs(limit = 50): AIUsageLog[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT payload FROM ai_usage_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<{ payload: string }>;
  return rows.map((r) => JSON.parse(r.payload) as AIUsageLog);
}

function getProviderApiKey(provider: AIProviderConfig): string | null {
  if (provider.type === 'gemini') {
    return process.env.GEMINI_API_KEY?.trim() || null;
  }

  const db = getDb();
  const secretRow = db
    .prepare('SELECT encrypted_value FROM encrypted_secrets WHERE scope = ? AND entity_id = ?')
    .get('ai_provider', provider.id) as { encrypted_value: string } | undefined;

  if (secretRow) {
    return decryptSecret(secretRow.encrypted_value);
  }

  if (provider.type === 'openai' && process.env.OPENAI_API_KEY?.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }
  if (provider.type === 'anthropic' && process.env.ANTHROPIC_API_KEY?.trim()) {
    return process.env.ANTHROPIC_API_KEY.trim();
  }
  if (provider.type === 'deepseek' && process.env.DEEPSEEK_API_KEY?.trim()) {
    return process.env.DEEPSEEK_API_KEY.trim();
  }
  if (provider.type === 'xai' && process.env.XAI_API_KEY?.trim()) {
    return process.env.XAI_API_KEY.trim();
  }
  return null;
}

function recordUsage(log: AIUsageLog, provider: AIProviderConfig): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO ai_usage_logs (id, provider_id, created_at, payload) VALUES (?, ?, ?, ?)'
  ).run(log.id, log.providerId, log.createdAt, JSON.stringify(log));

  provider.currentMonthSpendUsd =
    Math.round((provider.currentMonthSpendUsd + log.estimatedCostUsd) * 100000) / 100000;
  provider.totalTokensUsed += log.inputTokens + log.outputTokens;
  saveAIProvider(provider);
}

async function invokeSingleProvider(params: {
  provider: AIProviderConfig;
  modelId: string;
  systemInstruction: string;
  prompt: string;
  taskKey: string;
}): Promise<{
  text: string;
  providerId: string;
  providerName: string;
  modelId: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}> {
  const { provider, modelId, systemInstruction, prompt, taskKey } = params;

  if (!provider.enabled) {
    throw new Error(`AI provider "${provider.name}" is currently disabled.`);
  }

  const settings = getWorkspaceSettings();
  const allProviders = listAIProviders();
  const totalMonthlySpend = allProviders.reduce((s, p) => s + p.currentMonthSpendUsd, 0);
  if (totalMonthlySpend >= settings.globalMonthlyAiBudgetUsd) {
    throw new Error(
      `Global monthly AI spending limit ($${settings.globalMonthlyAiBudgetUsd.toFixed(2)}) reached.`
    );
  }
  if (provider.currentMonthSpendUsd >= provider.monthlySpendLimitUsd) {
    throw new Error(
      `Provider monthly spend limit ($${provider.monthlySpendLimitUsd.toFixed(2)}) reached for ${provider.name}.`
    );
  }

  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    throw new Error(
      provider.type === 'gemini'
        ? 'GEMINI_API_KEY is not configured in the server environment (Settings > Secrets).'
        : `No API key configured for ${provider.name}. Add credentials in AI Model Hub.`
    );
  }

  const start = Date.now();

  try {
    let text = '';
    let inputTokens = Math.ceil((systemInstruction.length + prompt.length) / 4);
    let outputTokens = 0;

    if (provider.type === 'gemini') {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction,
        },
      });
      text = (response.text ?? '').trim();
      const usage = response.usageMetadata;
      if (usage) {
        inputTokens = usage.promptTokenCount ?? inputTokens;
        outputTokens = usage.candidatesTokenCount ?? Math.ceil(text.length / 4);
      } else {
        outputTokens = Math.ceil(text.length / 4);
      }
    } else if (provider.type === 'anthropic') {
      const urlCheck = validateOutboundUrl(provider.baseUrl);
      if (!urlCheck.valid) throw new Error(urlCheck.reason);

      const resp = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 1024,
          system: systemInstruction,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Anthropic API HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
      }
      const data = (await resp.json()) as {
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      text = (data.content?.[0]?.text ?? '').trim();
      inputTokens = data.usage?.input_tokens ?? inputTokens;
      outputTokens = data.usage?.output_tokens ?? Math.ceil(text.length / 4);
    } else {
      // OpenAI, DeepSeek, xAI Grok, Custom OpenAI-compatible
      const urlCheck = validateOutboundUrl(provider.baseUrl);
      if (!urlCheck.valid) throw new Error(urlCheck.reason);

      const resp = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`${provider.name} API HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      text = (data.choices?.[0]?.message?.content ?? '').trim();
      inputTokens = data.usage?.prompt_tokens ?? inputTokens;
      outputTokens = data.usage?.completion_tokens ?? Math.ceil(text.length / 4);
    }

    const latencyMs = Date.now() - start;
    const estimatedCostUsd = estimateCostUsd(modelId, inputTokens, outputTokens);

    recordUsage(
      {
        id: `aiu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        providerId: provider.id,
        providerName: provider.name,
        modelId,
        taskKey,
        inputTokens,
        outputTokens,
        estimatedCostUsd,
        latencyMs,
        status: 'success',
        createdAt: new Date().toISOString(),
      },
      provider
    );

    return {
      text,
      providerId: provider.id,
      providerName: provider.name,
      modelId,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : 'Unknown AI provider error';
    recordUsage(
      {
        id: `aiu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        providerId: provider.id,
        providerName: provider.name,
        modelId,
        taskKey,
        inputTokens: Math.ceil((systemInstruction.length + prompt.length) / 4),
        outputTokens: 0,
        estimatedCostUsd: 0,
        latencyMs,
        status: 'error',
        errorMessage: msg,
        createdAt: new Date().toISOString(),
      },
      provider
    );
    throw err;
  }
}

export async function runAssignedAITask(params: {
  taskKey: AITaskKey;
  prompt: string;
  systemInstruction: string;
  overrideProviderId?: string;
  overrideModelId?: string;
}) {
  const assignments = listTaskAssignments();
  const assignment = assignments.find((a) => a.taskKey === params.taskKey);
  const providers = listAIProviders();

  const primaryProviderId =
    params.overrideProviderId ||
    assignment?.providerId ||
    providers.find((p) => p.isDefault && p.enabled)?.id ||
    'gemini';
  const primaryProvider = providers.find((p) => p.id === primaryProviderId);
  if (!primaryProvider) {
    throw new Error('Configured primary AI provider not found.');
  }

  const primaryModelId =
    params.overrideModelId || assignment?.modelId || primaryProvider.defaultModel;

  try {
    return await invokeSingleProvider({
      provider: primaryProvider,
      modelId: primaryModelId,
      systemInstruction: params.systemInstruction,
      prompt: params.prompt,
      taskKey: params.taskKey,
    });
  } catch (primaryErr) {
    // Attempt configured fallback provider if available, enabled, and has credentials
    const fallback = providers.find(
      (p) => p.isFallback && p.enabled && p.id !== primaryProvider.id && p.hasCredentials
    );
    if (!fallback) {
      throw primaryErr;
    }
    logActivity(
      'ai',
      `Fallback triggered for ${params.taskKey}`,
      `Primary ${primaryProvider.name} failed (${primaryErr instanceof Error ? primaryErr.message : 'error'}). Retrying with ${fallback.name}.`
    );
    return await invokeSingleProvider({
      provider: fallback,
      modelId: fallback.defaultModel,
      systemInstruction: params.systemInstruction,
      prompt: params.prompt,
      taskKey: params.taskKey,
    });
  }
}

export async function compareAIModels(params: {
  targets: Array<{ providerId: string; modelId: string }>;
  prompt: string;
  systemInstruction: string;
  taskKey: AITaskKey;
}) {
  const providers = listAIProviders();
  const results = await Promise.all(
    params.targets.map(async (t) => {
      const provider = providers.find((p) => p.id === t.providerId);
      if (!provider) {
        return {
          providerId: t.providerId,
          providerName: t.providerId,
          modelId: t.modelId,
          ok: false,
          error: 'Provider not found',
          text: '',
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        };
      }
      try {
        const res = await invokeSingleProvider({
          provider,
          modelId: t.modelId,
          systemInstruction: params.systemInstruction,
          prompt: params.prompt,
          taskKey: params.taskKey,
        });
        return { ...res, ok: true };
      } catch (err) {
        return {
          providerId: provider.id,
          providerName: provider.name,
          modelId: t.modelId,
          ok: false,
          error: err instanceof Error ? err.message : 'Execution failed',
          text: '',
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        };
      }
    })
  );
  return results;
}

export async function testAIProviderConnection(providerId: string): Promise<{
  ok: boolean;
  message: string;
  provider: AIProviderConfig;
}> {
  const provider = getAIProvider(providerId);
  if (!provider) {
    throw new Error('AI provider not found');
  }

  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    provider.connectionStatus = 'unconfigured';
    provider.lastTestedAt = new Date().toISOString();
    provider.lastError =
      provider.type === 'gemini'
        ? 'GEMINI_API_KEY is missing from server environment (Settings > Secrets).'
        : 'No API key saved in encrypted vault.';
    saveAIProvider(provider);
    return { ok: false, message: provider.lastError, provider };
  }

  try {
    const res = await invokeSingleProvider({
      provider: { ...provider, enabled: true },
      modelId: provider.defaultModel,
      systemInstruction: 'Respond concisely with OK.',
      prompt: 'Health check ping. Reply with OK.',
      taskKey: 'connection_test',
    });
    provider.connectionStatus = 'connected';
    provider.hasCredentials = true;
    provider.lastTestedAt = new Date().toISOString();
    provider.lastError = undefined;
    saveAIProvider(provider);
    logActivity('ai', `Verified ${provider.name}`, `Model ${provider.defaultModel} responded in ${res.latencyMs}ms.`);
    return {
      ok: true,
      message: `${provider.name} (${provider.defaultModel}) responded in ${res.latencyMs}ms.`,
      provider,
    };
  } catch (err) {
    provider.connectionStatus = 'error';
    provider.lastTestedAt = new Date().toISOString();
    provider.lastError = err instanceof Error ? err.message : 'Connection failed';
    saveAIProvider(provider);
    logActivity('ai', `${provider.name} test failed`, provider.lastError);
    return { ok: false, message: provider.lastError, provider };
  }
}
