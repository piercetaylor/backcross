/**
 * Main-thread file download helper.
 *
 * Responsibility: hand a string to the browser as a file download through a
 * Blob URL created and revoked on the main thread; nothing is uploaded. Used
 * by the Export screen and by the Upload screen's call-set table.
 *
 * Interface: downloadText(filename, content, mime) -> void.
 */

/** Downloads `content` as `filename` through a Blob URL created and revoked on the main thread; nothing is uploaded. */
export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
