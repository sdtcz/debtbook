interface Props {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  autoFocus?: boolean;
}

const CHIPS: { label: string; value: string }[] = [
  { label: '₦500', value: '500' },
  { label: '1k', value: '1k' },
  { label: '2k', value: '2k' },
  { label: '5k', value: '5k' },
  { label: '10k', value: '10k' },
];

/** Amount input — digits, decimal, or market shorthand like 3k */
export function MoneyInput({ id, label, value, onInput, autoFocus }: Props) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <input
        id={id}
        class="input"
        inputMode="decimal"
        autocomplete="off"
        placeholder="0.00 or 3k"
        value={value}
        autofocus={autoFocus}
        onInput={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          // Allow empty, digits/commas, optional decimal, optional trailing k/K
          if (raw === '' || /^[\d,]*\.?\d{0,2}k?$/i.test(raw)) {
            onInput(raw);
          }
        }}
      />
      <div class="chip-row" role="group" aria-label="Quick amounts">
        {CHIPS.map((c) => (
          <button
            key={c.value}
            type="button"
            class="chip"
            onClick={() => onInput(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div class="hint">Naira (₦) — tip: type 3k for ₦3,000</div>
    </div>
  );
}
