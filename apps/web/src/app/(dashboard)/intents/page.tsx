'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Plus, FlaskConical, Link2, Pencil, Trash2 } from 'lucide-react';

function createIntentSchema(nameRequired: string) {
  return z.object({
    name: z.string().min(1, nameRequired),
    description: z.string().optional(),
    keywords: z.string().optional(),
    exampleUtterances: z.string().optional(),
  });
}

type IntentFormValues = {
  name: string;
  description?: string;
  keywords?: string;
  exampleUtterances?: string;
};

interface IntentItem {
  id: string;
  name: string;
  description?: string;
  type: string; // 'preset' | 'custom'
  keywords?: string[];
  exampleUtterances?: string[];
  enabled: boolean;
  boundAgentId?: string;
  boundAgent?: { id: string; name: string; type: string };
}

export default function IntentsPage() {
  const t = useTranslations('intents');
  const tc = useTranslations('common');
  const [createOpen, setCreateOpen] = useState(false);
  const [editIntent, setEditIntent] = useState<IntentItem | null>(null);
  const [deleteIntent, setDeleteIntent] = useState<IntentItem | null>(null);
  const [bindIntentId, setBindIntentId] = useState<string | null>(null);
  const [bindAgentId, setBindAgentId] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const queryClient = useQueryClient();

  // ---- Queries ----
  const { data: intents = [], isLoading, error } = useQuery<IntentItem[]>({
    queryKey: ['intents'],
    queryFn: async () => {
      const res = await api.get('/intents');
      return res.data ?? [];
    },
    retry: false,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await api.get('/agents');
      return res.data ?? [];
    },
    retry: false,
  });

  // ---- Mutations ----
  const createMutation = useMutation({
    mutationFn: async (body: IntentFormValues) => {
      await api.post('/intents', {
        name: body.name,
        description: body.description,
        keywords: body.keywords ? body.keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
        exampleUtterances: body.exampleUtterances ? body.exampleUtterances.split('\n').map((s) => s.trim()).filter(Boolean) : [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      setCreateOpen(false);
      createForm.reset();
      toast.success(tc('toast.createSuccess'));
    },
    onError: () => toast.error(tc('toast.createFailed')),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: IntentFormValues }) => {
      await api.put(`/intents/${id}`, {
        name: body.name,
        description: body.description,
        keywords: body.keywords ? body.keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
        exampleUtterances: body.exampleUtterances ? body.exampleUtterances.split('\n').map((s) => s.trim()).filter(Boolean) : [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      setEditIntent(null);
      toast.success(tc('toast.updateSuccess'));
    },
    onError: () => toast.error(tc('toast.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/intents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      setDeleteIntent(null);
      toast.success(tc('toast.deleteSuccess'));
    },
    onError: () => toast.error(t('toast.deleteFailedPreset')),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/intents/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      toast.success(tc('toast.statusUpdated'));
    },
  });

  const bindMutation = useMutation({
    mutationFn: async ({ id, agentId }: { id: string; agentId: string | null }) => {
      await api.put(`/intents/${id}/bind-agent`, { agentId: agentId || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      setBindIntentId(null);
      toast.success(t('toast.bindSuccess'));
    },
    onError: () => toast.error(t('toast.bindFailed')),
  });

  const testMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await api.post('/intents/test', { message });
      return res.data;
    },
  });

  // ---- Forms ----
  const schema = useMemo(() => createIntentSchema(t('validation.nameRequired')), [t]);
  const createForm = useForm<IntentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', keywords: '', exampleUtterances: '' },
  });

  const editForm = useForm<IntentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', keywords: '', exampleUtterances: '' },
  });

  // Populate edit form when editIntent changes
  useEffect(() => {
    if (editIntent) {
      editForm.reset({
        name: editIntent.name,
        description: editIntent.description ?? '',
        keywords: editIntent.keywords?.join(', ') ?? '',
        exampleUtterances: editIntent.exampleUtterances?.join('\n') ?? '',
      });
    }
  }, [editIntent, editForm]);

  const isPreset = (intent: IntentItem) => intent.type === 'preset';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTestOpen(true)}>
            <FlaskConical className="mr-2 h-4 w-4" />
            {t('button.test')}
          </Button>
          <Button onClick={() => { createForm.reset(); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t('button.create')}
          </Button>
        </div>
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
          ) : intents.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t('empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.name')}</TableHead>
                  <TableHead>{t('table.description')}</TableHead>
                  <TableHead>{t('table.type')}</TableHead>
                  <TableHead>{t('table.status')}</TableHead>
                  <TableHead>{t('table.keywords')}</TableHead>
                  <TableHead>{t('table.boundAgent')}</TableHead>
                  <TableHead className="text-right">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {intents.map((intent: IntentItem) => (
                  <TableRow key={intent.id}>
                    <TableCell className="font-medium">{intent.name}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {intent.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isPreset(intent) ? 'default' : 'secondary'}>
                        {isPreset(intent) ? t('badge.system') : t('badge.custom')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={intent.enabled ? 'default' : 'secondary'}>
                        {intent.enabled ? tc('enabled') : tc('disabled')}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {intent.keywords?.join(', ') || '-'}
                    </TableCell>
                    <TableCell>
                      {intent.boundAgent?.name ?? '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleMutation.mutate(intent.id)}
                        >
                          {intent.enabled ? tc('disabled') : tc('enabled')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditIntent(intent)}
                          title={tc('edit')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setBindIntentId(intent.id);
                            setBindAgentId(intent.boundAgentId ?? '');
                          }}
                          title={t('action.bindAgent')}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                        {!isPreset(intent) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteIntent(intent)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title={tc('delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <SimpleDialog open={createOpen} onOpenChange={setCreateOpen} title={t('dialog.createTitle')}>
        <form onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <div>
            <Label>{tc('name')}</Label>
            <Input {...createForm.register('name')} placeholder={t('placeholder.name')} />
          </div>
          <div>
            <Label>{tc('description')}</Label>
            <Input {...createForm.register('description')} placeholder={t('placeholder.description')} />
          </div>
          <div>
            <Label>{t('label.keywords')}</Label>
            <Input {...createForm.register('keywords')} placeholder={t('placeholder.keywords')} />
          </div>
          <div>
            <Label>{t('label.exampleUtterances')}</Label>
            <Textarea {...createForm.register('exampleUtterances')} placeholder={t('placeholder.examples')} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>{tc('create')}</Button>
          </div>
        </form>
      </SimpleDialog>

      {/* Edit dialog */}
      <SimpleDialog open={!!editIntent} onOpenChange={(open) => !open && setEditIntent(null)} title={editIntent && isPreset(editIntent) ? t('dialog.editSystemTitle') : t('dialog.editCustomTitle')}>
        {editIntent && (
          <form
            onSubmit={editForm.handleSubmit((v) =>
              editMutation.mutate({ id: editIntent.id, body: v })
            )}
            className="space-y-4"
          >
            <div>
              <Label>{tc('name')}</Label>
              <Input
                {...editForm.register('name')}
                placeholder={t('placeholder.name')}
                disabled={isPreset(editIntent)}
              />
              {isPreset(editIntent) && (
                <p className="text-xs text-muted-foreground mt-1">{t('dialog.systemNameReadonly')}</p>
              )}
            </div>
            <div>
              <Label>{tc('description')}</Label>
              <Input {...editForm.register('description')} placeholder={t('placeholder.description')} />
            </div>
            <div>
              <Label>{t('label.keywords')}</Label>
              <Input {...editForm.register('keywords')} placeholder={t('placeholder.keywords')} />
            </div>
            <div>
              <Label>{t('label.exampleUtterances')}</Label>
              <Textarea {...editForm.register('exampleUtterances')} placeholder={t('placeholder.examples')} rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditIntent(null)}>{tc('cancel')}</Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending ? tc('saving') : tc('save')}
              </Button>
            </div>
          </form>
        )}
      </SimpleDialog>

      {/* Delete confirmation dialog */}
      <SimpleDialog open={!!deleteIntent} onOpenChange={(open) => !open && setDeleteIntent(null)} title={tc('confirmDelete')}>
        {deleteIntent && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('confirm.delete', { name: deleteIntent.name })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteIntent(null)}>{tc('cancel')}</Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteIntent.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? tc('deleting') : tc('confirmDelete')}
              </Button>
            </div>
          </div>
        )}
      </SimpleDialog>

      {/* Bind agent dialog */}
      <SimpleDialog open={!!bindIntentId} onOpenChange={(open) => !open && setBindIntentId(null)} title={t('dialog.bindTitle')}>
        <div className="space-y-4">
          <div>
            <Label>{t('dialog.selectAgent')}</Label>
            <Select value={bindAgentId} onChange={(e) => setBindAgentId(e.target.value)}>
              <option value="">{t('option.noBind')}</option>
              {agents.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBindIntentId(null)}>{tc('cancel')}</Button>
            <Button onClick={() => bindIntentId && bindMutation.mutate({ id: bindIntentId, agentId: bindAgentId || null })} disabled={bindMutation.isPending}>{tc('confirm')}</Button>
          </div>
        </div>
      </SimpleDialog>

      {/* Intent test dialog */}
      <SimpleDialog open={testOpen} onOpenChange={setTestOpen} title={t('dialog.testTitle')}>
        <div className="space-y-4">
          <div>
            <Label>{t('label.testMessage')}</Label>
            <Textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder={t('placeholder.testMessage')} rows={3} />
          </div>
          <Button onClick={() => testMessage && testMutation.mutate(testMessage)} disabled={!testMessage || testMutation.isPending} className="w-full">
            {testMutation.isPending ? t('button.recognizing') : t('button.recognize')}
          </Button>
          {testMutation.data && (
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-sm font-medium mb-2">{t('test.result')}</p>
              <pre className="text-xs bg-background p-2 rounded overflow-x-auto">{JSON.stringify(testMutation.data, null, 2)}</pre>
            </div>
          )}
        </div>
      </SimpleDialog>
    </div>
  );
}
