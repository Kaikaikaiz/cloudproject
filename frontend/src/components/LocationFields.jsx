export const states = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Kuala Lumpur',
  'Labuan',
  'Putrajaya',
];
export default function LocationFields({ values, onChange, disabled }) {
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor="state">State / Federal territory</label>
        <select
          id="state"
          name="state"
          value={values.state}
          onChange={onChange}
          disabled={disabled}
          required={!!values.city}
        >
          <option value="">Select state</option>
          {states.map((state) => (
            <option key={state}>{state}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="city">City / Area</label>
        <input
          id="city"
          name="city"
          value={values.city}
          onChange={onChange}
          placeholder="e.g. Petaling Jaya"
          maxLength={80}
          required={!!values.state}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
