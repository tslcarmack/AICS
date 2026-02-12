'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDateLocale } from '@/lib/date-locale';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RefreshCw } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  queued: 'secondary',
  ingesting: 'default',
  recognizing_intent: 'default',
  extracting_variables: 'default',
  agent_processing: 'default',
  safety_checking: 'default',
  completed: 'default',
  failed: 'destructive',
};

const STATUS_KEYS = ['queued', 'ingesting', 'recognizing_intent', 'extracting_variables', 'agent_processing', 'safety_checking', 'completed', 'failed'] as const;

export default function PipelinePage() {
  const t = useTranslations('pipeline');
  const tc = useTranslations('common');
  const [statusFilter, setStatusFilter] = useState('');
  const queryClient = useQueryClient();

  const { data: processingsData, isLoading, error } = useQuery({
    queryKey: ['pipeline', 'processings', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/pipeline/processings', { params });
      return res.data;
    },
    retry: false,
  });

  const processings = Array.isArray(processingsData) ? processingsData : processingsData?.items ?? [];

  const { data: config, isLoading: configLoading, error: configError } = useQuery({
    queryKey: ['pipeline', 'config'],
    queryFn: async () => {
      const res = await api.get('/pipeline/config');
      return res.data ?? {};
    },
    retry: false,
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/pipeline/${id}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'processings'] });
      toast.success(t('toast.retrySubmitted'));
    },
    onError: () => toast.error(t('toast.retryFailed')),
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.put('/pipeline/config', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'config'] });
      toast.success(t('toast.configUpdated'));
    },
    onError: () => toast.error(tc('toast.updateFailed')),
  });

  const cfg = config ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {(error || configError) && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="font-medium">{tc('error.backendNotConnected')}</p>
          <p className="mt-1 text-yellow-700">{tc('error.startBackend')}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('section.records')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-2">
              <Label className="self-center">{t('label.statusFilter')}:</Label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
                <option value="">{tc('all')}</option>
                {STATUS_KEYS.map((key) => (
                  <option key={key} value={key}>{t(`status.${key}`)}</option>
                ))}
              </Select>
            </div>
            {isLoading ? (
              <p className="text-muted-foreground">{tc('loading')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('table.ticketId')}</TableHead>
                    <TableHead>{t('table.stage')}</TableHead>
                    <TableHead>{t('table.status')}</TableHead>
                    <TableHead>{t('table.duration')}</TableHead>
                    <TableHead>{t('table.createdAt')}</TableHead>
                    <TableHead>{t('table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processings.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.ticketId?.slice(0, 8) ?? '-'}</TableCell>
                      <TableCell>{p.stage ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[p.status] ?? 'secondary'}>
                          {STATUS_KEYS.includes(p.status as (typeof STATUS_KEYS)[number]) ? t(`status.${p.status}`) : p.status ?? '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.durationMs != null ? `${p.durationMs}ms` : '-'}
                      </TableCell>
                      <TableCell>
                        {p.createdAt ? format(new Date(p.createdAt), 'MM-dd HH:mm', { locale: getDateLocale() }) : '-'}
                      </TableCell>
                      <TableCell>
                        {p.status === 'failed' && (
                          <Button variant="outline" size="sm" onClick={() => retryMutation.mutate(p.id)} disabled={retryMutation.isPending}>
                            <RefreshCw className="mr-1 h-4 w-4" />
                            {tc('retry')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('section.config')}</CardTitle>
          </CardHeader>
          <CardContent>
            {configLoading ? (
              <p className="text-muted-foreground">{tc('loading')}</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pipelineEnabled"
                    checked={Boolean(cfg.enabled ?? true)}
                    onChange={(e) => updateConfigMutation.mutate({ enabled: e.target.checked })}
                  />
                  <Label htmlFor="pipelineEnabled">{t('config.enabled')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pipelineAutoReply"
                    checked={Boolean(cfg.autoReply ?? true)}
                    onChange={(e) => updateConfigMutation.mutate({ autoReply: e.target.checked })}
                  />
                  <Label htmlFor="pipelineAutoReply">{t('config.autoReply')}</Label>
                </div>
                <div>
                  <Label>{t('config.maxRetries')}</Label>
                  <Input
                    type="number"
                    defaultValue={cfg.maxRetries ?? 3}
                    onBlur={(e) => updateConfigMutation.mutate({ maxRetries: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>{t('config.concurrency')}</Label>
                  <Input
                    type="number"
                    defaultValue={cfg.concurrency ?? 5}
                    onBlur={(e) => updateConfigMutation.mutate({ concurrency: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
