'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Eye, EyeOff, Save } from 'lucide-react';

const LLM_PROVIDERS: Record<string, { baseUrl: string; chatModels: string[]; embeddingModels: string[]; noteKey?: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    chatModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    embeddingModels: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    chatModels: ['deepseek-chat', 'deepseek-reasoner'],
    embeddingModels: [],
    noteKey: 'deepseekNote',
  },
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    chatModels: ['glm-4-plus', 'glm-4', 'glm-4-flash'],
    embeddingModels: ['embedding-3'],
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    chatModels: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
    embeddingModels: [],
    noteKey: 'moonshotNote',
  },
  custom: {
    baseUrl: '',
    chatModels: [],
    embeddingModels: [],
  },
};

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('custom');
  const queryClient = useQueryClient();

  // Settings returns a flat object of key-value pairs
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data ?? {};
    },
    retry: false,
  });

  // Local form state
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmApiBaseUrl, setLlmApiBaseUrl] = useState('');
  const [llmModel, setLlmModel] = useState('gpt-4o-mini');
  const [llmEmbeddingModel, setLlmEmbeddingModel] = useState('text-embedding-3-small');
  const [emailPollingInterval, setEmailPollingInterval] = useState('60');
  const [autoLearning, setAutoLearning] = useState(false);

  // Pipeline config
  const [pipelineAutoReply, setPipelineAutoReply] = useState(true);
  const [pipelineMaxRetries, setPipelineMaxRetries] = useState('3');

  // Pipeline config query
  const { data: pipelineConfig } = useQuery({
    queryKey: ['pipeline', 'config'],
    queryFn: async () => {
      const res = await api.get('/pipeline/config');
      return res.data ?? {};
    },
    retry: false,
  });

  useEffect(() => {
    if (pipelineConfig) {
      setPipelineAutoReply(pipelineConfig.autoReplyEnabled ?? true);
      setPipelineMaxRetries(String(pipelineConfig.maxRetries ?? 3));
    }
  }, [pipelineConfig]);

  const savePipelineMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.put('/pipeline/config', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'config'] });
      toast.success(t('toast.pipelineSaved'));
    },
    onError: () => toast.error(tc('toast.saveFailed')),
  });

  // Guard: only auto-fix DB once per page load
  const autoFixedRef = useRef(false);

  useEffect(() => {
    if (!settings) return;

    const savedUrl = (settings.llmApiBaseUrl as string) ?? '';
    const savedModel = (settings.llmModel as string) ?? '';
    const savedEmbeddingModel = (settings.llmEmbeddingModel as string) ?? '';

    setLlmApiBaseUrl(savedUrl);
    setEmailPollingInterval(String(settings.emailPollingIntervalSeconds ?? 60));
    setAutoLearning(settings.autoLearning === 'true' || settings.autoLearning === true);

    // Auto-detect provider from saved base URL
    const detected = Object.entries(LLM_PROVIDERS).find(
      ([key, p]) => key !== 'custom' && p.baseUrl && savedUrl.includes(p.baseUrl),
    );
    const providerKey = detected ? detected[0] : 'custom';
    setSelectedProvider(providerKey);

    const provider = LLM_PROVIDERS[providerKey];
    let correctedModel = savedModel;
    let correctedEmbeddingModel = savedEmbeddingModel;

    if (provider && providerKey !== 'custom') {
      // Auto-correct chat model if incompatible with provider
      if (provider.chatModels.length > 0) {
        if (!savedModel || !provider.chatModels.includes(savedModel)) {
          correctedModel = provider.chatModels[0];
        }
      }
      // Auto-correct embedding model
      if (provider.embeddingModels.length > 0) {
        if (savedEmbeddingModel && !provider.embeddingModels.includes(savedEmbeddingModel)) {
          correctedEmbeddingModel = provider.embeddingModels[0];
        }
      } else if (provider.embeddingModels.length === 0) {
        correctedEmbeddingModel = savedEmbeddingModel || '';
      }
    } else {
      correctedModel = savedModel || 'gpt-4o-mini';
      correctedEmbeddingModel = savedEmbeddingModel || 'text-embedding-3-small';
    }

    setLlmModel(correctedModel);
    setLlmEmbeddingModel(correctedEmbeddingModel);

    // If model was auto-corrected, persist correction to DB immediately
    if (!autoFixedRef.current) {
      const fixes: Record<string, string> = {};
      if (correctedModel !== savedModel && correctedModel) {
        fixes.llmModel = correctedModel;
      }
      if (correctedEmbeddingModel !== savedEmbeddingModel && correctedEmbeddingModel !== savedEmbeddingModel) {
        fixes.llmEmbeddingModel = correctedEmbeddingModel;
      }
      if (Object.keys(fixes).length > 0) {
        autoFixedRef.current = true;
        const details = Object.entries(fixes).map(([k, v]) => `${k}=${v}`).join(', ');
        api.put('/settings', fixes).then(() => {
          toast.info(t('toast.modelAutoCorrected', { details }));
        });
      }
    }
  }, [settings, t]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      await api.put('/settings', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(t('toast.settingsSaved'));
    },
    onError: () => toast.error(tc('toast.saveFailed')),
  });

  const handleSaveLlm = () => {
    const body: Record<string, unknown> = {
      llmApiBaseUrl,
      llmModel,
      llmEmbeddingModel,
    };
    if (llmApiKey) {
      body.llmApiKey = llmApiKey;
    }
    saveMutation.mutate(body);
  };

  const handleSaveGlobal = () => {
    saveMutation.mutate({
      emailPollingIntervalSeconds: Number(emailPollingInterval),
      autoLearning: String(autoLearning),
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {error && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="font-medium">{tc('error.backendNotConnected')}</p>
          <p className="mt-1 text-yellow-700">{tc('error.startBackend')}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">{tc('loading')}</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('section.llm')}</CardTitle>
              <CardDescription>{t('section.llmDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-w-lg">
                {/* Provider selector */}
                <div>
                  <Label>{t('label.provider')}</Label>
                  <Select
                    value={selectedProvider}
                    onChange={(e) => {
                      const key = e.target.value;
                      setSelectedProvider(key);
                      const provider = LLM_PROVIDERS[key];
                      if (provider && provider.baseUrl) {
                        setLlmApiBaseUrl(provider.baseUrl);
                      }
                      if (provider && provider.chatModels.length > 0) {
                        setLlmModel(provider.chatModels[0]);
                      }
                      if (provider && provider.embeddingModels.length > 0) {
                        setLlmEmbeddingModel(provider.embeddingModels[0]);
                      } else if (provider && provider.embeddingModels.length === 0 && key !== 'custom') {
                        setLlmEmbeddingModel('');
                      }
                    }}
                  >
                    {Object.entries(LLM_PROVIDERS).map(([key]) => (
                      <option key={key} value={key}>{t('providers.' + key)}</option>
                    ))}
                  </Select>
                </div>

                {/* Provider note */}
                {LLM_PROVIDERS[selectedProvider]?.noteKey && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    {t('providers.' + LLM_PROVIDERS[selectedProvider].noteKey)}
                  </div>
                )}

                {/* API Base URL */}
                <div>
                  <Label>{t('label.apiBaseUrl')}</Label>
                  <Input
                    value={llmApiBaseUrl}
                    onChange={(e) => setLlmApiBaseUrl(e.target.value)}
                    placeholder={t('placeholder.apiBaseUrl')}
                    readOnly={selectedProvider !== 'custom'}
                    className={selectedProvider !== 'custom' ? 'bg-muted' : ''}
                  />
                  {selectedProvider === 'custom' && (
                    <p className="text-xs text-muted-foreground mt-1">{t('hint.apiBaseUrl')}</p>
                  )}
                </div>

                {/* API Key */}
                <div>
                  <Label>{t('label.apiKey')}</Label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={llmApiKey}
                      onChange={(e) => setLlmApiKey(e.target.value)}
                      placeholder={t('placeholder.apiKeyMasked')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t('hint.apiKey')}</p>
                </div>

                {/* Chat model */}
                <div>
                  <Label>{t('label.chatModel')}</Label>
                  {LLM_PROVIDERS[selectedProvider]?.chatModels.length > 0 ? (
                    <div className="flex gap-2">
                      <Select
                        value={LLM_PROVIDERS[selectedProvider].chatModels.includes(llmModel) ? llmModel : '__custom__'}
                        onChange={(e) => {
                          if (e.target.value !== '__custom__') {
                            setLlmModel(e.target.value);
                          }
                        }}
                        className="flex-1"
                      >
                        {LLM_PROVIDERS[selectedProvider].chatModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        {!LLM_PROVIDERS[selectedProvider].chatModels.includes(llmModel) && (
                          <option value="__custom__">{t('option.customModel', { model: llmModel })}</option>
                        )}
                      </Select>
                      <Input
                        value={llmModel}
                        onChange={(e) => setLlmModel(e.target.value)}
                        placeholder={t('placeholder.modelName')}
                        className="flex-1"
                      />
                    </div>
                  ) : (
                    <Input
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      placeholder={t('placeholder.modelName')}
                    />
                  )}
                </div>

                {/* Embedding model */}
                <div>
                  <Label>{t('label.embeddingModel')}</Label>
                  {LLM_PROVIDERS[selectedProvider]?.embeddingModels.length > 0 ? (
                    <div className="flex gap-2">
                      <Select
                        value={LLM_PROVIDERS[selectedProvider].embeddingModels.includes(llmEmbeddingModel) ? llmEmbeddingModel : '__custom__'}
                        onChange={(e) => {
                          if (e.target.value !== '__custom__') {
                            setLlmEmbeddingModel(e.target.value);
                          }
                        }}
                        className="flex-1"
                      >
                        {LLM_PROVIDERS[selectedProvider].embeddingModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        {!LLM_PROVIDERS[selectedProvider].embeddingModels.includes(llmEmbeddingModel) && llmEmbeddingModel && (
                          <option value="__custom__">{t('option.customModel', { model: llmEmbeddingModel })}</option>
                        )}
                      </Select>
                      <Input
                        value={llmEmbeddingModel}
                        onChange={(e) => setLlmEmbeddingModel(e.target.value)}
                        placeholder={t('placeholder.modelName')}
                        className="flex-1"
                      />
                    </div>
                  ) : (
                    <Input
                      value={llmEmbeddingModel}
                      onChange={(e) => setLlmEmbeddingModel(e.target.value)}
                      placeholder={LLM_PROVIDERS[selectedProvider]?.embeddingModels.length === 0 && selectedProvider !== 'custom' ? t('hint.noEmbedding') : t('placeholder.modelName')}
                    />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{t('hint.embeddingUsage')}</p>
                </div>

                <Button onClick={handleSaveLlm} disabled={saveMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {t('button.saveLlm')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('section.global')}</CardTitle>
              <CardDescription>{t('section.globalDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-w-md">
                <div>
                  <Label>{t('label.emailPolling')}</Label>
                  <Input
                    type="number"
                    value={emailPollingInterval}
                    onChange={(e) => setEmailPollingInterval(e.target.value)}
                    min={10}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoLearning"
                    checked={autoLearning}
                    onChange={(e) => setAutoLearning(e.target.checked)}
                  />
                  <Label htmlFor="autoLearning">{t('label.autoLearning')}</Label>
                </div>
                <Button onClick={handleSaveGlobal} disabled={saveMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {t('button.saveGlobal')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('section.pipeline')}</CardTitle>
              <CardDescription>{t('section.pipelineDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-w-md">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pipelineAutoReply"
                    checked={pipelineAutoReply}
                    onChange={(e) => setPipelineAutoReply(e.target.checked)}
                  />
                  <Label htmlFor="pipelineAutoReply">{t('label.pipelineAutoReply')}</Label>
                </div>
                <div>
                  <Label>{t('label.maxRetries')}</Label>
                  <Input
                    type="number"
                    value={pipelineMaxRetries}
                    onChange={(e) => setPipelineMaxRetries(e.target.value)}
                    min={0}
                    max={10}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('hint.maxRetries')}</p>
                </div>
                <Button
                  onClick={() =>
                    savePipelineMutation.mutate({
                      auto_reply_enabled: pipelineAutoReply,
                      pipeline_max_retries: Number(pipelineMaxRetries),
                    })
                  }
                  disabled={savePipelineMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {t('button.savePipeline')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
