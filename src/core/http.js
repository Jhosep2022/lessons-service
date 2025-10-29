import { corsHeaders } from './cors.js';
export const parse = (e) => (e?.body ? (typeof e.body === 'string' ? JSON.parse(e.body) : e.body) : {});
export const ok = (e, body, status=200) => ({ statusCode: status, headers: { 'Content-Type':'application/json', ...corsHeaders(e) }, body: JSON.stringify(body) });
export const err = (e, msg, status=400) => ok(e, { error: msg }, status);
