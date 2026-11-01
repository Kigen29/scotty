/**
 * Pure helpers for incoming email: what part of a reply is new, whether a robot sent it, whether the person
 * asked to stop, and the per-lead reply address that tells Scotty who a reply belongs to.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `reply+<lead id>@<domain>`: replies to Scotty's emails come back here and land on the right lead. */
/** The public audit page for a lead. */
export const reportUrl = (token: string) => `${(process.env.REPORT_BASE_URL ?? "https://code5developers.com/r").replace(/\/$/, "")}/${token}`;

export const replyAddress = (leadId: string, domain: string) => `reply+${leadId}@${domain}`;

export function leadIdFromAddresses(addresses: string[], domain: string): string | null {
  const re = new RegExp(`^reply\\+(${UUID})@${escapeRegExp(domain)}$`, "i");
  for (const a of addresses) {
    const m = bareAddress(a).match(re);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** "Jane Doe <jane@x.com>" or "jane@x.com" → "jane@x.com". */
export function bareAddress(s: string) {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

/** "Jane Doe <jane@x.com>" → "Jane Doe", or null when there's no display name. */
export function displayName(s: string) {
  const m = s.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : null;
}

/**
 * Keeps only what the person wrote this time: drops quoted history ("On … wrote:", Outlook's
 * "From:/Sent:" block, "-----Original Message-----", lines starting with ">") and a trailing "-- " signature.
 */
export function stripQuoted(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    if (/^\s*On\s.+wrote:\s*$/i.test(line)) break;
    // Gmail sometimes wraps "On <date>, <name>" and "wrote:" onto two lines
    if (/^\s*On\s.+/i.test(line) && /^\s*.*wrote:\s*$/i.test(next) && !/wrote:/i.test(line)) break;
    if (/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^\s*From:\s.+/i.test(line) && lines.slice(i + 1, i + 4).some((l) => /^\s*(Sent|Date|To|Subject):\s/i.test(l))) break;
    if (/^-- ?$/.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Out-of-office notices, bounces and bulk mail: recorded, never answered, so two robots can't loop. */
export function isAutomated(headers: Record<string, string | string[] | undefined>, from: string, subject: string) {
  const h = (k: string) => {
    const v = Object.entries(headers).find(([key]) => key.toLowerCase() === k)?.[1];
    return (Array.isArray(v) ? v.join(",") : (v ?? "")).toLowerCase();
  };
  const auto = h("auto-submitted");
  if (auto && auto !== "no") return true;
  if (/(bulk|junk|list|auto_reply)/.test(h("precedence"))) return true;
  if (h("x-autoreply") || h("x-autorespond") || h("x-auto-response-suppress").includes("all")) return true;
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce)/i.test(bareAddress(from))) return true;
  return /^(auto(matic)?[ -]?reply|out of (the )?office|automatic reply|delivery status notification|undeliverable|mail delivery failed)/i.test(subject.trim());
}

/** "STOP", "unsubscribe", "remove me" and the like, as the whole point of a short message. */
export function isUnsubscribe(text: string) {
  const t = text.trim();
  if (!t) return false;
  const first = t.split("\n").find((l) => l.trim())?.trim() ?? "";
  if (/^(stop|unsubscribe|remove me|opt[ -]?out)\b[.!]*$/i.test(first)) return true;
  return t.length <= 80 && /\b(unsubscribe|stop (emailing|messaging|contacting) me|remove me from|don'?t (email|contact) me)\b/i.test(t);
}
