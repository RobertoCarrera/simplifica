/**
 * @simplifica/shared stub
 *
 * This package provides shared functionality for Simplify CRM apps.
 * Real implementation will be published to npm after Phase 7.
 *
 * Currently exports are stubs that will be replaced when
 * @simplifica/shared package is created.
 */

// Re-export guards
export * from "../../guards/auth.guard";
export * from "../../guards/module.guard";
export { StaffGuard } from "../guards/staff.guard";

// Re-export types (to be added)
// export * from '@simplifica/shared/types/user.types';
// export * from '@simplifica/shared/types/company.types';
// export * from '@simplifica/shared/types/module.types';

// Placeholder - to be resolved when @simplifica/shared is published
export const SHARED_VERSION = "0.1.0-stub";
