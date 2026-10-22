import { useLocale } from '../hooks/useLocale';
import { currencySymbol, quickAmounts } from '../lib/money';

interface Props {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  autoFocus?: boolean;
}

/** Amount input — digits, decimal, or market shorthand like 3k */
export function MoneyInput({ id, label, value, onInput, autoFocus }: Props) {
  const { t } = useLocale();
  // Quick amounts sized to the shop currency; the first one shows the symbol (e.g. ₦500).
  const chips = quickAmounts().map((v, i) => ({ value: v, label: i ? v : `${currencySymbol()}${v}` }));
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <input
        id={id}
        class="input"
        inputMode="decimal"
        autocomplete="off"
        placeholder={t('money.placeholder')}
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
      <div class="chip-row" role="group" aria-label={t('money.quickAmounts')}>
        {chips.map((c) => (
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
      <div class="hint">{t('money.hint')}</div>
    </div>
  );
}
