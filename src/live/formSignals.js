/**
 * The contact form talking to the film (S10). The form is plain DOM and works on its own; when
 * the film is mounted it listens here and the fox answers: ears at each keystroke, eyes on the
 * caret, a tilted head at a wrong field, and the delivery run after a send. In still mode nobody
 * listens and `sent` resolves at once.
 *
 * @typedef {{ type: 'key' } | { type: 'caret', x: number, y: number } | { type: 'blur' } | { type: 'invalid', field: string, x: number, y: number }} FormSignal
 */

/** @type {Set<(signal: FormSignal) => void>} */
const listeners = new Set();
/** @type {null|((message: string) => Promise<void>)} */
let delivery = null;

/** @returns {() => void} unsubscribe */
export function onFormSignal(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The film's delivery run; returns a promise that settles when the fox is back. */
export function setDeliveryHandler(fn) {
  delivery = fn;
  return () => {
    if (delivery === fn) delivery = null;
  };
}

function emit(signal) {
  listeners.forEach((fn) => fn(signal));
}

/** Screen point of the caret in a text field, measured with the field's own font. */
function caretPoint(field) {
  const rect = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const context = caretPoint.canvas.getContext('2d');
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const before = field.value.slice(0, field.selectionStart ?? field.value.length).split('\n').pop();
  const x = rect.left + parseFloat(style.paddingLeft || '0') + Math.min(context.measureText(before).width, rect.width);
  return { x, y: rect.top + rect.height / 2 };
}
caretPoint.canvas = typeof document === 'undefined' ? null : document.createElement('canvas');

export const formSignals = {
  keystroke() {
    emit({ type: 'key' });
  },
  /** @param {HTMLInputElement|HTMLTextAreaElement} field */
  caret(field) {
    if (!listeners.size) return;
    emit({ type: 'caret', ...caretPoint(field) });
  },
  blur() {
    emit({ type: 'blur' });
  },
  /** @param {string} name @param {HTMLElement|null} field */
  invalid(name, field) {
    const rect = field?.getBoundingClientRect();
    emit({ type: 'invalid', field: name, x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2 });
  },
  /** @param {string} message */
  sent(message) {
    return delivery ? delivery(message).catch(() => {}) : Promise.resolve();
  },
};
