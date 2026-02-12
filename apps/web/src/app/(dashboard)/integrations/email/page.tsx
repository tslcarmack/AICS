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
import { Plus, Wifi, Power, PowerOff, Trash2, Pencil, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type AddAccountForm = {
  displayName: string;
  email: string;
  provider: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  password: string;
};

type EditAccountForm = {
  displayName: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  password?: string;
};

const PROVIDERS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }> = {
  gmail: { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465 },
  '163': { imapHost: 'imap.163.com', imapPort: 993, smtpHost: 'smtp.163.com', smtpPort: 465 },
  outlook: { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
  qq: { imapHost: 'imap.qq.com', imapPort: 993, smtpHost: 'smtp.qq.com', smtpPort: 465 },
  custom: { imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 465 },
};

export default function EmailAccountsPage() {
  const t = useTranslations('emailAccounts');
  const tc = useTranslations('common');
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const queryClient = useQueryClient();

  const addAccountSchema = z.object({
    displayName: z.string().min(1, t('validation.displayName')),
    email: z.string().email(t('validation.email')),
    provider: z.string().min(1, t('validation.provider')),
    imapHost: z.string().optional(),
    imapPort: z.coerce.number().optional(),
    smtpHost: z.string().optional(),
    smtpPort: z.coerce.number().optional(),
    password: z.string().min(1, t('validation.password')),
  });

  const editAccountSchema = z.object({
    displayName: z.string().min(1, t('validation.displayName')),
    imapHost: z.string().min(1, t('validation.imapHost')),
    imapPort: z.coerce.number().min(1).max(65535),
    smtpHost: z.string().min(1, t('validation.smtpHost')),
    smtpPort: z.coerce.number().min(1).max(65535),
    password: z.string().optional(),
  });

  const { data: accounts = [], isLoading, error } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: async () => {
      const res = await api.get('/email-accounts');
      return res.data ?? [];
    },
    retry: false,
  });

  const addMutation = useMutation({
    mutationFn: async (body: AddAccountForm) => {
      const preset = PROVIDERS[body.provider];
      await api.post('/email-accounts', {
        email: body.email,
        displayName: body.displayName,
        provider: body.provider,
        imapHost: body.imapHost || preset?.imapHost || '',
        imapPort: body.imapPort || preset?.imapPort || 993,
        smtpHost: body.smtpHost || preset?.smtpHost || '',
        smtpPort: body.smtpPort || preset?.smtpPort || 465,
        credentials: { password: body.password },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
      setAddOpen(false);
      toast.success(t('toast.addSuccess'));
    },
    onError: () => toast.error(t('toast.addFailed')),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/email-accounts/${id}/test`),
    onSuccess: () => toast.success(t('toast.testSuccess')),
    onError: () => toast.error(t('toast.testFailed')),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/email-accounts/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
      toast.success(t('toast.statusUpdated'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/email-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
      toast.success(t('toast.deleted'));
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditAccountForm }) => {
      const body: any = {
        displayName: data.displayName,
        imapHost: data.imapHost,
        imapPort: data.imapPort,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
      };
      if (data.password) {
        body.credentials = { password: data.password };
      }
      await api.put(`/email-accounts/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
      setEditOpen(false);
      setEditingAccount(null);
      toast.success(t('toast.updateSuccess'));
    },
    onError: () => toast.error(t('toast.updateFailed')),
  });

  const form = useForm<AddAccountForm>({
    resolver: zodResolver(addAccountSchema),
    defaultValues: { displayName: '', email: '', provider: 'gmail', password: '' },
  });

  const editForm = useForm<EditAccountForm>({
    resolver: zodResolver(editAccountSchema),
  });

  const handleEdit = (acc: any) => {
    setEditingAccount(acc);
    editForm.reset({
      displayName: acc.displayName || '',
      imapHost: acc.imapHost || '',
      imapPort: acc.imapPort || 993,
      smtpHost: acc.smtpHost || '',
      smtpPort: acc.smtpPort || 465,
      password: '',
    });
    setEditOpen(true);
  };

  const selectedProvider = form.watch('provider');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/integrations"
            className="flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('button.add')}
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
                  <TableHead>{t('table.name')}</TableHead>
                  <TableHead>{t('table.email')}</TableHead>
                  <TableHead>{t('table.provider')}</TableHead>
                  <TableHead>{t('table.status')}</TableHead>
                  <TableHead>{t('table.lastSync')}</TableHead>
                  <TableHead>{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((acc: any) => (
                  <TableRow key={acc.id}>
                    <TableCell>{acc.displayName}</TableCell>
                    <TableCell>{acc.email}</TableCell>
                    <TableCell>{acc.provider in PROVIDERS ? t('providers.' + acc.provider) : acc.provider}</TableCell>
                    <TableCell>
                      <Badge variant={acc.enabled ? 'default' : 'secondary'}>
                        {acc.enabled ? t('status.enabled') : t('status.disabled')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {acc.lastSyncAt
                        ? format(new Date(acc.lastSyncAt), 'yyyy-MM-dd HH:mm', { locale: getDateLocale() })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(acc)} title={tc('edit')}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => testMutation.mutate(acc.id)} disabled={testMutation.isPending} title={t('action.testConnection')}>
                          <Wifi className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate(acc.id)} title={acc.enabled ? t('action.disable') : t('action.enable')}>
                          {acc.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { if (confirm(t('confirm.delete'))) deleteMutation.mutate(acc.id); }} title={tc('delete')}>
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

      <SimpleDialog open={addOpen} onOpenChange={setAddOpen} title={t('dialog.addTitle')}>
        <form onSubmit={form.handleSubmit((v) => addMutation.mutate(v))} className="space-y-4">
          <div>
            <Label>{t('label.displayName')}</Label>
            <Input {...form.register('displayName')} placeholder={t('placeholder.displayName')} />
          </div>
          <div>
            <Label>{t('label.email')}</Label>
            <Input {...form.register('email')} type="email" placeholder={t('placeholder.email')} />
          </div>
          <div>
            <Label>{t('label.provider')}</Label>
            <Select {...form.register('provider')}>
              {Object.entries(PROVIDERS).map(([key]) => (
                <option key={key} value={key}>{t('providers.' + key)}</option>
              ))}
            </Select>
          </div>
          {selectedProvider === 'custom' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t('label.imapHost')}</Label><Input {...form.register('imapHost')} /></div>
                <div><Label>{t('label.imapPort')}</Label><Input {...form.register('imapPort')} type="number" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t('label.smtpHost')}</Label><Input {...form.register('smtpHost')} /></div>
                <div><Label>{t('label.smtpPort')}</Label><Input {...form.register('smtpPort')} type="number" /></div>
              </div>
            </>
          )}
          <div>
            <Label>{t('label.password')}</Label>
            <Input {...form.register('password')} type="password" placeholder={t('placeholder.password')} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit" disabled={addMutation.isPending}>{t('button.submitAdd')}</Button>
          </div>
        </form>
      </SimpleDialog>

      <SimpleDialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditingAccount(null); }} title={t('dialog.editTitle')}>
        {editingAccount && (
          <form onSubmit={editForm.handleSubmit((v) => editMutation.mutate({ id: editingAccount.id, data: v }))} className="space-y-4">
            <div>
              <Label>{t('label.email')}</Label>
              <Input value={editingAccount.email} disabled className="bg-muted" />
            </div>
            <div>
              <Label>{t('label.displayName')}</Label>
              <Input {...editForm.register('displayName')} placeholder={t('placeholder.displayName')} />
              {editForm.formState.errors.displayName && <p className="text-sm text-red-500 mt-1">{editForm.formState.errors.displayName.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('label.imapHost')}</Label>
                <Input {...editForm.register('imapHost')} />
                {editForm.formState.errors.imapHost && <p className="text-sm text-red-500 mt-1">{editForm.formState.errors.imapHost.message}</p>}
              </div>
              <div>
                <Label>{t('label.imapPort')}</Label>
                <Input {...editForm.register('imapPort')} type="number" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('label.smtpHost')}</Label>
                <Input {...editForm.register('smtpHost')} />
                {editForm.formState.errors.smtpHost && <p className="text-sm text-red-500 mt-1">{editForm.formState.errors.smtpHost.message}</p>}
              </div>
              <div>
                <Label>{t('label.smtpPort')}</Label>
                <Input {...editForm.register('smtpPort')} type="number" />
              </div>
            </div>
            <div>
              <Label>{t('label.password')}</Label>
              <Input {...editForm.register('password')} type="password" placeholder={t('placeholder.passwordOptional')} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setEditOpen(false); setEditingAccount(null); }}>{tc('cancel')}</Button>
              <Button type="submit" disabled={editMutation.isPending}>{editMutation.isPending ? tc('saving') : tc('save')}</Button>
            </div>
          </form>
        )}
      </SimpleDialog>
    </div>
  );
}
