/**
 * Puts some words on the clipboard, and says whether they got there.
 *
 * The async clipboard needs a secure context and, in some webviews, a
 * permission that is not granted. The old selection-and-copy still works in
 * both of those places, so it is tried second.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the selection.
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  } catch {
    return false;
  }
}
