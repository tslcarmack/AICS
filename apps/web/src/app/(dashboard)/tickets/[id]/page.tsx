'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { getDateLocale } from '@/lib/date-locale';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Send, UserPlus, CheckCircle, XCircle, AlertTriangle, Bot, User, RefreshCw, Workflow } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  processing: 'default',
  awaiting_reply: 'default',
  resolved: 'default',
  closed: 'secondary',
  transferred: 'destructive',
};

const pipelineStatusColor: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  escalated: 'bg-amber-100 text-amber-700',
};

export default function TicketDetailPage() {
  const t = useTranslations('tickets');
  const tc = useTranslations('common');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [replyContent, setReplyContent] = useState('');
  const queryClient = useQueryClient();

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['tickets', id],
    queryFn: async () => {
      const res = await api.get(`/tickets/${id}`);
      return res.data;
    },
    retry: false,
  });

  const replyMutation = useMutation({
    mutationFn: async (content: string) => {
      await api.post(`/tickets/${id}/reply`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', id] });
      setReplyContent('');
      toast.success(t('toast.replySent'));
    },
    onError: () => toast.error(t('toast.replyFail')),
  });

  const resolveMutation = useMutation({
    mutationFn: async () => api.post(`/tickets/${id}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', id] });
      toast.success(t('toast.resolved'));
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => api.post(`/tickets/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', id] });
      toast.success(t('toast.closed'));
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (processingId: string) => api.post(`/pipeline/${processingId}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', id] });
      toast.success(t('toast.retrySubmitted'));
    },
    onError: () => toast.error(t('toast.retryFail')),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><p className="text-muted-foreground">{tc('loading')}</p></div>;
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tc('back')}
        </Button>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          {t('error.notFoundOrBackend')}
        </div>
      </div>
    );
  }

  const messages = ticket.messages ?? [];
  const activities = ticket.activities ?? [];
  const variables = ticket.variables ?? [];

  // Merge messages and activities into a timeline sorted by time
  const timeline = [
    ...messages.map((m: any) => ({
      type: 'message' as const,
      time: new Date(m.createdAt),
      data: m,
    })),
    ...activities.map((a: any) => ({
      type: 'activity' as const,
      time: new Date(a.createdAt),
      data: a,
    })),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{ticket.subject ?? t('detail.noSubject')}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>{ticket.customerEmail}</span>
              <Badge variant={statusVariant[ticket.status] ?? 'secondary'}>
                {ticket.status ? t(`status.${ticket.status}`) : ticket.status}
              </Badge>
              <span>{t('detail.source')} {ticket.source}</span>
              {ticket.assignedUser && <span>{t('detail.assignedTo')} {ticket.assignedUser.name}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <Button variant="outline" size="sm" onClick={() => resolveMutation.mutate()}>
              <CheckCircle className="mr-1 h-4 w-4" />
              {t('detail.resolve')}
            </Button>
          )}
          {ticket.status !== 'closed' && (
            <Button variant="outline" size="sm" onClick={() => closeMutation.mutate()}>
              <XCircle className="mr-1 h-4 w-4" />
              {t('detail.close')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Conversation timeline */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.conversationTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeline.map((item, i) => {
                  if (item.type === 'message') {
                    const msg = item.data;
                    const isInbound = msg.direction === 'inbound';
                    return (
                      <div key={`msg-${msg.id}`} className={`flex gap-3 ${isInbound ? '' : 'flex-row-reverse'}`}>
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isInbound ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                          {isInbound ? <User className="h-4 w-4" /> : msg.sender === 'AI' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                        </div>
                        <div className={`max-w-[70%] rounded-lg p-3 ${isInbound ? 'bg-muted' : 'bg-primary/10'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium">{msg.sender ?? (isInbound ? t('detail.customer') : t('detail.ai'))}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(msg.createdAt), 'MM-dd HH:mm', { locale: getDateLocale() })}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    );
                  } else {
                    const act = item.data;
                    return (
                      <div key={`act-${act.id}`} className="flex items-center justify-center gap-2 py-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs text-muted-foreground px-2">
                          {act.action} {act.details ? `- ${typeof act.details === 'string' ? act.details : JSON.stringify(act.details)}` : ''}
                          <span className="ml-1">({format(new Date(act.createdAt), 'MM-dd HH:mm', { locale: getDateLocale() })})</span>
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    );
                  }
                })}
                {timeline.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">{t('detail.noConversation')}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reply composer */}
          {ticket.status !== 'closed' && (
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <Textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder={t('detail.replyPlaceholder')}
                    rows={4}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => replyContent.trim() && replyMutation.mutate(replyContent.trim())}
                      disabled={!replyContent.trim() || replyMutation.isPending}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {replyMutation.isPending ? tc('sending') : t('detail.sendReply')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Side panel: variables and safety flags */}
        <div className="space-y-4">
          {/* Ticket info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('detail.ticketInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('detail.id')}</span>
                <span className="font-mono text-xs">{ticket.id?.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('detail.source')}</span>
                <span>{ticket.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('detail.createdAt')}</span>
                <span>{ticket.createdAt ? format(new Date(ticket.createdAt), 'MM-dd HH:mm', { locale: getDateLocale() }) : '-'}</span>
              </div>
              {ticket.intent && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('detail.intent')}</span>
                  <Badge variant="secondary">{ticket.intent.name}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Variables */}
          {variables.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('detail.extractedVars')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {variables.map((v: any) => (
                    <div key={v.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{v.variable?.name ?? v.variableId}</span>
                      <span className="font-medium">{v.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Safety flags */}
          {ticket.safetyFlags && ticket.safetyFlags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  {t('detail.safetyFlags')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ticket.safetyFlags.map((flag: any, i: number) => (
                    <div key={i} className="text-sm">
                      <Badge variant="destructive" className="text-xs">{flag.rule ?? flag.type}</Badge>
                      <p className="text-muted-foreground mt-1">{flag.details}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pipeline processing log */}
          {ticket.pipelines && ticket.pipelines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-1">
                  <Workflow className="h-4 w-4 text-blue-500" />
                  {t('detail.processingLog')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ticket.pipelines.map((p: any) => {
                    const sCfg = pipelineStatusColor[p.status] || pipelineStatusColor.queued;
                    const result = p.result as Record<string, any> | null;
                    return (
                      <div key={p.id} className="flex items-start gap-2 text-sm">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.stage ? t(`pipeline.${p.stage}`) : p.stage}</span>
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${sCfg}`}>
                              {p.status ? t(`pipeline.${p.status}`) : ''}
                            </span>
                          </div>
                          {p.error && (
                            <p className="text-xs text-red-500 mt-0.5 break-all">{p.error}</p>
                          )}
                          {result && p.stage === 'intent' && result.intentName && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t('detail.intentResult')}: {result.intentName} ({t('detail.confidence')}: {result.confidence})
                            </p>
                          )}
                          {result && p.stage === 'agent' && result.agentName && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t('detail.agentName')}: {result.agentName}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {p.createdAt ? format(new Date(p.createdAt), 'MM-dd HH:mm:ss', { locale: getDateLocale() }) : ''}
                          </p>
                        </div>
                        {p.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 shrink-0"
                            onClick={() => retryMutation.mutate(p.id)}
                            disabled={retryMutation.isPending}
                            title={tc('retry')}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
