export function notify(message, severity = 'info', duration = 4000) {
  window.dispatchEvent(new CustomEvent('app-notify', { detail: { message, severity, duration } }));
}

export function confirmDialog({ title = 'Confirm', message = '', onConfirm }) {
  window.dispatchEvent(new CustomEvent('app-confirm', { detail: { title, message, onConfirm } }));
}


