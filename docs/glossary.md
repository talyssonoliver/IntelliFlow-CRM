# IntelliFlow CRM Glossary

## A

### Aggregate Root

The main entity in a DDD bounded context that controls access to child entities.
Examples: Lead, Contact, Account, Opportunity, Task.

### ADR (Architecture Decision Record)

A document capturing an important architectural decision along with its context
and consequences.

## B

### Bounded Context

A central pattern in DDD that defines explicit boundaries between different
parts of the domain model.

## C

### Contact

A person record in the CRM, typically created when a lead is converted or
directly added.

### CQRS (Command Query Responsibility Segregation)

A pattern that separates read and write operations for a data store.

## D

### Domain Event

An event that captures something that happened in the domain. Used for loose
coupling between aggregates.

### DDD (Domain-Driven Design)

An approach to software development that centers the project on the core domain
and domain logic.

## H

### Hexagonal Architecture

Also known as Ports and Adapters. An architectural pattern that places business
logic at the center, with adapters for external dependencies.

## L

### Lead

A potential customer record in the CRM. Leads can be scored, qualified, and
converted to contacts.

### Lead Score

A numeric value (0-100) indicating the likelihood of a lead converting,
calculated by AI.

## O

### Opportunity

A sales deal being tracked through pipeline stages from prospecting to close.

### OpenTelemetry

A collection of tools, APIs, and SDKs for instrumenting, generating, collecting,
and exporting telemetry data.

## P

### Port (Architecture)

An interface that defines how the application core communicates with the outside
world.

### pgvector

PostgreSQL extension for storing and querying vector embeddings.

## R

### RAG (Retrieval-Augmented Generation)

An AI technique that retrieves relevant documents to augment LLM responses.

### RLS (Row-Level Security)

PostgreSQL feature that restricts which rows users can access based on security
policies.

## S

### Supabase

Backend-as-a-service providing PostgreSQL, authentication, and real-time
features.

## T

### Task

An activity or follow-up item associated with leads, contacts, or opportunities.

### tRPC

Type-safe RPC framework for TypeScript, providing end-to-end type safety.

## V

### Value Object

An immutable object defined by its attributes rather than identity. Example:
Email, LeadScore.

## Z

### Zero Trust

Security model that requires verification from everyone trying to access
resources, regardless of location.

### Zod

TypeScript-first schema validation library used for runtime type checking.
