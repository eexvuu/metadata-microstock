/**
 * One measure for the whole app.
 *
 * The header, the footer, every dashboard screen and every tool page use this
 * exact class, so the left edge of a heading never moves when you navigate.
 * Before this existed the dashboard had a sidebar that pushed its content in
 * while the tool pages started at the header's edge, and switching between
 * them looked like the page jumped.
 */
export const CONTAINER = 'mx-auto w-full max-w-[100rem] px-4 sm:px-8'
