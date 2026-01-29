import { ValueObject } from './ValueObject';
import { Result, DomainError } from './Result';

/**
 * WebsiteUrl Value Object
 *
 * Encapsulates URL validation and normalization.
 * Ensures all URLs are valid, normalized, and provide consistent access to URL components.
 *
 * @example
 * const result = WebsiteUrl.create('example.com');
 * if (result.isSuccess) {
 *   console.log(result.value.normalized); // "https://example.com"
 *   console.log(result.value.domain);     // "example.com"
 * }
 */

interface WebsiteUrlProps {
  value: string; // Normalized URL (with protocol)
}

export class InvalidUrlError extends DomainError {
  readonly code = 'INVALID_URL';

  constructor(url: string, reason?: string) {
    const message = reason ? `Invalid URL: ${url} (${reason})` : `Invalid URL: ${url}`;
    super(message);
  }
}

export class WebsiteUrl extends ValueObject<WebsiteUrlProps> {
  /**
   * Allowed protocols for website URLs
   */
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];

  /**
   * Maximum URL length (reasonable limit to prevent abuse)
   */
  private static readonly MAX_URL_LENGTH = 2048;

  /**
   * Create a WebsiteUrl from a string
   *
   * Accepts URLs with or without protocol. If protocol is missing, https:// is added.
   *
   * @param value - URL string (e.g., "example.com", "https://example.com")
   * @returns Result containing WebsiteUrl or InvalidUrlError
   */
  static create(value: string | null | undefined): Result<WebsiteUrl, InvalidUrlError> {
    if (!value) {
      return Result.fail(new InvalidUrlError('', 'URL cannot be empty'));
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return Result.fail(new InvalidUrlError(value, 'URL cannot be empty'));
    }

    if (trimmed.length > this.MAX_URL_LENGTH) {
      return Result.fail(new InvalidUrlError(value, `URL exceeds maximum length of ${this.MAX_URL_LENGTH}`));
    }

    // Add protocol if missing
    let urlWithProtocol = trimmed;
    if (!trimmed.match(/^https?:\/\//i)) {
      urlWithProtocol = `https://${trimmed}`;
    }

    // Validate using URL constructor
    let url: URL;
    try {
      url = new URL(urlWithProtocol);
    } catch (error) {
      return Result.fail(new InvalidUrlError(value, 'malformed URL'));
    }

    // Validate protocol
    if (!this.ALLOWED_PROTOCOLS.includes(url.protocol)) {
      return Result.fail(
        new InvalidUrlError(value, `protocol must be http or https, got ${url.protocol}`)
      );
    }

    // Validate hostname exists
    if (!url.hostname || url.hostname.length === 0) {
      return Result.fail(new InvalidUrlError(value, 'missing hostname'));
    }

    // Normalize: remove trailing slash from pathname if it's just "/"
    const normalized = url.pathname === '/' && url.search === '' && url.hash === ''
      ? `${url.protocol}//${url.host}`
      : url.href;

    return Result.ok(new WebsiteUrl({ value: normalized }));
  }

  /**
   * Get the normalized URL string
   */
  get value(): string {
    return this.props.value;
  }

  /**
   * Get the normalized URL (alias for value)
   */
  get normalized(): string {
    return this.props.value;
  }

  /**
   * Get the domain/hostname (e.g., "example.com")
   */
  get domain(): string {
    try {
      const url = new URL(this.props.value);
      return url.hostname;
    } catch {
      // Should never happen as we validated in create()
      return '';
    }
  }

  /**
   * Get the protocol (e.g., "https:")
   */
  get protocol(): string {
    try {
      const url = new URL(this.props.value);
      return url.protocol;
    } catch {
      return '';
    }
  }

  /**
   * Get the path (e.g., "/about")
   */
  get path(): string {
    try {
      const url = new URL(this.props.value);
      return url.pathname;
    } catch {
      return '';
    }
  }

  /**
   * Check if URL uses HTTPS
   */
  get isSecure(): boolean {
    return this.protocol === 'https:';
  }

  /**
   * Get URL without protocol (e.g., "example.com/about")
   */
  get withoutProtocol(): string {
    return this.props.value.replace(/^https?:\/\//, '');
  }

  /**
   * Get raw value for serialization
   */
  toValue(): string {
    return this.props.value;
  }

  /**
   * Convert to string (returns normalized URL)
   */
  toString(): string {
    return this.props.value;
  }
}
