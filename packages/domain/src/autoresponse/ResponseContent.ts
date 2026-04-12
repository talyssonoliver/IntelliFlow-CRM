import { ValueObject } from '../shared/ValueObject';

/**
 * ResponseContent - Value object for auto-response email content
 */
interface ResponseContentProps {
  subject: string;
  body: string;
  signature?: string;
  replyTo?: string;
}

export class ResponseContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResponseContentValidationError';
  }
}

export class ResponseContent extends ValueObject<ResponseContentProps> {
  private static readonly MAX_SUBJECT_LENGTH = 100;
  private static readonly MAX_BODY_LENGTH = 2000;

  private constructor(props: ResponseContentProps) {
    super(props);
  }

  static create(props: ResponseContentProps): ResponseContent {
    if (!props.subject || props.subject.trim().length === 0) {
      throw new ResponseContentValidationError('Subject is required');
    }
    if (props.subject.length > this.MAX_SUBJECT_LENGTH) {
      throw new ResponseContentValidationError(
        `Subject exceeds ${this.MAX_SUBJECT_LENGTH} characters`
      );
    }
    if (!props.body || props.body.trim().length === 0) {
      throw new ResponseContentValidationError('Body is required');
    }
    if (props.body.length > this.MAX_BODY_LENGTH) {
      throw new ResponseContentValidationError(`Body exceeds ${this.MAX_BODY_LENGTH} characters`);
    }
    return new ResponseContent({
      subject: props.subject.trim(),
      body: props.body.trim(),
      signature: props.signature?.trim(),
      replyTo: props.replyTo?.trim(),
    });
  }

  get subject(): string {
    return this.props.subject;
  }

  get body(): string {
    return this.props.body;
  }

  get signature(): string | undefined {
    return this.props.signature;
  }

  get replyTo(): string | undefined {
    return this.props.replyTo;
  }

  toValue(): ResponseContentProps {
    return { ...this.props };
  }

  /**
   * Create a modified copy of the content
   */
  withModifications(modifications: { subject?: string; body?: string }): ResponseContent {
    return ResponseContent.create({
      subject: modifications.subject ?? this.props.subject,
      body: modifications.body ?? this.props.body,
      signature: this.props.signature,
      replyTo: this.props.replyTo,
    });
  }
}
