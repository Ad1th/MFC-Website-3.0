import { useId, useRef, useState } from 'react';
import { site } from '../content/index.js';
import { apiBase } from '../live/newsletters.js';
import { flags } from '../live/flags.js';
import styles from './Contact.module.css';

/**
 * The one-line form. Enter moves to the next field and sends from the last one.
 * No red boxes, no alert(): one mono line says what needs fixing.
 */

const SEND_TIMEOUT_MS = 6000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const FIELDS = [
  { name: 'name', label: 'name', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'email', type: 'email', autoComplete: 'email' },
  { name: 'message', label: 'say something', type: 'textarea', autoComplete: 'off' },
];

/** @returns {{ field: string, text: string }|null} */
function validate({ name, email, message }) {
  const n = name.trim();
  const m = message.trim();
  if (n.length < 2) return { field: 'name', text: 'that name looks a little short.' };
  if (n.length > 80) return { field: 'name', text: 'that name is longer than 80 characters.' };
  if (!EMAIL.test(email.trim())) return { field: 'email', text: 'that email looks a little off.' };
  if (m.length < 10) return { field: 'message', text: 'say a little more. ten characters at least.' };
  if (m.length > 2000) return { field: 'message', text: 'that is over 2000 characters. trim it a little.' };
  return null;
}

async function send(payload) {
  const base = apiBase();
  if (!base || flags.backendDown) throw new Error('no backend');
  const res = await fetch(`${base}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  if (json && json.success === false) throw new Error('rejected');
}

function mailtoFor({ name, message }) {
  const subject = encodeURIComponent(`hello from ${name.trim() || 'the website'}`);
  const body = encodeURIComponent(message.trim());
  return `mailto:${site.email}?subject=${subject}&body=${body}`;
}

export default function Contact() {
  const id = useId();
  const [values, setValues] = useState({ name: '', email: '', message: '', company: '' });
  const [status, setStatus] = useState(/** @type {'idle'|'sending'|'sent'|'failed'} */ ('idle'));
  const [error, setError] = useState(/** @type {{ field: string, text: string }|null} */ (null));
  const [copied, setCopied] = useState(false);
  const refs = useRef({});

  const update = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }));
    if (error?.field === field) setError(null);
  };

  const focusField = (field) => refs.current[field]?.focus();

  const submit = async () => {
    if (status === 'sending') return;
    const problem = validate(values);
    if (problem) {
      setError(problem);
      focusField(problem.field);
      return;
    }
    setError(null);
    if (values.company) {
      setStatus('sent');
      return;
    }
    setStatus('sending');
    try {
      await send({ name: values.name.trim(), email: values.email.trim(), message: values.message.trim() });
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  };

  const onKeyDown = (index) => (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const next = FIELDS[index + 1];
    if (next) focusField(next.name);
    else submit();
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(site.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (status === 'sent') {
    return (
      <div className={styles.wrap}>
        <p className={styles.done} role="status">
          received. we'll write back.
        </p>
        <EmailLine copied={copied} onCopy={copyEmail} />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        aria-describedby={`${id}-status`}
      >
        {FIELDS.map((f, index) => {
          const invalid = error?.field === f.name;
          const common = {
            id: `${id}-${f.name}`,
            name: f.name,
            ref: (el) => {
              refs.current[f.name] = el;
            },
            value: values[f.name],
            onChange: update(f.name),
            onKeyDown: onKeyDown(index),
            autoComplete: f.autoComplete,
            'aria-invalid': invalid || undefined,
            'aria-describedby': invalid ? `${id}-status` : undefined,
            className: styles.input,
            disabled: status === 'sending',
          };
          return (
            <span key={f.name} className={styles.field} data-invalid={invalid || undefined}>
              <label htmlFor={common.id} className={styles.label}>
                {f.label}
              </label>
              {f.type === 'textarea' ? (
                <textarea {...common} rows={1} maxLength={2000} />
              ) : (
                <input {...common} type={f.type} inputMode={f.type === 'email' ? 'email' : undefined} maxLength={f.name === 'name' ? 80 : 254} />
              )}
            </span>
          );
        })}
        <span className={styles.honeypot} aria-hidden="true">
          <label htmlFor={`${id}-company`}>company</label>
          <input id={`${id}-company`} name="company" tabIndex={-1} autoComplete="off" value={values.company} onChange={update('company')} />
        </span>
        <button type="submit" className={styles.send} disabled={status === 'sending'} data-cursor="link">
          {status === 'sending' ? 'sending' : 'send'}
        </button>
      </form>

      <p id={`${id}-status`} className={styles.status} role="status" aria-live="polite">
        {error ? error.text : null}
        {status === 'failed' ? (
          <>
            couldn't send. email us instead: <a href={mailtoFor(values)}>{site.email}</a>
          </>
        ) : null}
      </p>

      <EmailLine copied={copied} onCopy={copyEmail} />
    </div>
  );
}

function EmailLine({ copied, onCopy }) {
  return (
    <p className={styles.emailLine}>
      <button type="button" className={styles.email} onClick={onCopy} data-cursor="link">
        {site.email}
        <span className="visually-hidden"> (copy email address)</span>
      </button>
      <span className={styles.copied} role="status" aria-live="polite">
        {copied ? 'copied.' : ''}
      </span>
    </p>
  );
}
