"use client";

/**
 * The only client component in the app.
 *
 * Everything else renders on the server; this exists because opening the browser
 * print dialog needs `window.print()`. If JavaScript is unavailable the page is
 * still printable from the browser's own menu, so nothing is lost.
 */
export function PrintButton() {
  return (
    <button type="button" className="btn-water" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}
