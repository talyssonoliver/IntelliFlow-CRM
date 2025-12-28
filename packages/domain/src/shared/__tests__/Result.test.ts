import { describe, it, expect } from 'vitest';
import { Result, DomainError } from '../Result';

// Custom error types for testing
class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message);
  }
}

class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor(
    message: string,
    public readonly id: string
  ) {
    super(message);
  }
}

class BusinessError extends DomainError {
  readonly code = 'BUSINESS_ERROR';

  constructor(message: string) {
    super(message);
  }
}

describe('Result', () => {
  describe('Result.ok - success case', () => {
    it('should create successful result with value', () => {
      const result = Result.ok(42);

      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.value).toBe(42);
    });

    it('should handle string values', () => {
      const result = Result.ok('success message');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('success message');
    });

    it('should handle object values', () => {
      const data = { id: '123', name: 'Test' };
      const result = Result.ok(data);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(data);
      expect(result.value.id).toBe('123');
    });

    it('should handle array values', () => {
      const result = Result.ok([1, 2, 3, 4, 5]);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle null as valid value', () => {
      const result = Result.ok(null);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(null);
    });

    it('should handle undefined as valid value', () => {
      const result = Result.ok(undefined);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(undefined);
    });

    it('should handle boolean values', () => {
      const trueResult = Result.ok(true);
      const falseResult = Result.ok(false);

      expect(trueResult.isSuccess).toBe(true);
      expect(trueResult.value).toBe(true);
      expect(falseResult.isSuccess).toBe(true);
      expect(falseResult.value).toBe(false);
    });

    it('should throw when accessing error on success', () => {
      const result = Result.ok(42);

      expect(() => result.error).toThrow('Cannot get error from successful result');
    });
  });

  describe('Result.fail - failure case', () => {
    it('should create failed result with error', () => {
      const error = new Error('Something went wrong');
      const result = Result.fail(error);

      expect(result.isSuccess).toBe(false);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(error);
    });

    it('should handle custom error types', () => {
      const error = new ValidationError('Invalid email', 'email');
      const result = Result.fail<string, ValidationError>(error);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(error);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.field).toBe('email');
    });

    it('should handle string errors', () => {
      const result = Result.fail<number, string>('Error message');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Error message');
    });

    it('should handle domain errors', () => {
      const error = new NotFoundError('User not found', 'user-123');
      const result = Result.fail<any, NotFoundError>(error);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.id).toBe('user-123');
    });

    it('should throw when accessing value on failure', () => {
      const result = Result.fail(new Error('Failed'));

      expect(() => result.value).toThrow('Cannot get value from failed result');
    });
  });

  describe('isSuccess and isFailure', () => {
    it('should return correct boolean for success', () => {
      const result = Result.ok(42);

      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
    });

    it('should return correct boolean for failure', () => {
      const result = Result.fail(new Error('Failed'));

      expect(result.isSuccess).toBe(false);
      expect(result.isFailure).toBe(true);
    });

    it('should be mutually exclusive', () => {
      const success = Result.ok(42);
      const failure = Result.fail(new Error('Failed'));

      expect(success.isSuccess && success.isFailure).toBe(false);
      expect(failure.isSuccess && failure.isFailure).toBe(false);
    });
  });

  describe('map - transform success value', () => {
    it('should transform success value', () => {
      const result = Result.ok(5).map((x) => x * 2);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(10);
    });

    it('should not execute map on failure', () => {
      let executed = false;
      const result = Result.fail<number>(new Error('Failed')).map((x) => {
        executed = true;
        return x * 2;
      });

      expect(executed).toBe(false);
      expect(result.isFailure).toBe(true);
    });

    it('should chain multiple map operations', () => {
      const result = Result.ok(10)
        .map((x) => x + 5)
        .map((x) => x * 2)
        .map((x) => x.toString());

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('30');
    });

    it('should preserve error through map chain', () => {
      const error = new Error('Initial error');
      const result = Result.fail<number>(error)
        .map((x) => x + 1)
        .map((x) => x * 2);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(error);
    });

    it('should handle type transformations', () => {
      const result = Result.ok(42).map((x) => ({ value: x, doubled: x * 2 }));

      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual({ value: 42, doubled: 84 });
    });

    it('should handle map to null', () => {
      const result = Result.ok(42).map(() => null);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(null);
    });

    it('should handle map to undefined', () => {
      const result = Result.ok(42).map(() => undefined);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(undefined);
    });
  });

  describe('flatMap - monadic bind', () => {
    it('should chain result-returning operations', () => {
      const divide = (a: number, b: number): Result<number, string> => {
        if (b === 0) return Result.fail('Division by zero');
        return Result.ok(a / b);
      };

      const result = Result.ok(10).flatMap((x) => divide(x, 2));

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(5);
    });

    it('should short-circuit on first failure', () => {
      const divide = (a: number, b: number): Result<number, string> => {
        if (b === 0) return Result.fail('Division by zero');
        return Result.ok(a / b);
      };

      const result = Result.ok(10)
        .flatMap((x) => divide(x, 0))
        .flatMap((x) => divide(x, 2));

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe('Division by zero');
    });

    it('should not execute flatMap on failure', () => {
      let executed = false;
      const result = Result.fail<number>(new Error('Failed')).flatMap((x) => {
        executed = true;
        return Result.ok(x * 2);
      });

      expect(executed).toBe(false);
      expect(result.isFailure).toBe(true);
    });

    it('should chain multiple flatMap operations', () => {
      const result = Result.ok(5)
        .flatMap((x) => Result.ok(x + 5))
        .flatMap((x) => Result.ok(x * 2))
        .flatMap((x) => Result.ok(x.toString()));

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('20');
    });

    it('should preserve error type through chain', () => {
      const error = new ValidationError('Invalid input', 'input');
      const result = Result.fail<number, ValidationError>(error)
        .flatMap((x) => Result.ok(x + 1))
        .flatMap((x) => Result.ok(x * 2));

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(error);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle complex validation chains', () => {
      const validatePositive = (n: number): Result<number, string> => {
        return n > 0 ? Result.ok(n) : Result.fail('Must be positive');
      };

      const validateLessThan100 = (n: number): Result<number, string> => {
        return n < 100 ? Result.ok(n) : Result.fail('Must be less than 100');
      };

      const validResult = Result.ok(50).flatMap(validatePositive).flatMap(validateLessThan100);

      const invalidResult = Result.ok(-5).flatMap(validatePositive).flatMap(validateLessThan100);

      expect(validResult.isSuccess).toBe(true);
      expect(validResult.value).toBe(50);

      expect(invalidResult.isFailure).toBe(true);
      expect(invalidResult.error).toBe('Must be positive');
    });
  });

  describe('getOrElse - default value', () => {
    it('should return value on success', () => {
      const result = Result.ok(42);
      expect(result.getOrElse(0)).toBe(42);
    });

    it('should return default on failure', () => {
      const result = Result.fail<number>(new Error('Failed'));
      expect(result.getOrElse(0)).toBe(0);
    });

    it('should handle null as default', () => {
      const result = Result.fail<string>(new Error('Failed'));
      expect(result.getOrElse(null)).toBe(null);
    });

    it('should handle object as default', () => {
      const defaultValue = { id: 'default', name: 'Default' };
      const result = Result.fail<{ id: string; name: string }>(new Error('Failed'));

      expect(result.getOrElse(defaultValue)).toBe(defaultValue);
    });

    it('should use provided default value on failure', () => {
      const result = Result.fail<number>(new Error('Failed'));

      // getOrElse takes a value, not a function, so it's always evaluated
      // This test verifies the default is returned on failure
      const defaultValue = result.getOrElse(99);

      expect(defaultValue).toBe(99);
    });
  });

  describe('getOrThrow - unwrap with exception', () => {
    it('should return value on success', () => {
      const result = Result.ok(42);
      expect(result.getOrThrow()).toBe(42);
    });

    it('should throw error on failure', () => {
      const error = new Error('Failed');
      const result = Result.fail(error);

      expect(() => result.getOrThrow()).toThrow(error);
    });

    it('should throw custom error on failure', () => {
      const error = new ValidationError('Invalid field', 'email');
      const result = Result.fail(error);

      expect(() => result.getOrThrow()).toThrow(ValidationError);
      expect(() => result.getOrThrow()).toThrow('Invalid field');
    });

    it('should throw string error', () => {
      const result = Result.fail<number, string>('String error');

      expect(() => result.getOrThrow()).toThrow('String error');
    });
  });

  describe('railway-oriented programming patterns', () => {
    it('should support railway-oriented error handling', () => {
      const validateEmail = (email: string): Result<string, ValidationError> => {
        if (!email.includes('@')) {
          return Result.fail(new ValidationError('Invalid email format', 'email'));
        }
        return Result.ok(email);
      };

      const normalizeEmail = (email: string): Result<string, ValidationError> => {
        return Result.ok(email.toLowerCase().trim());
      };

      const saveEmail = (email: string): Result<string, ValidationError> => {
        // Simulate save
        return Result.ok(email);
      };

      // Happy path
      const successResult = Result.ok('Test@Example.com')
        .flatMap(validateEmail)
        .flatMap(normalizeEmail)
        .flatMap(saveEmail);

      expect(successResult.isSuccess).toBe(true);
      expect(successResult.value).toBe('test@example.com');

      // Sad path
      const failureResult = Result.ok('invalid-email')
        .flatMap(validateEmail)
        .flatMap(normalizeEmail)
        .flatMap(saveEmail);

      expect(failureResult.isFailure).toBe(true);
      expect(failureResult.error.code).toBe('VALIDATION_ERROR');
    });

    it('should support combining results', () => {
      const result1 = Result.ok(5);
      const result2 = Result.ok(10);

      const combined = result1.flatMap((a) => result2.map((b) => a + b));

      expect(combined.isSuccess).toBe(true);
      expect(combined.value).toBe(15);
    });

    it('should handle early exit on first error', () => {
      let step2Called = false;
      let step3Called = false;

      const result = Result.ok(10)
        .flatMap((x) => {
          if (x < 20) return Result.fail(new Error('Too small'));
          return Result.ok(x);
        })
        .flatMap((x) => {
          step2Called = true;
          return Result.ok(x * 2);
        })
        .flatMap((x) => {
          step3Called = true;
          return Result.ok(x + 5);
        });

      expect(result.isFailure).toBe(true);
      expect(step2Called).toBe(false);
      expect(step3Called).toBe(false);
    });
  });

  describe('type safety', () => {
    it('should preserve generic types', () => {
      const numberResult = Result.ok<number>(42);
      const stringResult = Result.ok<string>('hello');

      const num: number = numberResult.value;
      const str: string = stringResult.value;

      expect(typeof num).toBe('number');
      expect(typeof str).toBe('string');
    });

    it('should support different error types', () => {
      const validationResult = Result.fail<string, ValidationError>(
        new ValidationError('Invalid', 'field')
      );
      const notFoundResult = Result.fail<string, NotFoundError>(
        new NotFoundError('Not found', 'id')
      );

      expect(validationResult.error).toBeInstanceOf(ValidationError);
      expect(notFoundResult.error).toBeInstanceOf(NotFoundError);
    });
  });

  describe('DomainError', () => {
    it('should extend Error class', () => {
      const error = new ValidationError('Test error', 'field');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should have error code', () => {
      const validationError = new ValidationError('Validation failed', 'email');
      const notFoundError = new NotFoundError('Not found', 'user-123');
      const businessError = new BusinessError('Business rule violated');

      expect(validationError.code).toBe('VALIDATION_ERROR');
      expect(notFoundError.code).toBe('NOT_FOUND');
      expect(businessError.code).toBe('BUSINESS_ERROR');
    });

    it('should have error message', () => {
      const error = new ValidationError('Invalid email format', 'email');

      expect(error.message).toBe('Invalid email format');
    });

    it('should set error name from constructor', () => {
      const validationError = new ValidationError('Test', 'field');
      const notFoundError = new NotFoundError('Test', 'id');

      expect(validationError.name).toBe('ValidationError');
      expect(notFoundError.name).toBe('NotFoundError');
    });

    it('should support custom properties', () => {
      const validationError = new ValidationError('Invalid field', 'email');
      const notFoundError = new NotFoundError('User not found', 'user-123');

      expect(validationError.field).toBe('email');
      expect(notFoundError.id).toBe('user-123');
    });

    it('should be throwable', () => {
      const error = new BusinessError('Business rule violated');

      expect(() => {
        throw error;
      }).toThrow(BusinessError);
      expect(() => {
        throw error;
      }).toThrow('Business rule violated');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string as value', () => {
      const result = Result.ok('');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('');
    });

    it('should handle zero as value', () => {
      const result = Result.ok(0);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should handle false as value', () => {
      const result = Result.ok(false);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should handle complex nested transformations', () => {
      const result = Result.ok({ a: 1, b: { c: 2 } })
        .map((x) => ({ ...x, b: { ...x.b, c: x.b.c * 2 } }))
        .map((x) => ({ ...x, total: x.a + x.b.c }));

      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual({
        a: 1,
        b: { c: 4 },
        total: 5,
      });
    });

    it('should handle very long chains', () => {
      let result: Result<number> = Result.ok(0);

      for (let i = 0; i < 100; i++) {
        result = result.map((x) => x + 1);
      }

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(100);
    });

    it('should maintain immutability', () => {
      const original = Result.ok({ count: 0 });
      const modified = original.map((x) => ({ count: x.count + 1 }));

      expect(original.value.count).toBe(0);
      expect(modified.value.count).toBe(1);
    });
  });
});
