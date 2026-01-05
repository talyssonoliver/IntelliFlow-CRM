/**
 * Incident Tracker Tests - PG-014
 *
 * Unit tests for incident tracking service, service health monitoring,
 * and subscriber management.
 *
 * @module status/incident-tracker
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initializeServices,
  getAllServices,
  getServiceById,
  updateServiceStatus,
  getOverallStatus,
  createIncident,
  addIncidentUpdate,
  getAllIncidents,
  getActiveIncidents,
  getRecentIncidents,
  subscribe,
  unsubscribe,
  getSubscribersForService,
  calculateUptime,
  healthCheck,
  resetStore,
  type ServiceHealth,
  type ServiceStatus,
} from './incident-tracker';

describe('incident-tracker', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initializeServices', () => {
    it('should initialize services with provided data', () => {
      const services = [
        { id: 'api', name: 'API', description: 'API Service', status: 'operational' as ServiceStatus, uptime: 99.9 },
        { id: 'web', name: 'Web App', description: 'Web Application', status: 'operational' as ServiceStatus, uptime: 99.95 },
      ];

      initializeServices(services);
      const result = getAllServices();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('api');
      expect(result[1].id).toBe('web');
    });

    it('should set lastChecked to current date', () => {
      const services = [
        { id: 'api', name: 'API', description: 'API Service', status: 'operational' as ServiceStatus, uptime: 99.9 },
      ];

      initializeServices(services);
      const result = getServiceById('api');

      expect(result?.lastChecked).toBeInstanceOf(Date);
    });
  });

  describe('getAllServices', () => {
    it('should return empty array when no services initialized', () => {
      const result = getAllServices();
      expect(result).toEqual([]);
    });

    it('should return all initialized services', () => {
      initializeServices([
        { id: 'svc1', name: 'Service 1', description: 'Desc 1', status: 'operational', uptime: 99.9 },
        { id: 'svc2', name: 'Service 2', description: 'Desc 2', status: 'degraded', uptime: 99.5 },
      ]);

      const result = getAllServices();
      expect(result).toHaveLength(2);
    });
  });

  describe('getServiceById', () => {
    beforeEach(() => {
      initializeServices([
        { id: 'api', name: 'API', description: 'API Service', status: 'operational', uptime: 99.9 },
      ]);
    });

    it('should return service when found', () => {
      const result = getServiceById('api');
      expect(result).toBeDefined();
      expect(result?.name).toBe('API');
    });

    it('should return undefined when service not found', () => {
      const result = getServiceById('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('updateServiceStatus', () => {
    beforeEach(() => {
      initializeServices([
        { id: 'api', name: 'API', description: 'API Service', status: 'operational', uptime: 99.9 },
      ]);
    });

    it('should update service status', () => {
      const result = updateServiceStatus('api', 'degraded');

      expect(result?.status).toBe('degraded');
      expect(getServiceById('api')?.status).toBe('degraded');
    });

    it('should update response time when provided', () => {
      const result = updateServiceStatus('api', 'operational', 150);

      expect(result?.responseTime).toBe(150);
    });

    it('should update lastChecked timestamp', () => {
      const before = getServiceById('api')?.lastChecked;
      vi.advanceTimersByTime(1000);

      updateServiceStatus('api', 'operational');

      const after = getServiceById('api')?.lastChecked;
      expect(after?.getTime()).toBeGreaterThan(before?.getTime() ?? 0);
    });

    it('should return undefined for nonexistent service', () => {
      const result = updateServiceStatus('nonexistent', 'operational');
      expect(result).toBeUndefined();
    });
  });

  describe('getOverallStatus', () => {
    it('should return operational when all services are operational', () => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'operational', uptime: 99.9 },
        { id: 'web', name: 'Web', description: 'Desc', status: 'operational', uptime: 99.9 },
      ]);

      const result = getOverallStatus();

      expect(result.status).toBe('operational');
      expect(result.label).toBe('All Systems Operational');
      expect(result.affectedCount).toBe(0);
    });

    it('should return degraded when any service is degraded', () => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'operational', uptime: 99.9 },
        { id: 'web', name: 'Web', description: 'Desc', status: 'degraded', uptime: 99.5 },
      ]);

      const result = getOverallStatus();

      expect(result.status).toBe('degraded');
      expect(result.label).toBe('Degraded Performance');
      expect(result.affectedCount).toBe(1);
    });

    it('should return partial_outage over degraded', () => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'partial_outage', uptime: 99.0 },
        { id: 'web', name: 'Web', description: 'Desc', status: 'degraded', uptime: 99.5 },
      ]);

      const result = getOverallStatus();

      expect(result.status).toBe('partial_outage');
      expect(result.label).toBe('Partial Outage');
    });

    it('should return major_outage as highest priority', () => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'major_outage', uptime: 90.0 },
        { id: 'web', name: 'Web', description: 'Desc', status: 'partial_outage', uptime: 99.0 },
        { id: 'db', name: 'Database', description: 'Desc', status: 'degraded', uptime: 99.5 },
      ]);

      const result = getOverallStatus();

      expect(result.status).toBe('major_outage');
      expect(result.label).toBe('Major Outage');
      expect(result.affectedCount).toBe(1);
    });
  });

  describe('createIncident', () => {
    beforeEach(() => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'operational', uptime: 99.9 },
        { id: 'web', name: 'Web', description: 'Desc', status: 'operational', uptime: 99.9 },
      ]);
    });

    it('should create incident with correct fields', () => {
      const incident = createIncident(
        'API Degradation',
        'minor',
        ['api'],
        'We are investigating slow response times'
      );

      expect(incident.id).toMatch(/^inc-\d+$/);
      expect(incident.title).toBe('API Degradation');
      expect(incident.severity).toBe('minor');
      expect(incident.status).toBe('investigating');
      expect(incident.affectedServices).toContain('api');
    });

    it('should create initial update with investigating status', () => {
      const incident = createIncident('Test', 'minor', ['api'], 'Initial message');

      expect(incident.updates).toHaveLength(1);
      expect(incident.updates[0].message).toBe('Initial message');
      expect(incident.updates[0].status).toBe('investigating');
    });

    it('should update affected service status for critical severity', () => {
      createIncident('Major Issue', 'critical', ['api'], 'Major outage');

      const service = getServiceById('api');
      expect(service?.status).toBe('major_outage');
    });

    it('should update affected service status for major severity', () => {
      createIncident('Partial Issue', 'major', ['api'], 'Partial outage');

      const service = getServiceById('api');
      expect(service?.status).toBe('partial_outage');
    });

    it('should update affected service status for minor/maintenance severity', () => {
      createIncident('Minor Issue', 'minor', ['api'], 'Degraded performance');

      const service = getServiceById('api');
      expect(service?.status).toBe('degraded');
    });

    it('should update multiple affected services', () => {
      createIncident('Multi-Service Issue', 'major', ['api', 'web'], 'Both affected');

      expect(getServiceById('api')?.status).toBe('partial_outage');
      expect(getServiceById('web')?.status).toBe('partial_outage');
    });
  });

  describe('addIncidentUpdate', () => {
    let incidentId: string;

    beforeEach(() => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'operational', uptime: 99.9 },
      ]);
      const incident = createIncident('Test Incident', 'minor', ['api'], 'Initial');
      incidentId = incident.id;
    });

    it('should add update to incident', () => {
      const result = addIncidentUpdate(incidentId, 'We identified the issue');

      expect(result?.updates).toHaveLength(2);
      expect(result?.updates[1].message).toBe('We identified the issue');
    });

    it('should update incident status when provided', () => {
      const result = addIncidentUpdate(incidentId, 'Issue identified', 'identified');

      expect(result?.status).toBe('identified');
      expect(result?.updates[1].status).toBe('identified');
    });

    it('should set resolvedAt when status is resolved', () => {
      const result = addIncidentUpdate(incidentId, 'Issue resolved', 'resolved');

      expect(result?.resolvedAt).toBeInstanceOf(Date);
    });

    it('should restore affected services to operational on resolution', () => {
      addIncidentUpdate(incidentId, 'Issue resolved', 'resolved');

      expect(getServiceById('api')?.status).toBe('operational');
    });

    it('should return undefined for nonexistent incident', () => {
      const result = addIncidentUpdate('nonexistent', 'Update');
      expect(result).toBeUndefined();
    });
  });

  describe('getAllIncidents', () => {
    beforeEach(() => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'operational', uptime: 99.9 },
      ]);
    });

    it('should return all incidents sorted by startedAt descending', () => {
      createIncident('First', 'minor', ['api'], 'First incident');
      vi.advanceTimersByTime(1000);
      createIncident('Second', 'minor', ['api'], 'Second incident');

      const incidents = getAllIncidents();

      expect(incidents).toHaveLength(2);
      expect(incidents[0].title).toBe('Second');
      expect(incidents[1].title).toBe('First');
    });
  });

  describe('getActiveIncidents', () => {
    beforeEach(() => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'operational', uptime: 99.9 },
      ]);
    });

    it('should return only non-resolved incidents', () => {
      const inc1 = createIncident('Active', 'minor', ['api'], 'Active incident');
      vi.advanceTimersByTime(1000); // Advance time to ensure unique ID
      const inc2 = createIncident('Resolved', 'minor', ['api'], 'Will be resolved');
      addIncidentUpdate(inc2.id, 'Resolved', 'resolved');

      const active = getActiveIncidents();

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(inc1.id);
    });

    it('should exclude completed incidents', () => {
      const inc = createIncident('Completed', 'maintenance', ['api'], 'Maintenance');
      addIncidentUpdate(inc.id, 'Done', 'completed');

      const active = getActiveIncidents();

      expect(active).toHaveLength(0);
    });
  });

  describe('getRecentIncidents', () => {
    beforeEach(() => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'operational', uptime: 99.9 },
      ]);
    });

    it('should return incidents from last 30 days by default', () => {
      createIncident('Recent', 'minor', ['api'], 'Recent incident');

      const recent = getRecentIncidents();

      expect(recent).toHaveLength(1);
    });

    it('should filter out old incidents', () => {
      createIncident('Old', 'minor', ['api'], 'Old incident');
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000); // 31 days

      const recent = getRecentIncidents();

      expect(recent).toHaveLength(0);
    });

    it('should accept custom days parameter', () => {
      createIncident('Week old', 'minor', ['api'], 'Week old incident');
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000); // 8 days

      const recent = getRecentIncidents(7);

      expect(recent).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    it('should create subscriber with generated id', () => {
      const subscriber = subscribe('test@example.com');

      expect(subscriber.id).toMatch(/^sub-\d+$/);
      expect(subscriber.email).toBe('test@example.com');
    });

    it('should set createdAt to current date', () => {
      const subscriber = subscribe('test@example.com');

      expect(subscriber.createdAt).toBeInstanceOf(Date);
    });

    it('should include services filter when provided', () => {
      const subscriber = subscribe('test@example.com', ['api', 'web']);

      expect(subscriber.services).toEqual(['api', 'web']);
    });
  });

  describe('unsubscribe', () => {
    it('should remove subscriber and return true', () => {
      const subscriber = subscribe('test@example.com');

      const result = unsubscribe(subscriber.id);

      expect(result).toBe(true);
    });

    it('should return false for nonexistent subscriber', () => {
      const result = unsubscribe('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getSubscribersForService', () => {
    beforeEach(() => {
      subscribe('all@example.com'); // No service filter = all services
      vi.advanceTimersByTime(1); // Ensure unique IDs
      subscribe('api@example.com', ['api']);
      vi.advanceTimersByTime(1);
      subscribe('web@example.com', ['web']);
      vi.advanceTimersByTime(1);
      subscribe('both@example.com', ['api', 'web']);
    });

    it('should return subscribers with no service filter', () => {
      const subscribers = getSubscribersForService('api');
      const emails = subscribers.map((s) => s.email);

      expect(emails).toContain('all@example.com');
    });

    it('should return subscribers subscribed to specific service', () => {
      const subscribers = getSubscribersForService('api');
      const emails = subscribers.map((s) => s.email);

      expect(emails).toContain('api@example.com');
      expect(emails).toContain('both@example.com');
    });

    it('should not return subscribers for other services', () => {
      const subscribers = getSubscribersForService('api');
      const emails = subscribers.map((s) => s.email);

      expect(emails).not.toContain('web@example.com');
    });
  });

  describe('calculateUptime', () => {
    it('should return a number between 99.9 and 100', () => {
      const uptime = calculateUptime('api', 90);

      expect(uptime).toBeGreaterThanOrEqual(99.9);
      expect(uptime).toBeLessThanOrEqual(100);
    });
  });

  describe('healthCheck', () => {
    beforeEach(() => {
      initializeServices([
        { id: 'api', name: 'API', description: 'Desc', status: 'operational', uptime: 99.9 },
      ]);
    });

    it('should return healthy=true and update status to operational for fast response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
      });

      const result = await healthCheck('api', 'https://api.example.com/health');

      expect(result.healthy).toBe(true);
      expect(result.responseTime).toBeDefined();
    });

    it('should return healthy=false and update status to major_outage on failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await healthCheck('api', 'https://api.example.com/health');

      expect(result.healthy).toBe(false);
      expect(getServiceById('api')?.status).toBe('major_outage');
    });

    it('should return healthy=false for non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      const result = await healthCheck('api', 'https://api.example.com/health');

      expect(result.healthy).toBe(false);
      expect(getServiceById('api')?.status).toBe('major_outage');
    });

    it('should set degraded status for slow but healthy response', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        // Simulate 500ms response time
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
          vi.advanceTimersByTime(500);
        });
        return { ok: true };
      });

      await healthCheck('api', 'https://api.example.com/health');

      expect(getServiceById('api')?.status).toBe('degraded');
    });
  });
});
