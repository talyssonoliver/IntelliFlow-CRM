import { describe, it, expect } from 'vitest';
import {
  FieldDescriptorSchema,
  FieldDescriptorArraySchema,
  buildZodFromDescriptors,
  CustomNodeTypeDescriptorSchema,
  CustomActionHandlerDescriptorSchema,
  ActionCustomConfigSchema,
  ActionConfigSchema,
  isPublicHttpUrl,
  PERMISSION_MANAGE_CUSTOM_NODE_TYPES,
  PERMISSION_MANAGE_CUSTOM_ACTIONS,
} from '../node-catalog';

describe('FieldDescriptor', () => {
  it('accepts a minimal string descriptor', () => {
    const d = FieldDescriptorSchema.parse({ key: 'name', label: 'Name', type: 'string' });
    expect(d.required).toBe(false);
  });

  it('requires enumValues when type === enum', () => {
    const res = FieldDescriptorSchema.safeParse({ key: 'a', label: 'A', type: 'enum' });
    expect(res.success).toBe(false);
  });

  it('rejects invalid identifiers for key', () => {
    const res = FieldDescriptorSchema.safeParse({ key: '1bad-key', label: 'A', type: 'string' });
    expect(res.success).toBe(false);
  });
});

describe('buildZodFromDescriptors', () => {
  const descriptors = FieldDescriptorArraySchema.parse([
    { key: 'title', label: 'Title', type: 'string', required: true },
    { key: 'count', label: 'Count', type: 'number' },
    { key: 'active', label: 'Active', type: 'boolean', required: true },
    { key: 'severity', label: 'Severity', type: 'enum', required: true, enumValues: ['low', 'high'] },
    { key: 'target', label: 'Target', type: 'entity' },
  ]);
  const schema = buildZodFromDescriptors(descriptors);

  it('passes when all required fields are present and valid', () => {
    const parsed = schema.parse({
      title: 'Test',
      active: true,
      severity: 'low',
    });
    expect(parsed.title).toBe('Test');
  });

  it('fails when required field missing', () => {
    const res = schema.safeParse({ active: true, severity: 'low' });
    expect(res.success).toBe(false);
  });

  it('rejects invalid enum value', () => {
    const res = schema.safeParse({ title: 'T', active: true, severity: 'medium' });
    expect(res.success).toBe(false);
  });

  it('permits optional fields to be missing', () => {
    const res = schema.safeParse({ title: 'T', active: true, severity: 'low' });
    expect(res.success).toBe(true);
  });

  it('passes through unknown keys', () => {
    const parsed = schema.parse({ title: 'T', active: true, severity: 'low', extra: 'x' });
    expect((parsed as unknown as { extra: string }).extra).toBe('x');
  });
});

describe('CustomNodeTypeDescriptor', () => {
  it('normalizes a minimal payload', () => {
    const d = CustomNodeTypeDescriptorSchema.parse({
      typeId: 'slack_notify',
      label: 'Slack Notify',
    });
    expect(d.iconKey).toBe('extension');
    expect(d.isActive).toBe(true);
    expect(d.configSchema).toEqual([]);
  });

  it('rejects non-slug typeId', () => {
    const res = CustomNodeTypeDescriptorSchema.safeParse({
      typeId: 'Not A Slug',
      label: 'x',
    });
    expect(res.success).toBe(false);
  });
});

describe('CustomActionHandlerDescriptor', () => {
  it('requires a valid endpoint URL', () => {
    const res = CustomActionHandlerDescriptorSchema.safeParse({
      actionTypeId: 'ping',
      label: 'Ping',
      endpointUrl: 'not-a-url',
    });
    expect(res.success).toBe(false);
  });

  it('defaults timeoutMs to 30000', () => {
    const d = CustomActionHandlerDescriptorSchema.parse({
      actionTypeId: 'ping',
      label: 'Ping',
      endpointUrl: 'https://example.com/webhook',
    });
    expect(d.timeoutMs).toBe(30_000);
  });
});

describe('ActionCustomConfigSchema', () => {
  it('parses via the top-level ActionConfigSchema discriminator', () => {
    const parsed = ActionConfigSchema.parse({
      type: 'action',
      actionType: 'custom',
      customActionId: 'abc',
      params: { foo: 'bar' },
    });
    expect(parsed.actionType).toBe('custom');
  });

  it('requires customActionId', () => {
    const res = ActionCustomConfigSchema.safeParse({
      type: 'action',
      actionType: 'custom',
      customActionId: '',
    });
    expect(res.success).toBe(false);
  });
});

describe('isPublicHttpUrl', () => {
  it('accepts public https URLs', () => {
    expect(isPublicHttpUrl('https://httpbin.org/post')).toBe(true);
  });

  it('rejects localhost / loopback', () => {
    expect(isPublicHttpUrl('http://localhost/x')).toBe(false);
    expect(isPublicHttpUrl('http://127.0.0.1/x')).toBe(false);
    expect(isPublicHttpUrl('http://[::1]/x')).toBe(false);
  });

  it('rejects RFC1918 ranges', () => {
    expect(isPublicHttpUrl('http://10.0.0.1/x')).toBe(false);
    expect(isPublicHttpUrl('http://192.168.1.1/x')).toBe(false);
    expect(isPublicHttpUrl('http://172.16.0.1/x')).toBe(false);
    expect(isPublicHttpUrl('http://172.31.0.1/x')).toBe(false);
  });

  it('rejects link-local 169.254.x.x (cloud metadata)', () => {
    expect(isPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(isPublicHttpUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('Permission constants', () => {
  it('exports stable RBAC strings', () => {
    expect(PERMISSION_MANAGE_CUSTOM_NODE_TYPES).toBe('workflow:manage_custom_node_types');
    expect(PERMISSION_MANAGE_CUSTOM_ACTIONS).toBe('workflow:manage_custom_actions');
  });
});
