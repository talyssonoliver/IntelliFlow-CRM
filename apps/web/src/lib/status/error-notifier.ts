import type { IncidentPayload } from './incident-creator';

declare global {
  interface Window {
    __INTELLIFLOW_INCIDENT_WEBHOOK__?: string;
  }
}

export type TeamNotificationPayload = {
  readonly event: 'team_notified';
  readonly incident: IncidentPayload;
  readonly channel: 'sre-oncall';
  readonly timestamp: string;
};

export function notifyTeam(incident: IncidentPayload): TeamNotificationPayload {
  const payload: TeamNotificationPayload = {
    event: 'team_notified',
    incident,
    channel: 'sre-oncall',
    timestamp: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<TeamNotificationPayload>('intelliflow:team-notified', {
        detail: payload,
      })
    );

    const webhookUrl = window.__INTELLIFLOW_INCIDENT_WEBHOOK__;
    if (typeof webhookUrl === 'string' && webhookUrl.length > 0) {
      fetch(webhookUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  }

  return payload;
}
