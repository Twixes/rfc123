/** Shared protocol constants between the popup OAuth helper, the popup-start
 *  page that auto-fires sign-in, and the popup-complete endpoint that signals
 *  the parent. Keeping them in one place so a path rename can't desync the
 *  three pieces. */
export const POPUP_SIGNAL = "rfc123:auth-complete";
export const POPUP_START_PATH = "/auth/popup-start";
export const POPUP_COMPLETE_PATH = "/api/auth/popup-complete";
