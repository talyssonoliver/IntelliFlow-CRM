'use client';

import { useMemo, useState } from 'react';
import { Task } from '@/lib/types';
import {
  FileText,
  Folder,
  Key,
  Shield,
  CheckCircle,
  Terminal,
  Lock,
  Eye,
  Filter,
  Package,
  LucideIcon,
} from 'lucide-react';
import { parseContractTags, ContractTagType } from './ContractTagList';

interface ContractAnalyticsViewProps {
  tasks: Task[];
}

interface TagStats {
  type: ContractTagType;
  count: number;
  percentage: number;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  barColor: string;
}

interface FileReference {
  path: string;
  taskCount: number;
  tasks: string[];
}

const TAG_CONFIG: Record<
  ContractTagType,
  { icon: LucideIcon; color: string; bgColor: string; barColor: string }
> = {
  FILE: { icon: FileText, color: 'text-blue-700', bgColor: 'bg-blue-100', barColor: 'bg-blue-500' },
  DIR: {
    icon: Folder,
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-100',
    barColor: 'bg-indigo-500',
  },
  ENV: { icon: Key, color: 'text-purple-700', bgColor: 'bg-purple-100', barColor: 'bg-purple-500' },
  POLICY: {
    icon: Shield,
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    barColor: 'bg-orange-500',
  },
  EVIDENCE: {
    icon: CheckCircle,
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    barColor: 'bg-green-500',
  },
  VALIDATE: {
    icon: Terminal,
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-100',
    barColor: 'bg-cyan-500',
  },
  GATE: { icon: Lock, color: 'text-red-700', bgColor: 'bg-red-100', barColor: 'bg-red-500' },
  AUDIT: {
    icon: Eye,
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    barColor: 'bg-yellow-500',
  },
  ARTIFACT: {
    icon: Package,
    color: 'text-teal-700',
    bgColor: 'bg-teal-100',
    barColor: 'bg-teal-500',
  },
};

export default function ContractAnalyticsView({ tasks }: ContractAnalyticsViewProps) {
  const [filterType, setFilterType] = useState<ContractTagType | 'all'>('all');

  // Calculate tag distribution
  const tagDistribution = useMemo(() => {
    const counts: Record<ContractTagType, number> = {
      FILE: 0,
      DIR: 0,
      ENV: 0,
      POLICY: 0,
      EVIDENCE: 0,
      VALIDATE: 0,
      GATE: 0,
      AUDIT: 0,
      ARTIFACT: 0,
    };

    tasks.forEach((task) => {
      const prereqTags = parseContractTags(task.prerequisites);
      const artifactTags = parseContractTags(task.artifacts.join(';'));
      const validationTags = parseContractTags(task.validation);

      [...prereqTags, ...artifactTags, ...validationTags].forEach((tag) => {
        counts[tag.type]++;
      });
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const stats: TagStats[] = (Object.keys(counts) as ContractTagType[])
      .map((type) => ({
        type,
        count: counts[type],
        percentage: total > 0 ? Math.round((counts[type] / total) * 100) : 0,
        ...TAG_CONFIG[type],
      }))
      .sort((a, b) => b.count - a.count);

    return { stats, total };
  }, [tasks]);

  // Calculate most referenced files
  const fileReferences = useMemo(() => {
    const fileMap = new Map<string, string[]>();

    tasks.forEach((task) => {
      const tags = parseContractTags(task.prerequisites);
      tags
        .filter((t) => t.type === 'FILE')
        .forEach((tag) => {
          const existing = fileMap.get(tag.value) || [];
          if (!existing.includes(task.id)) {
            fileMap.set(tag.value, [...existing, task.id]);
          }
        });
    });

    const refs: FileReference[] = [];
    fileMap.forEach((taskIds, path) => {
      refs.push({
        path,
        taskCount: taskIds.length,
        tasks: taskIds,
      });
    });

    return refs.sort((a, b) => b.taskCount - a.taskCount).slice(0, 10);
  }, [tasks]);

  // Calculate most used policies
  const policyReferences = useMemo(() => {
    const policyMap = new Map<string, string[]>();

    tasks.forEach((task) => {
      const tags = parseContractTags(task.prerequisites);
      tags
        .filter((t) => t.type === 'POLICY')
        .forEach((tag) => {
          const existing = policyMap.get(tag.value) || [];
          if (!existing.includes(task.id)) {
            policyMap.set(tag.value, [...existing, task.id]);
          }
        });
    });

    const refs: FileReference[] = [];
    policyMap.forEach((taskIds, path) => {
      refs.push({
        path,
        taskCount: taskIds.length,
        tasks: taskIds,
      });
    });

    return refs.sort((a, b) => b.taskCount - a.taskCount).slice(0, 10);
  }, [tasks]);

  const maxCount = Math.max(...tagDistribution.stats.map((s) => s.count));

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Contract Tag Analysis</h3>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as ContractTagType | 'all')}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="all">All Tags</option>
            {(Object.keys(TAG_CONFIG) as ContractTagType[]).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tag Distribution */}
      <div className="p-4 border-b border-gray-100">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Tag Distribution</h4>
        <div className="space-y-2">
          {tagDistribution.stats.map((stat) => {
            const Icon = stat.icon;
            const barWidth = maxCount > 0 ? (stat.count / maxCount) * 100 : 0;

            if (filterType !== 'all' && stat.type !== filterType) return null;

            return (
              <div key={stat.type} className="flex items-center gap-3">
                <div className={`w-20 flex items-center gap-1 ${stat.color}`}>
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{stat.type}:</span>
                </div>
                <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${stat.barColor} transition-all duration-300`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div className="w-24 text-right text-sm text-gray-600">
                  {stat.count} ({stat.percentage}%)
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-gray-500 text-right">
          Total: {tagDistribution.total} tags across {tasks.length} tasks
        </div>
      </div>

      {/* Most Referenced Files */}
      <div className="p-4 border-b border-gray-100">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Most Referenced Files</h4>
        {fileReferences.length > 0 ? (
          <div className="space-y-1.5">
            {fileReferences.map((ref, idx) => (
              <div key={ref.path} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-gray-400 text-right">{idx + 1}.</span>
                <code className="flex-1 text-gray-700 font-mono text-xs truncate" title={ref.path}>
                  {ref.path}
                </code>
                <span className="text-gray-500 whitespace-nowrap">{ref.taskCount} tasks</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 italic">No FILE: tags found</div>
        )}
      </div>

      {/* Most Used Policies */}
      <div className="p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Most Used Policies</h4>
        {policyReferences.length > 0 ? (
          <div className="space-y-1.5">
            {policyReferences.map((ref, idx) => (
              <div key={ref.path} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-gray-400 text-right">{idx + 1}.</span>
                <span className="flex-1 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-orange-500" />
                  <code className="text-gray-700 font-mono text-xs">{ref.path}</code>
                </span>
                <span className="text-gray-500 whitespace-nowrap">{ref.taskCount} tasks</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 italic">No POLICY: tags found</div>
        )}
      </div>
    </div>
  );
}
