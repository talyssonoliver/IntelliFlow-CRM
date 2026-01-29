# Email DNS Records Documentation

This document outlines the DNS records required for proper email deliverability and authentication for IntelliFlow CRM.

## Overview

For emails sent from IntelliFlow CRM to achieve high deliverability (target: >=95%), the following DNS records must be configured:

1. **SPF** (Sender Policy Framework) - Authorizes which servers can send email for your domain
2. **DKIM** (DomainKeys Identified Mail) - Cryptographically signs emails to verify authenticity
3. **DMARC** (Domain-based Message Authentication, Reporting & Conformance) - Defines policy for handling authentication failures
4. **MX** (Mail Exchanger) - Specifies mail servers for receiving email
5. **PTR** (Reverse DNS) - Maps IP addresses to domain names for verification

## Required DNS Records

### Domain: `mail.intelliflow-crm.com`

#### SPF Record

```dns
Type:  TXT
Host:  @
Value: v=spf1 include:_spf.intelliflow-crm.com include:sendgrid.net include:amazonses.com ~all
TTL:   3600
```

**Breakdown:**
- `v=spf1` - SPF version 1
- `include:_spf.intelliflow-crm.com` - Include our internal SPF records
- `include:sendgrid.net` - Authorize SendGrid to send on our behalf
- `include:amazonses.com` - Authorize Amazon SES as backup
- `~all` - Soft fail for unauthorized senders (use `-all` for strict enforcement in production)

#### DKIM Records

**Primary Selector (`ifc1`):**

```dns
Type:  TXT
Host:  ifc1._domainkey
Value: v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE[...public key...]
TTL:   3600
```

**Secondary Selector (`ifc2` - for key rotation):**

```dns
Type:  TXT
Host:  ifc2._domainkey
Value: v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE[...public key...]
TTL:   3600
```

**DKIM Configuration Options:**
- `v=DKIM1` - DKIM version
- `k=rsa` - Key type (RSA)
- `p=...` - Base64-encoded public key
- `t=s` (optional) - Strict mode, only applies to exact domain
- `t=y` (optional) - Testing mode, still learning

#### DMARC Record

```dns
Type:  TXT
Host:  _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@intelliflow-crm.com; ruf=mailto:dmarc-forensic@intelliflow-crm.com; sp=quarantine; adkim=r; aspf=r; pct=100
TTL:   3600
```

**Breakdown:**
- `v=DMARC1` - DMARC version
- `p=quarantine` - Policy for failures (none/quarantine/reject)
- `rua=mailto:...` - Aggregate report destination
- `ruf=mailto:...` - Forensic report destination
- `sp=quarantine` - Subdomain policy
- `adkim=r` - DKIM alignment mode (relaxed)
- `aspf=r` - SPF alignment mode (relaxed)
- `pct=100` - Apply policy to 100% of messages

#### MX Records (for inbound email)

```dns
Type:  MX
Host:  @
Value: 10 mx1.intelliflow-crm.com
TTL:   3600

Type:  MX
Host:  @
Value: 20 mx2.intelliflow-crm.com
TTL:   3600

Type:  MX
Host:  @
Value: 30 mx-backup.intelliflow-crm.com
TTL:   3600
```

**Priority:**
- 10: Primary mail server
- 20: Secondary mail server
- 30: Backup mail server

#### CNAME Records (for tracking)

```dns
Type:  CNAME
Host:  em1234
Value: u1234567.wl.sendgrid.net
TTL:   3600

Type:  CNAME
Host:  s1._domainkey
Value: s1.domainkey.u1234567.wl.sendgrid.net
TTL:   3600

Type:  CNAME
Host:  s2._domainkey
Value: s2.domainkey.u1234567.wl.sendgrid.net
TTL:   3600
```

#### A Records (for mail servers)

```dns
Type:  A
Host:  mx1
Value: 203.0.113.10
TTL:   3600

Type:  A
Host:  mx2
Value: 203.0.113.11
TTL:   3600

Type:  A
Host:  mail
Value: 203.0.113.10
TTL:   3600
```

#### PTR Records (Reverse DNS)

**Note:** PTR records must be configured through your hosting provider or ISP.

```dns
IP:     203.0.113.10
Value:  mx1.intelliflow-crm.com

IP:     203.0.113.11
Value:  mx2.intelliflow-crm.com
```

## Subdomain Configuration

### Transactional Email Subdomain

For separating transactional emails from marketing emails:

```dns
# SPF for transactional subdomain
Type:  TXT
Host:  transactional
Value: v=spf1 include:sendgrid.net -all
TTL:   3600

# DKIM for transactional subdomain
Type:  TXT
Host:  ifc1._domainkey.transactional
Value: v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE[...]
TTL:   3600

# DMARC for transactional subdomain
Type:  TXT
Host:  _dmarc.transactional
Value: v=DMARC1; p=reject; rua=mailto:dmarc-reports@intelliflow-crm.com; pct=100
TTL:   3600
```

### Marketing Email Subdomain

```dns
# SPF for marketing subdomain
Type:  TXT
Host:  marketing
Value: v=spf1 include:sendgrid.net include:mailchimp.com -all
TTL:   3600

# DMARC for marketing subdomain
Type:  TXT
Host:  _dmarc.marketing
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@intelliflow-crm.com; pct=100
TTL:   3600
```

## Verification Commands

### SPF Verification

```bash
# Check SPF record
dig +short TXT intelliflow-crm.com | grep spf

# Verify SPF with nslookup
nslookup -type=TXT intelliflow-crm.com
```

### DKIM Verification

```bash
# Check DKIM record
dig +short TXT ifc1._domainkey.intelliflow-crm.com

# Verify with OpenSSL
echo -n "test" | openssl dgst -sha256 -verify public_key.pem -signature sig.bin
```

### DMARC Verification

```bash
# Check DMARC record
dig +short TXT _dmarc.intelliflow-crm.com
```

### MX Verification

```bash
# Check MX records
dig +short MX intelliflow-crm.com
```

### Reverse DNS Verification

```bash
# Check PTR record
dig +short -x 203.0.113.10
```

## BIMI (Brand Indicators for Message Identification)

For displaying brand logo in supported email clients:

```dns
Type:  TXT
Host:  default._bimi
Value: v=BIMI1; l=https://intelliflow-crm.com/assets/brand/logo.svg; a=https://intelliflow-crm.com/assets/brand/vmc.pem
TTL:   3600
```

**Requirements:**
- SVG logo must be in Tiny PS format
- VMC (Verified Mark Certificate) required for full support
- DMARC policy must be `p=quarantine` or `p=reject`

## Monitoring and Reporting

### DMARC Report Analysis

Set up automated processing of DMARC aggregate reports:

1. Configure email receiving for `dmarc-reports@intelliflow-crm.com`
2. Parse XML reports for authentication failures
3. Alert on high failure rates (>5%)

### Deliverability Monitoring

Track these metrics:
- **Delivery rate**: Target >= 95%
- **Bounce rate**: Target <= 2%
- **Spam complaint rate**: Target <= 0.1%
- **DKIM pass rate**: Target >= 99%
- **SPF pass rate**: Target >= 99%

## Key Rotation Schedule

### DKIM Key Rotation

1. **Generate new key pair** (30 days before rotation)
2. **Publish new DKIM record** using alternate selector
3. **Wait for DNS propagation** (48-72 hours)
4. **Switch signing to new key** in application
5. **Monitor authentication rates** for 1 week
6. **Remove old DKIM record** after 30 days

### Recommended Schedule

| Selector | Active From | Retire Date |
|----------|-------------|-------------|
| ifc1     | 2024-01-01  | 2024-06-30  |
| ifc2     | 2024-07-01  | 2024-12-31  |
| ifc1     | 2025-01-01  | 2025-06-30  |

## Troubleshooting

### Common Issues

1. **SPF "permerror"**
   - Too many DNS lookups (>10)
   - Use `include` macros carefully
   - Flatten SPF if needed

2. **DKIM signature fails**
   - Check key length (minimum 1024-bit, recommended 2048-bit)
   - Verify canonicalization settings
   - Ensure body hasn't been modified

3. **DMARC fails despite passing SPF/DKIM**
   - Check alignment (From header must match)
   - Use relaxed alignment initially

4. **Emails going to spam**
   - Review content for spam triggers
   - Check IP reputation
   - Warm up new sending domains/IPs gradually

### Email Testing Tools

- [Mail Tester](https://www.mail-tester.com/)
- [MX Toolbox](https://mxtoolbox.com/)
- [DMARC Analyzer](https://www.dmarcanalyzer.com/)
- [Google Postmaster Tools](https://postmaster.google.com/)

## References

- [RFC 7208 - SPF](https://tools.ietf.org/html/rfc7208)
- [RFC 6376 - DKIM](https://tools.ietf.org/html/rfc6376)
- [RFC 7489 - DMARC](https://tools.ietf.org/html/rfc7489)
- [RFC 8617 - ARC](https://tools.ietf.org/html/rfc8617)
- [BIMI Group](https://bimigroup.org/)
