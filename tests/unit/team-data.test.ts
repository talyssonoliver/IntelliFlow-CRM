import { describe, it, expect } from 'vitest';
import teamData from '../../apps/web/src/data/team-data.json';

/**
 * Data Validation Tests for Team Data
 *
 * Ensures team-data.json maintains correct structure
 * and has all required fields for the About page.
 */

describe('Team Data Validation', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      expect(teamData.metadata).toBeDefined();
      expect(teamData.metadata.totalMembers).toBe(4);
      expect(teamData.metadata.lastUpdated).toBeDefined();
      expect(typeof teamData.metadata.lastUpdated).toBe('string');
      expect(teamData.metadata.version).toBeDefined();
    });

    it('should have a last updated timestamp', () => {
      expect(teamData.metadata.lastUpdated).toBeDefined();
      expect(typeof teamData.metadata.lastUpdated).toBe('string');
      // Should match YYYY-MM-DD format
      expect(teamData.metadata.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Team Members Structure', () => {
    it('should have exactly 4 team members', () => {
      expect(teamData.members).toHaveLength(4);
    });

    it('should have required fields for each member', () => {
      teamData.members.forEach(member => {
        expect(member.id).toBeDefined();
        expect(member.name).toBeDefined();
        expect(member.role).toBeDefined();
        expect(member.bio).toBeDefined();
        expect(member.photo).toBeDefined();
        expect(member.socialLinks).toBeDefined();
      });
    });

    it('should have unique member IDs', () => {
      const ids = teamData.members.map(m => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have the expected team members', () => {
      const names = teamData.members.map(m => m.name);
      expect(names).toContain('Alex Chen');
      expect(names).toContain('Jordan Smith');
      expect(names).toContain('Riley Patel');
      expect(names).toContain('Taylor Kim');
    });
  });

  describe('Content Validation', () => {
    it('should have valid photo URLs', () => {
      teamData.members.forEach(member => {
        expect(member.photo).toMatch(/^https?:\/\//);
      });
    });

    it('should have non-empty bios (minimum 50 characters)', () => {
      teamData.members.forEach(member => {
        expect(member.bio.length).toBeGreaterThan(50);
      });
    });

    it('should have descriptive role titles', () => {
      teamData.members.forEach(member => {
        expect(member.role.length).toBeGreaterThan(5);
        // Should not be just a generic "Member"
        expect(member.role.toLowerCase()).not.toBe('member');
      });
    });

    it('should have social links for each member', () => {
      teamData.members.forEach(member => {
        expect(member.socialLinks).toBeDefined();
        expect(member.socialLinks.linkedin || member.socialLinks.twitter).toBeTruthy();
      });
    });

    it('should have valid LinkedIn URLs', () => {
      teamData.members.forEach(member => {
        if (member.socialLinks.linkedin) {
          expect(member.socialLinks.linkedin).toMatch(/^https:\/\/(www\.)?linkedin\.com\//);
        }
      });
    });

    it('should have valid Twitter URLs', () => {
      teamData.members.forEach(member => {
        if (member.socialLinks.twitter) {
          expect(member.socialLinks.twitter).toMatch(/^https:\/\/(www\.)?twitter\.com\//);
        }
      });
    });
  });

  describe('Team Roles', () => {
    it('should have CEO/Co-Founder', () => {
      const roles = teamData.members.map(m => m.role);
      expect(roles.some(r => r.includes('CEO'))).toBe(true);
    });

    it('should have CTO/Co-Founder', () => {
      const roles = teamData.members.map(m => m.role);
      expect(roles.some(r => r.includes('CTO'))).toBe(true);
    });

    it('should have Head of Product', () => {
      const roles = teamData.members.map(m => m.role);
      expect(roles.some(r => r.includes('Product'))).toBe(true);
    });

    it('should have VP of Customer Success', () => {
      const roles = teamData.members.map(m => m.role);
      expect(roles.some(r => r.includes('Customer Success'))).toBe(true);
    });
  });
});
