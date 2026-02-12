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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const DATA_TYPES = ['string', 'number', 'boolean', 'date', 'email', 'list'] as const;
const EXTRACTION_METHODS = ['auto_sync', 'keyword', 'llm'] as const;

export default function VariablesPage() {
  const t = useTranslations('variables');
  const tc = useTranslations('common');

  const createVariableSchema = z.object({
    name: z.string().min(1, t('validation.nameRequired')),
    displayName: z.string().min(1, t('validation.displayNameRequired')),
    description: z.string().optional(),
    dataType: z.string().min(1, t('validation.dataTypeRequired')),
    extractionMethod: z.string().min(1, t('validation.extractionMethodRequired')),
    extractionConfig: z.string().optional(),
  });

  type CreateVariableForm = z.infer<typeof createVariableSchema>;
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tab, setTab] = useState('all');
  const queryClient = useQueryClient();

  const { data: variables = [], isLoading, error } = useQuery({
    queryKey: ['variables'],
    queryFn: async () => {
      const res = await api.get('/variables');
      return res.data ?? [];
    },
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async (body: CreateVariableForm) => {
      let extractionConfig: any = undefined;
      if (body.extractionConfig) {
        try { extractionConfig = JSON.parse(body.extractionConfig); } catch { extractionConfig = { raw: body.extractionConfig }; }
      }
      const payload = {
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        dataType: body.dataType,
        extractionMethod: body.extractionMethod,
        extractionConfig,
      };
      if (editingId) {
        await api.put(`/variables/${editingId}`, payload);
      } else {
        await api.post('/variables', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variables'] });
      setCreateOpen(false);
      setEditingId(null);
      toast.success(editingId ? tc('toast.updateSuccess') : tc('toast.createSuccess'));
    },
    onError: () => toast.error(tc('toast.operationFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/variables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variables'] });
      toast.success(tc('deleted'));
    },
  });

  const form = useForm<CreateVariableForm>({
    resolver: zodResolver(createVariableSchema),
    defaultValues: { name: '', displayName: '', description: '', dataType: 'string', extractionMethod: 'llm', extractionConfig: '' },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({ name: '', displayName: '', description: '', dataType: 'string', extractionMethod: 'llm', extractionConfig: '' });
    setCreateOpen(true);
  };

  const openEdit = (v: any) => {
    setEditingId(v.id);
    form.reset({
      name: v.name,
      displayName: v.displayName ?? '',
      description: v.description ?? '',
      dataType: v.dataType ?? 'string',
      extractionMethod: v.extractionMethod ?? 'llm',
      extractionConfig: v.extractionConfig ? JSON.stringify(v.extractionConfig) : '',
    });
    setCreateOpen(true);
  };

  const systemVars = variables.filter((v: any) => v.isSystem);
  const customVars = variables.filter((v: any) => !v.isSystem);
  const filteredVars = tab === 'system' ? systemVars : tab === 'custom' ? customVars : variables;

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
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all">{t('tabs.all', { count: variables.length })}</TabsTrigger>
              <TabsTrigger value="system">{t('tabs.system', { count: systemVars.length })}</TabsTrigger>
              <TabsTrigger value="custom">{t('tabs.custom', { count: customVars.length })}</TabsTrigger>
            </TabsList>

            <TabsContent value={tab} className="mt-4">
              {isLoading ? (
                <p className="text-muted-foreground">{tc('loading')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tc('name')}</TableHead>
                      <TableHead>{t('table.displayName')}</TableHead>
                      <TableHead>{t('table.dataType')}</TableHead>
                      <TableHead>{t('table.extractionMethod')}</TableHead>
                      <TableHead>{tc('type')}</TableHead>
                      <TableHead>{tc('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVars.map((v: any) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono text-sm">{v.name}</TableCell>
                        <TableCell>{v.displayName ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{DATA_TYPES.includes(v.dataType as typeof DATA_TYPES[number]) ? t(`dataType.${v.dataType}`) : v.dataType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{EXTRACTION_METHODS.includes(v.extractionMethod as typeof EXTRACTION_METHODS[number]) ? t(`extraction.${v.extractionMethod}`) : v.extractionMethod}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={v.isSystem ? 'default' : 'secondary'}>
                            {v.isSystem ? t('badge.system') : t('badge.custom')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {!v.isSystem && (
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" onClick={() => openEdit(v)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => { if (confirm(t('confirm.delete'))) deleteMutation.mutate(v.id); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <SimpleDialog open={createOpen} onOpenChange={setCreateOpen} title={editingId ? t('dialog.editTitle') : t('dialog.createTitle')}>
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <div>
            <Label>{t('label.name')}</Label>
            <Input {...form.register('name')} placeholder={t('placeholder.name')} />
          </div>
          <div>
            <Label>{t('label.displayName')}</Label>
            <Input {...form.register('displayName')} placeholder={t('placeholder.displayName')} />
          </div>
          <div>
            <Label>{tc('description')}</Label>
            <Input {...form.register('description')} placeholder={t('placeholder.description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('table.dataType')}</Label>
              <Select {...form.register('dataType')}>
                {DATA_TYPES.map((val) => (
                  <option key={val} value={val}>{t(`dataType.${val}`)}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('table.extractionMethod')}</Label>
              <Select {...form.register('extractionMethod')}>
                {EXTRACTION_METHODS.map((m) => (
                  <option key={m} value={m}>{t(`extraction.${m}`)}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>{t('label.extractionConfig')}</Label>
            <Textarea {...form.register('extractionConfig')} placeholder={t('placeholder.extractionConfig')} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>{editingId ? tc('update') : tc('create')}</Button>
          </div>
        </form>
      </SimpleDialog>
    </div>
  );
}
