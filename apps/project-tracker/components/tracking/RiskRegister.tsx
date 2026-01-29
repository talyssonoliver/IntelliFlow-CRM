'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, StaleIndicator } from './shared';

interface Risk {
  id: string;
  category: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  likelihood: 'High' | 'Medium' | 'Low';
  score: number;
  status: 'Open' | 'Mitigated' | 'Closed' | 'Monitoring';
  owner: string;
  mitigation: string;
  lastReviewed: string;
}

interface RiskSummary {
  total: number;
  open: number;
  mitigated: number;
  monitoring: number;
  closed: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
}

export default function RiskRegister() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'high'>('all');

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
      alert(err instanceof Error ? err.message : 'Failed to add risk');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 6) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score >= 3) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open':
        return 'bg-red-500/20 text-red-400';
      case 'Mitigated':
        return 'bg-green-500/20 text-green-400';
      case 'Monitoring':
        return 'bg-blue-500/20 text-blue-400';
      case 'Closed':
        return 'bg-gray-500/20 text-gray-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const filteredRisks = risks.filter((risk) => {
    if (filter === 'open') return risk.status === 'Open';
    if (filter === 'high') return risk.score >= 6;
    return true;
  });

  if (loading && risks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" className="animate-spin text-blue-500" size="2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
        <div className="flex items-center gap-2">
          <Icon name="error" size="lg" />
          <span>Error: {error}</span>
        </div>
        <button
          onClick={fetchData}
          className="mt-2 text-sm underline hover:no-underline"
        >
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
          <Icon name="warning" className="text-yellow-400" size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-white">Risk Register</h3>
            {lastUpdated && (
              <StaleIndicator
                lastUpdated={lastUpdated}
                thresholdMinutes={43200}
                showTime
              />
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
          <RefreshButton onRefresh={fetchData} label="Reload" />
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-700/30 rounded-lg p-4">
            <div className="text-2xl font-bold text-white">{summary.total}</div>
            <div className="text-sm text-gray-400">Total Risks</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-400">{summary.open}</div>
            <div className="text-sm text-gray-400">Open</div>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-400">{summary.highRisk}</div>
            <div className="text-sm text-gray-400">High Risk</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">{summary.mitigated}</div>
            <div className="text-sm text-gray-400">Mitigated</div>
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
                : 'bg-gray-700/50 text-gray-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : f === 'open' ? 'Open Only' : 'High Risk'}
          </button>
        ))}
      </div>

      {/* Risk Table */}
      <div className="bg-gray-700/30 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-xs font-medium text-gray-400 p-3">ID</th>
              <th className="text-left text-xs font-medium text-gray-400 p-3">Category</th>
              <th className="text-left text-xs font-medium text-gray-400 p-3">Description</th>
              <th className="text-center text-xs font-medium text-gray-400 p-3">Score</th>
              <th className="text-center text-xs font-medium text-gray-400 p-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-400 p-3">Owner</th>
            </tr>
          </thead>
          <tbody>
            {filteredRisks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-gray-400 py-8">
                  No risks found
                </td>
              </tr>
            ) : (
              filteredRisks.map((risk) => (
                <tr key={risk.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-3 font-mono text-sm text-blue-400">{risk.id}</td>
                  <td className="p-3 text-sm text-gray-300">{risk.category}</td>
                  <td className="p-3 text-sm text-gray-300 max-w-xs truncate" title={risk.description}>
                    {risk.description}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border ${getScoreColor(risk.score)}`}>
                      {risk.score}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(risk.status)}`}>
                      {risk.status}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-400">{risk.owner}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Risk Modal */}
      {showAddModal && (
        <AddRiskModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddRisk}
        />
      )}
    </div>
  );
}

function AddRiskModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (risk: Partial<Risk>) => void;
}) {
  const [formData, setFormData] = useState({
    category: 'Technical',
    description: '',
    impact: 'Medium' as 'High' | 'Medium' | 'Low',
    likelihood: 'Medium' as 'High' | 'Medium' | 'Low',
    owner: '',
    mitigation: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      alert('Description is required');
      return;
    }
    onAdd(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Add New Risk</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <Icon name="close" size="lg" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            >
              <option value="Technical">Technical</option>
              <option value="Security">Security</option>
              <option value="Business">Business</option>
              <option value="Compliance">Compliance</option>
              <option value="Operational">Operational</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              rows={3}
              placeholder="Describe the risk..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Impact</label>
              <select
                value={formData.impact}
                onChange={(e) => setFormData({ ...formData, impact: e.target.value as 'High' | 'Medium' | 'Low' })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Likelihood</label>
              <select
                value={formData.likelihood}
                onChange={(e) => setFormData({ ...formData, likelihood: e.target.value as 'High' | 'Medium' | 'Low' })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Owner</label>
            <input
              type="text"
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              placeholder="Who is responsible?"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Mitigation</label>
            <textarea
              value={formData.mitigation}
              onChange={(e) => setFormData({ ...formData, mitigation: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              rows={2}
              placeholder="How will this risk be mitigated?"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Risk
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
