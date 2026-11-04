/**
 * React hands the `close` event of a dialog to the handlers of the dialogs around
 * it, though the browser does not. Only the review's own closing may end the
 * review: a confirmation opened inside it closes without ending it.
 */
export function isOwnCloseEvent(event: {
  target: EventTarget | object;
  currentTarget: EventTarget | object;
}): boolean {
  return event.target === event.currentTarget;
}
