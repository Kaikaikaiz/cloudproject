export default function ItemArt({ kind, className = '' }) {
  return (
    <svg
      className={`item-art ${className}`}
      viewBox="0 0 240 200"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="120" cy="172" rx="68" ry="10" fill="#383640" opacity=".07" />
      {kind === 'tote' && (
        <g transform="rotate(-9 120 110)">
          <path d="M88 73V56c0-42 64-42 64 0v17" stroke="#aa987d" strokeWidth="10" />
          <path
            d="M66 66h108l12 102c-38 12-84 12-132 0z"
            fill="#f5edd9"
            stroke="#d6c6a7"
            strokeWidth="2"
          />
          <path d="M81 67l-6 100M159 67l7 102" stroke="#dfd2b8" strokeWidth="2" />
          <path d="M105 115c3-13 20-16 28-4 17 25-6 34-6 34s-28-6-22-30" fill="#91a17f" />
          <path d="M118 120l11 29" stroke="#f5edd9" strokeWidth="2" />
        </g>
      )}
      {kind === 'lamp' && (
        <g>
          <path d="M121 88v68" stroke="#a87452" strokeWidth="9" />
          <ellipse cx="120" cy="162" rx="42" ry="10" fill="#b78462" />
          <path d="M98 38h46l35 66H61z" fill="#f9ecd1" stroke="#d6bc90" strokeWidth="2" />
          <path d="M109 38l-12 65m35-65 13 65" stroke="#e3cfa9" strokeWidth="2" />
          <ellipse cx="120" cy="104" rx="59" ry="8" fill="#ead5ac" />
        </g>
      )}
      {kind === 'books' && (
        <g transform="rotate(-10 120 110)">
          <rect x="56" y="136" width="132" height="26" rx="4" fill="#8bab98" />
          <path d="M65 143h121v11H65" fill="#f7f0df" />
          <rect x="62" y="111" width="119" height="26" rx="4" fill="#d69b7d" />
          <path d="M70 117h108v13H70" fill="#fff5e5" />
          <rect x="73" y="40" width="88" height="78" rx="4" fill="#ecd778" />
          <rect x="83" y="49" width="69" height="61" rx="2" stroke="#b39f4f" />
          <path
            d="M99 92c-5-27 12-35 25-21 13-10 22 2 13 12-10 11-23 9-38 9"
            fill="#8c9d75"
          />
          <path d="M109 64h29" stroke="#8d7946" strokeWidth="3" />
        </g>
      )}
      {kind === 'camera' && (
        <g transform="rotate(7 120 110)">
          <rect x="51" y="70" width="140" height="89" rx="14" fill="#e6be9c" />
          <rect x="51" y="90" width="140" height="48" fill="#9b745e" />
          <rect x="67" y="59" width="34" height="13" rx="5" fill="#715c52" />
          <circle cx="126" cy="113" r="37" fill="#e6d8c5" />
          <circle cx="126" cy="113" r="29" fill="#494c49" />
          <circle cx="126" cy="113" r="19" fill="#6c817c" />
          <circle cx="120" cy="107" r="7" fill="#b8ccc2" />
          <rect x="162" y="79" width="18" height="10" rx="3" fill="#fff2d8" />
        </g>
      )}
    </svg>
  );
}
