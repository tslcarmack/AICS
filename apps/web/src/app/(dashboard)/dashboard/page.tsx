'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Reply, ArrowRightLeft, Clock } from 'lucide-react';

const COLORS = ['#2563eb', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');

  const { data: overview, isLoading, error } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const res = await api.get('/analytics/overview');
      return res.data;
    },
    retry: false,
  });

  const { data: volumeData } = useQuery({
    queryKey: ['analytics', 'volume'],
    queryFn: async () => {
      const res = await api.get('/analytics/volume?days=30');
      return res.data;
    },
    retry: false,
  });

  const { data: intentData } = useQuery({
    queryKey: ['analytics', 'intents'],
    queryFn: async () => {
      const res = await api.get('/analytics/intents');
      return res.data;
    },
    retry: false,
  });

  const statCards = [
    { key: 'totalTickets', value: overview?.totalTickets ?? 0, icon: Mail },
    { key: 'openTickets', value: overview?.openTickets ?? 0, icon: Clock },
    { key: 'resolvedToday', value: overview?.resolvedToday ?? 0, icon: Reply },
    { key: 'autoReplyRate', value: `${overview?.autoReplyRate ?? 0}%`, icon: ArrowRightLeft },
  ];

  const volumeTrend: Array<{ date: string; count: number }> = Array.isArray(volumeData) ? volumeData : [];

  const intentDistribution: Array<{ intentName: string; count: number }> = Array.isArray(intentData) ? intentData : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {error && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="font-medium">{tc('error.backendNotConnected')}</p>
          <p className="mt-1 text-yellow-700">{t('error.startBackend')}</p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground">{tc('loading')}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t(`stats.${stat.key}`)}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('chart.volumeTrend')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volumeTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#2563eb"
                    strokeWidth={2}
                    name={t('chart.ticketCount')}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('chart.intentDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={intentDistribution}
                    dataKey="count"
                    nameKey="intentName"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {intentDistribution.map((_: unknown, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
