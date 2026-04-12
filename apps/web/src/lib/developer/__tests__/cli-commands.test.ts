import { describe, it, expect } from 'vitest';
import {
  CLI_COMMAND_GROUPS,
  getAllCommands,
  getCommandsByGroup,
  type CliCommand,
  type CliCommandGroup,
} from '../cli-commands';

describe('cli-commands data module', () => {
  it('CLI_COMMAND_GROUPS exports 8 groups', () => {
    expect(CLI_COMMAND_GROUPS).toHaveLength(8);
  });

  it('getAllCommands() returns 35 total commands', () => {
    const all = getAllCommands();
    expect(all).toHaveLength(35);
  });

  it('getCommandsByGroup("setup") returns 5 commands', () => {
    const setup = getCommandsByGroup('setup');
    expect(setup).toHaveLength(5);
  });

  it('getCommandsByGroup("database") returns 5 commands including destructive db:reset', () => {
    const db = getCommandsByGroup('database');
    expect(db).toHaveLength(5);
    const destructiveCmd = db.find((c) => c.destructive === true);
    expect(destructiveCmd).toBeDefined();
    expect(destructiveCmd!.command).toContain('db:reset');
  });

  it('getCommandsByGroup("testing") returns 6 commands', () => {
    const testing = getCommandsByGroup('testing');
    expect(testing).toHaveLength(6);
  });

  it('each command has id, command, description, group fields', () => {
    const all = getAllCommands();
    for (const cmd of all) {
      expect(cmd.id).toBeTruthy();
      expect(cmd.command).toBeTruthy();
      expect(cmd.description).toBeTruthy();
      expect(cmd.group).toBeTruthy();
    }
  });

  it('CliCommand and CliCommandGroup types are usable', () => {
    const cmd: CliCommand = {
      id: 'test',
      command: 'test cmd',
      description: 'test desc',
      group: 'setup',
    };
    expect(cmd.id).toBe('test');

    const group: CliCommandGroup = {
      id: 'setup',
      title: 'Test',
      description: 'Test',
      icon: 'test',
      commands: [cmd],
    };
    expect(group.commands).toHaveLength(1);
  });

  it('getCommandsByGroup returns empty array for unknown group', () => {
    const result = getCommandsByGroup('nonexistent' as never);
    expect(result).toEqual([]);
  });

  it('each group has unique id', () => {
    const ids = CLI_COMMAND_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each command has a unique id', () => {
    const all = getAllCommands();
    const ids = all.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
