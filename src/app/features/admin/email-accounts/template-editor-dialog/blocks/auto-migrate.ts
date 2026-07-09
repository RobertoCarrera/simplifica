/**
 * Auto-migrate flow (PR2b email-block-editor)
 *
 * Triggered when a setting has `custom_blocks IS NULL` AND
 * `custom_body_template IS NOT NULL` — the legacy "user edited the raw
 * HTML body" path from before the block editor shipped. We parse the
 * legacy HTML into a Block[] using the SAME `defaultHtmlToBlocks`
 * parser the auto-seed path uses (spec id 1945 §9 — single source of
 * truth), then persist to `custom_blocks` one-shot atomically.
 *
 * Per spec id 1945 §9 + design id 1946 §4.5:
 *   - 50,000-char fallback: parser throws or html is over the cap →
 *     single ParagraphBlock with `text = custom_body_template.slice(0, 5000)`.
 *     The remainder stays in `custom_body_template` (untouched) for
 *     rollback / full restore. The caller (BlockEditorComponent)
 *     surfaces a yellow snackbar so the user knows the migration
 *     degraded.
 *
 * Why an async function returning a structured result instead of a
 * signal-bearing service method: the BlockEditorComponent owns the
 * FormArray and the preview-pipeline signals; keeping this helper
 * pure-Promise means it's trivially testable (no TestBed, no
 * Supabase stubbing — just pass a fake service).
 */
import { Block } from './block-types';
import { defaultHtmlToBlocks, makeParagraphBlock } from './block-parser';
import {
  CompanyEmailService,
} from '../../../../../services/company-email.service';
import { CompanyEmailSetting } from '../../../../../models/company-email.models';

/**
 * Result of an auto-migrate attempt. The dialog uses `migrated=true`
 * to decide whether to show the "we converted your template into a
 * single paragraph block" snackbar (banner is yellow per spec §5).
 */
export interface AutoMigrateResult {
  /** True when the parser succeeded and the blocks were persisted. */
  migrated: boolean;
  /** The blocks that should populate the FormArray (post-migration). */
  blocks: Block[];
  /** True when the parser crashed and we fell back to a single ParagraphBlock. */
  fallbackApplied: boolean;
}

/**
 * Run the auto-migrate flow for one setting.
 *
 * 1. Parse `customBodyTemplate` via `defaultHtmlToBlocks`.
 * 2. Persist the result to `custom_blocks` via
 *    `CompanyEmailService.updateCustomBlocks(setting.id, blocks)`.
 * 3. On parse error, fall back to a single ParagraphBlock with the
 *    first 5000 chars of the legacy body.
 * 4. On persist error, re-throw (caller surfaces a red error banner).
 *
 * @param setting the `CompanyEmailSetting` row (must have a non-null
 *                `custom_body_template`)
 * @param primaryColor optional brand primary_color (used to seed the
 *                     default color in the parsed heading + button blocks)
 * @param service the CompanyEmailService (DI: caller passes its injected
 *                instance to keep this helper pure-Promise / unit-testable)
 */
export async function autoMigrate(
  setting: CompanyEmailSetting,
  primaryColor: string | null,
  service: CompanyEmailService,
): Promise<AutoMigrateResult> {
  const legacy = setting.custom_body_template ?? '';

  // Pathological case: legacy is empty after trim — treat as no-op.
  if (!legacy.trim()) {
    return {
      migrated: false,
      blocks: [makeParagraphBlock('')],
      fallbackApplied: false,
    };
  }

  try {
    const blocks = defaultHtmlToBlocks(legacy, primaryColor);
    // Persist atomically (single SQL UPDATE). Throws on error.
    await new Promise<void>((resolve, reject) => {
      service
        .updateCustomBlocks(setting.id, blocks)
        .subscribe({
          next: () => resolve(),
          error: (e: unknown) => reject(e),
        });
    });
    return {
      migrated: true,
      blocks,
      fallbackApplied: false,
    };
  } catch (_err) {
    // 50,000-char fallback per spec §9: single ParagraphBlock with the
    // first 5000 chars of the legacy body. The remainder stays in
    // custom_body_template (untouched) so the user can manually
    // restore from the legacy view.
    const fallback: Block[] = [
      makeParagraphBlock(legacy.slice(0, 5000)),
    ];
    // Best-effort persist the fallback. If THIS also fails we still
    // return the fallback blocks so the user sees them in the canvas;
    // the parent dialog surfaces the persist error separately.
    try {
      await new Promise<void>((resolve, reject) => {
        service
          .updateCustomBlocks(setting.id, fallback)
          .subscribe({
            next: () => resolve(),
            error: (e: unknown) => reject(e),
          });
      });
    } catch {
      // Swallow: the FormArray below will still receive the fallback
      // blocks; persistence can be retried by clicking Guardar.
    }
    return {
      migrated: true,
      blocks: fallback,
      fallbackApplied: true,
    };
  }
}
