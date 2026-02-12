/**
 * API endpoint helpers - defines paths for API client
 */
export const api = {
  analytics: {
    dashboard: () => '/analytics/dashboard',
  },
  email: {
    accounts: () => '/email/accounts',
    account: (id: string) => `/email/accounts/${id}`,
    testAccount: (id: string) => `/email/accounts/${id}/test`,
  },
  knowledge: {
    bases: () => '/knowledge/bases',
    base: (id: string) => `/knowledge/bases/${id}`,
    documents: (id: string) => `/knowledge/bases/${id}/documents`,
  },
  intents: {
    list: () => '/intents',
    item: (id: string) => `/intents/${id}`,
    toggle: (id: string) => `/intents/${id}/toggle`,
    bindAgent: (id: string) => `/intents/${id}/bind-agent`,
  },
  agents: {
    list: () => '/agents',
    item: (id: string) => `/agents/${id}`,
  },
  safety: {
    rules: () => '/safety/rules',
    logs: () => '/safety/logs',
    config: () => '/safety/config',
  },
  tickets: {
    list: () => '/tickets',
    item: (id: string) => `/tickets/${id}`,
    assign: (id: string) => `/tickets/${id}/assign`,
    complete: (id: string) => `/tickets/${id}/complete`,
  },
  pipeline: {
    processings: () => '/pipeline/processings',
    retry: (emailId: string) => `/pipeline/processings/${emailId}/retry`,
    config: () => '/pipeline/config',
  },
  settings: {
    llm: () => '/settings/llm',
    global: () => '/settings/global',
  },
};
