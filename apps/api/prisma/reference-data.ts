/**
 * Countries and currencies, built from the runtime's own Unicode data (Intl) so no list is
 * typed by hand. The per-country currency and calling code are kept for the countries the
 * product serves first; others can be added here without a migration.
 */
const regionCodes =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );

const countryDetails: Record<string, { currencyCode: string; callingCode: string }> = {
  AE: { currencyCode: 'AED', callingCode: '+971' },
  AU: { currencyCode: 'AUD', callingCode: '+61' },
  CA: { currencyCode: 'CAD', callingCode: '+1' },
  DE: { currencyCode: 'EUR', callingCode: '+49' },
  FR: { currencyCode: 'EUR', callingCode: '+33' },
  GB: { currencyCode: 'GBP', callingCode: '+44' },
  IE: { currencyCode: 'EUR', callingCode: '+353' },
  IN: { currencyCode: 'INR', callingCode: '+91' },
  NZ: { currencyCode: 'NZD', callingCode: '+64' },
  SA: { currencyCode: 'SAR', callingCode: '+966' },
  SG: { currencyCode: 'SGD', callingCode: '+65' },
  US: { currencyCode: 'USD', callingCode: '+1' },
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' });

export const countries = regionCodes.map((code) => ({
  code,
  name: regionNames.of(code) ?? code,
  currencyCode: countryDetails[code]?.currencyCode ?? null,
  callingCode: countryDetails[code]?.callingCode ?? null,
}));

export const currencies = Intl.supportedValuesOf('currency').map((code) => {
  const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(1);
  const symbol = parts.find((p) => p.type === 'currency')?.value ?? null;
  const fraction = parts.find((p) => p.type === 'fraction')?.value;
  return {
    code,
    name: currencyNames.of(code) ?? code,
    symbol: symbol === code ? null : symbol,
    decimalDigits: fraction ? fraction.length : 0,
  };
});
