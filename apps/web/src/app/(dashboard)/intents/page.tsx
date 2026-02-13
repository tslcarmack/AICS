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
import {
  Plus,
  FlaskConical,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
} from 'lucide-react';

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

interface IntentAction {
  id?: string;
  type: string;
  config: any;
  order: number;
}

interface IntentItem {
  id: string;
  name: string;
  description?: string;
  type: string;
  keywords?: string[];
  exampleUtterances?: string[];
  enabled: boolean;
  boundAgentId?: string;
  boundAgent?: { id: string; name: string; type: string };
  actions?: IntentAction[];
}

// ---- Action Row Component ----
function ActionRow({
  action,
  index,
  total,
  agents,
  tags,
  t,
  tc,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  action: IntentAction;
  index: number;
  total: number;
  agents: any[];
  tags: any[];
  t: (key: string) => string;
  tc: (key: string) => string;
  onUpdate: (action: IntentAction) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isEscalateNotLast = action.type === 'escalate' && index < total - 1;

  return (
    <div className="flex items-start gap-2 rounded-lg border p-3">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-6 text-center">{index + 1}</span>
          <Select
            value={action.type}
            onChange={(e) =>
              onUpdate({ ...action, type: e.target.value, config: {} })
            }
            className="flex-1"
          >
            <option value="execute_agent">{t('actionType.executeAgent')}</option>
            <option value="add_tag">{t('actionType.addTag')}</option>
            <option value="escalate">{t('actionType.escalate')}</option>
          </Select>
        </div>

        {action.type === 'execute_agent' && (
          <Select
            value={action.config?.agentId || ''}
            onChange={(e) =>
              onUpdate({ ...action, config: { agentId: e.target.value || undefined } })
            }
          >
            <option value="">{t('actionConfig.selectAgent')}</option>
            {agents.map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}

        {action.type === 'add_tag' && (
          <Select
            value={action.config?.tagId || ''}
            onChange={(e) =>
              onUpdate({ ...action, config: { tagId: e.target.value || undefined } })
            }
          >
            <option value="">{t('actionConfig.selectTag')}</option>
            {tags.map((tag: any) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
        )}

        {action.type === 'escalate' && (
          <p className="text-xs text-muted-foreground pl-8">{t('actionConfig.escalateDesc')}</p>
        )}

        {isEscalateNotLast && (
          <div className="flex items-center gap-1 text-xs text-amber-600 pl-8">
            <AlertTriangle className="h-3 w-3" />
            {t('actionConfig.escalateWarning')}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onMoveUp}
          disabled={index === 0}
        >
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onMoveDown}
          disabled={index === total - 1}
        >
          <ArrowDown className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default function IntentsPage() {
  const t = useTranslations('intents');
  const tc = useTranslations('common');
  const [createOpen, setCreateOpen] = useState(false);
  const [editIntent, setEditIntent] = useState<IntentItem | null>(null);
  const [deleteIntent, setDeleteIntent] = useState<IntentItem | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [createActions, setCreateActions] = useState<IntentAction[]>([]);
  const [editActions, setEditActions] = useState<IntentAction[]>([]);
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

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await api.get('/tags');
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
        actions: createActions.map((a, i) => ({ type: a.type, config: a.config, order: i + 1 })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      setCreateOpen(false);
      setCreateActions([]);
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
        actions: editActions.map((a, i) => ({ type: a.type, config: a.config, order: i + 1 })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      setEditIntent(null);
      setEditActions([]);
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

  // Populate edit form & actions when editIntent changes
  useEffect(() => {
    if (editIntent) {
      editForm.reset({
        name: editIntent.name,
        description: editIntent.description ?? '',
        keywords: editIntent.keywords?.join(', ') ?? '',
        exampleUtterances: editIntent.exampleUtterances?.join('\n') ?? '',
      });
      setEditActions(
        (editIntent.actions || []).map((a) => ({
          type: a.type,
          config: a.config || {},
          order: a.order,
        }))
      );
    }
  }, [editIntent, editForm]);

  const isPreset = (intent: IntentItem) => intent.type === 'preset';

  // ---- Action helpers ----
  const addAction = (setter: React.Dispatch<React.SetStateAction<IntentAction[]>>) => {
    setter((prev) => [...prev, { type: 'execute_agent', config: {}, order: prev.length + 1 }]);
  };

  const removeAction = (setter: React.Dispatch<React.SetStateAction<IntentAction[]>>, index: number) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAction = (setter: React.Dispatch<React.SetStateAction<IntentAction[]>>, index: number, action: IntentAction) => {
    setter((prev) => prev.map((a, i) => (i === index ? action : a)));
  };

  const moveAction = (setter: React.Dispatch<React.SetStateAction<IntentAction[]>>, index: number, direction: -1 | 1) => {
    setter((prev) => {
      const newArr = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= newArr.length) return prev;
      [newArr[index], newArr[targetIndex]] = [newArr[targetIndex], newArr[index]];
      return newArr;
    });
  };

  // Get action type label
  const getActionLabel = (type: string) => {
    try { return t(`actionType.${type}`); } catch { return type; }
  };

  // Summarize actions for table display
  const summarizeActions = (intent: IntentItem) => {
    const actions = intent.actions || [];
    if (actions.length === 0) {
      // Show legacy bound agent if present
      return intent.boundAgent?.name ? `${t('actionType.executeAgent')}: ${intent.boundAgent.name}` : '-';
    }
    return actions.map((a) => getActionLabel(a.type)).join(' → ');
  };

  // ---- Actions editor component ----
  const renderActionsEditor = (actions: IntentAction[], setter: React.Dispatch<React.SetStateAction<IntentAction[]>>) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{t('label.actions')}</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => addAction(setter)}>
          <Plus className="h-3 w-3 mr-1" />
          {t('button.addAction')}
        </Button>
      </div>
      {actions.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3 border rounded-lg border-dashed">
          {t('actionConfig.noActions')}
        </p>
      )}
      {actions.map((action, index) => (
        <ActionRow
          key={index}
          action={action}
          index={index}
          total={actions.length}
          agents={agents}
          tags={tags}
          t={t}
          tc={tc}
          onUpdate={(a) => updateAction(setter, index, a)}
          onRemove={() => removeAction(setter, index)}
          onMoveUp={() => moveAction(setter, index, -1)}
          onMoveDown={() => moveAction(setter, index, 1)}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTestOpen(true)}>
            <FlaskConical className="mr-2 h-4 w-4" />
            {t('button.test')}
          </Button>
          <Button onClick={() => { createForm.reset(); setCreateActions([]); setCreateOpen(true); }}>
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
                  <TableHead>{t('table.actions')}</TableHead>
                  <TableHead className="text-right">{tc('actions')}</TableHead>
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
                    <TableCell className="max-w-[200px]">
                      <span className="text-xs text-muted-foreground">{summarizeActions(intent)}</span>
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
          {renderActionsEditor(createActions, setCreateActions)}
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
            {renderActionsEditor(editActions, setEditActions)}
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
