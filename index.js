/**
 * Host half of the font-settings bundle.
 *
 * The font backend is `@deepseek-ai/dsh-client-ui-theme`. Its `ui-theme` Config
 * carries `textFontFamily` / `codeFontFamily` / `terminalFontFamily` as volatile
 * fields, and its Host half injects those values into every served index before
 * the first frame. This bundle therefore owns no settings namespace and injects
 * nothing of its own — doing so would stack a second, competing first-paint layer
 * over the shipped one.
 *
 * The Host half still exists for two reasons: a bundle row must resolve to a Host
 * plugin, and its permissive Config keeps a profile patch written for the old
 * `sans` / `mono` fields loadable. Schemastery passes unknown keys through
 * untouched, so those legacy keys are accepted and simply ignored.
 */
import z from '@deepseek-ai/schemastery';

/** Accepts the legacy `sans` / `mono` keys without claiming them. */
export const Config = z.object({});

/** Nothing to wire: presentation and persistence both live elsewhere. */
export function apply() {}
