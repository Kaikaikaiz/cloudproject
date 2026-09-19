import { useId } from 'react';
export default function Input({ label, error, hint, id, ...props }) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error || hint ? fieldId + '-help' : undefined}
        {...props}
      />
      {(error || hint) && (
        <small id={fieldId + '-help'} className={error ? 'field-error' : ''}>
          {error || hint}
        </small>
      )}
    </div>
  );
}
