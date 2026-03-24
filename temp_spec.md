# Delta for Subscription Management

## ADDED Requirements

### Requirement: Module-Aware Subscription Management

The system **MUST** prevent subscription execution for inactive modules to reduce resource consumption and improve app loading performance. The system **MUST** automatically clean up subscriptions when the component is destroyed using Angular's `DestroyRef`. The system **MUST** provide a utility function `moduleAwareSubscribe()` that combines module status check, subscription execution, and automatic cleanup.

#### Scenario: Subscription Executes When Module Enabled

- GIVEN a component with a module-aware subscription to an observable
- WHEN the target module is enabled (via `SupabaseModulesService.isModuleEnabled()`)
- THEN the subscription is executed and its cleanup is automatically tied to the component's `DestroyRef`
- AND the subscription receives emissions as expected

#### Scenario: Subscription Skipped When Module Disabled

- GIVEN a component with a module-aware subscription to an observable
- WHEN the target module is disabled
- THEN the subscription is never executed (no observable subscription created)
- AND no cleanup action is required

#### Scenario: Module Status Unavailable

- GIVEN a component with a module-aware subscription
- WHEN the module status cannot be determined (e.g., `SupabaseModulesService` throws an error)
- THEN the subscription is treated as disabled (no subscription created)
- AND the error is logged for debugging purposes

#### Scenario: Subscription Error Handling

- GIVEN a module-aware subscription that encounters an error during execution
- WHEN the observable emits an error
- THEN the error is caught and logged by the utility
- AND the subscription is automatically cleaned up as usual

### Requirement: Integration with SupabaseModulesService

The system **MUST** use `SupabaseModulesService.isModuleEnabled(moduleName)` to determine module status. The system **SHOULD** support reactive module status changes (if the module status changes while the component is active). The system **MAY** cache module status per component lifecycle for performance.

#### Scenario: Reactive Module Status Change

- GIVEN a component with an active module-aware subscription
- WHEN the module status changes from enabled to disabled (e.g., user loses access)
- THEN the subscription is automatically unsubscribed and no further emissions are received
- AND the component may optionally be notified of the change (e.g., via a callback)

#### Scenario: Status Caching Within Component Lifecycle

- GIVEN a component with multiple module-aware subscriptions to the same module
- WHEN the first subscription checks module status
- THEN the status may be cached for the duration of the component's lifecycle
- AND subsequent subscriptions use the cached value to avoid repeated checks

### Requirement: Migration Path for High-Impact Components

The system **SHOULD** provide a migration guide for existing components, prioritizing high-impact components (Chat, Analytics, Tickets). The system **MUST** maintain backward compatibility during phased rollout (components continue to work with raw `.subscribe()` until migrated).

#### Scenario: Migrating Chat Component Subscriptions

- GIVEN the Chat component with 7 raw `.subscribe()` calls
- WHEN each subscription is replaced with `moduleAwareSubscribe()`
- THEN the component loads zero subscriptions when `moduloChat` is disabled
- AND subscription cleanup coverage improves from 13.8% towards 100%

#### Scenario: Verifying Performance Improvement

- GIVEN a component with migrated module-aware subscriptions
- WHEN the target module is disabled
- THEN zero subscriptions are active (verified via developer tools or subscription count)
- AND the component load time decreases measurably

## MODIFIED Requirements

### Requirement: Utility Helper Availability

The system **SHOULD** provide utility helpers to reduce boilerplate for subscription cleanup, including both generic (`safeSubscribe`) and module‑aware (`moduleAwareSubscribe`) variants. The module‑aware helper **MUST** be used for any subscription that depends on module availability.

(Previously: The system **SHOULD** provide a utility helper to reduce boilerplate for subscription cleanup.)

#### Scenario: Using Module-Aware Helper

- GIVEN a component with a subscription that depends on `moduloChat`
- WHEN the developer uses `moduleAwareSubscribe('chat', observable$, callback)`
- THEN the subscription is automatically gated by module status and cleaned up on destruction
- AND the developer does not need to manually check module status or inject `DestroyRef`

## Non-functional Requirements

### Performance

- Module status checks **MUST** add negligible overhead (≤1ms per check).
- The utility **SHALL** not create additional subscriptions beyond those explicitly requested.

### Memory

- Module‑aware subscriptions **MUST NOT** retain references to components after destruction.
- Caching of module status **SHOULD** be scoped to component lifecycle to avoid stale state.

### Compatibility

- The utility **MUST** work with standalone components (96% of codebase).
- The utility **MUST** integrate with existing ESLint RxJS rules (no rule violations).

### Testing

- Each migrated component **MUST** have unit tests verifying subscription behavior when module is enabled/disabled.
- Edge cases (module status errors, reactive changes) **SHOULD** be covered by integration tests.

## Success Metrics

- Chat component loads zero subscriptions when `moduloChat` is disabled (verified via developer tools).
- Subscription cleanup coverage increases from 13.8% towards 100% across migrated components.
- No regression in component functionality after migration.
- Measurable reduction in app loading time for users with limited module access.

## Edge Cases (Additional)

### Edge Case: Multiple Modules in One Component

- GIVEN a component with subscriptions dependent on different modules
- WHEN the component uses `moduleAwareSubscribe()` for each module
- THEN each subscription respects its own module status independently

### Edge Case: Subscription Inside Nested Services

- GIVEN a service that creates subscriptions on behalf of a component
- WHEN the service uses `moduleAwareSubscribe()` with the component's `DestroyRef`
- THEN the subscription is gated by module status and cleaned up when the component is destroyed

### Edge Case: Race Condition During Module Status Resolution

- GIVEN a component that subscribes before module status is fully resolved
- WHEN the status resolves after subscription attempt
- THEN the subscription is evaluated against the final status (enabled → subscribe, disabled → no subscription)
- AND no dangling subscriptions are left if status resolves as disabled
