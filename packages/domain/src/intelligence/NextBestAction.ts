/**
 * NextBestAction Value Object (IFC-095)
 *
 * Encapsulates next best action recommendation with validation
 * and priority handling. Immutable and self-validating.
 *
 * @module @intelliflow/domain/intelligence
 */

import { ValueObject } from '../shared/ValueObject';
import {
  NBA_ACTION_TYPES,
  NBA_ACTION_PRIORITIES,
  type NBAActionType,
  type NBAActionPriority,
} from '../ai/AIConstants';

export class InvalidActionTypeError extends Error {
  constructor(value: string) {
    super(`Invalid action type: ${value}. Must be one of: ${NBA_ACTION_TYPES.join(', ')}`);
    this.name = 'InvalidActionTypeError';
  }
}

export class InvalidPriorityError extends Error {
  constructor(value: string) {
    super(`Invalid priority: ${value}. Must be one of: ${NBA_ACTION_PRIORITIES.join(', ')}`);
    this.name = 'InvalidPriorityError';
  }
}

interface NextBestActionProps {
  actionType: NBAActionType;
  priority: NBAActionPriority;
  rationale: string;
  deadline: Date | null;
  confidence?: number;
}

interface CreateNextBestActionInput {
  actionType: string;
  priority: string;
  rationale: string;
  deadline: Date | null;
  confidence?: number;
}

/**
 * NextBestAction value object representing AI-recommended action
 */
export class NextBestAction extends ValueObject<NextBestActionProps> {
  private constructor(props: NextBestActionProps) {
    super(props);
  }

  /**
   * Create a new NextBestAction
   * @param input - Action creation input
   * @throws InvalidActionTypeError if action type is not recognized
   * @throws InvalidPriorityError if priority is not recognized
   */
  static create(input: CreateNextBestActionInput): NextBestAction {
    const { actionType, priority, rationale, deadline, confidence } = input;

    // Validate action type
    if (!NBA_ACTION_TYPES.includes(actionType as NBAActionType)) {
      throw new InvalidActionTypeError(actionType);
    }

    // Validate priority
    if (!NBA_ACTION_PRIORITIES.includes(priority as NBAActionPriority)) {
      throw new InvalidPriorityError(priority);
    }

    return new NextBestAction({
      actionType: actionType as NBAActionType,
      priority: priority as NBAActionPriority,
      rationale,
      deadline,
      confidence,
    });
  }

  /**
   * Get the action type
   */
  getActionType(): NBAActionType {
    return this.props.actionType;
  }

  /**
   * Get the priority level
   */
  getPriority(): NBAActionPriority {
    return this.props.priority;
  }

  /**
   * Get the rationale for this recommendation
   */
  getRationale(): string {
    return this.props.rationale;
  }

  /**
   * Get the deadline (or null if no deadline)
   */
  getDeadline(): Date | null {
    return this.props.deadline;
  }

  /**
   * Get confidence score (optional)
   */
  getConfidence(): number | undefined {
    return this.props.confidence;
  }

  /**
   * Check if this action is urgent (CRITICAL or HIGH priority)
   */
  isUrgent(): boolean {
    return this.props.priority === 'CRITICAL' || this.props.priority === 'HIGH';
  }

  /**
   * Check if this action has a deadline
   */
  hasDeadline(): boolean {
    return this.props.deadline !== null;
  }

  /**
   * Check if deadline is overdue
   */
  isOverdue(): boolean {
    if (!this.props.deadline) return false;
    return new Date() > this.props.deadline;
  }

  /**
   * Serialize to plain object for storage/API response
   */
  toValue(): {
    actionType: NBAActionType;
    priority: NBAActionPriority;
    rationale: string;
    deadline: string | null;
    confidence?: number;
  } {
    return {
      actionType: this.props.actionType,
      priority: this.props.priority,
      rationale: this.props.rationale,
      deadline: this.props.deadline?.toISOString() ?? null,
      confidence: this.props.confidence,
    };
  }
}
