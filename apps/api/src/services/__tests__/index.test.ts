/**
 * Services Module Index Tests
 *
 * Tests that all exports from the services module are valid and accessible.
 */

import { describe, it, expect } from 'vitest';
import * as servicesModule from '../index';

describe('Services Module Exports', () => {
  describe('Appointment Domain Service Exports', () => {
    it('should export AppointmentDomainService', () => {
      expect(servicesModule.AppointmentDomainService).toBeDefined();
    });

    it('should export appointmentDomainService instance', () => {
      expect(servicesModule.appointmentDomainService).toBeDefined();
    });
  });

  describe('Deadline Domain Service Exports', () => {
    it('should export DeadlineDomainService', () => {
      expect(servicesModule.DeadlineDomainService).toBeDefined();
    });

    it('should export deadlineDomainService instance', () => {
      expect(servicesModule.deadlineDomainService).toBeDefined();
    });

    it('should export createDeadlineDomainService factory', () => {
      expect(servicesModule.createDeadlineDomainService).toBeDefined();
      expect(typeof servicesModule.createDeadlineDomainService).toBe('function');
    });
  });

  describe('Module Export Count', () => {
    it('should export all services', () => {
      const exportKeys = Object.keys(servicesModule);
      // Should have at least: AppointmentDomainService, appointmentDomainService,
      // DeadlineDomainService, deadlineDomainService, createDeadlineDomainService
      expect(exportKeys.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Service Instances', () => {
    it('should have valid appointmentDomainService instance', () => {
      const service = servicesModule.appointmentDomainService;
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(servicesModule.AppointmentDomainService);
    });

    it('should have valid deadlineDomainService instance', () => {
      const service = servicesModule.deadlineDomainService;
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(servicesModule.DeadlineDomainService);
    });
  });

  describe('Factory Functions', () => {
    it('should create DeadlineDomainService with factory', () => {
      const service = servicesModule.createDeadlineDomainService();
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(servicesModule.DeadlineDomainService);
    });
  });
});
