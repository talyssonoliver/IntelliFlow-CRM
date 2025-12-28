-- Case/Matter Domain Migration for IntelliFlow CRM
-- Legal case management with tasks and deadlines
-- Migration: case

-- ============================================
-- ENUMS
-- ============================================

-- Case status enum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- Case priority enum
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- Case task status enum (if different from general TaskStatus)
CREATE TYPE "CaseTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- ============================================
-- TABLES
-- ============================================

-- Cases table (legal matters)
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "deadline" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "resolution" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- Case tasks table (embedded tasks within cases)
CREATE TABLE "case_tasks" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "CaseTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assignee" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_tasks_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- INDEXES
-- ============================================

-- Cases indexes
CREATE INDEX "cases_status_idx" ON "cases"("status");
CREATE INDEX "cases_priority_idx" ON "cases"("priority");
CREATE INDEX "cases_clientId_idx" ON "cases"("clientId");
CREATE INDEX "cases_assignedTo_idx" ON "cases"("assignedTo");
CREATE INDEX "cases_deadline_idx" ON "cases"("deadline");
CREATE INDEX "cases_createdAt_idx" ON "cases"("createdAt");

-- Composite index for overdue cases query
CREATE INDEX "cases_status_deadline_idx" ON "cases"("status", "deadline");

-- Case tasks indexes
CREATE INDEX "case_tasks_caseId_idx" ON "case_tasks"("caseId");
CREATE INDEX "case_tasks_status_idx" ON "case_tasks"("status");
CREATE INDEX "case_tasks_assignee_idx" ON "case_tasks"("assignee");
CREATE INDEX "case_tasks_dueDate_idx" ON "case_tasks"("dueDate");

-- Composite index for overdue tasks
CREATE INDEX "case_tasks_status_dueDate_idx" ON "case_tasks"("status", "dueDate");

-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================

-- Cases foreign keys
ALTER TABLE "cases" ADD CONSTRAINT "cases_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cases" ADD CONSTRAINT "cases_assignedTo_fkey"
    FOREIGN KEY ("assignedTo") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Case tasks foreign keys
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_assignee_fkey"
    FOREIGN KEY ("assignee") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- TRIGGERS
-- ============================================

-- Apply updatedAt trigger to cases and case_tasks tables
CREATE TRIGGER update_cases_updated_at
    BEFORE UPDATE ON "cases"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_case_tasks_updated_at
    BEFORE UPDATE ON "case_tasks"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE "cases" IS 'Legal cases/matters with status tracking and deadlines';
COMMENT ON TABLE "case_tasks" IS 'Tasks associated with legal cases';

COMMENT ON COLUMN "cases"."status" IS 'Current status of the case (OPEN, IN_PROGRESS, ON_HOLD, CLOSED, CANCELLED)';
COMMENT ON COLUMN "cases"."priority" IS 'Case priority level (LOW, MEDIUM, HIGH, URGENT)';
COMMENT ON COLUMN "cases"."deadline" IS 'Case deadline/due date';
COMMENT ON COLUMN "cases"."clientId" IS 'Reference to the client account';
COMMENT ON COLUMN "cases"."assignedTo" IS 'User assigned to handle this case';
COMMENT ON COLUMN "cases"."resolution" IS 'Resolution notes when case is closed';

COMMENT ON COLUMN "case_tasks"."caseId" IS 'Reference to parent case';
COMMENT ON COLUMN "case_tasks"."assignee" IS 'User assigned to complete this task';
COMMENT ON COLUMN "case_tasks"."completedAt" IS 'Timestamp when task was completed';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on cases and case_tasks tables
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "case_tasks" ENABLE ROW LEVEL SECURITY;

-- Cases RLS policies
CREATE POLICY "cases_select_policy" ON "cases"
    FOR SELECT USING (
        auth.uid()::text = "assignedTo"
        OR auth.uid()::text IN (SELECT id FROM users WHERE role = 'ADMIN')
    );

CREATE POLICY "cases_insert_policy" ON "cases"
    FOR INSERT WITH CHECK (auth.uid()::text = "assignedTo");

CREATE POLICY "cases_update_policy" ON "cases"
    FOR UPDATE USING (
        auth.uid()::text = "assignedTo"
        OR auth.uid()::text IN (SELECT id FROM users WHERE role = 'ADMIN')
    );

CREATE POLICY "cases_delete_policy" ON "cases"
    FOR DELETE USING (
        auth.uid()::text IN (SELECT id FROM users WHERE role = 'ADMIN')
    );

-- Case tasks RLS policies (based on parent case access)
CREATE POLICY "case_tasks_select_policy" ON "case_tasks"
    FOR SELECT USING (
        "caseId" IN (
            SELECT id FROM cases
            WHERE "assignedTo" = auth.uid()::text
        )
        OR auth.uid()::text IN (SELECT id FROM users WHERE role = 'ADMIN')
    );

CREATE POLICY "case_tasks_insert_policy" ON "case_tasks"
    FOR INSERT WITH CHECK (
        "caseId" IN (
            SELECT id FROM cases
            WHERE "assignedTo" = auth.uid()::text
        )
    );

CREATE POLICY "case_tasks_update_policy" ON "case_tasks"
    FOR UPDATE USING (
        "caseId" IN (
            SELECT id FROM cases
            WHERE "assignedTo" = auth.uid()::text
        )
        OR auth.uid()::text IN (SELECT id FROM users WHERE role = 'ADMIN')
    );

CREATE POLICY "case_tasks_delete_policy" ON "case_tasks"
    FOR DELETE USING (
        "caseId" IN (
            SELECT id FROM cases
            WHERE "assignedTo" = auth.uid()::text
        )
        OR auth.uid()::text IN (SELECT id FROM users WHERE role = 'ADMIN')
    );

-- ============================================
-- UTILITY FUNCTIONS
-- ============================================

-- Function to get case statistics by status
CREATE OR REPLACE FUNCTION get_case_statistics(user_id TEXT DEFAULT NULL)
RETURNS TABLE (
    status "CaseStatus",
    count BIGINT,
    overdue_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.status,
        COUNT(*)::BIGINT as count,
        COUNT(*) FILTER (
            WHERE c.deadline IS NOT NULL
            AND c.deadline < CURRENT_TIMESTAMP
            AND c.status NOT IN ('CLOSED', 'CANCELLED')
        )::BIGINT as overdue_count
    FROM cases c
    WHERE user_id IS NULL OR c."assignedTo" = user_id
    GROUP BY c.status;
END;
$$;

-- Function to get cases with upcoming deadlines
CREATE OR REPLACE FUNCTION get_upcoming_deadline_cases(
    days_ahead INT DEFAULT 7,
    user_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    title TEXT,
    status "CaseStatus",
    priority "CasePriority",
    deadline TIMESTAMP(3),
    days_remaining INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.title,
        c.status,
        c.priority,
        c.deadline,
        EXTRACT(DAY FROM c.deadline - CURRENT_TIMESTAMP)::INT as days_remaining
    FROM cases c
    WHERE c.deadline IS NOT NULL
        AND c.deadline <= (CURRENT_TIMESTAMP + (days_ahead || ' days')::INTERVAL)
        AND c.status NOT IN ('CLOSED', 'CANCELLED')
        AND (user_id IS NULL OR c."assignedTo" = user_id)
    ORDER BY c.deadline ASC;
END;
$$;

-- Function to get task progress for a case
CREATE OR REPLACE FUNCTION get_case_task_progress(case_id TEXT)
RETURNS TABLE (
    total_tasks BIGINT,
    completed_tasks BIGINT,
    pending_tasks BIGINT,
    overdue_tasks BIGINT,
    progress_percentage DECIMAL(5,2)
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_tasks,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::BIGINT as completed_tasks,
        COUNT(*) FILTER (WHERE status IN ('PENDING', 'IN_PROGRESS'))::BIGINT as pending_tasks,
        COUNT(*) FILTER (
            WHERE "dueDate" < CURRENT_TIMESTAMP
            AND status NOT IN ('COMPLETED', 'CANCELLED')
        )::BIGINT as overdue_tasks,
        CASE
            WHEN COUNT(*) = 0 THEN 0.00
            ELSE ROUND((COUNT(*) FILTER (WHERE status = 'COMPLETED')::DECIMAL / COUNT(*)) * 100, 2)
        END as progress_percentage
    FROM case_tasks
    WHERE "caseId" = case_id;
END;
$$;

COMMENT ON FUNCTION get_case_statistics IS 'Returns case counts grouped by status with overdue counts';
COMMENT ON FUNCTION get_upcoming_deadline_cases IS 'Returns cases with deadlines within specified days';
COMMENT ON FUNCTION get_case_task_progress IS 'Returns task completion progress for a specific case';
