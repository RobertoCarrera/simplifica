# Proposal: Assign Rooms to Unlinked Bookings

## Intent
Enable historical DocPlanner bookings to sync with Google Calendar by allowing users to easily assign resources (rooms) to bookings that currently lack them (`resource_id: null`). Provide a manual trigger to initiate the synchronization process for linked bookings.

## Scope

### In Scope
- UI to list bookings missing a `resource_id`.
- UI to bulk-assign rooms based on a professional's `default_resource_id`.
- UI to manually assign specific resources to individual unlinked bookings.
- UI button in the Resources tab to trigger the Google Calendar sync (`backfill-gcal-bookings?mode=resources`).
- Backend update mechanism for assigning `resource_id` to existing bookings.

### Out of Scope
- Modifications to the core synchronization logic in `backfill-gcal-bookings`.
- Automatic/background syncing immediately upon resource assignment (sync remains manually triggered or scheduled).
- Complex AI-based assignment logic.

## Capabilities

### New Capabilities
- `unlinked-bookings-management`: UI and logic to identify, bulk-assign, and individually assign resources to bookings missing a `resource_id`.
- `manual-gcal-sync-trigger`: UI component to invoke the existing `backfill-gcal-bookings` Edge Function for resources.

### Modified Capabilities
- None

## Approach
1. **Unlinked Bookings UI**: Add a section in the Admin/Resources dashboard highlighting bookings with `resource_id: null`.
2. **Assignment Strategy**: Group unlinked bookings by professional. Suggest the professional's `default_resource_id` for bulk application. Provide a dropdown for manual room selection per booking or group.
3. **Backend Update**: Use standard Supabase REST or a lightweight RPC to perform bulk `UPDATE bookings SET resource_id = X WHERE id IN (...)`.
4. **Sync Trigger**: Add a prominent "Sync Resources to GCal" button in the Resources tab that POSTs to the `backfill-gcal-bookings?mode=resources` endpoint.

## Open Questions
- Do we need to filter unlinked bookings by date (e.g., only future bookings, or past X months) to avoid overwhelming the UI?
- Should the sync trigger button have a loading state or polling mechanism to indicate when the background Edge Function completes?

## Alternatives Considered
- **Auto-assign during import**: Rejected because historical import is already complete, and assigning without user confirmation might lead to room double-booking conflicts that are harder to untangle later.
- **Trigger sync automatically on update**: Rejected to keep the scope tight; bulk assignments followed by a single manual sync is safer and less taxing on rate limits.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Admin/Resources UI` | New | Add unlinked bookings list, bulk assignment tools, and GCal sync button |
| `Bookings Service` | Modified | Add capability to fetch `resource_id: null` bookings and update them |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Double-booking a room | Medium | Validate room availability during manual assignment or allow conflicts but highlight them visually. |
| Edge Function timeouts on sync | Low | Sync function is already designed to handle backfills; user can re-trigger if needed. |

## Rollback Plan
- Revert UI changes hiding the new assignment interfaces.
- If invalid assignments occur, provide a script to reset `resource_id = null` for bookings modified within the incident timeframe.

## Dependencies
- Existing `backfill-gcal-bookings` Edge Function.
- Database schema with `bookings.resource_id` and `professionals.default_resource_id`.

## Success Criteria
- [ ] Users can view a list of bookings lacking a `resource_id`.
- [ ] Users can assign resources to these bookings manually and in bulk.
- [ ] Users can trigger the GCal sync from the UI, resulting in successfully synced events.