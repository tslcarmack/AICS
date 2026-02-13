'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#6b7280',
];

interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export default function TagsPage() {
  const t = useTranslations('tags');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#3b82f6');
  const queryClient = useQueryClient();

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await api.get('/tags');
      return res.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; color: string }) => api.post('/tags', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setDialogOpen(false);
      toast.success(t('createSuccess'));
    },
    onError: () => toast.error(t('createError')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; color: string }) =>
      api.put(`/tags/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setDialogOpen(false);
      setEditingTag(null);
      toast.success(t('updateSuccess'));
    },
    onError: () => toast.error(t('updateError')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success(t('deleteSuccess'));
    },
    onError: () => toast.error(t('deleteError')),
  });

  const handleOpenCreate = () => {
    setEditingTag(null);
    setFormName('');
    setFormColor('#3b82f6');
    setDialogOpen(true);
  };

  const handleOpenEdit = (tag: Tag) => {
    setEditingTag(tag);
    setFormName(tag.name);
    setFormColor(tag.color);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    if (editingTag) {
      updateMutation.mutate({ id: editingTag.id, name: formName.trim(), color: formColor });
    } else {
      createMutation.mutate({ name: formName.trim(), color: formColor });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('tagList')} ({tags.length})</CardTitle>
          <Button onClick={handleOpenCreate} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {t('create')}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">{t('loading')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('color')}</TableHead>
                  <TableHead>{t('createdAt')}</TableHead>
                  <TableHead className="w-[100px]">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag: Tag) => (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-5 w-5 rounded border"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-xs text-muted-foreground">{tag.color}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tag.createdAt
                        ? format(new Date(tag.createdAt), 'yyyy-MM-dd HH:mm', { locale: zhCN })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => handleOpenEdit(tag)} title={t('edit')}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm(t('confirmDelete'))) deleteMutation.mutate(tag.id);
                          }}
                          title={t('delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {tags.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {t('empty')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SimpleDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingTag(null);
        }}
        title={editingTag ? t('editTag') : t('createTag')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>{t('name')}</Label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t('namePlaceholder')}
            />
          </div>
          <div>
            <Label>{t('color')}</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormColor(color)}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    formColor === color ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                value={formColor}
                onChange={(e) => setFormColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded border-0"
              />
              <Input
                value={formColor}
                onChange={(e) => setFormColor(e.target.value)}
                className="w-28"
                placeholder="#000000"
              />
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-white"
                style={{ backgroundColor: formColor }}
              >
                {formName || t('preview')}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditingTag(null); }}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {editingTag ? t('save') : t('create')}
            </Button>
          </div>
        </form>
      </SimpleDialog>
    </div>
  );
}
