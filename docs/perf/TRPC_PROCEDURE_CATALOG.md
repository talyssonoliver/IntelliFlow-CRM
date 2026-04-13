# tRPC Procedure Catalog

**Generated**: 2026-04-12  
**Source**: `apps/api/src/modules/*/*.router.ts`  
**Total procedures**: 323 (240 queries + 83 mutations + 1 subscription)  
**Module count**: 30

---

## Key

| Column | Meaning |
|--------|---------|
| Procedure | `module.procedureName` |
| Type | Q = query, M = mutation, S = subscription |
| Auth | `pub` = publicProcedure, `auth` = protectedProcedure, `tenant` = tenantProcedure, `admin` = adminProcedure, `authP` = authProcedure (pre-session) |
| Input schema | Named Zod schema from `@intelliflow/validators` (or `inline` if defined locally) |

---

## account (14)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `account.create` | M | tenant | `createAccountSchema` | Create a new account/company |
| `account.getById` | Q | tenant | inline `{ id }` | Fetch account by ID with relations |
| `account.list` | Q | tenant | `accountQuerySchema` | Paginated/filtered account list |
| `account.update` | M | tenant | `updateAccountSchema` | Update account fields |
| `account.delete` | M | tenant | inline `{ id }` | Soft-delete an account |
| `account.stats` | Q | tenant | — | Aggregate account metrics |
| `account.filterOptions` | Q | tenant | — | Distinct values for filter dropdowns |
| `account.getContacts` | Q | tenant | inline `{ accountId }` | Contacts linked to an account |
| `account.getOpportunities` | Q | tenant | inline `{ accountId }` | Opportunities linked to an account |
| `account.getActivity` | Q | tenant | inline `{ accountId }` | Activity timeline for an account |
| `account.getHierarchy` | Q | tenant | inline `{ accountId }` | Parent/child account tree |
| `account.setParent` | M | tenant | inline `{ id, parentId }` | Set parent account |
| `account.assignees` | Q | tenant | — | List all users eligible to own accounts |
| `account.assignOwner` | M | tenant | inline `{ accountId, userId }` | Assign account owner |

---

## admin/queues (6)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `queues.list` | Q | admin | — | List all BullMQ queues and their counts |
| `queues.getByName` | Q | admin | inline `{ name }` | Get queue details by name |
| `queues.pause` | M | admin | inline `{ name }` | Pause a BullMQ queue |
| `queues.resume` | M | admin | inline `{ name }` | Resume a paused queue |
| `queues.retryFailed` | M | admin | inline `{ name }` | Retry all failed jobs in a queue |
| `queues.deleteScheduler` | M | admin | inline `{ name }` | Delete a repeat scheduler |

---

## agent (8)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `agent.listTools` | Q | tenant | — | List all registered agent tools |
| `agent.getTool` | Q | tenant | inline `{ toolId }` | Get single tool definition |
| `agent.executeTool` | M | tenant | inline `{ toolId, input }` | Execute an agent tool |
| `agent.getPendingApprovals` | Q | tenant | — | List tool calls awaiting human approval |
| `agent.getPendingAction` | Q | tenant | inline `{ id }` | Get a single pending approval by ID |
| `agent.approveAction` | M | tenant | inline `{ id, feedback? }` | Approve a pending tool call |
| `agent.rejectAction` | M | tenant | inline `{ id, reason }` | Reject a pending tool call |
| `agent.getPendingCount` | Q | tenant | — | Count of outstanding approvals |

---

## agent/conversation (13)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `conversation.create` | M | tenant | `createConversationSchema` | Start a new AI conversation session |
| `conversation.getById` | Q | tenant | inline `{ id }` | Fetch conversation with messages |
| `conversation.getBySessionId` | Q | tenant | inline `{ sessionId }` | Fetch conversation by session token |
| `conversation.search` | Q | tenant | `conversationSearchSchema` | Full-text search across conversations |
| `conversation.addMessage` | M | tenant | `addMessageSchema` | Append a user/assistant message |
| `conversation.recordToolCall` | M | tenant | `recordToolCallSchema` | Log an agent tool invocation |
| `conversation.updateToolCall` | M | tenant | `updateToolCallSchema` | Update tool call result/status |
| `conversation.approveToolCall` | M | tenant | `approveToolCallSchema` | Human-approve a pending tool call |
| `conversation.endConversation` | M | tenant | inline `{ id }` | Mark conversation complete |
| `conversation.escalate` | M | tenant | inline `{ id, reason }` | Escalate to human support |
| `conversation.getPendingApprovals` | Q | tenant | — | List conversations awaiting approval |
| `conversation.getAnalytics` | Q | admin | inline date range | Conversation volume/quality metrics |
| `conversation.archiveOld` | M | admin | inline `{ olderThanDays }` | Archive old conversation records |

---

## ai-monitoring (11)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `aiMonitoring.getStatus` | Q | tenant | — | Overall AI system health status |
| `aiMonitoring.getDriftMetrics` | Q | tenant | — | Model drift indicators |
| `aiMonitoring.getLatencyMetrics` | Q | tenant | — | P50/P95/P99 latency by model |
| `aiMonitoring.getLatencyTrend` | Q | tenant | inline date range | Latency trend over time |
| `aiMonitoring.getHallucinationReport` | Q | tenant | — | Hallucination rate report |
| `aiMonitoring.getROIMetrics` | Q | tenant | — | Cost vs. value metrics |
| `aiMonitoring.getActiveAgents` | Q | tenant | — | List actively running agents |
| `aiMonitoring.getAgentLogs` | Q | tenant | inline `{ agentId }` | Logs for a specific agent |
| `aiMonitoring.resetAgentStatus` | M | admin | inline `{ agentId }` | Reset agent to idle state |
| `aiMonitoring.deleteAgent` | M | admin | inline `{ agentId }` | Remove agent record |
| `aiMonitoring.getFailedJobs` | Q | admin | — | List failed background AI jobs |

---

## ai-review (8)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `aiReview.list` | Q | tenant | inline filters | List AI-generated responses pending review |
| `aiReview.get` | Q | tenant | inline `{ id }` | Get single review item |
| `aiReview.claim` | M | tenant | inline `{ id }` | Claim a review item for self |
| `aiReview.approve` | M | tenant | inline `{ id, feedback? }` | Approve AI response |
| `aiReview.reject` | M | tenant | inline `{ id, reason }` | Reject AI response |
| `aiReview.escalate` | M | tenant | inline `{ id, reason }` | Escalate to senior reviewer |
| `aiReview.release` | M | tenant | inline `{ id }` | Release claimed item back to queue |
| `aiReview.stats` | Q | tenant | — | Review queue statistics |

---

## analytics (14)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `analytics.dealsWonTrend` | Q | tenant | inline date range | Deals won count over time |
| `analytics.growthTrends` | Q | tenant | inline date range | Pipeline growth trends |
| `analytics.trafficSources` | Q | tenant | — | Lead source breakdown |
| `analytics.recentActivity` | Q | tenant | — | Recent CRM activity feed |
| `analytics.leadStats` | Q | tenant | — | Lead funnel statistics |
| `analytics.exportMetrics` | M | tenant | inline filters | Export metrics as CSV/JSON |
| `analytics.exportConversionFunnel` | M | tenant | inline filters | Export funnel data (deprecated) |
| `analytics.getOverview` | Q | tenant | inline date range | High-level dashboard overview |
| `analytics.getSalesMetrics` | Q | tenant | inline date range | Revenue and deal metrics |
| `analytics.getLeadMetrics` | Q | tenant | inline date range | Lead volume and conversion metrics |
| `analytics.getConversionFunnel` | Q | tenant | inline date range | Stage-by-stage conversion rates |
| `analytics.getTimeSeriesData` | Q | tenant | inline `{ metric, range }` | Arbitrary metric time series |
| `analytics.exportReport` | M | tenant | inline filters | Generate and download full report |
| `analytics.topPerformers` | Q | tenant | inline date range | Top reps by pipeline/deals |

---

## autoresponse (14)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `autoresponse.create` | M | tenant | `createAutoResponseSchema` | Create an AI auto-response draft |
| `autoresponse.getById` | Q | tenant | inline `{ id }` | Get auto-response by ID |
| `autoresponse.list` | Q | tenant | `listAutoResponsesSchema` | List responses with status filter |
| `autoresponse.submitForApproval` | M | tenant | inline `{ id }` | Submit draft for human approval |
| `autoresponse.approve` | M | tenant | inline `{ id }` | Approve and queue for sending |
| `autoresponse.reject` | M | tenant | inline `{ id, reason }` | Reject auto-response |
| `autoresponse.escalate` | M | tenant | inline `{ id, reason }` | Escalate to supervisor |
| `autoresponse.resolveEscalation` | M | tenant | inline `{ id, resolution }` | Resolve escalated response |
| `autoresponse.markSent` | M | tenant | inline `{ id }` | Mark as delivered |
| `autoresponse.markFailed` | M | tenant | inline `{ id, error }` | Mark send as failed |
| `autoresponse.getPendingForApprover` | Q | tenant | — | Queue of items for current approver |
| `autoresponse.rollback` | M | tenant | inline `{ id }` | Rollback approved response |
| `autoresponse.regenerate` | M | tenant | inline `{ id }` | Re-generate AI response content |
| `autoresponse.getStatsByStatus` | Q | tenant | — | Response counts by status |

---

## billing (19)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `billing.getSubscription` | Q | tenant | — | Current tenant subscription details |
| `billing.listInvoices` | Q | tenant | `listInvoicesInputSchema` | Paginated invoice list |
| `billing.getInvoice` | Q | tenant | `getInvoiceInputSchema` | Single invoice by ID |
| `billing.payInvoice` | M | tenant | `payInvoiceInputSchema` | Pay an outstanding invoice |
| `billing.getPaymentMethods` | Q | tenant | — | List saved payment methods |
| `billing.updatePaymentMethod` | M | tenant | `updatePaymentMethodInputSchema` | Update default payment method |
| `billing.removePaymentMethod` | M | tenant | inline `{ paymentMethodId }` | Remove a payment method |
| `billing.updateSubscription` | M | tenant | `updateSubscriptionInputSchema` | Change subscription plan/tier |
| `billing.cancelSubscription` | M | tenant | `cancelSubscriptionInputSchema` | Cancel current subscription |
| `billing.pauseSubscription` | M | tenant | `pauseSubscriptionInputSchema` | Pause subscription billing |
| `billing.getUpcomingInvoice` | Q | tenant | `getUpcomingInvoiceInputSchema` | Preview next invoice |
| `billing.ensureCustomer` | M | tenant | — | Create Stripe customer if missing |
| `billing.getUsageMetrics` | Q | tenant | — | Feature usage for current billing period |
| `billing.getBillingInformation` | Q | tenant | — | Billing address and tax info |
| `billing.updateBillingInformation` | M | tenant | `updateBillingInformationInputSchema` | Update billing address/tax info |
| `billing.createCheckoutSubscription` | M | tenant | inline plan + addons | Start a Stripe Checkout session |
| `billing.sendReceiptEmail` | M | tenant | inline `{ invoiceId }` | Re-send invoice receipt email |
| `billing.handleSubscriptionWebhook` | M | pub | `webhookPayloadSchema` | Process Stripe webhook events |
| `billing.getCheckoutSession` | Q | tenant | inline `{ sessionId }` | Get Stripe Checkout session status |

---

## calendar (7)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `calendar.list` | Q | tenant | — | List calendar events for tenant |
| `calendar.create` | M | tenant | inline event fields | Create a calendar event |
| `calendar.update` | M | tenant | inline `{ id, ...fields }` | Update a calendar event |
| `calendar.delete` | M | tenant | inline `{ id }` | Delete a calendar event |
| `calendarWebhook.getSyncStatus` | Q | tenant | — | Google/Outlook calendar sync status |
| `calendarWebhook.triggerSync` | M | tenant | — | Manually trigger calendar sync |
| `calendarWebhook.listRegistrations` | Q | tenant | — | List active webhook registrations |

---

## chain-version (15)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `chainVersion.create` | M | tenant | `createChainVersionSchema` | Create a new LangChain chain version |
| `chainVersion.update` | M | tenant | `updateChainVersionSchema` | Update chain config/prompts |
| `chainVersion.activate` | M | admin | inline `{ id }` | Set chain version as active |
| `chainVersion.deprecate` | M | admin | inline `{ id }` | Mark chain version deprecated |
| `chainVersion.archive` | M | admin | inline `{ id }` | Archive a chain version |
| `chainVersion.rollback` | M | admin | inline `{ id }` | Roll back to a previous version |
| `chainVersion.getById` | Q | tenant | inline `{ id }` | Fetch chain version by ID |
| `chainVersion.getActive` | Q | tenant | — | Get currently active chain version |
| `chainVersion.getConfig` | Q | tenant | inline `{ id }` | Get chain configuration |
| `chainVersion.list` | Q | tenant | inline filters | List chain versions with filters |
| `chainVersion.getHistory` | Q | tenant | — | Version history timeline |
| `chainVersion.getAuditLog` | Q | admin | inline `{ id }` | Detailed audit log for a chain |
| `chainVersion.getStats` | Q | tenant | — | Performance stats across versions |
| `chainVersion.compare` | Q | tenant | inline `{ idA, idB }` | Diff two chain versions |
| `chainVersion.getZepBudget` | Q | tenant | — | Zep memory budget for current version |

---

## contact (20)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `contact.create` | M | tenant | `createContactSchema` | Create a new contact |
| `contact.getById` | Q | tenant | inline `{ id }` | Fetch contact by ID |
| `contact.getByEmail` | Q | tenant | inline `{ email }` | Look up contact by email |
| `contact.list` | Q | tenant | `contactQuerySchema` | Paginated/filtered contact list |
| `contact.update` | M | tenant | `updateContactSchema` | Update contact fields |
| `contact.delete` | M | tenant | inline `{ id }` | Delete a contact |
| `contact.linkToAccount` | M | tenant | inline `{ contactId, accountId }` | Associate contact with account |
| `contact.unlinkFromAccount` | M | tenant | inline `{ contactId, accountId }` | Remove account association |
| `contact.stats` | Q | tenant | — | Contact aggregate statistics |
| `contact.search` | Q | tenant | `contactSearchSchema` | Full-text contact search |
| `contact.filterOptions` | Q | tenant | — | Distinct values for filter dropdowns |
| `contact.bulkEmail` | M | tenant | inline `{ contactIds, templateId }` | Send bulk email to contacts |
| `contact.bulkExport` | M | tenant | inline filters | Export contacts as CSV |
| `contact.bulkDelete` | M | tenant | inline `{ ids }` | Bulk delete contacts |
| `contact.linkToLead` | M | tenant | inline `{ contactId, leadId }` | Link contact to a lead |
| `contact.unlinkFromLead` | M | tenant | inline `{ contactId, leadId }` | Unlink contact from lead |
| `contact.getTimeline` | Q | tenant | inline `{ contactId }` | Activity timeline for contact |
| `contact.logActivity` | M | tenant | `logActivitySchema` | Log a manual activity |
| `contact.addNote` | M | tenant | `addNoteSchema` | Add a note to a contact |
| `contact.scoreWithAI` | M | tenant | inline `{ contactId }` | Trigger AI contact scoring |

---

## documents (3)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `upload.upload` | M | tenant | inline file metadata | Upload a document/file |
| `upload.getUploadStatus` | Q | tenant | inline `{ uploadId }` | Check upload processing status |
| `emailInbound.processInbound` | M | pub | inline email payload | Process an inbound email webhook |

---

## email/inbound (17)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `email.webhook` | M | pub | inline webhook payload | Receive inbound email from provider |
| `email.getEmail` | Q | tenant | inline `{ id }` | Fetch single email by ID |
| `email.listEmails` | Q | tenant | inline filters | List emails with filters |
| `email.processEmail` | M | tenant | inline `{ id }` | Manually trigger email processing |
| `email.getThread` | Q | tenant | inline `{ threadId }` | Get email conversation thread |
| `email.getAttachment` | Q | tenant | inline `{ id }` | Get attachment metadata/URL |
| `email.sendEmail` | M | tenant | inline compose fields | Send an outbound email |
| `email.saveDraft` | M | tenant | inline compose fields | Save email as draft |
| `email.listTemplates` | Q | tenant | — | List email templates |
| `email.markAsRead` | M | tenant | inline `{ id }` | Mark email as read |
| `email.markAsUnread` | M | tenant | inline `{ id }` | Mark email as unread |
| `email.setLabels` | M | tenant | inline `{ id, labels }` | Apply labels to email |
| `email.getUnreadCounts` | Q | tenant | — | Unread counts per folder/label |
| `email.lookupByEmail` | Q | tenant | inline `{ email }` | Find CRM entity by email address |
| `email.getStorageUsage` | Q | tenant | — | Mailbox storage consumption |
| `email.getRelatedMessages` | Q | tenant | inline `{ entityId }` | Emails linked to a CRM entity |
| `email.searchContacts` | Q | tenant | inline `{ q }` | Search contacts for compose autocomplete |

---

## experiment (15)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `experiment.create` | M | tenant | `createExperimentSchema` | Create an A/B experiment |
| `experiment.update` | M | tenant | `updateExperimentSchema` | Update experiment config |
| `experiment.start` | M | tenant | inline `{ id }` | Start a paused/draft experiment |
| `experiment.pause` | M | tenant | inline `{ id }` | Pause a running experiment |
| `experiment.complete` | M | tenant | inline `{ id }` | Mark experiment complete |
| `experiment.archive` | M | tenant | inline `{ id }` | Archive completed experiment |
| `experiment.assignVariant` | M | tenant | `assignVariantSchema` | Assign a user to a variant |
| `experiment.getVariant` | Q | tenant | inline `{ experimentId, userId }` | Get variant for a user |
| `experiment.recordScore` | M | tenant | `recordScoreSchema` | Record a metric score event |
| `experiment.recordConversion` | M | tenant | `recordConversionSchema` | Record a conversion event |
| `experiment.analyze` | Q | tenant | inline `{ id }` | Statistical analysis of results |
| `experiment.getById` | Q | tenant | inline `{ id }` | Fetch experiment by ID |
| `experiment.list` | Q | tenant | inline filters | List experiments |
| `experiment.getStatus` | Q | tenant | inline `{ id }` | Get current experiment status |
| `experiment.getResults` | Q | tenant | inline `{ id }` | Get variant results/metrics |

---

## feedback (10)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `feedback.submitSimple` | M | tenant | `submitFeedbackSchema` | Submit thumbs-up/down feedback on AI |
| `feedback.submitCorrection` | M | tenant | `submitCorrectionSchema` | Submit detailed correction |
| `feedback.getForLead` | Q | tenant | inline `{ leadId }` | Get feedback entries for a lead |
| `feedback.getAnalytics` | Q | tenant | — | Aggregate feedback quality metrics |
| `feedback.checkRetraining` | Q | tenant | — | Check if retraining threshold reached |
| `feedback.exportTrainingData` | M | admin | inline filters | Export labeled data for training |
| `feedbackSurvey.getDashboardStats` | Q | tenant | — | NPS/CSAT survey dashboard |
| `feedbackSurvey.getNPSTrend` | Q | tenant | inline date range | NPS score trend over time |
| `feedbackSurvey.getSentimentBreakdown` | Q | tenant | — | Sentiment distribution chart data |
| `feedbackSurvey.exportData` | M | tenant | inline filters | Export survey responses |

---

## help-article (11)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `helpArticle.list` | Q | pub | inline `{ category?, q? }` | List help articles |
| `helpArticle.getBySlug` | Q | pub | inline `{ slug }` | Fetch article by URL slug |
| `helpArticle.getByCategory` | Q | pub | inline `{ category }` | List articles in a category |
| `helpArticle.getRelated` | Q | pub | inline `{ articleId }` | Related articles |
| `helpArticle.create` | M | admin | `createArticleSchema` | Create a help article |
| `helpArticle.update` | M | admin | `updateArticleSchema` | Update article content |
| `helpArticle.delete` | M | admin | inline `{ id }` | Delete an article |
| `helpArticle.publish` | M | admin | inline `{ id }` | Publish draft article |
| `helpArticle.unpublish` | M | admin | inline `{ id }` | Unpublish a live article |
| `helpArticle.submitFeedback` | M | auth | inline `{ id, helpful }` | Submit article helpfulness rating |
| `helpArticle.getFeedbackStats` | Q | admin | inline `{ id }` | Helpfulness stats for an article |

---

## home (12)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `home.getWelcomeSummary` | Q | tenant | — | Personalized welcome dashboard summary |
| `home.getAIInsights` | Q | tenant | — | AI-generated actionable insights |
| `home.getDailyGoal` | Q | tenant | — | Today's goal/target |
| `home.updateDailyGoal` | M | tenant | inline `{ target }` | Update daily goal target |
| `home.getPinnedItems` | Q | tenant | — | User's pinned navigation items |
| `home.pinItem` | M | tenant | inline `{ entityType, entityId }` | Pin an entity |
| `home.unpinItem` | M | tenant | inline `{ id }` | Unpin an item |
| `home.reorderPinnedItems` | M | tenant | inline `{ ids }` | Reorder pinned items |
| `home.getAllInsights` | Q | tenant | — | Full list of AI insights |
| `home.getInsightById` | Q | tenant | inline `{ id }` | Single insight detail |
| `home.ensureInsightReview` | M | tenant | inline `{ id }` | Mark insight as reviewed |
| `home.dismissInsight` | M | tenant | inline `{ id }` | Dismiss an insight |

---

## integrations (6)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `integrations.getConnectorHealth` | Q | tenant | inline `{ connectorId }` | Health status of a single connector |
| `integrations.getAllConnectorsHealth` | Q | tenant | — | Health status of all connectors |
| `integrations.getConnectorsByType` | Q | tenant | inline `{ type }` | List connectors of a given type |
| `integrations.triggerSync` | M | tenant | inline `{ connectorId }` | Trigger a manual integration sync |
| `integrations.getDashboardConfig` | Q | pub | — | Integration hub configuration |
| `integrations.testConnection` | M | tenant | inline `{ connectorId }` | Test connector connectivity |

---

## intelligence (10)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `intelligence.getSentimentDashboard` | Q | tenant | — | Sentiment analysis overview |
| `intelligence.getLeadInsights` | Q | tenant | inline `{ leadId }` | AI insights for a lead |
| `intelligence.getContactInsights` | Q | tenant | inline `{ contactId }` | AI insights for a contact |
| `intelligence.getInsightsSummary` | Q | tenant | — | Cross-entity insight summary |
| `intelligence.triggerPrediction` | M | tenant | inline `{ entityId, type }` | Trigger prediction job |
| `intelligence.updateLeadInsights` | M | tenant | inline `{ leadId }` | Refresh cached lead insights |
| `intelligence.updateContactInsights` | M | tenant | inline `{ contactId }` | Refresh cached contact insights |
| `intelligence.getChurnDashboard` | Q | tenant | — | Churn risk dashboard |
| `intelligence.getLeadScoringDashboard` | Q | tenant | — | Lead scoring model dashboard |
| `intelligence.ragSearch` | Q | tenant | inline `{ q }` | RAG-powered semantic search |

---

## lead (20)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `lead.create` | M | tenant | `createLeadSchema` | Create a new lead |
| `lead.getById` | Q | tenant | inline `{ id }` | Fetch lead by ID |
| `lead.list` | Q | tenant | `leadQuerySchema` | Paginated/filtered lead list |
| `lead.update` | M | tenant | `updateLeadSchema` | Update lead fields |
| `lead.delete` | M | tenant | inline `{ id }` | Delete a lead |
| `lead.qualify` | M | tenant | inline `{ id }` | Mark lead as qualified |
| `lead.convert` | M | tenant | `convertLeadSchema` | Convert lead to contact/opportunity |
| `lead.convertToDeal` | M | tenant | inline `{ id }` | Convert lead directly to deal |
| `lead.scoreWithAI` | M | tenant | inline `{ id }` | Trigger AI lead scoring |
| `lead.stats` | Q | tenant | — | Lead funnel statistics |
| `lead.getHotLeads` | Q | tenant | — | High-score leads ready for action |
| `lead.getReadyForQualification` | Q | tenant | — | Leads meeting qualification criteria |
| `lead.bulkScore` | M | tenant | inline `{ ids }` | Bulk AI scoring |
| `lead.filterOptions` | Q | tenant | — | Distinct values for filter dropdowns |
| `lead.bulkConvert` | M | tenant | inline `{ ids }` | Bulk convert leads |
| `lead.bulkUpdateStatus` | M | tenant | inline `{ ids, status }` | Bulk status update |
| `lead.bulkArchive` | M | tenant | inline `{ ids }` | Bulk archive leads |
| `lead.addNote` | M | tenant | `addNoteSchema` | Add a note to a lead |
| `lead.logActivity` | M | tenant | `logActivitySchema` | Log a manual activity on lead |
| `lead.bulkDelete` | M | tenant | inline `{ ids }` | Bulk delete leads |

---

## lead-settings (12)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `leadSettings.stages.getAll` | Q | tenant | — | Get all lead pipeline stages |
| `leadSettings.stages.updateAll` | M | tenant | inline stages array | Replace all stages |
| `leadSettings.stages.resetToDefaults` | M | tenant | — | Reset stages to system defaults |
| `leadSettings.scoringRules.getAll` | Q | tenant | — | Get all lead scoring rules |
| `leadSettings.scoringRules.updateAll` | M | tenant | inline rules array | Replace all scoring rules |
| `leadSettings.scoringRules.resetToDefaults` | M | tenant | — | Reset scoring rules to defaults |
| `leadSettings.customFields.list` | Q | tenant | — | List custom lead fields |
| `leadSettings.customFields.create` | M | tenant | inline field definition | Create a custom field |
| `leadSettings.customFields.update` | M | tenant | inline `{ id, ...fields }` | Update a custom field |
| `leadSettings.customFields.delete` | M | tenant | inline `{ id }` | Delete a custom field |
| `leadSettings.automation.get` | Q | tenant | — | Get lead automation config |
| `leadSettings.automation.update` | M | tenant | inline automation config | Update lead automation settings |

---

## legal (43)

### legal/appointments (13)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `appointments.create` | M | tenant | `createAppointmentSchema` | Create a legal appointment |
| `appointments.getById` | Q | tenant | inline `{ id }` | Fetch appointment by ID |
| `appointments.list` | Q | tenant | inline filters | List appointments |
| `appointments.update` | M | tenant | `updateAppointmentSchema` | Update appointment details |
| `appointments.reschedule` | M | tenant | `rescheduleAppointmentSchema` | Reschedule to new time slot |
| `appointments.confirm` | M | tenant | inline `{ id }` | Confirm a scheduled appointment |
| `appointments.complete` | M | tenant | inline `{ id }` | Mark appointment as completed |
| `appointments.cancel` | M | tenant | inline `{ id, reason }` | Cancel appointment |
| `appointments.markNoShow` | M | tenant | inline `{ id }` | Mark client as no-show |
| `appointments.delete` | M | tenant | inline `{ id }` | Delete appointment record |
| `appointments.checkConflicts` | Q | tenant | inline time range | Check for scheduling conflicts |
| `appointments.checkAvailability` | Q | tenant | inline `{ userId, date }` | Check agent availability |
| `appointments.findNextSlot` | Q | tenant | inline `{ userId, duration }` | Find next available time slot |

### legal/cases (12)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `cases.list` | Q | tenant | inline filters | List legal cases |
| `cases.getById` | Q | tenant | inline `{ id }` | Fetch case by ID |
| `cases.stats` | Q | tenant | — | Case aggregate statistics |
| `cases.create` | M | tenant | `createCaseSchema` | Create a new legal case |
| `cases.update` | M | tenant | `updateCaseSchema` | Update case details |
| `cases.changeStatus` | M | tenant | inline `{ id, status }` | Change case status |
| `cases.close` | M | tenant | inline `{ id, outcome }` | Close a case |
| `cases.addTask` | M | tenant | inline `{ caseId, task }` | Add task to case |
| `cases.completeTask` | M | tenant | inline `{ caseId, taskId }` | Mark case task complete |
| `cases.removeTask` | M | tenant | inline `{ caseId, taskId }` | Remove task from case |
| `cases.filterOptions` | Q | tenant | — | Distinct values for filter dropdowns |
| `cases.assignees` | Q | tenant | — | List users eligible to own cases |

### legal/documents (18)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `legalDocs.create` | M | tenant | `createLegalDocumentSchema` | Create a legal document record |
| `legalDocs.createVersion` | M | tenant | `createDocumentVersionSchema` | Add a new document version |
| `legalDocs.getById` | Q | tenant | inline `{ id }` | Fetch document by ID |
| `legalDocs.list` | Q | tenant | `documentQuerySchema` | List documents with filters |
| `legalDocs.grantAccess` | M | tenant | inline `{ id, userId }` | Grant user access to document |
| `legalDocs.revokeAccess` | M | tenant | inline `{ id, userId }` | Revoke user access |
| `legalDocs.submitForReview` | M | tenant | inline `{ id }` | Submit document for review |
| `legalDocs.approve` | M | tenant | inline `{ id }` | Approve reviewed document |
| `legalDocs.sign` | M | tenant | inline `{ id, signature }` | Digitally sign document |
| `legalDocs.archive` | M | tenant | inline `{ id }` | Archive document |
| `legalDocs.placeLegalHold` | M | tenant | inline `{ id, reason }` | Place document on legal hold |
| `legalDocs.releaseLegalHold` | M | tenant | inline `{ id }` | Release legal hold |
| `legalDocs.delete` | M | tenant | inline `{ id }` | Delete document |
| `legalDocs.getSignedUrl` | Q | tenant | inline `{ id }` | Get presigned download URL |
| `legalDocs.getAuditTrail` | Q | tenant | inline `{ id }` | Document access/change audit trail |
| `legalDocs.bulkDownload` | M | tenant | inline `{ ids }` | Bulk download as zip |
| `legalDocs.bulkArchive` | M | tenant | inline `{ ids }` | Bulk archive documents |
| `legalDocs.bulkDelete` | M | tenant | inline `{ ids }` | Bulk delete documents |

---

## misc/activity-feed (9)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `activityFeed.getUnifiedFeed` | Q | tenant | inline filters | Cross-entity activity feed |
| `activityFeed.getEntityFeed` | Q | tenant | inline `{ entityType, entityId }` | Activity feed for a specific entity |
| `activityFeed.getStats` | Q | tenant | — | Activity feed statistics |
| `activityFeed.search` | Q | tenant | inline `{ q }` | Search activity feed |
| `activityFeed.toggleReaction` | M | tenant | inline `{ activityId, emoji }` | Toggle emoji reaction |
| `activityFeed.getReactions` | Q | tenant | inline `{ activityId }` | Get reactions on an activity |
| `activityFeed.addComment` | M | tenant | inline `{ activityId, text }` | Add comment to activity |
| `activityFeed.getComments` | Q | tenant | inline `{ activityId }` | Get comments on an activity |

---

## misc/global-search (1)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `globalSearch.query` | Q | tenant | inline `{ q, types? }` | Cross-entity full-text search |

---

## misc/health (5)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `health.ping` | Q | pub | — | Basic liveness check |
| `health.check` | Q | pub | — | Detailed health check |
| `health.ready` | Q | pub | — | Readiness probe |
| `health.alive` | Q | pub | — | Kubernetes liveness probe |
| `health.dbStats` | Q | pub | — | Database connection pool stats |

---

## misc/system (6)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `system.version` | Q | pub | — | API version info |
| `system.info` | Q | pub | — | Build and environment info |
| `system.features` | Q | pub | — | Feature flags |
| `system.config` | Q | admin | — | Full runtime config (admin only) |
| `system.metrics` | Q | admin | — | Runtime metrics (admin only) |
| `system.capabilities` | Q | pub | — | Declared API capabilities |

---

## misc/timeline (9)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `timeline.getEvents` | Q | tenant | inline `{ entityType, entityId }` | Timeline events for entity |
| `timeline.getStats` | Q | tenant | inline `{ entityType, entityId }` | Timeline event statistics |
| `timeline.getUpcomingDeadlines` | Q | tenant | — | Upcoming deadline events |
| `timeline.computeDeadline` | Q | tenant | inline deadline params | Compute a deadline from rules |
| `timeline.isBusinessDay` | Q | tenant | inline `{ date }` | Check if date is a business day |
| `timeline.getNextBusinessDay` | Q | tenant | inline `{ date }` | Get next business day |
| `timeline.validateDeadlineRule` | Q | tenant | inline rule config | Validate a deadline rule |
| `timeline.getPendingAgentActions` | Q | tenant | — | Agent actions pending in timeline |

---

## notifications (10)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `notifications.list` | Q | tenant | inline `{ cursor?, limit? }` | Paginated notification list |
| `notifications.getUnreadCount` | Q | tenant | — | Count of unread notifications |
| `notifications.markAsRead` | M | tenant | inline `{ id }` | Mark notification as read |
| `notifications.markAllAsRead` | M | tenant | — | Mark all notifications read |
| `notifications.delete` | M | tenant | inline `{ id }` | Delete a notification |
| `notifications.getPreferences` | Q | tenant | — | Notification channel preferences |
| `notifications.updatePreferences` | M | tenant | inline preferences | Update notification preferences |
| `notifications.batchAction` | M | tenant | inline `{ ids, action }` | Bulk read/delete notifications |
| `notifications.onNew` | S | tenant | — | WebSocket subscription for new notifications |

---

## opportunity (20)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `opportunity.create` | M | tenant | `createOpportunitySchema` | Create a new opportunity/deal |
| `opportunity.getById` | Q | tenant | inline `{ id }` | Fetch opportunity by ID |
| `opportunity.list` | Q | tenant | `opportunityQuerySchema` | Paginated/filtered opportunity list |
| `opportunity.update` | M | tenant | `updateOpportunitySchema` | Update opportunity fields |
| `opportunity.delete` | M | tenant | inline `{ id }` | Soft-delete opportunity |
| `opportunity.listTrashed` | Q | tenant | — | List soft-deleted opportunities |
| `opportunity.restore` | M | tenant | inline `{ id }` | Restore from trash |
| `opportunity.permanentDelete` | M | tenant | inline `{ id }` | Hard-delete opportunity |
| `opportunity.moveStage` | M | tenant | inline `{ id, stage }` | Move to pipeline stage |
| `opportunity.getHistory` | Q | tenant | inline `{ id }` | Stage change history |
| `opportunity.getProducts` | Q | tenant | inline `{ id }` | Line items/products on opportunity |
| `opportunity.getPipeline` | Q | tenant | — | Full pipeline board view |
| `opportunity.stats` | Q | tenant | — | Pipeline aggregate statistics |
| `opportunity.forecast` | Q | tenant | inline date range | Revenue forecast |
| `opportunity.dealForecast` | Q | tenant | inline date range | Deal-level forecast breakdown |

---

## opportunity/pipeline-config (5)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `pipelineConfig.getAll` | Q | tenant | — | Get all pipeline stages |
| `pipelineConfig.updateStage` | M | tenant | inline `{ id, ...fields }` | Update a single stage |
| `pipelineConfig.updateAll` | M | tenant | inline stages array | Replace all pipeline stages |
| `pipelineConfig.resetToDefaults` | M | tenant | — | Reset to default stages |
| `pipelineConfig.getStats` | Q | tenant | — | Stage conversion statistics |

---

## privacy/dsar (2)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `dsar.submitDSAR` | M | pub | inline `{ type, email, description? }` | Submit a GDPR rights request |
| `dsar.getDSARStatus` | Q | pub | inline `{ requestId, verificationToken }` | Check DSAR status (token-gated) |

---

## routing (13)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `routing.list` | Q | tenant | inline `{ cursor?, limit?, isActive? }` | List routing rules |
| `routing.get` | Q | tenant | inline `{ id }` | Get a routing rule by ID |
| `routing.create` | M | tenant | `createRoutingRuleSchema` | Create a lead routing rule |
| `routing.update` | M | tenant | `updateRoutingRuleSchema` | Update a routing rule |
| `routing.delete` | M | tenant | inline `{ id }` | Delete a routing rule |
| `routing.reorder` | M | tenant | inline `{ rules }` | Batch reorder rule priorities |
| `routing.toggle` | M | tenant | inline `{ id, isActive }` | Toggle rule active/inactive |
| `routing.getAssignments` | Q | tenant | inline `{ limit?, cursor? }` | Recent lead assignment log |
| `routing.getAgentWorkload` | Q | tenant | — | Agent availability and capacity |
| `routing.getLeadQueue` | Q | tenant | inline `{ limit?, scoreMin?, source? }` | Unassigned lead queue |
| `routing.assignLead` | M | tenant | inline `{ leadId, userId, reason? }` | Manually assign a lead |
| `routing.autoRouteLead` | M | tenant | `autoRouteLeadInputSchema` | Auto-route lead via engine |
| `routing.suggestLeadAssignee` | Q | tenant | `suggestLeadAssigneeInputSchema` | Suggest assignees for a lead |

---

## security/audit (5)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `audit.search` | Q | tenant | inline search filters | Search audit log (manager+) |
| `audit.getByResource` | Q | tenant | inline `{ resourceType, resourceId }` | Audit trail for a resource |
| `audit.getMyActivity` | Q | tenant | inline `{ limit?, offset? }` | Current user's activity log |
| `audit.getSecurityEvents` | Q | admin | inline `{ eventType?, severity?, startDate?, endDate? }` | Security event log |
| `audit.getStats` | Q | admin | inline date range | Aggregate audit statistics |

---

## subscription/module-access (3)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `moduleAccess.getEnabledModules` | Q | auth | — | Get enabled modules for current tenant |
| `moduleAccess.getPlans` | Q | auth | — | List all plans with included modules |
| `moduleAccess.toggleModule` | M | admin | `toggleModuleInputSchema` | Enable/disable a module for tenant |

---

## task (14)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `task.create` | M | tenant | `createTaskSchema` | Create a task |
| `task.getById` | Q | tenant | `taskIdSchema` | Fetch task by ID |
| `task.list` | Q | tenant | `taskQuerySchema` | Paginated/filtered task list |
| `task.update` | M | tenant | `updateTaskSchema` | Update task fields |
| `task.delete` | M | tenant | `taskIdSchema` | Delete a task |
| `task.archive` | M | tenant | inline `{ id }` | Archive a task |
| `task.complete` | M | tenant | `completeTaskSchema` | Mark task complete |
| `task.start` | M | tenant | `startTaskSchema` | Start a task |
| `task.cancel` | M | tenant | `cancelTaskSchema` | Cancel a task |
| `task.stats` | Q | tenant | — | Task aggregate statistics |
| `task.assign` | M | tenant | `assignTaskSchema` | Assign task to user |
| `task.reschedule` | M | tenant | `rescheduleTaskSchema` | Reschedule task due date |
| `task.getReminders` | Q | tenant | `getRemindersSchema` | Get task reminders |
| `task.getByEntity` | Q | tenant | `getByEntitySchema` | Tasks linked to a CRM entity |

---

## ticket (18)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `ticket.create` | M | tenant | `createTicketSchema` | Create a support ticket |
| `ticket.getById` | Q | tenant | `idSchema` | Fetch ticket by ID |
| `ticket.list` | Q | tenant | `ticketQuerySchema` | Paginated/filtered ticket list |
| `ticket.update` | M | tenant | `updateTicketSchema` | Update ticket fields |
| `ticket.delete` | M | tenant | `idSchema` | Delete a ticket |
| `ticket.archive` | M | tenant | `idSchema` | Archive a ticket |
| `ticket.stats` | Q | tenant | `statsInputSchema` | Ticket aggregate statistics |
| `ticket.addResponse` | M | tenant | `addResponseSchema` | Add agent/customer response |
| `ticket.bulkAssign` | M | tenant | inline `{ ids, userId }` | Bulk assign tickets |
| `ticket.bulkUpdateStatus` | M | tenant | inline `{ ids, status }` | Bulk update ticket status |
| `ticket.bulkResolve` | M | tenant | inline `{ ids }` | Bulk resolve tickets |
| `ticket.bulkEscalate` | M | tenant | inline `{ ids, reason }` | Bulk escalate tickets |
| `ticket.bulkClose` | M | tenant | inline `{ ids }` | Bulk close tickets |
| `ticket.assignees` | Q | tenant | — | List users eligible for ticket assignment |
| `ticket.filterOptions` | Q | tenant | inline `{ field }` | Distinct values for filter dropdowns |
| `ticket.addAttachment` | M | tenant | `addAttachmentSchema` | Attach file to ticket |

---

## ticket-config (12)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `ticketConfig.slaPolicies.list` | Q | tenant | — | List SLA policies |
| `ticketConfig.slaPolicies.getById` | Q | tenant | inline `{ id }` | Get SLA policy by ID |
| `ticketConfig.slaPolicies.create` | M | tenant | `createSlaPolicySchema` | Create SLA policy |
| `ticketConfig.slaPolicies.update` | M | tenant | `updateSlaPolicySchema` | Update SLA policy |
| `ticketConfig.slaPolicies.delete` | M | tenant | inline `{ id }` | Delete SLA policy |
| `ticketConfig.slaPolicies.setDefault` | M | tenant | inline `{ id }` | Set default SLA policy |
| `ticketConfig.categories.list` | Q | tenant | — | List ticket categories |
| `ticketConfig.categories.getById` | Q | tenant | inline `{ id }` | Get category by ID |
| `ticketConfig.categories.create` | M | tenant | `createTicketCategorySchema` | Create ticket category |
| `ticketConfig.categories.update` | M | tenant | `updateTicketCategorySchema` | Update ticket category |
| `ticketConfig.categories.delete` | M | tenant | inline `{ id }` | Delete ticket category |
| `ticketConfig.categories.reorder` | M | tenant | `reorderTicketCategorySchema` | Reorder ticket categories |

---

## ticket-routing (2)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `ticketRouting.autoRoute` | M | tenant | `autoRouteInputSchema` | Auto-route ticket via AI classification |
| `ticketRouting.suggestAssignee` | Q | tenant | `suggestAssigneeInputSchema` | Suggest ranked agent candidates |

---

## auth (20)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `auth.login` | M | authP | `loginSchema` | Email/password login |
| `auth.loginWithOAuth` | M | pub | `oauthInitSchema` | Initiate OAuth flow |
| `auth.resolveSso` | Q | pub | `ssoResolveSchema` | Resolve SSO redirect |
| `auth.oauthCallback` | M | pub | `oauthCallbackSchema` | Handle OAuth provider callback |
| `auth.verifyMfa` | M | pub | `mfaVerifySchema` | Verify MFA code |
| `auth.resendMfaCode` | M | pub | `resendMfaCodeSchema` | Resend MFA code |
| `auth.logout` | M | auth | — | Invalidate session |
| `auth.refreshSession` | M | pub | `refreshTokenSchema` | Refresh access token |
| `auth.setupMfa` | M | auth | `mfaSetupSchema` | Begin MFA enrollment |
| `auth.confirmMfa` | M | auth | `mfaConfirmSchema` | Confirm MFA enrollment |
| `auth.getBackupCodes` | M | auth | — | Get MFA backup codes |
| `auth.getMfaStatus` | Q | auth | — | Get current MFA status |
| `auth.disableMfa` | M | auth | `disableMfaSchema` | Disable MFA |
| `auth.regenerateBackupCodes` | M | auth | inline verify input | Regenerate MFA backup codes |
| `auth.getSessions` | Q | auth | — | List active sessions |
| `auth.revokeSession` | M | auth | `revokeSessionSchema` | Revoke a specific session |
| `auth.getStatus` | Q | pub | — | Auth service status |
| `auth.requestPasswordReset` | M | authP | `forgotPasswordSchema` | Request password reset email |
| `auth.resetPassword` | M | authP | `resetPasswordSchema` | Reset password with token |
| `auth.signup` | M | authP | `signupSchema` | Create new user account |
| `auth.verifyEmail` | M | pub | `verifyEmailCallbackSchema` | Verify email address |
| `auth.resendVerification` | M | pub | inline `{ email }` | Resend email verification |

---

## user (3)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `user.getProfile` | Q | tenant | — | Get current user profile |
| `user.updateTimezone` | M | tenant | inline `{ timezone }` | Update user timezone |
| `user.updateProfile` | M | tenant | inline profile fields | Update name, avatar, etc. |

---

## webhooks (9)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `webhooks.handleWebhook` | M | pub | `webhookPayloadSchema` | Receive inbound webhook |
| `webhooks.registerSource` | M | auth | inline `{ source, url, events }` | Register a webhook source |
| `webhooks.unregisterSource` | M | auth | inline `{ sourceId }` | Unregister a webhook source |
| `webhooks.getSources` | Q | auth | — | List registered webhook sources |
| `webhooks.getMetrics` | Q | auth | — | Webhook delivery metrics |
| `webhooks.processRetries` | M | auth | — | Process pending webhook retries |
| `webhooks.getDeadLetterEntries` | Q | auth | — | List undeliverable webhook entries |
| `webhooks.reprocessDeadLetter` | M | auth | inline `{ id }` | Reprocess a dead-letter entry |
| `webhooks.cleanup` | M | auth | — | Clean up old webhook records |

---

## workflow (8)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `workflow.create` | M | tenant | inline workflow definition | Create a workflow automation |
| `workflow.update` | M | tenant | inline `{ id, ...fields }` | Update workflow |
| `workflow.delete` | M | tenant | inline `{ id }` | Delete a workflow |
| `workflow.setActive` | M | tenant | inline `{ id, active }` | Activate/deactivate workflow |
| `workflow.list` | Q | tenant | inline `{ cursor?, limit?, active? }` | List workflows |
| `workflow.getById` | Q | tenant | inline `{ id }` | Get workflow by ID |
| `workflow.getExecution` | Q | tenant | inline `{ id }` | Get a workflow execution |
| `workflow.getExecutionsByEntity` | Q | tenant | inline `{ entityType, entityId }` | Executions linked to entity |

---

## zep-budget (3)

| Procedure | Type | Auth | Input schema | Summary |
|-----------|------|------|-------------|---------|
| `zepBudget.getStatus` | Q | auth | inline `{ sessionId }` | Get Zep memory budget status |
| `zepBudget.getAuditHistory` | Q | tenant | inline `{ sessionId?, limit? }` | Budget usage audit history |
| `zepBudget.reset` | M | auth | inline `{ sessionId }` | Reset Zep memory budget |

---

## Totals

| Metric | Count |
|--------|-------|
| Total modules | 30 |
| Total procedures | 323 |
| Queries (Q) | 161 |
| Mutations (M) | 161 |
| Subscriptions (S) | 1 |
| Router files | 50 |

### Largest modules

| Rank | Module | Count |
|------|--------|-------|
| 1 | legal (appointments + cases + documents) | 43 |
| 2 | contact | 20 |
| 2 | lead | 20 |
| 2 | opportunity | 20 |
| 5 | auth | 22 |

> **Note**: `auth` has 22 rows in the table above (login through resendVerification) making it the single-router leader; `legal` is the largest functional group when its three sub-routers are summed.
