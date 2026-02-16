'use client';

import { useState, useRef, useCallback, useMemo, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Skeleton, Badge, Card } from '@intelliflow/ui';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/pricing/calculator';
import { getAccountTier, TIER_CONFIG } from './AccountCard';

interface HierarchyNode {
  id: string;
  name: string;
  industry?: string;
  revenue?: number;
  _count: { contacts: number; opportunities: number };
  children: HierarchyNode[];
}

interface HierarchyAncestor {
  id: string;
  name: string;
}

interface HierarchyData {
  ancestors: HierarchyAncestor[];
  current: HierarchyNode;
  rootAccount: HierarchyAncestor | null;
}

interface AccountHierarchyProps {
  accountId: string;
}

interface TreeNodeProps {
  node: HierarchyNode;
  currentId: string;
  level: number;
  expandedNodes: Set<string>;
  focusedNodeId: string | null;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
  onNavigate: (id: string) => void;
  nodeRefs: React.MutableRefObject<Map<string, HTMLLIElement>>;
}

function TreeNode({
  node,
  currentId,
  level,
  expandedNodes,
  focusedNodeId,
  onToggle,
  onFocus,
  onNavigate,
  nodeRefs,
}: TreeNodeProps) {
  const isExpanded = expandedNodes.has(node.id);
  const isCurrent = node.id === currentId;
  const isFocused = node.id === focusedNodeId;
  const hasChildren = node.children.length > 0;
  const tier = getAccountTier(node.revenue);
  const tierConfig = TIER_CONFIG[tier];

  return (
    <li
      ref={(el) => {
        if (el) nodeRefs.current.set(node.id, el);
      }}
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isCurrent}
      tabIndex={isFocused ? 0 : -1}
      className={`outline-none ${level > 0 ? 'ml-6 border-l border-border pl-3' : ''}`}
      onFocus={() => onFocus(node.id)}
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors
          ${isCurrent ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'}
          ${isFocused ? 'ring-2 ring-ring' : ''}`}
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          onFocus(node.id);
        }}
      >
        {hasChildren ? (
          <button
            className="p-0.5 rounded hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <span className="material-symbols-outlined text-base text-muted-foreground">
              {isExpanded ? 'expand_more' : 'chevron_right'}
            </span>
          </button>
        ) : (
          <span className="w-6" />
        )}

        <span className={`w-2 h-2 rounded-full shrink-0 ${tierConfig.dot}`} />

        <button
          className="text-sm font-medium text-foreground hover:text-primary hover:underline text-left truncate"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(node.id);
          }}
        >
          {node.name}
          {isCurrent && <span className="text-xs text-primary ml-1">(current)</span>}
        </button>

        {node.industry && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {node.industry}
          </Badge>
        )}

        {node.revenue != null && (
          <span className="text-xs text-muted-foreground shrink-0 ml-auto">
            {formatCurrency(node.revenue)}
          </span>
        )}

        <span className="text-[10px] text-muted-foreground shrink-0">
          {node._count.contacts}C &middot; {node._count.opportunities}O
        </span>
      </div>

      {hasChildren && isExpanded && (
        <ul role="group" className="mt-0.5">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              currentId={currentId}
              level={level + 1}
              expandedNodes={expandedNodes}
              focusedNodeId={focusedNodeId}
              onToggle={onToggle}
              onFocus={onFocus}
              onNavigate={onNavigate}
              nodeRefs={nodeRefs}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function flattenVisibleNodes(node: HierarchyNode, expandedNodes: Set<string>): string[] {
  const result: string[] = [node.id];
  if (expandedNodes.has(node.id)) {
    for (const child of node.children) {
      result.push(...flattenVisibleNodes(child, expandedNodes));
    }
  }
  return result;
}

function findParentId(root: HierarchyNode, targetId: string): string | null {
  for (const child of root.children) {
    if (child.id === targetId) return root.id;
    const found = findParentId(child, targetId);
    if (found) return found;
  }
  return null;
}

function findNode(root: HierarchyNode, id: string): HierarchyNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function AccountHierarchy({ accountId }: AccountHierarchyProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([accountId]));
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const nodeRefs = useRef(new Map<string, HTMLLIElement>());

  const hierarchyQuery = api.account.getHierarchy.useQuery({ accountId });
  const data: HierarchyData | undefined = hierarchyQuery.data;
  const isLoading = hierarchyQuery.isLoading;
  const error = hierarchyQuery.error;
  const setParentMutation = api.account.setParent.useMutation({
    onSuccess: () => {
      utils.account.getHierarchy.invalidate({ accountId });
    },
  });

  const pickerQuery = api.account.list.useQuery(
    { search: pickerSearch, page: 1, limit: 10 },
    { enabled: showPicker && pickerSearch.length >= 2 }
  );

  const onToggle = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onNavigate = useCallback(
    (id: string) => {
      router.push(`/accounts/${id}`);
    },
    [router]
  );

  const visibleNodes = useMemo(() => {
    if (!data?.current) return [];
    return flattenVisibleNodes(data.current, expandedNodes);
  }, [data?.current, expandedNodes]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLUListElement>) => {
      if (!focusedNodeId || !data?.current) return;
      const idx = visibleNodes.indexOf(focusedNodeId);
      if (idx === -1) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (idx < visibleNodes.length - 1) {
            const nextId = visibleNodes[idx + 1];
            setFocusedNodeId(nextId);
            nodeRefs.current.get(nextId)?.focus();
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (idx > 0) {
            const prevId = visibleNodes[idx - 1];
            setFocusedNodeId(prevId);
            nodeRefs.current.get(prevId)?.focus();
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const node = findNode(data.current, focusedNodeId);
          if (node && node.children.length > 0) {
            if (!expandedNodes.has(focusedNodeId)) {
              onToggle(focusedNodeId);
            } else {
              const firstChild = node.children[0].id;
              setFocusedNodeId(firstChild);
              nodeRefs.current.get(firstChild)?.focus();
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (expandedNodes.has(focusedNodeId)) {
            onToggle(focusedNodeId);
          } else {
            const parentId = findParentId(data.current, focusedNodeId);
            if (parentId) {
              setFocusedNodeId(parentId);
              nodeRefs.current.get(parentId)?.focus();
            }
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          onNavigate(focusedNodeId);
          break;
        }
        case 'Home': {
          e.preventDefault();
          if (visibleNodes.length > 0) {
            const firstId = visibleNodes[0];
            setFocusedNodeId(firstId);
            nodeRefs.current.get(firstId)?.focus();
          }
          break;
        }
        case 'End': {
          e.preventDefault();
          if (visibleNodes.length > 0) {
            const lastId = visibleNodes[visibleNodes.length - 1];
            setFocusedNodeId(lastId);
            nodeRefs.current.get(lastId)?.focus();
          }
          break;
        }
      }
    },
    [focusedNodeId, visibleNodes, expandedNodes, data?.current, onToggle, onNavigate]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <span className="material-symbols-outlined text-3xl mb-2">error</span>
        <p className="text-sm">Failed to load hierarchy</p>
      </div>
    );
  }

  if (!data) return null;

  const hasHierarchy = data.ancestors.length > 0 || data.current.children.length > 0;

  return (
    <div className="space-y-4">
      {data.ancestors.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          {data.ancestors.map((ancestor, i) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              {i > 0 && <span className="material-symbols-outlined text-xs">chevron_right</span>}
              <button
                className="hover:text-primary hover:underline"
                onClick={() => router.push(`/accounts/${ancestor.id}`)}
              >
                {ancestor.name}
              </button>
            </span>
          ))}
          <span className="material-symbols-outlined text-xs">chevron_right</span>
          <span className="font-medium text-foreground">{data.current.name}</span>
        </div>
      )}

      {hasHierarchy ? (
        <Card className="p-4">
          <ul role="tree" aria-label="Account hierarchy" onKeyDown={handleKeyDown}>
            <TreeNode
              node={data.current}
              currentId={accountId}
              level={0}
              expandedNodes={expandedNodes}
              focusedNodeId={focusedNodeId}
              onToggle={onToggle}
              onFocus={setFocusedNodeId}
              onNavigate={onNavigate}
              nodeRefs={nodeRefs}
            />
          </ul>
        </Card>
      ) : (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-4xl text-muted-foreground mb-3">
            account_tree
          </span>
          <p className="text-muted-foreground">This account has no parent or child accounts.</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
          <span className="material-symbols-outlined text-base mr-1">link</span>
          Set Parent Account
        </Button>
        {data.ancestors.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setParentMutation.mutate({ accountId, parentAccountId: null })}
            disabled={setParentMutation.isPending}
          >
            <span className="material-symbols-outlined text-base mr-1">link_off</span>
            Remove Parent
          </Button>
        )}
      </div>

      {showPicker && (
        <Card className="p-4 border-2 border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Select Parent Account</h4>
            <button className="p-1 rounded hover:bg-muted" onClick={() => setShowPicker(false)}>
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground mb-3"
            placeholder="Search accounts..."
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            autoFocus
          />
          {pickerQuery.isLoading && <Skeleton className="h-8 w-full" />}
          {pickerQuery.data?.accounts && (
            <div className="max-h-48 overflow-y-auto divide-y">
              {pickerQuery.data.accounts
                .filter((a: any) => a.id !== accountId)
                .map((account: any) => (
                  <button
                    key={account.id}
                    className="flex items-center gap-2 px-2 py-2 w-full text-left hover:bg-muted/50 rounded text-sm"
                    onClick={() => {
                      setParentMutation.mutate({ accountId, parentAccountId: account.id });
                      setShowPicker(false);
                      setPickerSearch('');
                    }}
                  >
                    <span className="material-symbols-outlined text-base text-muted-foreground">
                      domain
                    </span>
                    <span className="truncate">{account.name}</span>
                  </button>
                ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
