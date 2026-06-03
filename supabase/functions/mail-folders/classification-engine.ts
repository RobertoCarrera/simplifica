/**
 * Classification Engine — rule-based email organization.
 *
 * Pluggable architecture: each rule implements ClassificationRule.
 * The engine aggregates rule scores to suggest folders for a given email
 * and identifies similar emails for bulk auto-filing.
 *
 * Design principles:
 *   - Extensible: add new rules by implementing ClassificationRule
 *   - Composable: rules are independent, engine merges their output
 *   - Best-effort: engine never throws; all errors degrade gracefully
 *   - Language-aware: Spanish keyword detection for Simplifica's user base
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface EmailFeatures {
  id?: string;
  senderName: string;
  senderEmail: string;
  senderDomain: string;
  subject: string;
  /** Normalized — lowercased, trimmed */
  subjectLower: string;
  /** Individual words from subject, deduplicated */
  subjectWords: string[];
  isStarred: boolean;
  /** User-applied labels (e.g. 'Importante', 'Favoritos') */
  labels?: string[];
}

export interface FolderCandidate {
  name: string;
  /** Suggested folder name to create if it doesn't exist */
  suggestedName: string;
  path: string;
}

export interface FolderSuggestion {
  folderName: string;
  folderPath: string;
  existingFolderId?: string;
  /** 0–1, higher = better match */
  score: number;
  /** Human-readable reason */
  reason: string;
  /** If no existing folder matches, this is the name to create */
  createIfMissing?: string;
}

export interface SimilarEmailMatch {
  emailId?: string;
  score: number;
  reasons: string[];
}

export interface ClassificationRule {
  /** Unique rule name for debugging and weighting */
  name: string;
  /**
   * Score an email against known folders and return suggestions.
   * Called with the email features and the list of existing user folders.
   */
  suggest(email: EmailFeatures, existingFolders: FolderCandidate[]): FolderSuggestion[];
  /**
   * Given a target folder suggestion and a list of candidate emails,
   * return which emails are "similar" enough to the trigger email.
   */
  findSimilar(
    triggerEmail: EmailFeatures,
    candidateEmails: EmailFeatures[],
    targetFolder: FolderSuggestion,
  ): SimilarEmailMatch[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract domain from email address, lowercased */
export function extractDomain(email: string): string {
  const atIndex = email.lastIndexOf('@');
  return atIndex >= 0 ? email.slice(atIndex + 1).toLowerCase() : '';
}

/** Extract local part (before @) from email */
function extractLocalPart(email: string): string {
  const atIndex = email.lastIndexOf('@');
  return atIndex >= 0 ? email.slice(0, atIndex).toLowerCase() : email.toLowerCase();
}

/** Sanitize a string for use as folder name */
export function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 50) || 'Sin_nombre';
}

/** Tokenize subject into lowercased words, filtering out short/common words */
const STOP_WORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'a', 'en', 'por', 'para', 'con', 'sin', 'del', 'al',
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
  'with', 'of', 'from', 'by', 'is', 'it', 'its', 'be', 'are', 'was',
  're', 'fwd', 'fw', 'rv', 'sv', 'vs',
]);

export function tokenizeSubject(subject: string): string[] {
  return subject
    .toLowerCase()
    .replace(/[^\w\sáéíóúüñ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i); // deduplicate
}

/** Jaccard similarity between two word sets */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Build EmailFeatures from raw email data */
export function buildEmailFeatures(data: {
  id?: string;
  from?: { name?: string; email?: string } | null;
  subject?: string;
  is_starred?: boolean;
  labels?: string[];
}): EmailFeatures {
  const senderName = data.from?.name || data.from?.email?.split('@')[0] || '';
  const senderEmail = data.from?.email || '';
  const senderDomain = extractDomain(senderEmail);
  const subject = data.subject || '';
  const subjectLower = subject.toLowerCase().trim();
  const subjectWords = tokenizeSubject(subject);

  return {
    id: data.id,
    senderName,
    senderEmail,
    senderDomain,
    subject,
    subjectLower,
    subjectWords,
    isStarred: data.is_starred ?? false,
    labels: data.labels ?? [],
  };
}

// ── Rule 1: Sender Match ───────────────────────────────────────────────────

export class SenderRule implements ClassificationRule {
  name = 'sender';

  suggest(email: EmailFeatures, existingFolders: FolderCandidate[]): FolderSuggestion[] {
    if (!email.senderEmail) return [];

    const localName = sanitizeFolderName(extractLocalPart(email.senderEmail));
    const companyName = sanitizeFolderName(email.senderDomain.split('.')[0] || email.senderDomain);

    const suggestions: FolderSuggestion[] = [];

    // Exact match: folder named after sender's local part or full name
    for (const folder of existingFolders) {
      const folderBase = folder.name.toLowerCase();
      if (folderBase === localName.toLowerCase()) {
        suggestions.push({
          folderName: folder.name,
          folderPath: folder.path,
          existingFolderId: folder.name, // caller fills this in
          score: 1.0,
          reason: `Folder exists for sender "${email.senderName}"`,
        });
      }
      if (email.senderName && folderBase === sanitizeFolderName(email.senderName).toLowerCase()) {
        suggestions.push({
          folderName: folder.name,
          folderPath: folder.path,
          score: 0.95,
          reason: `Folder matches sender display name "${email.senderName}"`,
        });
      }
    }

    // If no match, suggest creating one
    if (suggestions.length === 0) {
      const suggestedName = email.senderName
        ? sanitizeFolderName(email.senderName)
        : localName;
      suggestions.push({
        folderName: suggestedName,
        folderPath: `/${suggestedName}`,
        score: 0.7,
        reason: `New folder for "${email.senderName || email.senderEmail}"`,
        createIfMissing: suggestedName,
      });
    }

    // Also suggest domain-based folder as alternative
    if (companyName && companyName.length > 2) {
      suggestions.push({
        folderName: companyName,
        folderPath: `/${companyName}`,
        score: 0.35,
        reason: `Domain folder "${companyName}" (${email.senderDomain})`,
        createIfMissing: companyName,
      });
    }

    return suggestions;
  }

  findSimilar(
    trigger: EmailFeatures,
    candidates: EmailFeatures[],
    _targetFolder: FolderSuggestion,
  ): SimilarEmailMatch[] {
    return candidates
      .filter((c) => c.senderEmail.toLowerCase() === trigger.senderEmail.toLowerCase())
      .map((c) => ({
        emailId: c.id,
        score: 1.0,
        reasons: ['Exact sender match'],
      }));
  }
}

// ── Rule 2: Subject Keywords ───────────────────────────────────────────────

export class SubjectKeywordRule implements ClassificationRule {
  name = 'subject_keywords';

  /** Minimum Jaccard similarity to consider two subjects as related */
  private similarityThreshold: number;

  constructor(similarityThreshold = 0.3) {
    this.similarityThreshold = similarityThreshold;
  }

  suggest(email: EmailFeatures, existingFolders: FolderCandidate[]): FolderSuggestion[] {
    if (email.subjectWords.length === 0) return [];

    const suggestions: FolderSuggestion[] = [];

    // Check existing folders for name overlap with subject words
    for (const folder of existingFolders) {
      const folderWords = tokenizeSubject(folder.name);
      const folderSet = new Set(folderWords);
      const emailSet = new Set(email.subjectWords);
      const sim = jaccardSimilarity(folderSet, emailSet);

      if (sim >= this.similarityThreshold) {
        suggestions.push({
          folderName: folder.name,
          folderPath: folder.path,
          score: 0.5 + sim * 0.4, // 0.5–0.9 range
          reason: `Subject keywords match folder "${folder.name}"`,
        });
      }
    }

    // If no match but subject has meaningful keywords, suggest top keyword as folder
    if (suggestions.length === 0 && email.subjectWords.length > 0) {
      const topWord = email.subjectWords[0];
      const cleanName = sanitizeFolderName(
        topWord.charAt(0).toUpperCase() + topWord.slice(1),
      );
      suggestions.push({
        folderName: cleanName,
        folderPath: `/${cleanName}`,
        score: 0.25,
        reason: `Top subject keyword: "${topWord}"`,
        createIfMissing: cleanName,
      });
    }

    return suggestions;
  }

  findSimilar(
    trigger: EmailFeatures,
    candidates: EmailFeatures[],
    _targetFolder: FolderSuggestion,
  ): SimilarEmailMatch[] {
    const triggerSet = new Set(trigger.subjectWords);
    if (triggerSet.size === 0) return [];

    return candidates
      .map((c) => {
        const candSet = new Set(c.subjectWords);
        const sim = jaccardSimilarity(triggerSet, candSet);
        return {
          emailId: c.id,
          score: sim,
          reasons: sim >= this.similarityThreshold
            ? [`Subject similarity: ${Math.round(sim * 100)}%`]
            : [],
        };
      })
      .filter((m) => m.score >= this.similarityThreshold && m.emailId !== trigger.id);
  }
}

// ── Rule 3: Label-Based (Star / Important) ──────────────────────────────────

export class LabelBasedRule implements ClassificationRule {
  name = 'label';

  /** Mapping from boolean flags / labels to folder name suggestions */
  private labelMapping: Record<string, string> = {
    starred: 'Destacados',
    important: 'Importante',
    favorito: 'Favoritos',
    favoritos: 'Favoritos',
    importante: 'Importante',
    trabajo: 'Trabajo',
    personal: 'Personal',
    proyectos: 'Proyectos',
    newsletter: 'Newsletters',
    facturas: 'Facturas',
    recibos: 'Recibos',
    notificaciones: 'Notificaciones',
  };

  suggest(email: EmailFeatures, _existingFolders: FolderCandidate[]): FolderSuggestion[] {
    if (!email.isStarred && (!email.labels || email.labels.length === 0)) {
      return [];
    }

    const suggestions: FolderSuggestion[] = [];

    // When starred, suggest "Destacados" folder
    if (email.isStarred) {
      suggestions.push({
        folderName: 'Destacados',
        folderPath: '/Destacados',
        score: 0.6,
        reason: 'Email is starred — suggest "Destacados" folder',
        createIfMissing: 'Destacados',
      });
    }

    // Map user labels to folder names
    for (const label of email.labels || []) {
      const lower = label.toLowerCase().trim();
      const mappedKey = Object.keys(this.labelMapping).find(
        (k) => k === lower || lower.includes(k),
      );

      if (mappedKey) {
        const folderName = this.labelMapping[mappedKey];
        suggestions.push({
          folderName,
          folderPath: `/${folderName}`,
          score: 0.65,
          reason: `Label "${label}" maps to "${folderName}"`,
          createIfMissing: folderName,
        });
      } else if (lower.length > 0) {
        const sanitized = sanitizeFolderName(label);
        suggestions.push({
          folderName: sanitized,
          folderPath: `/${sanitized}`,
          score: 0.5,
          reason: `Label-based: "${label}"`,
          createIfMissing: sanitized,
        });
      }
    }

    return suggestions;
  }

  findSimilar(
    trigger: EmailFeatures,
    candidates: EmailFeatures[],
    _targetFolder: FolderSuggestion,
  ): SimilarEmailMatch[] {
    // Group other starred emails together
    if (trigger.isStarred) {
      return candidates
        .filter((c) => c.isStarred && c.id !== trigger.id)
        .map((c) => ({
          emailId: c.id,
          score: 0.5,
          reasons: ['Also starred'],
        }));
    }

    // Group emails with same labels
    const triggerLabels = new Set((trigger.labels || []).map((l) => l.toLowerCase()));
    if (triggerLabels.size === 0) return [];

    return candidates
      .filter((c) => c.id !== trigger.id)
      .map((c) => {
        const candLabels = new Set((c.labels || []).map((l) => l.toLowerCase()));
        const overlap = [...triggerLabels].filter((l) => candLabels.has(l)).length;
        return {
          emailId: c.id,
          score: triggerLabels.size > 0 ? overlap / triggerLabels.size : 0,
          reasons: overlap > 0 ? [`${overlap} shared label(s)`] : [],
        };
      })
      .filter((m) => m.score > 0);
  }
}

// ── Rule 4: Domain-Based ────────────────────────────────────────────────────

export class DomainBasedRule implements ClassificationRule {
  name = 'domain';

  suggest(email: EmailFeatures, existingFolders: FolderCandidate[]): FolderSuggestion[] {
    if (!email.senderDomain) return [];

    const domainBase = sanitizeFolderName(email.senderDomain.split('.')[0] || email.senderDomain);

    // Check if a folder already exists for this domain
    for (const folder of existingFolders) {
      if (folder.name.toLowerCase() === domainBase.toLowerCase()) {
        return [{
          folderName: folder.name,
          folderPath: folder.path,
          score: 0.4,
          reason: `Domain folder "${folder.name}" exists`,
        }];
      }
    }

    return [];
  }

  findSimilar(
    trigger: EmailFeatures,
    candidates: EmailFeatures[],
    _targetFolder: FolderSuggestion,
  ): SimilarEmailMatch[] {
    return candidates
      .filter(
        (c) =>
          c.senderDomain.toLowerCase() === trigger.senderDomain.toLowerCase() &&
          c.id !== trigger.id,
      )
      .map((c) => ({
        emailId: c.id,
        score: 0.3,
        reasons: [`Same domain: ${trigger.senderDomain}`],
      }));
  }
}

// ── Engine ──────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  /** Merged + deduplicated folder suggestions, sorted by score desc */
  suggestions: FolderSuggestion[];
  /** Emails similar to the trigger, sorted by score desc */
  similarEmails: SimilarEmailMatch[];
}

export interface EngineOptions {
  /** Minimum score for a suggestion to be included */
  minSuggestionScore?: number;
  /** Maximum number of suggestions returned */
  maxSuggestions?: number;
  /** Minimum score for a similar email to be included */
  minSimilarityScore?: number;
  /** Maximum number of similar emails returned */
  maxSimilarEmails?: number;
  /** Weight multiplier per rule name */
  ruleWeights?: Record<string, number>;
}

const DEFAULT_OPTIONS: Required<EngineOptions> = {
  minSuggestionScore: 0.2,
  maxSuggestions: 10,
  minSimilarityScore: 0.25,
  maxSimilarEmails: 50,
  ruleWeights: {},
};

export class ClassificationEngine {
  private rules: ClassificationRule[] = [];
  private options: Required<EngineOptions>;

  constructor(rules?: ClassificationRule[], options?: EngineOptions) {
    this.rules = rules ?? [
      new SenderRule(),
      new SubjectKeywordRule(0.3),
      new LabelBasedRule(),
      new DomainBasedRule(),
    ];
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Add or replace a rule */
  registerRule(rule: ClassificationRule): void {
    const idx = this.rules.findIndex((r) => r.name === rule.name);
    if (idx >= 0) {
      this.rules[idx] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  /** Remove a rule by name */
  removeRule(name: string): void {
    this.rules = this.rules.filter((r) => r.name !== name);
  }

  getRules(): ClassificationRule[] {
    return [...this.rules];
  }

  /**
   * Classify an email: generate folder suggestions and find similar emails.
   *
   * @param email - The trigger email features
   * @param existingFolders - Currently existing user folders for the account
   * @param candidateEmails - Other emails to check for similarity (e.g., inbox messages)
   */
  classify(
    email: EmailFeatures,
    existingFolders: FolderCandidate[],
    candidateEmails: EmailFeatures[] = [],
  ): ClassificationResult {
    // ── Phase 1: Generate suggestions ──────────────────────────────────
    const suggestionMap = new Map<string, FolderSuggestion>();

    for (const rule of this.rules) {
      let ruleSuggestions: FolderSuggestion[];
      try {
        ruleSuggestions = rule.suggest(email, existingFolders);
      } catch (err) {
        console.error(`[ClassificationEngine] Rule "${rule.name}" threw during suggest:`, err);
        continue;
      }

      const weight = this.options.ruleWeights[rule.name] ?? 1.0;

      for (const sug of ruleSuggestions) {
        const key = sug.folderPath.toLowerCase();
        const existing = suggestionMap.get(key);

        const weightedScore = sug.score * weight;

        if (!existing || weightedScore > existing.score) {
          suggestionMap.set(key, {
            ...sug,
            score: Number(weightedScore.toFixed(3)),
            // Merge reasons if same folder
            reason: existing
              ? `${existing.reason}; ${sug.reason}`
              : sug.reason,
            createIfMissing: sug.createIfMissing || existing?.createIfMissing,
            existingFolderId: sug.existingFolderId || existing?.existingFolderId,
          });
        } else if (existing && weightedScore < existing.score) {
          // Keep the higher-scored one but merge createIfMissing
          if (!existing.createIfMissing && sug.createIfMissing) {
            existing.createIfMissing = sug.createIfMissing;
          }
        }
      }
    }

    // Filter and sort suggestions
    let suggestions = [...suggestionMap.values()]
      .filter((s) => s.score >= this.options.minSuggestionScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.maxSuggestions);

    // ── Phase 2: Find similar emails ───────────────────────────────────
    if (candidateEmails.length === 0) {
      return { suggestions, similarEmails: [] };
    }

    // Use the top suggestion as the target
    const topSuggestion = suggestions[0];
    const similarityMap = new Map<string, SimilarEmailMatch>();

    if (topSuggestion) {
      for (const rule of this.rules) {
        let matches: SimilarEmailMatch[];
        try {
          matches = rule.findSimilar(email, candidateEmails, topSuggestion);
        } catch (err) {
          console.error(`[ClassificationEngine] Rule "${rule.name}" threw during findSimilar:`, err);
          continue;
        }

        const weight = this.options.ruleWeights[rule.name] ?? 1.0;

        for (const match of matches) {
          if (!match.emailId || match.emailId === email.id) continue;

          const weightedScore = match.score * weight;
          const existing = similarityMap.get(match.emailId);

          if (!existing || weightedScore > existing.score) {
            similarityMap.set(match.emailId, {
              emailId: match.emailId,
              score: Number(weightedScore.toFixed(3)),
              reasons: existing
                ? [...existing.reasons, ...match.reasons]
                : match.reasons,
            });
          } else if (existing && match.reasons.length > 0) {
            // Keep higher score but merge reasons
            for (const r of match.reasons) {
              if (!existing.reasons.includes(r)) {
                existing.reasons.push(r);
              }
            }
          }
        }
      }
    }

    const similarEmails = [...similarityMap.values()]
      .filter((m) => m.score >= this.options.minSimilarityScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.maxSimilarEmails);

    return { suggestions, similarEmails };
  }
}

/**
 * Pre-configured engine instance with default rules appropriate for
 * Simplifica's Spanish-speaking user base.
 */
export function createDefaultEngine(options?: EngineOptions): ClassificationEngine {
  return new ClassificationEngine(
    [
      new SenderRule(),
      new SubjectKeywordRule(0.3),
      new LabelBasedRule(),
      new DomainBasedRule(),
    ],
    {
      // Prioritize sender and label rules for Spanish-speaking CRM context
      ruleWeights: {
        sender: 1.2,
        label: 1.1,
        subject_keywords: 1.0,
        domain: 0.8,
      },
      ...options,
    },
  );
}
