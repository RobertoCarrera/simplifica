# Delta for Subscription Management

## ADDED Requirements

### Requirement: Module-Aware Subscription Management

The system **MUST** prevent subscription execution for inactive modules, automatically clean up subscriptions on component destruction, and provide `moduleAwareSubscribe()` utility.

#### Scenario: Enabled Module

- GIVEN component with module-aware subscription
- WHEN module enabled
- THEN subscription executes with automatic cleanup via `DestroyRef`

#### Scenario: Disabled Module

- GIVEN component with module-aware subscription
- WHEN module disabled
- THEN subscription never executes (no cleanup needed)

#### Scenario: Module Status Unavailable

- GIVEN module status cannot be determined
- THEN subscription treated as disabled, error logged

### Requirement: Integration with SupabaseModulesService

The system **MUST** use `SupabaseModulesService.isModuleEnabled()`. It **SHOULD** support reactive status changes and **MAY** cache status per component lifecycle.

#### Scenario: Status Change During Subscription

- GIVEN active subscription
- WHEN module disabled
- THEN subscription automatically unsubscribed

#### Scenario: Status Caching

- GIVEN multiple subscriptions to same module
- WHEN first checks status
- THEN status cached for component lifecycle

### Requirement: Migration Path for High-Impact Components

The system **SHOULD** provide migration guide prioritizing Chat, Analytics, Tickets. It **MUST** maintain backward compatibility.

#### Scenario: Chat Component Migration

- GIVEN Chat component with 7 raw `.subscribe()` calls
- WHEN replaced with `moduleAwareSubscribe()`
- THEN zero subscriptions load when `moduloChat` disabled

#### Scenario: Performance Verification

- GIVEN migrated component
- WHEN module disabled
- THEN zero active subscriptions, load time decreases

## MODIFIED Requirements

### Requirement: Utility Helper Availability

The system **SHOULD** provide utility helpers including generic (`safeSubscribe`) and module‑aware (`moduleAwareSubscribe`) variants. Module‑aware helper **MUST** be used for module‑dependent subscriptions.

(Previously: The system **SHOULD** provide a utility helper to reduce boilerplate for subscription cleanup.)

#### Scenario: Using Module-Aware Helper

- GIVEN subscription depends on `moduloChat`
- WHEN developer uses `moduleAwareSubscribe('chat', observable$, callback)`
- THEN subscription gated by module status and auto‑cleaned

## Non-functional Requirements

- **Performance**: Module status checks ≤1ms. No extra subscriptions.
- **Memory**: No retained references after destruction. Cache scoped to component lifecycle.
- **Compatibility**: Works with standalone components (96%). Integrates with ESLint RxJS rules.
- **Testing**: Unit tests verify enabled/disabled behavior. Integration tests cover edge cases.

## Success Metrics

- Chat component loads zero subscriptions when `moduloChat` disabled.
- Subscription cleanup coverage increases from 13.8% towards 100%.
- No regression in component functionality.
- Measurable load‑time reduction for users with limited module access.

## Edge Cases

- **Multiple modules**: Subscriptions respect respective module status independently.
- **Nested services**: Service can use `moduleAwareSubscribe()` with component's `DestroyRef`.
- **Race condition**: Subscription evaluated against final module status; no dangling subscriptions.
