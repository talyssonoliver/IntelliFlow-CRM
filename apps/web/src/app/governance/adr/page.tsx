'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@intelliflow/ui';

interface ADRMetadata {
  id: string;
  title: string;
  status: string;
  date: string;
  deciders: string;
  technicalStory: string;
  filePath: string;
  relatedADRs: string[];
  sprint: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ADRValidation extends ADRMetadata {
  validation: ValidationResult;
}

interface ADRStats {
  total: number;
  byStatus: Record<string, number>;
  validationSummary: { valid: number; withErrors: number; withWarnings: number };
}

type TabView = 'list' | 'index' | 'graph';

const VALID_STATUSES = ['Proposed', 'Accepted', 'Rejected', 'Deprecated', 'Superseded'];

export default function ADRRegistryPage() {
  const [activeTab, setActiveTab] = useState<TabView>('list');
  const [adrs, setAdrs] = useState<ADRMetadata[]>([]);
  const [validations, setValidations] = useState<ADRValidation[]>([]);
  const [stats, setStats] = useState<ADRStats | null>(null);
  const [indexContent, setIndexContent] = useState<string>('');
  const [graphContent, setGraphContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [indexLoading, setIndexLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [newAdrTitle, setNewAdrTitle] = useState('');
  const [newAdrStory, setNewAdrStory] = useState('');
  const [creating, setCreating] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [selectedAdr, setSelectedAdr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchADRs = useCallback(async () => {
    setLoading(true);
    try {
      const url = searchQuery
        ? `/api/adr?action=search&q=${encodeURIComponent(searchQuery)}`
        : '/api/adr?action=list';
      const response = await fetch(url);
      const result = await response.json();
      if (result.success) {
        setAdrs(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to fetch ADRs');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/adr?action=stats');
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  const fetchIndex = useCallback(async () => {
    setIndexLoading(true);
    try {
      const response = await fetch('/api/adr/index');
      const result = await response.json();
      if (result.success) {
        setIndexContent(result.data.content);
      }
    } catch (err) {
      console.error('Failed to fetch index:', err);
    } finally {
      setIndexLoading(false);
    }
  }, []);

  const fetchGraph = useCallback(async () => {
    try {
      const response = await fetch('/api/adr?action=graph');
      const result = await response.json();
      if (result.success) {
        setGraphContent(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch graph:', err);
    }
  }, []);

  const fetchValidations = useCallback(async () => {
    try {
      const response = await fetch('/api/adr/validate');
      const result = await response.json();
      if (result.success) {
        setValidations(result.data.validations);
      }
    } catch (err) {
      console.error('Failed to fetch validations:', err);
    }
  }, []);

  useEffect(() => {
    fetchADRs();
    fetchStats();
  }, [fetchADRs, fetchStats]);

  useEffect(() => {
    if (activeTab === 'index' && !indexContent) {
      fetchIndex();
    }
    if (activeTab === 'graph' && !graphContent) {
      fetchGraph();
    }
  }, [activeTab, indexContent, graphContent, fetchIndex, fetchGraph]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchADRs();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdrTitle.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/adr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newAdrTitle,
          technicalStory: newAdrStory || undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccessMessage(`ADR created: ${result.data.path}`);
        setNewAdrTitle('');
        setNewAdrStory('');
        setShowCreateModal(false);
        fetchADRs();
        fetchStats();
        setIndexContent(''); // Reset index to refetch
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to create ADR');
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateIndex = async () => {
    setGeneratingIndex(true);
    setError(null);

    try {
      const response = await fetch('/api/adr/index', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        setSuccessMessage(`Index generated: ${result.data.path}`);
        fetchIndex(); // Refresh the index content
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to generate index');
    } finally {
      setGeneratingIndex(false);
    }
  };

  const handleStatusUpdate = async (adrId: string, newStatus: string) => {
    setStatusUpdating(adrId);
    setError(null);

    try {
      const response = await fetch('/api/adr/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: adrId, status: newStatus }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccessMessage(`Status updated to ${newStatus}`);
        fetchADRs();
        fetchStats();
        setIndexContent(''); // Reset index to refetch
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to update status');
    } finally {
      setStatusUpdating(null);
      setSelectedAdr(null);
    }
  };

  const handleValidate = async () => {
    setShowValidationPanel(true);
    await fetchValidations();
  };

  // Clear messages after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const getStatusBadgeClass = (status: string) => {
    if (status.includes('Accepted')) {
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    }
    if (status.includes('Proposed')) {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    }
    if (status.includes('Rejected') || status.includes('Deprecated')) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccessMessage('Copied to clipboard');
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl">
        {/* Messages */}
        {successMessage && (
          <div className="mb-4 p-4 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined">check_circle</span>
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">ADR Registry</h1>
              <p className="text-muted-foreground mt-1">
                Architecture Decision Records and their compliance mappings
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleValidate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-foreground text-sm font-medium hover:bg-accent transition-colors"
              >
                <span className="material-symbols-outlined text-lg">checklist</span>
                Validate
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                New ADR
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'list'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-symbols-outlined text-lg align-middle mr-1">list</span>
              List
            </button>
            <button
              onClick={() => setActiveTab('index')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'index'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-symbols-outlined text-lg align-middle mr-1">article</span>
              Index
            </button>
            <button
              onClick={() => setActiveTab('graph')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'graph'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-symbols-outlined text-lg align-middle mr-1">account_tree</span>
              Graph
            </button>
          </div>
        </div>

        {/* Stats (always visible) */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-5 mb-6">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Total ADRs</p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Accepted</p>
              <p className="text-2xl font-bold text-emerald-500">{stats.byStatus['Accepted'] || 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Proposed</p>
              <p className="text-2xl font-bold text-amber-500">{stats.byStatus['Proposed'] || 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Valid</p>
              <p className="text-2xl font-bold text-emerald-500">{stats.validationSummary.valid}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">With Issues</p>
              <p className="text-2xl font-bold text-red-500">
                {stats.validationSummary.withErrors + stats.validationSummary.withWarnings}
              </p>
            </Card>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'list' && (
          <>
            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-3 mb-6">
              <div className="relative flex-1 max-w-md">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ADRs by title or content..."
                  className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-card border border-border rounded-lg text-foreground text-sm font-medium hover:bg-accent transition-colors"
              >
                Search
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    fetchADRs();
                  }}
                  className="px-4 py-2 text-muted-foreground hover:text-foreground text-sm"
                >
                  Clear
                </button>
              )}
            </form>

            {/* ADR List */}
            <Card>
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">Loading ADRs...</div>
              ) : adrs.length === 0 ? (
                <div className="p-8 text-center">
                  <span className="material-symbols-outlined text-4xl text-muted-foreground mb-2">
                    architecture
                  </span>
                  <p className="text-muted-foreground">
                    {searchQuery ? 'No ADRs found matching your search' : 'No ADRs found'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          ADR
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Sprint
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Date
                        </th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {adrs.map((adr) => (
                        <tr key={adr.id} className="hover:bg-accent/50 transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-foreground">
                                {adr.id}: {adr.title}
                              </p>
                              {adr.technicalStory && (
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  Story: {adr.technicalStory}
                                </p>
                              )}
                              {adr.relatedADRs.length > 0 && (
                                <div className="flex gap-1 mt-1">
                                  {adr.relatedADRs.slice(0, 3).map((related) => (
                                    <span
                                      key={related}
                                      className="inline-flex px-1.5 py-0.5 text-xs bg-muted rounded"
                                    >
                                      {related}
                                    </span>
                                  ))}
                                  {adr.relatedADRs.length > 3 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{adr.relatedADRs.length - 3} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {selectedAdr === adr.id ? (
                              <div className="flex flex-col gap-1">
                                {VALID_STATUSES.map((status) => (
                                  <button
                                    key={status}
                                    onClick={() => handleStatusUpdate(adr.id, status)}
                                    disabled={statusUpdating === adr.id}
                                    className={`text-left px-2 py-1 text-xs rounded hover:bg-accent transition-colors ${
                                      adr.status.includes(status) ? 'font-bold' : ''
                                    }`}
                                  >
                                    {status}
                                  </button>
                                ))}
                                <button
                                  onClick={() => setSelectedAdr(null)}
                                  className="text-left px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setSelectedAdr(adr.id)}
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(adr.status)}`}
                              >
                                {adr.status}
                                <span className="material-symbols-outlined text-sm">edit</span>
                              </button>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            Sprint {adr.sprint}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">{adr.date}</td>
                          <td className="px-6 py-4 text-right">
                            <button className="text-primary hover:underline text-sm">View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {activeTab === 'index' && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Auto-Generated Index</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(indexContent)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">content_copy</span>
                  Copy
                </button>
                <button
                  onClick={handleGenerateIndex}
                  disabled={generatingIndex}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-lg">
                    {generatingIndex ? 'sync' : 'save'}
                  </span>
                  {generatingIndex ? 'Generating...' : 'Save to File'}
                </button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              This index is auto-generated from all ADR files. Click "Save to File" to write it to{' '}
              <code className="px-1 py-0.5 bg-muted rounded">docs/shared/adr-index.md</code>
            </p>
            {indexLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading index...</div>
            ) : (
              <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm text-foreground whitespace-pre-wrap font-mono">
                {indexContent}
              </pre>
            )}
          </Card>
        )}

        {activeTab === 'graph' && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Dependency Graph</h2>
              <button
                onClick={() => copyToClipboard('```mermaid\n' + graphContent + '\n```')}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="material-symbols-outlined text-lg">content_copy</span>
                Copy Mermaid
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              This graph shows relationships between ADRs. Copy the Mermaid code to render it in any
              Mermaid-compatible viewer.
            </p>
            <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm text-foreground whitespace-pre font-mono">
              {graphContent || 'Loading graph...'}
            </pre>
          </Card>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-foreground">Create New ADR</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newAdrTitle}
                    onChange={(e) => setNewAdrTitle(e.target.value)}
                    placeholder="e.g., Event-Driven Architecture"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Technical Story (Optional)
                  </label>
                  <input
                    type="text"
                    value={newAdrStory}
                    onChange={(e) => setNewAdrStory(e.target.value)}
                    placeholder="e.g., IFC-108"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !newAdrTitle.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create ADR'}
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Validation Panel */}
        {showValidationPanel && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-lg font-bold text-foreground">ADR Validation Results</h2>
                <button
                  onClick={() => setShowValidationPanel(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {validations.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Loading validations...</p>
                ) : (
                  <div className="space-y-4">
                    {validations.map((v) => (
                      <div
                        key={v.id}
                        className={`p-4 rounded-lg border ${
                          !v.validation.valid
                            ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                            : v.validation.warnings.length > 0
                            ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                            : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`material-symbols-outlined ${
                              !v.validation.valid
                                ? 'text-red-500'
                                : v.validation.warnings.length > 0
                                ? 'text-amber-500'
                                : 'text-emerald-500'
                            }`}
                          >
                            {!v.validation.valid
                              ? 'error'
                              : v.validation.warnings.length > 0
                              ? 'warning'
                              : 'check_circle'}
                          </span>
                          <span className="font-medium text-foreground">
                            {v.id}: {v.title}
                          </span>
                        </div>
                        {v.validation.errors.length > 0 && (
                          <div className="ml-7 space-y-1">
                            {v.validation.errors.map((err, i) => (
                              <p key={i} className="text-sm text-red-600 dark:text-red-400">
                                Error: {err}
                              </p>
                            ))}
                          </div>
                        )}
                        {v.validation.warnings.length > 0 && (
                          <div className="ml-7 space-y-1">
                            {v.validation.warnings.map((warning, i) => (
                              <p key={i} className="text-sm text-amber-600 dark:text-amber-400">
                                Warning: {warning}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
