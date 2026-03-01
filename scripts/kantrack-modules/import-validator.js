/***********************
 * IMPORT VALIDATOR
 * Pure functions — no IDB, no DOM.
 * Validates a parsed .kantrack.json payload before applying it.
 ***********************/

export const FORMAT_VERSION = 1;
export const SUPPORTED_FORMAT_VERSIONS = [1];

const VALID_COLUMNS = ['todo', 'inProgress', 'onHold', 'done'];

/**
 * Validate a parsed .kantrack.json object.
 * Returns { valid: boolean, errors: string[], warnings: string[] }
 *   valid  — false if any hard error exists; warnings never block import
 *   errors — structural problems that prevent safe import
 *   warnings — integrity issues the user should know about (import proceeds)
 */
export function validateImportFile(parsed) {
  const errors = [];
  const warnings = [];

  if (!parsed || typeof parsed !== 'object') {
    errors.push('File does not contain a valid JSON object.');
    return { valid: false, errors, warnings };
  }

  // ── Format version ────────────────────────────────────────────────────────
  if (parsed.formatVersion === undefined || parsed.formatVersion === null) {
    errors.push('Missing formatVersion field.');
  } else if (!SUPPORTED_FORMAT_VERSIONS.includes(parsed.formatVersion)) {
    errors.push(
      `Unsupported format version: ${parsed.formatVersion}. Supported: ${SUPPORTED_FORMAT_VERSIONS.join(', ')}.`
    );
  }

  // ── Tasks array ───────────────────────────────────────────────────────────
  if (!Array.isArray(parsed.tasks)) {
    errors.push('Missing or invalid tasks array.');
  } else {
    // Integrity: count check
    if (
      parsed.integrity &&
      typeof parsed.integrity.tasks_count === 'number' &&
      parsed.integrity.tasks_count !== parsed.tasks.length
    ) {
      warnings.push(
        `Integrity mismatch: file claims ${parsed.integrity.tasks_count} task(s) but contains ${parsed.tasks.length}.`
      );
    }

    // Referential integrity: tag references
    const tagIds = new Set(Array.isArray(parsed.tags) ? parsed.tags.map(t => t.id) : []);
    const missingTagIds = new Set();
    for (const task of parsed.tasks) {
      if (Array.isArray(task.tags)) {
        for (const tagId of task.tags) {
          if (!tagIds.has(tagId)) missingTagIds.add(tagId);
        }
      }
    }
    if (missingTagIds.size > 0) {
      warnings.push(
        `${missingTagIds.size} tag reference(s) in tasks have no matching tag definition. Affected tasks will keep their tag IDs but tags will not display correctly.`
      );
    }

    // Column validity
    const invalidColumnCount = parsed.tasks.filter(
      t => t.column && !VALID_COLUMNS.includes(t.column)
    ).length;
    if (invalidColumnCount > 0) {
      warnings.push(
        `${invalidColumnCount} task(s) reference unknown columns and will be placed in "To Do".`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Extract a human-readable summary of entity counts from a parsed payload.
 * Returns { tasks, tags, pages, clocks } — all numbers, zero if absent.
 */
export function extractImportSummary(parsed) {
  return {
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks.length : 0,
    tags: Array.isArray(parsed.tags) ? parsed.tags.length : 0,
    pages: Array.isArray(parsed.notebook_items) ? parsed.notebook_items.length : 0,
    clocks: Array.isArray(parsed.clocks) ? parsed.clocks.length : 0,
  };
}
