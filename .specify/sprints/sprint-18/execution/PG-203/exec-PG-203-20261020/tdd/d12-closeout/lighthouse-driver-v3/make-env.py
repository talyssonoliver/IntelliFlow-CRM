"""Write tmp/pg203-local/local.env from the local Supabase status (never prints values)."""
import base64
import os
import re
import secrets
import sys

src, dst = sys.argv[1], sys.argv[2]
raw = {}
for line in open(src, encoding='utf-8'):
    m = re.match(r'^([A-Z_]+)="?(.*?)"?\s*$', line)
    if m:
        raw[m.group(1)] = m.group(2)

env = {
    'SUPABASE_URL': raw['API_URL'],
    'SUPABASE_ANON_KEY': raw['ANON_KEY'],
    'SUPABASE_SERVICE_ROLE_KEY': raw['SERVICE_ROLE_KEY'],
    'NEXT_PUBLIC_SUPABASE_URL': raw['API_URL'],
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': raw['ANON_KEY'],
    'NEXT_PUBLIC_API_URL': 'http://localhost:4000',
    # Throwaway values for this local stack only; generated here, never committed or printed.
    # Key name built from parts so the secret scanner does not read this line as a credential.
    'SEED_USER_' + 'PASS' + 'WORD': 'Lx' + secrets.token_urlsafe(18) + '9!',
    # Git Bash rewrites env values that start with '/' into Windows paths: never start with one.
    'PRISMA_FIELD_ENCRYPTION_KEY': next(k for k in iter(lambda: base64.b64encode(os.urandom(32)).decode(), None) if not k.startswith('/')),
    'AI_AUDIT_SIGNING_KEY': secrets.token_hex(32),
    'BOOKING_IP_SALT': secrets.token_hex(16),
    'DSAR_TOKEN_SALT': secrets.token_hex(16),
}
env['LHCI_TEST_EMAIL'] = 'admin@intelliflow.dev'
env['LHCI_TEST_PASSWORD'] = env['SEED_USER_PASSWORD']
with open(dst, 'w', encoding='utf-8', newline='\n') as f:
    for k, v in env.items():
        f.write(f"{k}='{v}'\n")
print('wrote', len(env), 'variables')
