// Shared byte cap for the Node adapters and Worker. The body still receives
// per-field and turn-count validation after JSON parsing.
export const INTERVIEW_BODY_LIMIT=640*1024;
