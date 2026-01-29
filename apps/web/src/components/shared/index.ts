/**
 * Shared Components
 *
 * Reusable components used across multiple pages.
 * Follow the design system defined in docs/design/UI_DEVELOPMENT_PROMPT.md
 */

// Page Layout Components
export {
  PageHeader,
  Breadcrumbs,
  type PageHeaderProps,
  type BreadcrumbItem,
  type PageAction,
} from './page-header';

export {
  EntityHeader,
  type EntityHeaderProps,
  type EntityBadge,
} from './entity-header';

// Form Components
export { ContactForm } from './contact-form';
export { ApplicationForm } from './application-form';
export { ApplyButton } from './apply-button';

// Template Components
export { JobDetailTemplate } from './job-detail-template';
export { LandingBuilder } from './landing-builder';

// Auth Components
export {
  GoogleSignInButton,
  MicrosoftSignInButton,
  SocialLoginGrid,
  OAuthDivider,
  GoogleIcon,
  MicrosoftIcon,
  type AuthProviderButtonProps,
  type SocialLoginGridProps,
  type OAuthDividerProps,
} from './auth-providers';

// Auth Page Components
export { AuthBackground, type AuthBackgroundProps } from './auth-background';
export { AuthCard, type AuthCardProps } from './auth-card';
export { PasswordInput, type PasswordInputProps } from './password-input';
export {
  TrustIndicators,
  type TrustIndicatorsProps,
  type TrustIndicatorItem,
} from './trust-indicators';

// Registration Components
export {
  RegistrationForm,
  type RegistrationFormData,
  type RegistrationFormErrors,
  type RegistrationFormProps,
} from './registration-form';

// Password Reset Components
export {
  PasswordResetForm,
  PasswordStrengthIndicator,
  TokenExpiryWarning,
  ResetSuccess,
  TokenInvalid,
  type PasswordResetFormProps,
  type PasswordResetFormErrors,
  type PasswordStrengthIndicatorProps,
  type TokenExpiryWarningProps,
  type ResetSuccessProps,
  type TokenInvalidProps,
} from './password-reset';

// Onboarding Components
export {
  OnboardingFlow,
  DEFAULT_ONBOARDING_STEPS,
  type OnboardingFlowProps,
  type OnboardingStep,
} from './onboarding-flow';

// List Page Components
export {
  SearchFilterBar,
  useFilterState,
  useMultiFilterState,
  type SearchFilterBarProps,
  type FilterOption,
  type FilterDropdownConfig,
  type FilterChip,
  type SortOption,
} from './search-filter-bar';

// MFA Components
export { MfaQrGenerator, type MfaQrGeneratorProps } from './mfa-qr-generator';
export { BackupCodesDisplay, type BackupCodesDisplayProps } from './backup-codes-display';
export { MfaVerification, type MfaVerificationProps } from './mfa-verification';

// Email Verification Components
export {
  EmailVerification,
  type EmailVerificationProps,
  type VerificationStatus,
} from './email-verification';

// OAuth Callback Components (PG-024)
export {
  OAuthCallback,
  type OAuthCallbackProps,
  type OAuthCallbackStatus,
} from './oauth-callback';

// Code Validation Utilities
export {
  validateCodeFormat,
  sanitizeCode,
  formatCodeForDisplay,
  isValidTotpCode,
  isValidBackupCode,
  getCodeError,
  CODE_LENGTH,
  BACKUP_CODE_LENGTH,
} from '@/lib/shared/code-validator';
