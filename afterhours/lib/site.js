/* Railway hands you the domain without a scheme, and pasting it in exactly as
   shown leaves SITE_URL as "something.up.railway.app". That breaks the Discord
   redirect, which has to match character for character, and it breaks the
   Twitch embed, which parses this as a URL. Rather than let people lose an hour
   to it, put the scheme back and say so in the log. */

let warned = false;

function siteUrl() {
  const raw = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return 'http://localhost:3000';
  if (/^https?:\/\//i.test(raw)) return raw;

  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(raw);
  const fixed = (local ? 'http://' : 'https://') + raw;
  if (!warned) {
    warned = true;
    console.log('[afterhours] SITE_URL had no http:// or https:// in front of it. Reading it as ' + fixed);
    console.log('[afterhours] Set SITE_URL to exactly that, or Discord sign-in will keep failing.');
  }
  return fixed;
}

function siteHost() {
  try { return new URL(siteUrl()).hostname; } catch (e) { return 'localhost'; }
}

function hadScheme() {
  const raw = String(process.env.SITE_URL || '').trim();
  return !raw || /^https?:\/\//i.test(raw);
}

module.exports = { siteUrl, siteHost, hadScheme };
