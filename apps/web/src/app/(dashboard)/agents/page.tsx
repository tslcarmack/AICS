'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SimpleDialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Copy, Power } from 'lucide-react';

export default function AgentsPage() {
  const t = useTranslations('agents');
  const tc = useTranslations('common');

  const agentSchema = z.object({
    name: z.string().min(1, t('validation.nameRequired')),
    description: z.string().optional(),
    type: z.enum(['conversational', 'workflow']),
    systemPrompt: z.string().optional(),
    modelId: z.string().optional(),
    temperature: z.coerce.number().min(0).max(2).optional(),
    maxTokens: z.coerce.number().optional(),
    knowledgeBaseIds: z.string().optional(),
    toolIds: z.string().optional(),
  });

  type AgentForm = z.infer<typeof agentSchema>;
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await api.get('/agents');
      return res.data ?? [];
    },
    retry: false,
  });

  const { data: knowledgeBases = [] } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: async () => {
      const res = await api.get('/knowledge-bases');
      return res.data ?? [];
    },
    retry: false,
  });

  const { data: availableTools = [] } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => {
      const res = await api.get('/tools');
      return res.data ?? [];
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: any }) => {
      if (id) {
        await api.put(`/agents/${id}`, body);
      } else {
        await api.post('/agents', body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setEditOpen(false);
      setEditingId(null);
      toast.success(tc('toast.saveSuccess'));
    },
    onError: () => toast.error(tc('toast.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(tc('deleted'));
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/agents/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(t('toast.duplicateSuccess'));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/agents/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(tc('toast.statusUpdated'));
    },
  });

  const form = useForm<AgentForm>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: '',
      description: '',
      type: 'conversational',
      systemPrompt: '',
      modelId: '',
      temperature: 0.7,
      maxTokens: 2048,
      knowledgeBaseIds: '',
    },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({
      name: '',
      description: '',
      type: 'conversational',
      systemPrompt: '',
      modelId: '',
      temperature: 0.7,
      maxTokens: 2048,
      knowledgeBaseIds: '',
      toolIds: '',
    });
    setEditOpen(true);
  };

  const openEdit = (agent: any) => {
    setEditingId(agent.id);
    form.reset({
      name: agent.name,
      description: agent.description ?? '',
      type: agent.type ?? 'conversational',
      systemPrompt: agent.systemPrompt ?? '',
      modelId: agent.modelId ?? '',
      temperature: agent.temperature ?? 0.7,
      maxTokens: agent.maxTokens ?? 2048,
      knowledgeBaseIds: agent.knowledgeBases?.map((kb: any) => kb.knowledgeBaseId || kb.id).join(',') ?? '',
      toolIds: agent.tools?.map((t: any) => t.id).join(',') ?? '',
    });
    setEditOpen(true);
  };

  const onSubmit = form.handleSubmit((values) => {
    const body = {
      name: values.name,
      description: values.description,
      type: values.type,
      systemPrompt: values.systemPrompt,
      modelId: values.modelId || undefined,
      temperature: values.temperature,
      maxTokens: values.maxTokens,
      knowledgeBaseIds: values.knowledgeBaseIds
        ? values.knowledgeBaseIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      toolIds: values.toolIds
        ? values.toolIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    };
    saveMutation.mutate({ id: editingId ?? undefined, body });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('button.create')}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="font-medium">{tc('error.backendNotConnected')}</p>
          <p className="mt-1 text-yellow-700">{tc('error.startBackend')}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('list.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">{tc('loading')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tc('name')}</TableHead>
                  <TableHead>{tc('type')}</TableHead>
                  <TableHead>{tc('description')}</TableHead>
                  <TableHead>{tc('status')}</TableHead>
                  <TableHead>{t('table.knowledgeBase')}</TableHead>
                  <TableHead>{t('table.tools')}</TableHead>
                  <TableHead>{tc('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent: any) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {agent.type === 'workflow' ? t('type.workflow') : t('type.conversational')}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {agent.description ?? '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={agent.enabled ? 'default' : 'secondary'}>
                        {agent.enabled ? tc('enabled') : tc('disabled')}
                      </Badge>
                    </TableCell>
                    <TableCell>{agent.knowledgeBases?.length ?? 0}</TableCell>
                    <TableCell>{agent.tools?.length ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => openEdit(agent)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => duplicateMutation.mutate(agent.id)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate(agent.id)}>
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { if (confirm(t('confirm.delete'))) deleteMutation.mutate(agent.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SimpleDialog open={editOpen} onOpenChange={setEditOpen} title={editingId ? t('dialog.editTitle') : t('dialog.createTitle')}>
        <form onSubmit={onSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div>
            <Label>{tc('name')}</Label>
            <Input {...form.register('name')} placeholder={t('placeholder.name')} />
          </div>
          <div>
            <Label>{tc('type')}</Label>
            <Select {...form.register('type')}>
              <option value="conversational">{t('type.conversational')}</option>
              <option value="workflow">{t('type.workflow')}</option>
            </Select>
          </div>
          <div>
            <Label>{tc('description')}</Label>
            <Input {...form.register('description')} placeholder={t('placeholder.description')} />
          </div>
          <div>
            <Label>{t('label.systemPrompt')}</Label>
            <Textarea {...form.register('systemPrompt')} placeholder={t('placeholder.systemPrompt')} rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('label.temperature')}</Label>
              <Input {...form.register('temperature')} type="number" step="0.1" min="0" max="2" />
            </div>
            <div>
              <Label>{t('label.maxTokens')}</Label>
              <Input {...form.register('maxTokens')} type="number" />
            </div>
          </div>
          <div>
            <Label>{t('label.knowledgeBase')}</Label>
            <Select {...form.register('knowledgeBaseIds')}>
              <option value="">{t('option.none')}</option>
              {knowledgeBases.map((kb: any) => (
                <option key={kb.id} value={kb.id}>{kb.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('label.tools')}</Label>
            <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
              {availableTools.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">{t('empty.noTools')}</p>
              ) : (
                availableTools.map((tool: any) => {
                  const currentIds = (form.watch('toolIds') || '').split(',').filter(Boolean);
                  const isChecked = currentIds.includes(tool.id);
                  return (
                    <label key={tool.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted p-1 rounded">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          let ids = currentIds;
                          if (e.target.checked) {
                            ids = [...ids, tool.id];
                          } else {
                            ids = ids.filter((id: string) => id !== tool.id);
                          }
                          form.setValue('toolIds', ids.join(','));
                        }}
                        className="rounded"
                      />
                      <span>{tool.displayName || tool.name}</span>
                      {!tool.enabled && <Badge variant="secondary" className="text-xs">{tc('disabled')}</Badge>}
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('hint.tools')}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit" disabled={saveMutation.isPending}>{tc('save')}</Button>
          </div>
        </form>
      </SimpleDialog>
    </div>
  );
}
