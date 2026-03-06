'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, StaleIndicator } from './shared';
import {
  type Risk,
  type RiskStatus,
  type RiskSummary,
  VALID_RISK_TRANSITIONS,
  getScoreColor,
  getStatusColor,
  classifyScore,
  generateCSVExport,
  generateJSONExport,
} from '../../lib/risk-domain';

export default function RiskRegister() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editRisk, setEditRisk] = useState<Risk | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'high'>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/tracking/risks');
      if (!response.ok) throw new Error('Failed to fetch risks');
      const result = await response.json();
      setRisks(result.risks || []);
      setSummary(result.summary || null);
      setLastUpdated(result.lastUpdated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddRisk = async (newRisk: Partial<Risk>) => {
    try {
      const response = await fetch('/api/tracking/risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', risk: newRisk }),
      });
      if (!response.ok) throw new Error('Failed to add risk');
      await fetchData();
      setShowAddModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add risk');
    }
  };

  const handleEditRisk = async (riskId: string, updates: Partial<Risk>) => {
    try {
      const response = await fetch('/api/tracking/risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', riskId, updates }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to edit risk');
      }
      await fetchData();
      setEditRisk(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit risk');
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    const dateStr = new Date().toISOString().split('T')[0];
    if (format === 'csv') {
      const csv = generateCSVExport(filteredRisks);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `risk-register-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const json = generateJSONExport(
        filteredRisks,
        summary || {
          total: 0,
          open: 0,
          mitigated: 0,
          monitoring: 0,
          closed: 0,
          inProgress: 0,
          accepted: 0,
          highRisk: 0,
          mediumRisk: 0,
          lowRisk: 0,
        }
      );
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `risk-register-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setShowExportMenu(false);
  };

  const filteredRisks = risks.filter((risk) => {
    if (filter === 'open') return risk.status === 'Open' || risk.status === 'In Progress';
    if (filter === 'high') return risk.score >= 15;
    return true;
  });

  const categories = [...new Set(risks.map((r) => r.category))];

  if (loading && risks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" className="animate-spin text-blue-500" size="2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
        <div className="flex items-center gap-2">
          <Icon name="error" size="lg" />
          <span>Error: {error}</span>
        </div>
        <button onClick={fetchData} className="mt-2 text-sm underline hover:no-underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="warning" className="text-yellow-600" size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Risk Register</h3>
            {lastUpdated && (
              <StaleIndicator lastUpdated={lastUpdated} thresholdMinutes={43200} showTime />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <Icon name="add" size="base" />
            Add Risk
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              <Icon name="download" size="base" />
              Export
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => handleExport('csv')}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export JSON
                </button>
              </div>
            )}
          </div>
          <RefreshButton onRefresh={fetchData} label="Reload" />
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
            <div className="text-sm text-gray-500">Total Risks</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600">{summary.open}</div>
            <div className="text-sm text-gray-500">Open</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-600">{summary.inProgress}</div>
            <div className="text-sm text-gray-500">In Progress</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">{summary.mitigated}</div>
            <div className="text-sm text-gray-500">Mitigated</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-600">{summary.accepted}</div>
            <div className="text-sm text-gray-500">Accepted</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-orange-600">{summary.highRisk}</div>
            <div className="text-sm text-gray-500">High Risk</div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'open', 'high'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            {f === 'all' ? 'All' : f === 'open' ? 'Open Only' : 'High Risk'}
          </button>
        ))}
      </div>

      {/* Risk Table */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-500 p-3">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 p-3">Category</th>
              <th className="text-left text-xs font-medium text-gray-500 p-3">Description</th>
              <th className="text-center text-xs font-medium text-gray-500 p-3">Score</th>
              <th className="text-center text-xs font-medium text-gray-500 p-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 p-3">Owner</th>
              <th className="text-center text-xs font-medium text-gray-500 p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRisks.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-gray-500 py-8">
                  No risks found
                </td>
              </tr>
            ) : (
              filteredRisks.map((risk) => (
                <Fragment key={risk.id}>
                  <tr
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                      expandedRow === risk.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setExpandedRow(expandedRow === risk.id ? null : risk.id)}
                  >
                    <td className="p-3 font-mono text-sm text-blue-600">{risk.id}</td>
                    <td className="p-3 text-sm text-gray-700">{risk.category}</td>
                    <td
                      className="p-3 text-sm text-gray-700 max-w-xs truncate"
                      title={risk.description}
                    >
                      {risk.description}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border ${getScoreColor(risk.score)}`}
                        title={classifyScore(risk.score)}
                      >
                        {risk.score}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(risk.status)}`}>
                        {risk.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-gray-500">{risk.owner}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditRisk(risk);
                        }}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title="Edit risk"
                      >
                        <Icon name="edit" size="base" />
                      </button>
                    </td>
                  </tr>
                  {expandedRow === risk.id && (
                    <tr>
                      <td colSpan={7} className="bg-blue-50 border-b border-blue-100 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">
                              Mitigation Strategy
                            </h4>
                            <p className="text-sm text-gray-600">
                              {risk.mitigation || 'No mitigation defined'}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">
                              Escalation Path
                            </h4>
                            <p className="text-sm text-gray-600">
                              {risk.escalationPath || 'Not defined'}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">Evidence</h4>
                            <p className="text-sm text-gray-600">
                              {risk.evidence || 'No evidence'}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">Notes</h4>
                            <p className="text-sm text-gray-600">{risk.notes || 'No notes'}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">
                              Last Reviewed
                            </h4>
                            <p className="text-sm text-gray-600">{risk.lastReviewed}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">Review Date</h4>
                            <p className="text-sm text-gray-600">
                              {risk.reviewDate}
                              {risk.reviewDate &&
                                /^\d{4}-\d{2}-\d{2}$/.test(risk.reviewDate) &&
                                new Date(risk.reviewDate) < new Date() && (
                                  <span className="ml-2 text-xs text-red-500 font-medium">
                                    OVERDUE
                                  </span>
                                )}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditRisk(risk);
                            }}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            Edit Risk
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Risk Modal (Add/Edit) */}
      {(showAddModal || editRisk) && (
        <RiskModal
          onClose={() => {
            setShowAddModal(false);
            setEditRisk(null);
          }}
          onAdd={handleAddRisk}
          onEdit={handleEditRisk}
          editRisk={editRisk ?? undefined}
          categories={categories}
        />
      )}
    </div>
  );
}

function RiskModal({
  onClose,
  onAdd,
  onEdit,
  editRisk,
  categories,
}: {
  onClose: () => void;
  onAdd: (risk: Partial<Risk>) => void;
  onEdit: (riskId: string, updates: Partial<Risk>) => void;
  editRisk?: Risk;
  categories: string[];
}) {
  const isEdit = !!editRisk;
  const allCategories = [...new Set([...categories, 'Other'])];

  const [formData, setFormData] = useState({
    category: editRisk?.category || categories[0] || 'Technical',
    description: editRisk?.description || '',
    impact: editRisk?.impact || 3,
    likelihood: editRisk?.likelihood || 3,
    owner: editRisk?.owner || '',
    mitigation: editRisk?.mitigation || '',
    status: editRisk?.status || ('Open' as RiskStatus),
    escalationPath: editRisk?.escalationPath || '',
    evidence: editRisk?.evidence || '',
    notes: editRisk?.notes || '',
  });

  const computedScore = formData.impact * formData.likelihood;
  const validTransitions = isEdit ? (VALID_RISK_TRANSITIONS[editRisk?.status ?? 'Open'] ?? []) : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim()) return;

    if (isEdit) {
      const updates: Partial<Risk> = {};
      if (formData.category !== editRisk!.category) updates.category = formData.category;
      if (formData.description !== editRisk!.description)
        updates.description = formData.description;
      if (formData.impact !== editRisk!.impact) updates.impact = formData.impact;
      if (formData.likelihood !== editRisk!.likelihood) updates.likelihood = formData.likelihood;
      if (formData.status !== editRisk!.status) updates.status = formData.status;
      if (formData.owner !== editRisk!.owner) updates.owner = formData.owner;
      if (formData.mitigation !== editRisk!.mitigation) updates.mitigation = formData.mitigation;
      if (formData.escalationPath !== editRisk!.escalationPath)
        updates.escalationPath = formData.escalationPath;
      if (formData.evidence !== editRisk!.evidence) updates.evidence = formData.evidence;
      if (formData.notes !== editRisk!.notes) updates.notes = formData.notes;
      onEdit(editRisk!.id, updates);
    } else {
      onAdd({
        category: formData.category,
        description: formData.description,
        impact: formData.impact,
        likelihood: formData.likelihood,
        owner: formData.owner,
        mitigation: formData.mitigation,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg border border-gray-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Risk' : 'Add New Risk'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Icon name="close" size="lg" />
          </button>
        </div>

        {isEdit && (
          <div className="mb-4 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
            Risk ID: <span className="font-mono font-medium">{editRisk!.id}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
            >
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              rows={3}
              placeholder="Describe the risk..."
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Impact (1-5)</label>
              <select
                value={formData.impact}
                onChange={(e) => setFormData({ ...formData, impact: parseInt(e.target.value) })}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Likelihood (1-5)</label>
              <select
                value={formData.likelihood}
                onChange={(e) => setFormData({ ...formData, likelihood: parseInt(e.target.value) })}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Score</label>
              <div
                className={`flex items-center justify-center h-[42px] rounded-lg border text-sm font-bold ${getScoreColor(computedScore)}`}
              >
                {computedScore}
              </div>
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as RiskStatus })}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              >
                <option value={editRisk?.status}>{editRisk?.status} (current)</option>
                {validTransitions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-600 mb-1">Owner</label>
            <input
              type="text"
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              placeholder="Who is responsible?"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Mitigation</label>
            <textarea
              value={formData.mitigation}
              onChange={(e) => setFormData({ ...formData, mitigation: e.target.value })}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              rows={2}
              placeholder="How will this risk be mitigated?"
            />
          </div>

          {isEdit && (
            <>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Escalation Path</label>
                <input
                  type="text"
                  value={formData.escalationPath}
                  onChange={(e) => setFormData({ ...formData, escalationPath: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  placeholder="Who to escalate to..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Evidence</label>
                <input
                  type="text"
                  value={formData.evidence}
                  onChange={(e) => setFormData({ ...formData, evidence: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  placeholder="File paths, links, or descriptions..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  rows={2}
                  placeholder="Additional notes..."
                />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {isEdit ? 'Save Changes' : 'Add Risk'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
