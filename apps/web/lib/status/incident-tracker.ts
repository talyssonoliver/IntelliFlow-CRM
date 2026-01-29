/**
 * Incident Tracker Service
 *
 * Manages system incidents, status updates, and subscriber notifications.
 * Used by the status page to display real-time system health.
 *
 * @module status/incident-tracker
 */

export type ServiceStatus =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage';

export type IncidentSeverity = 'maintenance' | 'minor' | 'major' | 'critical';

export type IncidentStatus =
  | 'investigating'
  | 'identified'
  | 'monitoring'
  | 'resolved'
  | 'completed';

export interface ServiceHealth {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  uptime: number;
  lastChecked: Date;
  responseTime?: number;
}

export interface IncidentUpdate {
  time: Date;
  message: string;
  status?: IncidentStatus;
}

export interface Incident {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  startedAt: Date;
  resolvedAt?: Date;
  affectedServices: string[];
  updates: IncidentUpdate[];
}

export interface StatusSubscriber {
  id: string;
  email: string;
  createdAt: Date;
  services?: string[]; // Empty = all services
}

/**
 * In-memory store for demo purposes.
 * In production, this would be backed by a database.
 */
const store = {
  services: new Map<string, ServiceHealth>(),
  incidents: new Map<string, Incident>(),
  subscribers: new Map<string, StatusSubscriber>(),
};

/**
 * Initialize default services
 */
export function initializeServices(services: Omit<ServiceHealth, 'lastChecked'>[]): void {
  for (const service of services) {
    store.services.set(service.id, {
      ...service,
      lastChecked: new Date(),
    });
  }
}

/**
 * Get all services
 */
export function getAllServices(): ServiceHealth[] {
  return Array.from(store.services.values());
}

/**
 * Get service by ID
 */
export function getServiceById(id: string): ServiceHealth | undefined {
  return store.services.get(id);
}

/**
 * Update service status
 */
export function updateServiceStatus(
  id: string,
  status: ServiceStatus,
  responseTime?: number
): ServiceHealth | undefined {
  const service = store.services.get(id);
  if (!service) return undefined;

  const updated: ServiceHealth = {
    ...service,
    status,
    responseTime,
    lastChecked: new Date(),
  };

  store.services.set(id, updated);
  return updated;
}

/**
 * Get overall system status
 */
export function getOverallStatus(): {
  status: ServiceStatus;
  label: string;
  affectedCount: number;
} {
  const services = getAllServices();
  const majorOutage = services.filter((s) => s.status === 'major_outage');
  const partialOutage = services.filter((s) => s.status === 'partial_outage');
  const degraded = services.filter((s) => s.status === 'degraded');

  if (majorOutage.length > 0) {
    return {
      status: 'major_outage',
      label: 'Major Outage',
      affectedCount: majorOutage.length,
    };
  }

  if (partialOutage.length > 0) {
    return {
      status: 'partial_outage',
      label: 'Partial Outage',
      affectedCount: partialOutage.length,
    };
  }

  if (degraded.length > 0) {
    return {
      status: 'degraded',
      label: 'Degraded Performance',
      affectedCount: degraded.length,
    };
  }

  return {
    status: 'operational',
    label: 'All Systems Operational',
    affectedCount: 0,
  };
}

/**
 * Create a new incident
 */
export function createIncident(
  title: string,
  severity: IncidentSeverity,
  affectedServices: string[],
  message: string
): Incident {
  const id = `inc-${Date.now()}`;
  const incident: Incident = {
    id,
    title,
    status: 'investigating',
    severity,
    startedAt: new Date(),
    affectedServices,
    updates: [
      {
        time: new Date(),
        message,
        status: 'investigating',
      },
    ],
  };

  store.incidents.set(id, incident);

  // Update affected service statuses
  for (const serviceId of affectedServices) {
    let status: ServiceStatus;
    if (severity === 'critical') {
      status = 'major_outage';
    } else if (severity === 'major') {
      status = 'partial_outage';
    } else {
      status = 'degraded';
    }
    updateServiceStatus(serviceId, status);
  }

  return incident;
}

/**
 * Add update to an incident
 */
export function addIncidentUpdate(
  incidentId: string,
  message: string,
  status?: IncidentStatus
): Incident | undefined {
  const incident = store.incidents.get(incidentId);
  if (!incident) return undefined;

  const update: IncidentUpdate = {
    time: new Date(),
    message,
    status,
  };

  const updated: Incident = {
    ...incident,
    status: status ?? incident.status,
    updates: [...incident.updates, update],
  };

  if (status === 'resolved' || status === 'completed') {
    updated.resolvedAt = new Date();

    // Restore affected services to operational
    for (const serviceId of incident.affectedServices) {
      updateServiceStatus(serviceId, 'operational');
    }
  }

  store.incidents.set(incidentId, updated);
  return updated;
}

/**
 * Get all incidents
 */
export function getAllIncidents(): Incident[] {
  return Array.from(store.incidents.values()).sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
  );
}

/**
 * Get active incidents (not resolved)
 */
export function getActiveIncidents(): Incident[] {
  return getAllIncidents().filter(
    (i) => i.status !== 'resolved' && i.status !== 'completed'
  );
}

/**
 * Get recent incidents (last 30 days)
 */
export function getRecentIncidents(days = 30): Incident[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return getAllIncidents().filter((i) => i.startedAt >= cutoff);
}

/**
 * Subscribe to status updates
 */
export function subscribe(
  email: string,
  services?: string[]
): StatusSubscriber {
  const id = `sub-${Date.now()}`;
  const subscriber: StatusSubscriber = {
    id,
    email,
    createdAt: new Date(),
    services,
  };

  store.subscribers.set(id, subscriber);
  return subscriber;
}

/**
 * Unsubscribe from status updates
 */
export function unsubscribe(id: string): boolean {
  return store.subscribers.delete(id);
}

/**
 * Get subscribers for a service
 */
export function getSubscribersForService(serviceId: string): StatusSubscriber[] {
  return Array.from(store.subscribers.values()).filter(
    (s) => !s.services || s.services.length === 0 || s.services.includes(serviceId)
  );
}

/**
 * Calculate uptime percentage for a service over the last N days
 */
export function calculateUptime(
  _serviceId: string,
  _days = 90
): number {
  // In production, this would query historical data
  // For now, return a simulated value
  return 99.9 + Math.random() * 0.09;
}

/**
 * Health check for a service
 */
export async function healthCheck(
  serviceId: string,
  endpoint: string
): Promise<{ healthy: boolean; responseTime: number }> {
  const start = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    const responseTime = Date.now() - start;
    const healthy = response.ok;

    // Update service status based on health check
    if (healthy) {
      let status: ServiceStatus;
      if (responseTime < 200) {
        status = 'operational';
      } else if (responseTime < 1000) {
        status = 'degraded';
      } else {
        status = 'partial_outage';
      }
      updateServiceStatus(serviceId, status, responseTime);
    } else {
      updateServiceStatus(serviceId, 'major_outage', responseTime);
    }

    return { healthy, responseTime };
  } catch {
    const responseTime = Date.now() - start;
    updateServiceStatus(serviceId, 'major_outage', responseTime);
    return { healthy: false, responseTime };
  }
}

/**
 * Reset all stores - for testing purposes
 */
export function resetStore(): void {
  store.services.clear();
  store.incidents.clear();
  store.subscribers.clear();
}

export default {
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
};
