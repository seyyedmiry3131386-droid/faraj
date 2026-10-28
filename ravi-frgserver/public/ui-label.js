// Presentation-only spelling of ezafe. Never apply this to a reporter's
// answer, source quotation, option value, comparison key, or saved draft.
export const uiLabel = value => String(value ?? '').replace(/\u0654/g, '').replace(/ۀ/g, 'ه');
