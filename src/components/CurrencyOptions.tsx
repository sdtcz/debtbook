import { useLocale } from '../hooks/useLocale';
import { currencyGroups, currencyLabel } from '../lib/currency';

/** <option>s for the currency <select> (setup + settings): grouped, sorted by code. */
export function CurrencyOptions() {
  const { locale, t } = useLocale();
  const { africa, other } = currencyGroups();
  const opts = (codes: string[]) =>
    codes.map((code) => (
      <option key={code} value={code}>
        {currencyLabel(code, locale)}
      </option>
    ));
  return (
    <>
      <optgroup label={t('currency.groupAfrica')}>{opts(africa)}</optgroup>
      <optgroup label={t('currency.groupOther')}>{opts(other)}</optgroup>
    </>
  );
}
