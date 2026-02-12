'use client';

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getDateLocale } from '@/lib/date-locale';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import {
  Plus,
  Upload,
  Search,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderPlus,
  Filter,
  X,
  BookOpen,
  Eye,
  Save,
} from 'lucide-react';

// ==================== Types ====================
interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  knowledgeBaseId: string;
  children?: Category[];
}

interface KnowledgeDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  categoryId: string | null;
  createdAt: string;
}

interface KnowledgeDocumentDetail extends KnowledgeDocument {
  content: string | null;
  filePath: string | null;
  chunks?: Array<{ id: string; content: string; metadata: any }>;
}

// ==================== Constants ====================
const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive'; color: string }> = {
  pending: { variant: 'secondary', color: 'bg-gray-100 text-gray-600' },
  processing: { variant: 'default', color: 'bg-blue-100 text-blue-700' },
  ready: { variant: 'default', color: 'bg-green-100 text-green-700' },
  failed: { variant: 'destructive', color: 'bg-red-100 text-red-700' },
};

const typeKeyMap: Record<string, string> = {
  pdf: 'pdf', docx: 'word', doc: 'word', xlsx: 'excel', xls: 'excel',
  txt: 'txt', md: 'markdown', html: 'html', richtext: 'richtext',
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

// ==================== Helper: Build tree from flat categories ====================
function buildCategoryTree(categories: Category[]): Category[] {
  const map = new Map<string, Category>();
  const roots: Category[] = [];

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }

  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ==================== Context Menu Component ====================
function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handle = () => onClose();
    document.addEventListener('click', handle);
    return () => document.removeEventListener('click', handle);
  }, [onClose]);

  return (
    <div
      className="fixed z-50 min-w-[160px] rounded-md border bg-popover shadow-md py-1"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors ${
            item.danger ? 'text-red-600 hover:text-red-700' : ''
          }`}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ==================== Hoverable Tree Item (for "All" and "Uncategorized" rows) ====================
function HoverableTreeItem({
  icon,
  label,
  isSelected,
  paddingLeft,
  onClick,
  actions,
}: {
  icon: React.ReactNode;
  label: string;
  isSelected: boolean;
  paddingLeft: number;
  onClick: () => void;
  actions?: React.ReactNode | null;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`flex items-center justify-between py-1.5 cursor-pointer hover:bg-muted/80 transition-colors ${
        isSelected ? 'bg-primary/10 text-primary font-medium' : ''
      }`}
      style={{ paddingLeft: `${paddingLeft}px`, paddingRight: '12px' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      {hovered && actions ? (
        <div className="flex items-center gap-0.5 shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}

// ==================== Tree Node Component ====================
function TreeNode({
  category,
  depth,
  selectedCategoryId,
  onSelect,
  onAddChild,
  onRename,
  onDelete,
}: {
  category: Category;
  depth: number;
  selectedCategoryId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (cat: Category) => void;
  onDelete: (cat: Category) => void;
}) {
  const t = useTranslations('knowledge');
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const hasChildren = category.children && category.children.length > 0;
  const isSelected = selectedCategoryId === category.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer text-sm transition-colors hover:bg-muted/80 ${
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(category.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-muted rounded"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-[22px]" />
        )}
        {hasChildren && expanded ? (
          <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-amber-500 shrink-0" />
        )}
        <span className="truncate flex-1">{category.name}</span>
        {/* Hover action buttons - use state instead of group-hover for Tailwind v4 compatibility */}
        {hovered && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              className="p-0.5 rounded hover:bg-muted-foreground/20"
              title={t('action.addSubCategory')}
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(category.id);
              }}
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              className="p-0.5 rounded hover:bg-muted-foreground/20"
              title={t('action.rename')}
              onClick={(e) => {
                e.stopPropagation();
                onRename(category);
              }}
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              className="p-0.5 rounded hover:bg-red-100"
              title={t('action.deleteCategory')}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(category);
              }}
            >
              <Trash2 className="h-3 w-3 text-red-400 hover:text-red-600" />
            </button>
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {category.children!.map((child) => (
            <TreeNode
              key={child.id}
              category={child}
              depth={depth + 1}
              selectedCategoryId={selectedCategoryId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Main Page Component ====================
export default function KnowledgePage() {
  const t = useTranslations('knowledge');
  const tc = useTranslations('common');

  // ---- State ----
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'uncategorized' | 'category'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());

  // Dialogs
  const [createBaseOpen, setCreateBaseOpen] = useState(false);
  const [createKnowledgeOpen, setCreateKnowledgeOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [renameCategoryOpen, setRenameCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [baseName, setBaseName] = useState('');
  const [baseDesc, setBaseDesc] = useState('');
  const [entryName, setEntryName] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [entryType, setEntryType] = useState<'file' | 'qa'>('file');

  // Preview / Edit dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDocumentDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    category: Category;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // ---- Queries ----
  const { data: bases = [], isLoading: basesLoading, error } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: async () => {
      const res = await api.get('/knowledge-bases');
      return (res.data ?? []) as KnowledgeBase[];
    },
    retry: false,
  });

  // Auto-select first base
  useEffect(() => {
    if (!selectedBaseId && bases.length > 0) {
      setSelectedBaseId(bases[0].id);
    }
  }, [bases, selectedBaseId]);

  const { data: categories = [] } = useQuery({
    queryKey: ['knowledge-categories', selectedBaseId],
    queryFn: async () => {
      if (!selectedBaseId) return [];
      const res = await api.get(`/knowledge-bases/${selectedBaseId}/categories`);
      return (res.data ?? []) as Category[];
    },
    enabled: !!selectedBaseId,
  });

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ['knowledge-documents', selectedBaseId],
    queryFn: async () => {
      if (!selectedBaseId) return [];
      const res = await api.get(`/knowledge-bases/${selectedBaseId}/documents`);
      return (res.data ?? []) as KnowledgeDocument[];
    },
    enabled: !!selectedBaseId,
  });

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const uncategorizedCount = useMemo(() => documents.filter((d) => !d.categoryId).length, [documents]);

  // ---- Filtered documents ----
  const filteredDocs = useMemo(() => {
    let result = documents;

    // Filter by category
    if (viewMode === 'category' && selectedCategoryId) {
      // Get all descendant category IDs
      const getDescendantIds = (cats: Category[], parentId: string): string[] => {
        const ids: string[] = [];
        for (const cat of cats) {
          if (cat.id === parentId || cat.parentId === parentId) {
            ids.push(cat.id);
            if (cat.children) {
              ids.push(...cat.children.map((c) => c.id));
            }
          }
        }
        return ids;
      };
      const validIds = [selectedCategoryId, ...getDescendantIds(categories, selectedCategoryId)];
      result = result.filter((d) => d.categoryId && validIds.includes(d.categoryId));
    } else if (viewMode === 'uncategorized') {
      result = result.filter((d) => !d.categoryId);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) => d.name.toLowerCase().includes(q));
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((d) => d.type === typeFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((d) => d.status === statusFilter);
    }

    return result;
  }, [documents, viewMode, selectedCategoryId, categories, searchQuery, typeFilter, statusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDocs.slice(start, start + pageSize);
  }, [filteredDocs, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode, selectedCategoryId, searchQuery, typeFilter, statusFilter, selectedBaseId]);

  // ---- Mutations ----
  const createBaseMutation = useMutation({
    mutationFn: async () => {
      await api.post('/knowledge-bases', { name: baseName, description: baseDesc || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      setCreateBaseOpen(false);
      setBaseName('');
      setBaseDesc('');
      toast.success(t('toast.createBaseSuccess'));
    },
    onError: () => toast.error(tc('toast.createFailed')),
  });

  const deleteBaseMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/knowledge-bases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      setSelectedBaseId(null);
      toast.success(t('toast.deleteBaseSuccess'));
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/knowledge-bases/${selectedBaseId}/categories`, {
        name: categoryName,
        parentId: parentCategoryId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-categories', selectedBaseId] });
      setAddCategoryOpen(false);
      setCategoryName('');
      setParentCategoryId(null);
      toast.success(t('toast.createCategorySuccess'));
    },
    onError: () => toast.error(t('toast.createCategoryFailed')),
  });

  const renameCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!editingCategory) return;
      await api.put(`/knowledge-bases/categories/${editingCategory.id}`, { name: categoryName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-categories', selectedBaseId] });
      setRenameCategoryOpen(false);
      setCategoryName('');
      setEditingCategory(null);
      toast.success(t('toast.renameSuccess'));
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/knowledge-bases/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-categories', selectedBaseId] });
      if (selectedCategoryId) {
        setSelectedCategoryId(null);
        setViewMode('all');
      }
      toast.success(t('toast.deleteCategorySuccess'));
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      if (viewMode === 'category' && selectedCategoryId) {
        formData.append('categoryId', selectedCategoryId);
      }
      await api.post(`/knowledge-bases/${selectedBaseId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents', selectedBaseId] });
      toast.success(t('toast.uploadSuccess'));
    },
    onError: () => toast.error(tc('toast.uploadFailed')),
  });

  const createEntryMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/knowledge-bases/${selectedBaseId}/entries`, {
        name: entryName,
        content: entryContent,
        categoryId: viewMode === 'category' && selectedCategoryId ? selectedCategoryId : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents', selectedBaseId] });
      setCreateKnowledgeOpen(false);
      setEntryName('');
      setEntryContent('');
      toast.success(t('toast.createEntrySuccess'));
    },
    onError: () => toast.error(tc('toast.createFailed')),
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/knowledge-bases/${selectedBaseId}/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents', selectedBaseId] });
      toast.success(tc('deleted'));
    },
  });

  const deleteUncategorizedMutation = useMutation({
    mutationFn: async () => {
      const uncategorized = documents.filter((d) => !d.categoryId);
      for (const doc of uncategorized) {
        await api.delete(`/knowledge-bases/${selectedBaseId}/documents/${doc.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents', selectedBaseId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      toast.success(t('toast.deleteUncategorizedSuccess'));
    },
    onError: () => toast.error(tc('toast.deleteFailed')),
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, name, content }: { id: string; name?: string; content?: string }) => {
      await api.put(`/knowledge-bases/${selectedBaseId}/documents/${id}`, { name, content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents', selectedBaseId] });
      setIsEditing(false);
      toast.success(t('toast.updateSuccess'));
      // Reload the preview with fresh data
      if (previewDoc) {
        handleOpenPreview(previewDoc.id);
      }
    },
    onError: () => toast.error(tc('toast.updateFailed')),
  });

  // ---- Handlers ----
  const handleOpenPreview = async (docId: string) => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    setIsEditing(false);
    try {
      const res = await api.get(`/knowledge-bases/${selectedBaseId}/documents/${docId}`);
      const doc = res.data as KnowledgeDocumentDetail;
      setPreviewDoc(doc);
      setEditName(doc.name);
      setEditContent(doc.content || '');
    } catch {
      toast.error(t('toast.getDocFailed'));
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleStartEdit = () => {
    if (previewDoc) {
      setEditName(previewDoc.name);
      setEditContent(previewDoc.content || '');
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (previewDoc) {
      updateDocMutation.mutate({
        id: previewDoc.id,
        name: editName !== previewDoc.name ? editName : undefined,
        content: editContent !== previewDoc.content ? editContent : undefined,
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        uploadMutation.mutate(files[i]);
      }
      e.target.value = '';
    }
  };

  const handleCategoryContextMenu = useCallback((e: React.MouseEvent, cat: Category) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, category: cat });
  }, []);

  const handleAddChildCategory = useCallback((parentId: string) => {
    setParentCategoryId(parentId);
    setCategoryName('');
    setAddCategoryOpen(true);
  }, []);

  const handleRenameCategory = useCallback((cat: Category) => {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setRenameCategoryOpen(true);
  }, []);

  const handleDeleteCategory = useCallback((cat: Category) => {
    if (confirm(t('confirm.deleteCategory', { name: cat.name }))) {
      deleteCategoryMutation.mutate(cat.id);
    }
  }, [deleteCategoryMutation, t]);

  const handleSelectAll = () => {
    if (selectedDocs.size === paginatedDocs.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(paginatedDocs.map((d) => d.id)));
    }
  };

  const toggleDocSelection = (id: string) => {
    const next = new Set(selectedDocs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDocs(next);
  };

  // ---- Get unique types for filter ----
  const uniqueTypes = useMemo(() => {
    const types = new Set(documents.map((d) => d.type));
    return Array.from(types);
  }, [documents]);

  // ---- Render ----
  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* ==================== Left Panel: Tree Structure ==================== */}
      <div className="w-[260px] shrink-0 border-r bg-muted/30 flex flex-col overflow-hidden">
        {/* Base selector / header */}
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('label.knowledgeBase')}</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCreateBaseOpen(true)} title={t('action.createBase')}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {basesLoading ? (
            <p className="text-xs text-muted-foreground">{tc('loading')}</p>
          ) : (
            <Select
              value={selectedBaseId || ''}
              onChange={(e) => {
                setSelectedBaseId(e.target.value || null);
                setSelectedCategoryId(null);
                setViewMode('all');
              }}
              className="h-8 text-sm"
            >
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.documentCount} {t('label.documents')})
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Tree navigation */}
        <div className="flex-1 overflow-y-auto py-2">
          {selectedBaseId && (
            <>
              {/* All knowledge */}
              <HoverableTreeItem
                icon={<BookOpen className="h-4 w-4" />}
                label={t('tree.allKnowledge')}
                isSelected={viewMode === 'all'}
                paddingLeft={12}
                onClick={() => {
                  setViewMode('all');
                  setSelectedCategoryId(null);
                }}
                actions={
                  <button
                    className="p-0.5 rounded hover:bg-muted-foreground/20"
                    title={t('action.addTopCategory')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setParentCategoryId(null);
                      setCategoryName('');
                      setAddCategoryOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                }
              />

              {/* Uncategorized */}
              <HoverableTreeItem
                icon={<Folder className="h-4 w-4 text-amber-500" />}
                label={`${t('tree.uncategorized')}${uncategorizedCount > 0 ? ` (${uncategorizedCount})` : ''}`}
                isSelected={viewMode === 'uncategorized'}
                paddingLeft={20}
                onClick={() => {
                  setViewMode('uncategorized');
                  setSelectedCategoryId(null);
                }}
                actions={
                  uncategorizedCount > 0 ? (
                    <button
                      className="p-0.5 rounded hover:bg-red-100"
                      title={t('action.deleteUncategorized')}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t('confirm.deleteUncategorized', { count: uncategorizedCount }))) {
                          deleteUncategorizedMutation.mutate();
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-red-400 hover:text-red-600" />
                    </button>
                  ) : null
                }
              />

              {/* Category tree */}
              {categoryTree.map((cat) => (
                <TreeNode
                  key={cat.id}
                  category={cat}
                  depth={1}
                  selectedCategoryId={viewMode === 'category' ? selectedCategoryId : null}
                  onSelect={(id) => {
                    setViewMode('category');
                    setSelectedCategoryId(id);
                  }}
                  onAddChild={handleAddChildCategory}
                  onRename={handleRenameCategory}
                  onDelete={handleDeleteCategory}
                />
              ))}

              {/* Add category button at bottom */}
              <div className="px-3 mt-2">
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  onClick={() => {
                    setParentCategoryId(null);
                    setCategoryName('');
                    setAddCategoryOpen(true);
                  }}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  {t('action.addCategory')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Bottom info */}
        {selectedBaseId && (
          <div className="p-3 border-t text-xs text-muted-foreground">
            <p>{t('stats.docsAndCategories', { docs: documents.length, categories: categories.length })}</p>
          </div>
        )}
      </div>

      {/* ==================== Right Panel: Document List ==================== */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <div className="flex items-center gap-2">
            {selectedBaseId && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  multiple
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.html"
                  onChange={handleFileUpload}
                />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadMutation.isPending ? tc('uploading') : t('button.upload')}
                </Button>
                <Button size="sm" onClick={() => {
                  setEntryName('');
                  setEntryContent('');
                  setEntryType('qa');
                  setCreateKnowledgeOpen(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('button.create')}
                </Button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            <p className="font-medium">{tc('error.backendNotConnected')}</p>
          </div>
        )}

        {!selectedBaseId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{t('empty.selectBase')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Search & Filter bar */}
            <div className="flex items-center gap-3 px-6 py-3 border-b bg-muted/20">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-9"
                  placeholder={t('search.placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 w-[120px] text-sm"
              >
                <option value="all">{t('filter.allType')}</option>
                {uniqueTypes.map((typeKey) => (
                  <option key={typeKey} value={typeKey}>
                    {t('type.' + (typeKeyMap[typeKey] || typeKey))}
                  </option>
                ))}
              </Select>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 w-[120px] text-sm"
              >
                <option value="all">{t('filter.allStatus')}</option>
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {t('status.' + key)}
                  </option>
                ))}
              </Select>
              {(typeFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => {
                    setTypeFilter('all');
                    setStatusFilter('all');
                    setSearchQuery('');
                  }}
                >
                  <Filter className="mr-1 h-3.5 w-3.5" />
                  {t('filter.clear')}
                </Button>
              )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto px-6">
              {docsLoading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">{tc('loading')}</div>
              ) : paginatedDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <FileText className="h-10 w-10 mb-3 opacity-30" />
                  <p>{searchQuery || typeFilter !== 'all' || statusFilter !== 'all' ? t('empty.noMatch') : t('empty.noKnowledge')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <input
                          type="checkbox"
                          checked={selectedDocs.size === paginatedDocs.length && paginatedDocs.length > 0}
                          onChange={handleSelectAll}
                          className="rounded"
                        />
                      </TableHead>
                      <TableHead className="min-w-[300px]">{t('table.fileName')}</TableHead>
                      <TableHead className="w-[100px]">{t('table.type')}</TableHead>
                      <TableHead className="w-[100px]">{t('table.status')}</TableHead>
                      <TableHead className="w-[120px]">{t('table.category')}</TableHead>
                      <TableHead className="w-[160px]">{t('table.createdAt')}</TableHead>
                      <TableHead className="w-[110px]">{t('table.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDocs.map((doc) => {
                      const sCfg = statusConfig[doc.status] || statusConfig.pending;
                      const statusLabel = t('status.' + (doc.status in statusConfig ? doc.status : 'pending'));
                      const typeLabel = t('type.' + (typeKeyMap[doc.type] || doc.type));
                      const catName = categories.find((c) => c.id === doc.categoryId)?.name;
                      return (
                        <TableRow key={doc.id} className="hover:bg-muted/50">
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedDocs.has(doc.id)}
                              onChange={() => toggleDocSelection(doc.id)}
                              className="rounded"
                            />
                          </TableCell>
                          <TableCell>
                            <button
                              className="flex items-center gap-2 text-left hover:text-primary transition-colors"
                              onClick={() => handleOpenPreview(doc.id)}
                            >
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="truncate" title={doc.name}>{doc.name}</span>
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal">
                              {typeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sCfg.color}`}>
                              {statusLabel}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{catName || '-'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(doc.createdAt), 'yyyy-MM-dd HH:mm', { locale: getDateLocale() })}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleOpenPreview(doc.id)}
                                title={tc('view')}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {doc.type === 'richtext' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => {
                                    handleOpenPreview(doc.id);
                                    // Defer to let preview load first
                                    setTimeout(() => setIsEditing(true), 300);
                                  }}
                                  title={tc('edit')}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  if (confirm(t('confirm.deleteDoc'))) deleteDocMutation.mutate(doc.id);
                                }}
                                title={tc('delete')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Pagination */}
            {filteredDocs.length > 0 && (
              <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/20 text-sm">
                <span className="text-muted-foreground">
                  {t('pagination.total', { count: filteredDocs.length })}
                  {selectedDocs.size > 0 && ` · ${t('pagination.selected', { count: selectedDocs.size })}`}
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                    >
                      ‹
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 7) {
                        page = i + 1;
                      } else if (currentPage <= 4) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 3) {
                        page = totalPages - 6 + i;
                      } else {
                        page = currentPage - 3 + i;
                      }
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      ›
                    </Button>
                  </div>
                  <Select
                    value={String(pageSize)}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-7 w-[100px] text-xs"
                  >
                    {PAGE_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {t('pagination.perPage', { count: s })}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ==================== Context Menu ==================== */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: t('action.addSubCategory'),
              icon: <FolderPlus className="h-4 w-4" />,
              onClick: () => {
                setParentCategoryId(contextMenu.category.id);
                setCategoryName('');
                setAddCategoryOpen(true);
              },
            },
            {
              label: t('action.rename'),
              icon: <Pencil className="h-4 w-4" />,
              onClick: () => {
                setEditingCategory(contextMenu.category);
                setCategoryName(contextMenu.category.name);
                setRenameCategoryOpen(true);
              },
            },
            {
              label: t('action.deleteCategory'),
              icon: <Trash2 className="h-4 w-4" />,
              danger: true,
              onClick: () => {
                if (confirm(t('confirm.deleteCategory', { name: contextMenu.category.name }))) {
                  deleteCategoryMutation.mutate(contextMenu.category.id);
                }
              },
            },
          ]}
        />
      )}

      {/* ==================== Dialogs ==================== */}

      {/* Create knowledge base */}
      <SimpleDialog open={createBaseOpen} onOpenChange={setCreateBaseOpen} title={t('dialog.createBase')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (baseName.trim()) createBaseMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label>{tc('name')}</Label>
            <Input value={baseName} onChange={(e) => setBaseName(e.target.value)} placeholder={t('placeholder.baseName')} />
          </div>
          <div>
            <Label>{tc('description')}</Label>
            <Textarea value={baseDesc} onChange={(e) => setBaseDesc(e.target.value)} placeholder={t('placeholder.baseDesc')} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateBaseOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={!baseName.trim() || createBaseMutation.isPending}>
              {tc('create')}
            </Button>
          </div>
        </form>
      </SimpleDialog>

      {/* Add category */}
      <SimpleDialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen} title={t('dialog.addCategory')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (categoryName.trim()) createCategoryMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label>{t('label.categoryName')}</Label>
            <Input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder={t('placeholder.categoryName')}
              autoFocus
            />
          </div>
          {parentCategoryId && (
            <p className="text-sm text-muted-foreground">
              {t('label.parentCategory')}：{categories.find((c) => c.id === parentCategoryId)?.name}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAddCategoryOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={!categoryName.trim() || createCategoryMutation.isPending}>
              {tc('create')}
            </Button>
          </div>
        </form>
      </SimpleDialog>

      {/* Rename category */}
      <SimpleDialog open={renameCategoryOpen} onOpenChange={setRenameCategoryOpen} title={t('dialog.renameCategory')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (categoryName.trim()) renameCategoryMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label>{t('label.categoryName')}</Label>
            <Input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder={t('placeholder.newName')}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRenameCategoryOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={!categoryName.trim() || renameCategoryMutation.isPending}>
              {tc('save')}
            </Button>
          </div>
        </form>
      </SimpleDialog>

      {/* Create knowledge entry */}
      <SimpleDialog open={createKnowledgeOpen} onOpenChange={setCreateKnowledgeOpen} title={t('dialog.createEntry')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (entryName.trim() && entryContent.trim()) createEntryMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label>{t('label.entryTitle')}</Label>
            <Input
              value={entryName}
              onChange={(e) => setEntryName(e.target.value)}
              placeholder={t('placeholder.entryTitle')}
            />
          </div>
          <div>
            <Label>{t('label.entryContent')}</Label>
            <Textarea
              value={entryContent}
              onChange={(e) => setEntryContent(e.target.value)}
              placeholder={t('placeholder.qaFormat')}
              rows={8}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateKnowledgeOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!entryName.trim() || !entryContent.trim() || createEntryMutation.isPending}
            >
              {createEntryMutation.isPending ? tc('creating') : tc('create')}
            </Button>
          </div>
        </form>
      </SimpleDialog>

      {/* Preview / Edit document */}
      <SimpleDialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewOpen(false);
            setPreviewDoc(null);
            setIsEditing(false);
          }
        }}
        title={
          previewLoading
            ? tc('loading')
            : isEditing
              ? t('dialog.editEntry')
              : previewDoc?.name || t('dialog.docPreview')
        }
      >
        {previewLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            {tc('loading')}
          </div>
        ) : previewDoc ? (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{t('type.' + (typeKeyMap[previewDoc.type] || previewDoc.type))}</Badge>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig[previewDoc.status]?.color || ''}`}>
                {t('status.' + (previewDoc.status in statusConfig ? previewDoc.status : 'pending'))}
              </span>
              <span>·</span>
              <span>{format(new Date(previewDoc.createdAt), 'yyyy-MM-dd HH:mm', { locale: getDateLocale() })}</span>
            </div>

            {isEditing ? (
              /* ---- Edit mode ---- */
              <>
                <div>
                  <Label>{t('label.entryTitle')}</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t('label.entryTitle')}
                  />
                </div>
                <div>
                  <Label>{t('label.entryContent')}</Label>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder={t('placeholder.editContent')}
                    rows={16}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    {tc('cancel')}
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={updateDocMutation.isPending || (!editName.trim())}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {updateDocMutation.isPending ? tc('saving') : tc('save')}
                  </Button>
                </div>
              </>
            ) : (
              /* ---- Preview mode ---- */
              <>
                {/* Content */}
                {previewDoc.content ? (
                  <div className="rounded-lg border bg-muted/30 p-4 max-h-[60vh] overflow-auto">
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                      {previewDoc.content}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>
                      {previewDoc.status === 'pending' || previewDoc.status === 'processing'
                        ? t('dialog.docProcessing')
                        : t('dialog.noContent')}
                    </p>
                  </div>
                )}

                {/* Chunks preview */}
                {previewDoc.chunks && previewDoc.chunks.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors py-1">
                      {t('dialog.viewChunks', { count: previewDoc.chunks.length })}
                    </summary>
                    <div className="mt-2 space-y-2 max-h-[30vh] overflow-auto">
                      {previewDoc.chunks.map((chunk, i) => (
                        <div
                          key={chunk.id}
                          className="rounded border bg-background p-3 text-xs"
                        >
                          <span className="text-muted-foreground font-medium">#{i + 1}</span>
                          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{chunk.content}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* Action buttons */}
                <div className="flex justify-end gap-2">
                  {previewDoc.type === 'richtext' && (
                    <Button variant="outline" onClick={handleStartEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {tc('edit')}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                    {tc('close')}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </SimpleDialog>
    </div>
  );
}
