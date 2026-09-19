import { useId } from 'react';
export default function Select({
  label,
  options,
  placeholder = 'Select an option',
  ...props
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option
            key={typeof option === 'string' ? option : option.value}
            value={typeof option === 'string' ? option : option.value}
          >
            {typeof option === 'string' ? option : option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
