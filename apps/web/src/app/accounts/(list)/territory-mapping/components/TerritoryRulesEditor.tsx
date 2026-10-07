'use client';

/**
 * Rule rows for a territory (PG-197): country (required), optional region and
 * postcode prefix. Duplicate detection uses the same key as the server and the
 * DB de-duplication index (BR-19): country + case-insensitive region + postal
 * match key, blank ≡ absent.
 */
import { Button, Input } from '@intelliflow/ui';
import { TERRITORY_LIMITS, postalMatchKey, regionMatchKey } from '@intelliflow/domain';
import { CountrySelect } from '@/components/shared/country-select';

export interface RuleDraft {
  key: string;
  country: string | null;
  region: string;
  postalPrefix: string;
}

export interface RuleIssue {
  /** Zero-based index of the row the issue is reported on. */
  index: number;
  message: string;
}

function ruleKey(rule: RuleDraft): string {
  return [
    rule.country,
    regionMatchKey(rule.region) ?? '',
    postalMatchKey(rule.postalPrefix) ?? '',
  ].join('|');
}

/** Missing countries and duplicate rules, reported at the offending (second) row. */
export function findRuleIssues(rules: readonly RuleDraft[]): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const seen = new Map<string, number>();
  rules.forEach((rule, index) => {
    if (!rule.country) {
      issues.push({ index, message: `Choose a country for rule ${index + 1}.` });
      return;
    }
    const key = ruleKey(rule);
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, index);
      return;
    }
    issues.push({
      index,
      message: `Rules ${first + 1} and ${index + 1} cover the same area. Change or remove one.`,
    });
  });
  return issues;
}

let ruleKeySeq = 0;
export function newRuleDraft(partial: Partial<Omit<RuleDraft, 'key'>> = {}): RuleDraft {
  ruleKeySeq += 1;
  return { key: `rule-${ruleKeySeq}`, country: null, region: '', postalPrefix: '', ...partial };
}

export interface TerritoryRulesEditorProps {
  rules: RuleDraft[];
  onChange: (rules: RuleDraft[]) => void;
  issues: RuleIssue[];
  /** The default territory may have no rules. */
  isDefault: boolean;
  disabled?: boolean;
}

export function TerritoryRulesEditor({
  rules,
  onChange,
  issues,
  isDefault,
  disabled,
}: Readonly<TerritoryRulesEditorProps>) {
  const update = (index: number, patch: Partial<RuleDraft>) =>
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  const remove = (index: number) => onChange(rules.filter((_, i) => i !== index));
  const issueFor = (index: number) => issues.find((issue) => issue.index === index);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-foreground">Rules</legend>
      <p className="text-xs text-muted-foreground">
        An account matches when any rule matches: same country, and the region and postcode prefix
        when set.{isDefault ? ' The default territory can have no rules.' : ''}
      </p>
      {rules.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {isDefault ? 'No rules — used as the fallback only.' : 'Add at least one rule.'}
        </p>
      )}
      <ol className="space-y-3">
        {rules.map((rule, index) => {
          const n = index + 1;
          const issue = issueFor(index);
          const errorId = issue ? `rule-${rule.key}-error` : undefined;
          return (
            <li key={rule.key} className="rounded-lg border border-border p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <label htmlFor={`rule-${rule.key}-country`} className="text-xs font-medium">
                    Rule {n} country
                  </label>
                  <CountrySelect
                    id={`rule-${rule.key}-country`}
                    value={rule.country}
                    allowClear={false}
                    onChange={(country) => update(index, { country })}
                    ariaInvalid={!!issue}
                    ariaDescribedBy={errorId}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`rule-${rule.key}-region`} className="text-xs font-medium">
                    Rule {n} region
                  </label>
                  <Input
                    id={`rule-${rule.key}-region`}
                    value={rule.region}
                    maxLength={TERRITORY_LIMITS.maxRegionLength}
                    placeholder="Any"
                    onChange={(e) => update(index, { region: e.target.value })}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={errorId}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`rule-${rule.key}-postal`} className="text-xs font-medium">
                    Rule {n} postcode prefix
                  </label>
                  <Input
                    id={`rule-${rule.key}-postal`}
                    value={rule.postalPrefix}
                    maxLength={TERRITORY_LIMITS.maxPostalCodeLength}
                    placeholder="Any"
                    onChange={(e) => update(index, { postalPrefix: e.target.value })}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={errorId}
                    disabled={disabled}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  aria-label={`Remove rule ${n}`}
                  disabled={disabled}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    delete
                  </span>
                </Button>
              </div>
              {issue && (
                <p id={errorId} className="text-xs text-destructive">
                  {issue.message}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rules, newRuleDraft()])}
        disabled={disabled || rules.length >= TERRITORY_LIMITS.maxRulesPerTerritory}
      >
        Add Rule
      </Button>
    </fieldset>
  );
}
