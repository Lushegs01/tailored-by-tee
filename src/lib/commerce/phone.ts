/*
 * Nigerian mobile numbers. People type them every way — "0803 123 4567",
 * "+234 803…", "234803…", "803-123-4567" — so input is normalised to E.164
 * (+234 followed by ten digits) before it is stored or sent to Paystack.
 * Pure; shared by the checkout form and the server.
 */

/** Mobile numbers: ten digits after +234, starting 70–71, 80–81 or 90–91 (e.g. 803, 905, 701). */
const NATIONAL_MOBILE = /^[789][01]\d{8}$/;

/** "+2348031234567", or null when the input is not a Nigerian mobile number. */
export function normalizeNigerianPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");

  let national: string;
  if (/^\+234\d+$/.test(compact)) national = compact.slice(4);
  else if (/^234\d+$/.test(compact)) national = compact.slice(3);
  else if (/^0\d+$/.test(compact)) national = compact.slice(1);
  else if (/^\d+$/.test(compact)) national = compact;
  else return null;

  // A leading zero kept after the country code ("+234 0803…") is a common slip.
  if (national.length === 11 && national.startsWith("0")) national = national.slice(1);

  return NATIONAL_MOBILE.test(national) ? `+234${national}` : null;
}

/** "+234 803 123 4567" for display; anything unexpected is returned unchanged. */
export function formatNigerianPhone(e164: string): string {
  const match = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+234 ${match[1]} ${match[2]} ${match[3]}` : e164;
}
