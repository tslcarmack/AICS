'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Mail,
  Code2,
  MessageCircle,
  MessageSquare,
  Hash,
  Send,
  ShoppingBag,
  Webhook,
  Users,
  Globe,
  Bot,
  ArrowRight,
} from 'lucide-react';

type IntegrationCategory = 'all' | 'channel' | 'tools';

interface IntegrationItem {
  id: string;
  icon: React.ReactNode;
  nameKey: string;
  descKey: string;
  category: IntegrationCategory[];
  enabled: boolean;
  href?: string;
}

export default function IntegrationsPage() {
  const t = useTranslations('integrations');
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('all');

  const { data: emailAccounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: async () => {
      const res = await api.get('/email-accounts');
      return res.data ?? [];
    },
    retry: false,
  });

  const connectedEmailCount = emailAccounts.length;

  const integrations: IntegrationItem[] = [
    {
      id: 'email',
      icon: <Mail className="h-6 w-6" />,
      nameKey: 'email.name',
      descKey: 'email.description',
      category: ['channel'],
      enabled: true,
      href: '/integrations/email',
    },
    {
      id: 'api',
      icon: <Code2 className="h-6 w-6" />,
      nameKey: 'api.name',
      descKey: 'api.description',
      category: ['tools'],
      enabled: false,
    },
    {
      id: 'livechat',
      icon: <MessageCircle className="h-6 w-6" />,
      nameKey: 'livechat.name',
      descKey: 'livechat.description',
      category: ['channel'],
      enabled: false,
    },
    {
      id: 'wechat',
      icon: <MessageSquare className="h-6 w-6" />,
      nameKey: 'wechat.name',
      descKey: 'wechat.description',
      category: ['channel'],
      enabled: false,
    },
    {
      id: 'whatsapp',
      icon: <Hash className="h-6 w-6" />,
      nameKey: 'whatsapp.name',
      descKey: 'whatsapp.description',
      category: ['channel'],
      enabled: false,
    },
    {
      id: 'line',
      icon: <MessageCircle className="h-6 w-6" />,
      nameKey: 'line.name',
      descKey: 'line.description',
      category: ['channel'],
      enabled: false,
    },
    {
      id: 'telegram',
      icon: <Send className="h-6 w-6" />,
      nameKey: 'telegram.name',
      descKey: 'telegram.description',
      category: ['channel'],
      enabled: false,
    },
    {
      id: 'slack',
      icon: <Hash className="h-6 w-6" />,
      nameKey: 'slack.name',
      descKey: 'slack.description',
      category: ['channel'],
      enabled: false,
    },
    {
      id: 'teams',
      icon: <Users className="h-6 w-6" />,
      nameKey: 'teams.name',
      descKey: 'teams.description',
      category: ['channel'],
      enabled: false,
    },
    {
      id: 'shopify',
      icon: <ShoppingBag className="h-6 w-6" />,
      nameKey: 'shopify.name',
      descKey: 'shopify.description',
      category: ['tools'],
      enabled: false,
    },
    {
      id: 'webhook',
      icon: <Webhook className="h-6 w-6" />,
      nameKey: 'webhook.name',
      descKey: 'webhook.description',
      category: ['tools'],
      enabled: false,
    },
  ];

  const filteredIntegrations =
    activeTab === 'all'
      ? integrations
      : integrations.filter((item) =>
          item.category.includes(activeTab as IntegrationCategory),
        );

  const handleCardClick = (item: IntegrationItem) => {
    if (item.href) {
      router.push(item.href);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
          <TabsTrigger value="channel">{t('tabs.channel')}</TabsTrigger>
          <TabsTrigger value="tools">{t('tabs.tools')}</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {filteredIntegrations.map((item) => {
              const isConnected = item.id === 'email' && connectedEmailCount > 0;

              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  className={`group relative rounded-lg border bg-card p-5 transition-all ${
                    item.enabled
                      ? 'border-border hover:border-primary/50 hover:shadow-md cursor-pointer'
                      : 'border-border/60 opacity-75'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                        item.enabled
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{t(item.nameKey)}</h3>
                        {!item.enabled && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {t('status.comingSoon')}
                          </Badge>
                        )}
                        {isConnected && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            {t('status.connected')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {t(item.descKey)}
                      </p>
                    </div>
                  </div>

                  {/* Bottom action area */}
                  {item.enabled && (
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                      {isConnected ? (
                        <span className="text-xs text-muted-foreground">
                          {t('accountCount', { count: connectedEmailCount })}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t('status.notConnected')}
                        </span>
                      )}
                      <span className="text-xs font-medium text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isConnected ? t('manage') : t('configure')}
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
