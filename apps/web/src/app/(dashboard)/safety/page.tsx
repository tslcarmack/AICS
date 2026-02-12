'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { getDateLocale } from '@/lib/date-locale';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, Shield, AlertTriangle, CheckCircle, Pencil } from 'lucide-react';

type AddRuleForm = {
  name: string;
  description?: string;
  checkType: string;
  pattern?: string;
  severity?: string;
  action?: string;
};

export default function SafetyPage() {
  const t = useTranslations('safety');
  const tc = useTranslations('common');
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const queryClient = useQueryClient();

  const addRuleSchema = z.object({
    name: z.string().min(1, t('validation.nameRequired')),
    description: z.string().optional(),
    checkType: z.string().min(1, t('validation.checkTypeRequired')),
    pattern: z.string().optional(),
    severity: z.string().optional(),
    action: z.string().optional(),
  });

  const CHECK_TYPES = [
    { value: 'keyword', label: t('checkType.keyword') },
    { value: 'regex', label: t('checkType.regex') },
    { value: 'llm', label: t('checkType.llm') },
  ];

  const SEVERITIES = [
    { value: 'low', label: t('severity.low') },
    { value: 'medium', label: t('severity.medium') },
    { value: 'high', label: t('severity.high') },
    { value: 'critical', label: t('severity.critical') },
  ];

  const ACTIONS = [
    { value: 'warn', label: t('action.warn') },
    { value: 'block', label: t('action.block') },
    { value: 'transfer', label: t('action.transfer') },
  ];

  const { data: overview, error: overviewError } = useQuery({
    queryKey: ['safety', 'overview'],
    queryFn: async () => {
      const res = await api.get('/safety/overview');
      return res.data ?? {};
    },
    retry: false,
  });

  const { data: rules = [], isLoading: rulesLoading, error: rulesError } = useQuery({
    queryKey: ['safety', 'rules'],
    queryFn: async () => {
      const res = await api.get('/safety/rules');
      return res.data ?? [];
    },
    retry: false,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['safety', 'logs'],
    queryFn: async () => {
      const res = await api.get('/safety/logs');
      return res.data ?? { items: [], total: 0 };
    },
    retry: false,
  });

  const logs = logsData?.items ?? logsData ?? [];

  const addRuleMutation = useMutation({
    mutationFn: async (body: AddRuleForm) => {
      await api.post('/safety/rules', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety', 'rules'] });
      setRuleDialogOpen(false);
      setEditingRule(null);
      toast.success(tc('toast.addSuccess'));
    },
    onError: () => toast.error(tc('toast.addFailed')),
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, ...body }: AddRuleForm & { id: string }) => {
      await api.put(`/safety/rules/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety', 'rules'] });
      setRuleDialogOpen(false);
      setEditingRule(null);
      toast.success(tc('toast.updateSuccess'));
    },
    onError: () => toast.error(tc('toast.updateFailed')),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/safety/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety', 'rules'] });
      toast.success(tc('toast.deleteSuccess'));
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/safety/rules/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety', 'rules'] });
      toast.success(tc('toast.statusUpdated'));
    },
  });

  const form = useForm<AddRuleForm>({
    resolver: zodResolver(addRuleSchema),
    defaultValues: { name: '', description: '', checkType: 'keyword', pattern: '', severity: 'medium', action: 'warn' },
  });

  const handleOpenAdd = () => {
    setEditingRule(null);
    form.reset({ name: '', description: '', checkType: 'keyword', pattern: '', severity: 'medium', action: 'warn' });
    setRuleDialogOpen(true);
  };

  const handleOpenEdit = (rule: any) => {
    setEditingRule(rule);
    form.reset({
      name: rule.name ?? '',
      description: rule.description ?? '',
      checkType: rule.checkType ?? 'keyword',
      pattern: rule.pattern ?? '',
      severity: rule.severity ?? 'medium',
      action: rule.action ?? 'warn',
    });
    setRuleDialogOpen(true);
  };

  const handleSubmitRule = (values: AddRuleForm) => {
    if (editingRule) {
      updateRuleMutation.mutate({ ...values, id: editingRule.id });
    } else {
      addRuleMutation.mutate(values);
    }
  };

  const hasError = overviewError || rulesError;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {hasError && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="font-medium">{tc('error.backendNotConnected')}</p>
          <p className="mt-1 text-yellow-700">{tc('error.startBackend')}</p>
        </div>
      )}

      {/* Overview cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('stats.totalChecks')}</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.totalChecks ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('stats.passRate')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{overview?.passRate ?? '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('stats.blockedCount')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overview?.blockedCount ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">{t('tabs.rules')}</TabsTrigger>
          <TabsTrigger value="logs">{t('tabs.logs')}</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('tabs.rules')} ({rules.length})</CardTitle>
              <Button onClick={handleOpenAdd} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {t('button.add')}
              </Button>
            </CardHeader>
            <CardContent>
              {rulesLoading ? (
                <p className="text-muted-foreground">{tc('loading')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('table.name')}</TableHead>
                      <TableHead>{t('table.checkType')}</TableHead>
                      <TableHead>{t('table.pattern')}</TableHead>
                      <TableHead>{t('table.severity')}</TableHead>
                      <TableHead>{t('table.action')}</TableHead>
                      <TableHead>{t('table.status')}</TableHead>
                      <TableHead>{t('table.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{CHECK_TYPES.find((ct) => ct.value === r.checkType)?.label ?? r.checkType}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">{r.pattern ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={r.severity === 'critical' || r.severity === 'high' ? 'destructive' : 'secondary'}>
                            {SEVERITIES.find((s) => s.value === r.severity)?.label ?? r.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>{ACTIONS.find((a) => a.value === r.action)?.label ?? r.action ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={r.enabled ? 'default' : 'secondary'}>
                            {r.enabled ? tc('enabled') : tc('disabled')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => handleOpenEdit(r)} title={tc('edit')}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => toggleRuleMutation.mutate(r.id)}>
                              {r.enabled ? tc('disabled') : tc('enabled')}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => { if (confirm(tc('confirmDelete'))) deleteRuleMutation.mutate(r.id); }}>
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
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('tabs.logs')}</CardTitle>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <p className="text-muted-foreground">{tc('loading')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('table.ticketId')}</TableHead>
                      <TableHead>{t('table.checkType')}</TableHead>
                      <TableHead>{t('table.result')}</TableHead>
                      <TableHead>{t('table.details')}</TableHead>
                      <TableHead>{t('table.time')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(logs) ? logs : []).map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">{log.ticketId?.slice(0, 8) ?? '-'}</TableCell>
                        <TableCell>{CHECK_TYPES.find((ct) => ct.value === log.checkType)?.label ?? log.checkType ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={log.passed ? 'default' : 'destructive'}>
                            {log.passed ? t('result.passed') : t('result.failed')}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{log.details ?? '-'}</TableCell>
                        <TableCell>
                          {log.createdAt ? format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm', { locale: getDateLocale() }) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SimpleDialog
        open={ruleDialogOpen}
        onOpenChange={(open) => {
          setRuleDialogOpen(open);
          if (!open) setEditingRule(null);
        }}
        title={editingRule ? t('dialog.editTitle') : t('dialog.addTitle')}
      >
        <form onSubmit={form.handleSubmit(handleSubmitRule)} className="space-y-4">
          <div>
            <Label>{t('table.name')}</Label>
            <Input {...form.register('name')} placeholder={t('placeholder.name')} disabled={editingRule?.type === 'builtin'} />
          </div>
          <div>
            <Label>{tc('description')}</Label>
            <Input {...form.register('description')} placeholder={t('placeholder.description')} disabled={editingRule?.type === 'builtin'} />
          </div>
          <div>
            <Label>{t('table.checkType')}</Label>
            <Select {...form.register('checkType')} disabled={editingRule?.type === 'builtin'}>
              {CHECK_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('label.pattern')}</Label>
            <Input {...form.register('pattern')} placeholder={t('placeholder.pattern')} disabled={editingRule?.type === 'builtin'} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('table.severity')}</Label>
              <Select {...form.register('severity')}>
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('table.action')}</Label>
              <Select {...form.register('action')} disabled={editingRule?.type === 'builtin'}>
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </Select>
            </div>
          </div>
          {editingRule?.type === 'builtin' && (
            <p className="text-xs text-muted-foreground">{t('hint.builtinRule')}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setRuleDialogOpen(false); setEditingRule(null); }}>{tc('cancel')}</Button>
            <Button type="submit" disabled={editingRule ? updateRuleMutation.isPending : addRuleMutation.isPending}>
              {editingRule ? tc('save') : tc('add')}
            </Button>
          </div>
        </form>
      </SimpleDialog>
    </div>
  );
}
