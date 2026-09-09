interface Props {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  autoFocus?: boolean;
}

/** Amount input — accepts digits and one decimal point */
export function MoneyInput({ id, label, value, onInput, autoFocus }: Props) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <input
        id={id}
        class="input"
        inputMode="decimal"
        autocomplete="off"
        placeholder="0.00"
        value={value}
        autofocus={autoFocus}
        onInput={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          // Allow empty, digits, optional comma thousands, one dot
          if (raw === '' || /^[\d,]*\.?\d{0,2}$/.test(raw)) {
            onInput(raw);
          }
        }}
      />
      <div class="hint">Enter amount in Naira (₦)</div>
    </div>
  );
}
