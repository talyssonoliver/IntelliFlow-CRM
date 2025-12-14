'use client';

import { useState } from 'react';
import { Settings, Cpu, GitBranch, Activity, Link } from 'lucide-react';

type SettingsSection = 'ai-agents' | 'devops' | 'monitoring' | 'integrations';

export default function SettingsView() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('ai-agents');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">System Configuration & Settings</h2>
        <p className="text-sm text-gray-600 mt-1">Manage AI agents, team access, integrations, and system preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <aside className="w-64 flex-shrink-0">
          <nav className="bg-white rounded-lg shadow p-4 space-y-1">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">AI & Automation</div>
            <button
              onClick={() => setActiveSection('ai-agents')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === 'ai-agents'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Cpu className="w-4 h-4" />
              AI Agents
            </button>

            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Infrastructure</div>
            <button
              onClick={() => setActiveSection('devops')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === 'devops'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              DevSecOps
            </button>
            <button
              onClick={() => setActiveSection('monitoring')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === 'monitoring'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Activity className="w-4 h-4" />
              Monitoring
            </button>
            <button
              onClick={() => setActiveSection('integrations')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === 'integrations'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Link className="w-4 h-4" />
              External Services
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1">
          {/* AI Agents Section */}
          {activeSection === 'ai-agents' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">AI Agent Configuration</h3>
                <p className="text-sm text-gray-600 mt-1">Configure AI agents, models, and automation preferences</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Claude Code */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">Claude Code</h4>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Default Model</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="sonnet">Claude Sonnet 4.5 (Default)</option>
                        <option value="opus">Claude 3 Opus</option>
                        <option value="haiku">Claude 3.5 Haiku</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Commands Active</label>
                      <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="12" readOnly />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Auto-generate tests</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                  </div>
                </div>

                {/* GitHub Copilot */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">GitHub Copilot</h4>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">License Type</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option>Enterprise</option>
                        <option>Individual</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Seats Used</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="5 / 10" readOnly />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Code suggestions</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                  </div>
                </div>

                {/* CrewAI Agents */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">CrewAI Agents</h4>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Active Agents</label>
                      <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="3" readOnly />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Agent Types</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="Qualifier, Writer, Researcher" readOnly />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Human oversight</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                  </div>
                </div>

                {/* LangChain */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">LangChain</h4>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option>OpenAI (Production)</option>
                        <option>Ollama (Development)</option>
                        <option>Anthropic</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option>gpt-4-turbo</option>
                        <option>gpt-3.5-turbo</option>
                        <option>claude-3-opus</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DevOps Section */}
          {activeSection === 'devops' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">DevSecOps Configuration</h3>
                <p className="text-sm text-gray-600 mt-1">Configure CI/CD pipelines, security gates, and deployment settings</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* CI/CD Pipeline */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h4 className="font-semibold text-gray-900 mb-4">CI/CD Pipeline</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Auto-deploy to staging</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Run E2E tests</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Coverage Threshold (%)</label>
                      <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="90" min="0" max="100" />
                    </div>
                  </div>
                </div>

                {/* Security Gates */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h4 className="font-semibold text-gray-900 mb-4">Security Gates</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">SAST scan</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Dependency check</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Secret scanning</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Monitoring Section */}
          {activeSection === 'monitoring' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Monitoring Configuration</h3>
                <p className="text-sm text-gray-600 mt-1">Configure observability and alerting</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* OpenTelemetry */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h4 className="font-semibold text-gray-900 mb-4">OpenTelemetry</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Enable tracing</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Export Endpoint</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="http://localhost:4318" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sample Rate (%)</label>
                      <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="100" min="0" max="100" />
                    </div>
                  </div>
                </div>

                {/* Alerts */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h4 className="font-semibold text-gray-900 mb-4">Alert Configuration</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Error Rate Threshold (%)</label>
                      <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="5" min="1" max="100" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Response Time Alert (ms)</label>
                      <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="200" min="50" max="5000" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Slack notifications</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Integrations Section */}
          {activeSection === 'integrations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">External Service Integrations</h3>
                <p className="text-sm text-gray-600 mt-1">Configure connections to external services and APIs</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Supabase */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">Supabase</h4>
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Connected</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project URL</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="https://xxx.supabase.co" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="Free (500MB)" readOnly />
                    </div>
                  </div>
                </div>

                {/* GitHub */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">GitHub</h4>
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Connected</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Repository</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="org/intelliflow-crm" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Auto-sync branches</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                  </div>
                </div>

                {/* Slack */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">Slack</h4>
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Not Connected</span>
                  </div>
                  <div className="space-y-3">
                    <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      Connect to Slack
                    </button>
                  </div>
                </div>

                {/* Sentry */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">Sentry</h4>
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Connected</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">DSN</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg" defaultValue="https://xxx@sentry.io/xxx" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Error tracking</label>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" defaultChecked />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
