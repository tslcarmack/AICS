'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
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
  Pencil,
  Trash2,
  Play,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Wrench,
} from 'lucide-react';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const PARAM_TYPES = ['string', 'number', 'boolean', 'array', 'object'] as const;
const AUTH_TYPES = ['none', 'bearer', 'api_key', 'basic'] as const;

type ToolForm = {
  name: string;
  displayName: string;
  description: string;
  type: string;
  method: string;
  url: string;
  headers?: string;
  bodyTemplate?: string;
  authType: string;
  authToken?: string;
  authHeaderName?: string;
  authHeaderValue?: string;
  authUsername?: string;
  authPassword?: string;
  timeout: number;
  parameters: Array<{ name: string; type: string; description?: string; required: boolean; variableBinding?: string }>;
  responseMappings: Array<{ jsonPath: string; variableName: string }>;
};

// ── Helpers ─────────────────────────────────────────────────────

function formToApi(form: ToolForm) {
  // Build parameters JSON Schema
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const p of form.parameters) {
    properties[p.name] = {
      type: p.type,
      description: p.description || '',
      ...(p.variableBinding ? { variableBinding: p.variableBinding } : {}),
    };
    if (p.required) required.push(p.name);
  }
  const parameters = { type: 'object', properties, required };

  // Build response mapping
  const responseMapping: Record<string, string> = {};
  for (const m of form.responseMappings) {
    responseMapping[m.jsonPath] = m.variableName;
  }

  // Build auth config
  let authConfig: Record<string, string> | undefined;
  if (form.authType === 'bearer' && form.authToken) {
    authConfig = { token: form.authToken };
  } else if (form.authType === 'api_key' && form.authHeaderName) {
    authConfig = { headerName: form.authHeaderName, headerValue: form.authHeaderValue || '' };
  } else if (form.authType === 'basic') {
    authConfig = { username: form.authUsername || '', password: form.authPassword || '' };
  }

  // Parse headers
  let headers: Record<string, string> | undefined;
  if (form.headers) {
    try { headers = JSON.parse(form.headers); } catch { /* ignore */ }
  }

  // Parse body template
  let bodyTemplate: any;
  if (form.bodyTemplate) {
    try { bodyTemplate = JSON.parse(form.bodyTemplate); } catch { bodyTemplate = form.bodyTemplate; }
  }

  return {
    name: form.name,
    displayName: form.displayName,
    description: form.description,
    type: form.type,
    method: form.method,
    url: form.url,
    headers,
    bodyTemplate,
    authType: form.authType,
    authConfig,
    parameters,
    responseMapping: Object.keys(responseMapping).length > 0 ? responseMapping : undefined,
    timeout: form.timeout,
  };
}

function apiToForm(tool: any): Partial<ToolForm> {
  // Parse parameters from JSON Schema
  const params: ToolForm['parameters'] = [];
  if (tool.parameters?.properties) {
    const required = tool.parameters.required || [];
    for (const [name, def] of Object.entries(tool.parameters.properties as Record<string, any>)) {
      params.push({
        name,
        type: def.type || 'string',
        description: def.description || '',
        required: required.includes(name),
        variableBinding: def.variableBinding || '',
      });
    }
  }

  // Parse response mapping
  const responseMappings: ToolForm['responseMappings'] = [];
  if (tool.responseMapping) {
    for (const [jsonPath, variableName] of Object.entries(tool.responseMapping as Record<string, string>)) {
      responseMappings.push({ jsonPath, variableName });
    }
  }

  return {
    name: tool.name,
    displayName: tool.displayName,
    description: tool.description,
    type: tool.type,
    method: tool.method || 'GET',
    url: tool.url || '',
    headers: tool.headers ? JSON.stringify(tool.headers, null, 2) : '',
    bodyTemplate: tool.bodyTemplate ? JSON.stringify(tool.bodyTemplate, null, 2) : '',
    authType: tool.authType || 'none',
    timeout: tool.timeout || 30000,
    parameters: params,
    responseMappings,
  };
}

// ── Main Page Component ──────────────────────────────────────────

export default function ToolsPage() {
  const t = useTranslations('tools');
  const tc = useTranslations('common');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingTool, setTestingTool] = useState<any | null>(null);
  const [logsToolId, setLogsToolId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────

  const { data: tools = [], isLoading, error } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => {
      const res = await api.get('/tools');
      return res.data ?? [];
    },
    retry: false,
  });

  const { data: variables = [] } = useQuery({
    queryKey: ['variables'],
    queryFn: async () => {
      const res = await api.get('/variables');
      return res.data ?? [];
    },
  });

  // ── Mutations ────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (body: ToolForm) => api.post('/tools', formToApi(body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      setCreateOpen(false);
      toast.success(t('toast.createSuccess'));
    },
    onError: (err: any) => toast.error(err.response?.data?.message || tc('toast.createFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ToolForm }) =>
      api.put(`/tools/${id}`, formToApi(body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      setEditingId(null);
      toast.success(t('toast.updateSuccess'));
    },
    onError: (err: any) => toast.error(err.response?.data?.message || tc('toast.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/tools/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast.success(t('toast.deleteSuccess'));
    },
    onError: (err: any) => toast.error(err.response?.data?.message || tc('toast.deleteFailed')),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/tools/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────

  const handleDelete = (tool: any) => {
    const msg = tool.agentCount > 0
      ? t('confirm.deleteWithBindings', { count: tool.agentCount })
      : t('confirm.delete');
    if (confirm(msg)) deleteMutation.mutate(tool.id);
  };

  // ── Render ───────────────────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            {tc('error.backendConnectFailed')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> {t('button.create')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.name')}</TableHead>
                <TableHead>{t('table.displayName')}</TableHead>
                <TableHead>{t('table.type')}</TableHead>
                <TableHead>{t('table.method')}</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead className="text-right">{tc('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {tc('loading')}
                  </TableCell>
                </TableRow>
              ) : tools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('empty')}
                  </TableCell>
                </TableRow>
              ) : (
                tools.map((tool: any) => (
                  <TableRow key={tool.id}>
                    <TableCell className="font-mono text-sm">{tool.name}</TableCell>
                    <TableCell>{tool.displayName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{tool.type === 'http_api' ? 'HTTP API' : t('badge.builtin')}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{tool.method || '-'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                      {tool.url || '-'}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleMutation.mutate(tool.id)}
                        className="flex items-center gap-1 text-sm"
                      >
                        {tool.enabled ? (
                          <>
                            <ToggleRight className="h-5 w-5 text-green-500" />
                            <span className="text-green-600">{tc('enabled')}</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-5 w-5 text-gray-400" />
                            <span className="text-gray-400">{tc('disabled')}</span>
                          </>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setTestingTool(tool)}>
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(tool.id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLogsToolId(tool.id)}>
                          <Clock className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(tool)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <ToolFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
        variables={variables}
        title={t('dialog.createTitle')}
      />

      {/* Edit Dialog */}
      {editingId && (
        <EditToolDialog
          toolId={editingId}
          onClose={() => setEditingId(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editingId, body: data })}
          isPending={updateMutation.isPending}
          variables={variables}
        />
      )}

      {/* Test Dialog */}
      {testingTool && (
        <TestToolDialog
          tool={testingTool}
          onClose={() => setTestingTool(null)}
        />
      )}

      {/* Logs Dialog */}
      {logsToolId && (
        <LogsDialog
          toolId={logsToolId}
          onClose={() => setLogsToolId(null)}
        />
      )}
    </div>
  );
}

// ── Tool Form Dialog ───────────────────────────────────────────

function ToolFormDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  variables,
  title,
  defaultValues,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ToolForm) => void;
  isPending: boolean;
  variables: any[];
  title: string;
  defaultValues?: Partial<ToolForm>;
}) {
  const t = useTranslations('tools');
  const tc = useTranslations('common');

  const parameterSchema = z.object({
    name: z.string().min(1, t('validation.paramName')),
    type: z.string().min(1, t('validation.paramType')),
    description: z.string().optional(),
    required: z.boolean().default(false),
    variableBinding: z.string().optional(),
  });

  const responseMappingSchema = z.object({
    jsonPath: z.string().min(1, t('validation.jsonPath')),
    variableName: z.string().min(1, t('validation.variable')),
  });

  const toolSchema = z.object({
    name: z.string().min(1, t('validation.toolName')).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, t('validation.nameFormat')),
    displayName: z.string().min(1, t('validation.displayName')),
    description: z.string().min(1, t('validation.description')),
    type: z.string().default('http_api'),
    method: z.string().default('GET'),
    url: z.string().min(1, t('validation.url')),
    headers: z.string().optional(),
    bodyTemplate: z.string().optional(),
    authType: z.string().default('none'),
    authToken: z.string().optional(),
    authHeaderName: z.string().optional(),
    authHeaderValue: z.string().optional(),
    authUsername: z.string().optional(),
    authPassword: z.string().optional(),
    timeout: z.coerce.number().min(1000).max(120000).default(30000),
    parameters: z.array(parameterSchema).default([]),
    responseMappings: z.array(responseMappingSchema).default([]),
  });

  const form = useForm<ToolForm>({
    resolver: zodResolver(toolSchema),
    defaultValues: {
      type: 'http_api',
      method: 'GET',
      authType: 'none',
      timeout: 30000,
      parameters: [],
      responseMappings: [],
      ...defaultValues,
    },
  });

  const { fields: paramFields, append: addParam, remove: removeParam } = useFieldArray({
    control: form.control,
    name: 'parameters',
  });

  const { fields: mappingFields, append: addMapping, remove: removeMapping } = useFieldArray({
    control: form.control,
    name: 'responseMappings',
  });

  const authType = form.watch('authType');
  const [section, setSection] = useState<string>('basic');

  return (
    <SimpleDialog open={open} onClose={onClose} title={title} className="max-w-3xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
        {/* Section tabs */}
        <div className="flex gap-2 border-b pb-2">
              {['basic', 'api', 'auth', 'params', 'mapping'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                section === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {t(`section.${s}`)}
            </button>
          ))}
        </div>

        {/* Basic Info */}
        {section === 'basic' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('label.name')} *</Label>
                <Input {...form.register('name')} placeholder="get_order_status" />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label>{t('label.displayName')} *</Label>
                <Input {...form.register('displayName')} placeholder={t('placeholder.displayName')} />
              </div>
            </div>
            <div>
              <Label>{t('label.description')} *</Label>
              <Textarea {...form.register('description')} placeholder={t('placeholder.description')} rows={3} />
              <p className="text-xs text-muted-foreground mt-1">{t('hint.description')}</p>
            </div>
          </div>
        )}

        {/* API Config */}
        {section === 'api' && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>{t('label.method')}</Label>
                <Select {...form.register('method')}>
                  {HTTP_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
              <div className="col-span-3">
                <Label>{t('label.url')} *</Label>
                <Input {...form.register('url')} placeholder="https://api.example.com/orders/{{order_id}}" />
                <p className="text-xs text-muted-foreground mt-1">{t('hint.placeholders')}</p>
              </div>
            </div>
            <div>
              <Label>{t('label.headers')}</Label>
              <Textarea {...form.register('headers')} placeholder='{"X-Custom-Header": "value"}' rows={3} className="font-mono text-sm" />
            </div>
            <div>
              <Label>{t('label.bodyTemplate')}</Label>
              <Textarea {...form.register('bodyTemplate')} placeholder='{"order_id": "{{order_id}}"}' rows={4} className="font-mono text-sm" />
            </div>
            <div className="w-48">
              <Label>{t('label.timeout')}</Label>
              <Input type="number" {...form.register('timeout')} />
            </div>
          </div>
        )}

        {/* Auth Config */}
        {section === 'auth' && (
          <div className="space-y-4">
            <div>
              <Label>{t('label.authType')}</Label>
              <Select {...form.register('authType')}>
                {AUTH_TYPES.map((authVal) => (
                  <option key={authVal} value={authVal}>{t(`auth.${authVal}`)}</option>
                ))}
              </Select>
            </div>
            {authType === 'bearer' && (
              <div>
                <Label>{t('label.bearerToken')}</Label>
                <Input {...form.register('authToken')} type="password" placeholder="sk-xxxx..." />
              </div>
            )}
            {authType === 'api_key' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('label.authHeaderName')}</Label>
                  <Input {...form.register('authHeaderName')} placeholder="X-API-Key" />
                </div>
                <div>
                  <Label>{t('label.authHeaderValue')}</Label>
                  <Input {...form.register('authHeaderValue')} type="password" placeholder="your-api-key" />
                </div>
              </div>
            )}
            {authType === 'basic' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('label.username')}</Label>
                  <Input {...form.register('authUsername')} />
                </div>
                <div>
                  <Label>{t('label.password')}</Label>
                  <Input {...form.register('authPassword')} type="password" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Parameters */}
        {section === 'params' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t('hint.params')}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => addParam({ name: '', type: 'string', description: '', required: false, variableBinding: '' })}>
                <Plus className="h-3 w-3 mr-1" /> {t('button.addParam')}
              </Button>
            </div>
            {paramFields.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('empty_params')}</p>
            ) : (
              <div className="space-y-3">
                {paramFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start border rounded-md p-3">
                    <div className="col-span-2">
                      <Label className="text-xs">{tc('name')}</Label>
                      <Input {...form.register(`parameters.${index}.name`)} placeholder="order_id" className="text-sm" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">{tc('type')}</Label>
                      <Select {...form.register(`parameters.${index}.type`)} className="text-sm">
                        {PARAM_TYPES.map((pt) => (
                          <option key={pt} value={pt}>{t(`paramType.${pt}`)}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">{t('label.paramDescription')}</Label>
                      <Input {...form.register(`parameters.${index}.description`)} placeholder={t('placeholder.paramDescription')} className="text-sm" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">{t('label.variableBinding')}</Label>
                      <Select {...form.register(`parameters.${index}.variableBinding`)} className="text-sm">
                        <option value="">{t('option.none')}</option>
                        {variables.map((v: any) => (
                          <option key={v.id} value={v.name}>{v.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-2 flex items-end gap-2">
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" {...form.register(`parameters.${index}.required`)} className="rounded" />
                        {t('label.required')}
                      </label>
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeParam(index)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Response Mapping */}
        {section === 'mapping' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t('hint.mapping')}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => addMapping({ jsonPath: '', variableName: '' })}>
                <Plus className="h-3 w-3 mr-1" /> {t('button.addMapping')}
              </Button>
            </div>
            {mappingFields.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('empty_mapping')}</p>
            ) : (
              <div className="space-y-3">
                {mappingFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end border rounded-md p-3">
                    <div className="col-span-5">
                      <Label className="text-xs">{t('label.jsonPath')}</Label>
                      <Input {...form.register(`responseMappings.${index}.jsonPath`)} placeholder="$.data.status" className="font-mono text-sm" />
                    </div>
                    <div className="col-span-1 text-center text-muted-foreground py-2">→</div>
                    <div className="col-span-5">
                      <Label className="text-xs">{t('label.targetVariable')}</Label>
                      <Select {...form.register(`responseMappings.${index}.variableName`)} className="text-sm">
                        <option value="">{t('test.selectVariable')}</option>
                        {variables.map((v: any) => (
                          <option key={v.id} value={v.name}>{v.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeMapping(index)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? tc('saving') : tc('save')}
          </Button>
        </div>
      </form>
    </SimpleDialog>
  );
}

// ── Edit Tool Dialog (loads tool detail) ───────────────────────

function EditToolDialog({
  toolId,
  onClose,
  onSubmit,
  isPending,
  variables,
}: {
  toolId: string;
  onClose: () => void;
  onSubmit: (data: ToolForm) => void;
  isPending: boolean;
  variables: any[];
}) {
  const t = useTranslations('tools');
  const { data: tool, isLoading } = useQuery({
    queryKey: ['tools', toolId],
    queryFn: async () => {
      const res = await api.get(`/tools/${toolId}`);
      return res.data;
    },
  });

  if (isLoading || !tool) return null;

  return (
    <ToolFormDialog
      open={true}
      onClose={onClose}
      onSubmit={onSubmit}
      isPending={isPending}
      variables={variables}
      title={t('dialog.editTitle')}
      defaultValues={apiToForm(tool)}
    />
  );
}

// ── Test Tool Dialog ───────────────────────────────────────────

function TestToolDialog({ tool, onClose }: { tool: any; onClose: () => void }) {
  const t = useTranslations('tools');
  const tc = useTranslations('common');
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Extract parameter names from schema
  const paramDefs = tool.parameters?.properties
    ? Object.entries(tool.parameters.properties as Record<string, any>).map(([name, def]) => ({
        name,
        type: def.type,
        description: def.description,
        variableBinding: def.variableBinding,
      }))
    : [];

  const handleTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post(`/tools/${tool.id}/test`, { parameters: params });
      setResult(res.data);
    } catch (err: any) {
      setResult({ result: { success: false, error: err.response?.data?.message || err.message } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SimpleDialog open={true} onClose={onClose} title={t('test.dialogTitle', { name: tool.displayName })} className="max-w-3xl">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Parameters Input */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t('test.inputParams')}</h3>
          {paramDefs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('test.noParams')}</p>
          ) : (
            paramDefs.map((p) => (
              <div key={p.name} className="grid grid-cols-4 gap-2 items-center">
                <Label className="text-sm">
                  {p.name}
                  {p.variableBinding && (
                    <span className="text-xs text-muted-foreground ml-1">({t('test.binding')} {p.variableBinding})</span>
                  )}
                </Label>
                <div className="col-span-3">
                  <Input
                    value={params[p.name] || ''}
                    onChange={(e) => setParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                    placeholder={p.description || p.name}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <Button onClick={handleTest} disabled={loading} className="w-full">
          <Play className="h-4 w-4 mr-1" />
          {loading ? t('test.executing') : t('test.sendRequest')}
        </Button>

        {/* Result */}
        {result && (
          <div className="space-y-3">
            {/* Request Info */}
            {result.request && (
              <div className="rounded-md bg-muted p-3 space-y-1">
                <h4 className="text-sm font-medium">{t('test.request')}</h4>
                <p className="text-xs font-mono">{result.request.method} {result.request.url}</p>
                {result.request.body && (
                  <pre className="text-xs font-mono overflow-auto max-h-32 bg-background p-2 rounded">
                    {JSON.stringify(result.request.body, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Response */}
            <div className={`rounded-md p-3 space-y-1 ${result.result?.success ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'}`}>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  {result.result?.success ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-500" /> {tc('success')}</>
                  ) : (
                    <><XCircle className="h-4 w-4 text-red-500" /> {tc('failed')}</>
                  )}
                </h4>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {result.result?.statusCode && <span>HTTP {result.result.statusCode}</span>}
                  {result.result?.duration && <span>{result.result.duration}ms</span>}
                </div>
              </div>
              {result.result?.error && (
                <p className="text-sm text-red-600">{result.result.error}</p>
              )}
              {result.result?.data && (
                <pre className="text-xs font-mono overflow-auto max-h-48 bg-background p-2 rounded mt-2">
                  {typeof result.result.data === 'string'
                    ? result.result.data
                    : JSON.stringify(result.result.data, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </SimpleDialog>
  );
}

// ── Execution Logs Dialog ──────────────────────────────────────

function LogsDialog({ toolId, onClose }: { toolId: string; onClose: () => void }) {
  const t = useTranslations('tools');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tool-logs', toolId, page],
    queryFn: async () => {
      const res = await api.get(`/tools/${toolId}/logs?page=${page}&pageSize=10`);
      return res.data;
    },
  });

  const logs = data?.items || [];
  const totalPages = data?.totalPages || 1;

  return (
    <SimpleDialog open={true} onClose={onClose} title={t('logs.title')} className="max-w-4xl">
      <div className="max-h-[70vh] overflow-y-auto">
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">{tc('loading')}</p>
        ) : logs.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">{t('logs.empty')}</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log: any) => (
              <div key={log.id} className="border rounded-md">
                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="w-full flex items-center justify-between p-3 text-sm hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                    <Badge variant="secondary">{log.duration}ms</Badge>
                    {log.statusCode && <Badge variant="outline">HTTP {log.statusCode}</Badge>}
                    {log.ticket && <span className="text-xs text-muted-foreground">{t('logs.ticket')}: {log.ticket.subject || log.ticket.id}</span>}
                    {log.agent && <span className="text-xs text-muted-foreground">{t('logs.agent')}: {log.agent.name}</span>}
                  </div>
                  {expandedId === log.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {expandedId === log.id && (
                  <div className="p-3 border-t bg-muted/30 space-y-2">
                    <div>
                      <p className="text-xs font-medium mb-1">{t('logs.inputParams')}</p>
                      <pre className="text-xs font-mono bg-background p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(log.input, null, 2)}
                      </pre>
                    </div>
                    {log.output && (
                      <div>
                        <p className="text-xs font-medium mb-1">{t('logs.response')}</p>
                        <pre className="text-xs font-mono bg-background p-2 rounded overflow-auto max-h-32">
                          {JSON.stringify(log.output, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.error && (
                      <p className="text-sm text-red-600">{t('logs.error')} {log.error}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {tc('prevPage')}
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              {tc('nextPage')}
            </Button>
          </div>
        )}
      </div>
    </SimpleDialog>
  );
}
