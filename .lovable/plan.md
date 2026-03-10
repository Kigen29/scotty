

## Security Scan Results — 2 Findings

### Finding 1: ERROR — All RLS policies are still RESTRICTIVE
The previous migration created policies without explicitly specifying `AS PERMISSIVE`. While PostgreSQL defaults to PERMISSIVE, the database still reports all 21 policies as RESTRICTIVE. The fix is to re-run the policy recreation with explicit `AS PERMISSIVE` clauses.

### Finding 2: WARN — `has_team_role` 2-parameter overload is a cross-team bypass risk
A 2-parameter version of `has_team_role(_user_id, _role)` checks if a user has a role in ANY team, not a specific one. While current policies use the safe 3-parameter version, the overload is a footgun for future development. Fix: drop the 2-parameter overload.

### Implementation

**Single database migration** that:

1. Drops and recreates all 21 RLS policies explicitly as `AS PERMISSIVE` across all 14 tables
2. Drops the 2-parameter `has_team_role` overload: `DROP FUNCTION IF EXISTS public.has_team_role(uuid, team_role)`

No frontend or edge function changes needed.

