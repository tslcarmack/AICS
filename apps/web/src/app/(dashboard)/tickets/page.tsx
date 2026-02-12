'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDateLocale } from '@/lib/date-locale';
import { useRouter } from 'next/navigation';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SimpleDialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Eye, UserPlus, CheckCircle, XCircle, Mail } from 'lucide-react';

const STATUS_TABS = [
  { value: 'all' },
  { value: 'pending' },
  { value: 'processing' },
  { value: 'awaiting_reply' },
  { value: 'resolved' },
  { value: 'closed' },
];

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  processing: 'default',
  awaiting_reply: 'default',
  resolved: 'default',
  closed: 'secondary',
  transferred: 'destructive',
};

export default function TicketsPage() {
  const t = useTranslations('tickets');
  const tc = useTranslations('common');
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('all');
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulateForm, setSimulateForm] = useState({
    senderEmail: 'customer@example.com',
    senderName: '测试客户',
    subject: '测试邮件 - 产品咨询',
    body: '你好，我想了解一下你们的产品功能和价格，请尽快回复，谢谢！',
  });
  const queryClient = useQueryClient();

  const { data: ticketsData, isLoading, error } = useQuery({
    queryKey: ['tickets', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/tickets', { params });
      return res.data;
    },
    retry: false,
  });

  const tickets = Array.isArray(ticketsData) ? ticketsData : ticketsData?.items ?? [];

  const assignMutation = useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      await api.post(`/tickets/${id}/assign`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setAssignOpen(false);
      toast.success(t('toast.assignSuccess'));
    },
    onError: () => toast.error(t('toast.assignFail')),
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/tickets/${id}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success(t('toast.resolved'));
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/tickets/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success(t('toast.closed'));
    },
  });

  const simulateEmailMutation = useMutation({
    mutationFn: async (data: typeof simulateForm) => {
      return api.post('/integration/simulate-email', data);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setSimulateOpen(false);
      const ticketId = res.data?.ticketId;
      toast.success(t('toast.simulateSuccess'), {
        action: ticketId ? { label: t('action.viewTicket'), onClick: () => router.push(`/tickets/${ticketId}`) } : undefined,
      });
    },
    onError: () => toast.error(t('toast.simulateFail')),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button onClick={() => setSimulateOpen(true)} variant="outline" className="gap-2">
          <Mail className="h-4 w-4" />
          {t('button.simulate')}
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
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.value === 'all' ? tc('all') : t(`status.${tab.value}`)}
                </TabsTrigger>
              ))}
            </TabsList>

            {STATUS_TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value} className="mt-4">
                {isLoading ? (
                  <p className="text-muted-foreground">{tc('loading')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('table.subject')}</TableHead>
                        <TableHead>{t('table.customerEmail')}</TableHead>
                        <TableHead>{t('table.source')}</TableHead>
                        <TableHead>{t('table.status')}</TableHead>
                        <TableHead>{t('table.assignedTo')}</TableHead>
                        <TableHead>{t('table.createdAt')}</TableHead>
                        <TableHead>{t('table.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tickets.map((ticket: any) => (
                        <TableRow key={ticket.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/tickets/${ticket.id}`)}>
                          <TableCell className="font-medium">{ticket.subject ?? '-'}</TableCell>
                          <TableCell>{ticket.customerEmail ?? '-'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{ticket.source ?? '-'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[ticket.status] ?? 'secondary'}>
                              {ticket.status ? t(`status.${ticket.status}`) : '-'}
                            </Badge>
                          </TableCell>
                          <TableCell>{ticket.assignedUser?.name ?? '-'}</TableCell>
                          <TableCell>
                            {ticket.createdAt ? format(new Date(ticket.createdAt), 'yyyy-MM-dd HH:mm', { locale: getDateLocale() }) : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button variant="outline" size="sm" onClick={() => router.push(`/tickets/${ticket.id}`)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => { setSelectedTicketId(ticket.id); setAssignUserId(''); setAssignOpen(true); }}>
                                <UserPlus className="h-4 w-4" />
                              </Button>
                              {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                                <Button variant="outline" size="sm" onClick={() => resolveMutation.mutate(ticket.id)}>
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}
                              {ticket.status !== 'closed' && (
                                <Button variant="outline" size="sm" onClick={() => closeMutation.mutate(ticket.id)}>
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <SimpleDialog open={assignOpen} onOpenChange={(open) => !open && setAssignOpen(false)} title={t('dialog.assignTitle')}>
        <div className="space-y-4">
          <div>
            <Label>{t('dialog.userId')}</Label>
            <Input value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} placeholder={t('dialog.assignUserIdPlaceholder')} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>{tc('cancel')}</Button>
            <Button
              onClick={() => selectedTicketId && assignUserId && assignMutation.mutate({ id: selectedTicketId, userId: assignUserId })}
              disabled={assignMutation.isPending || !assignUserId}
            >
              {tc('confirm')}
            </Button>
          </div>
        </div>
      </SimpleDialog>

      <SimpleDialog open={simulateOpen} onOpenChange={(open) => !open && setSimulateOpen(false)} title={t('button.simulate')}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('dialog.simulateDesc')}</p>
          <div>
            <Label>{t('dialog.senderEmail')}</Label>
            <Input
              value={simulateForm.senderEmail}
              onChange={(e) => setSimulateForm((f) => ({ ...f, senderEmail: e.target.value }))}
              placeholder="customer@example.com"
            />
          </div>
          <div>
            <Label>{t('dialog.senderName')}</Label>
            <Input
              value={simulateForm.senderName}
              onChange={(e) => setSimulateForm((f) => ({ ...f, senderName: e.target.value }))}
              placeholder={t('placeholder.customerName')}
            />
          </div>
          <div>
            <Label>{t('dialog.subject')}</Label>
            <Input
              value={simulateForm.subject}
              onChange={(e) => setSimulateForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder={t('simulate.defaultSubject')}
            />
          </div>
          <div>
            <Label>{t('dialog.body')}</Label>
            <Textarea
              value={simulateForm.body}
              onChange={(e) => setSimulateForm((f) => ({ ...f, body: e.target.value }))}
              placeholder={t('dialog.bodyPlaceholder')}
              rows={5}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSimulateOpen(false)}>{tc('cancel')}</Button>
            <Button
              onClick={() => simulateEmailMutation.mutate(simulateForm)}
              disabled={simulateEmailMutation.isPending || !simulateForm.senderEmail || !simulateForm.body}
            >
              {simulateEmailMutation.isPending ? tc('sending') : t('button.sendSimulate')}
            </Button>
          </div>
        </div>
      </SimpleDialog>
    </div>
  );
}
