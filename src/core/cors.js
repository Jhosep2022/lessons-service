export const corsHeaders = (e) => ({
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS === '*' ? '*' : (e?.headers?.origin || e?.headers?.Origin || '*'),
  'Vary': 'Origin',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Max-Age': '600'
});
export const preflightResponse = (e) => ({ statusCode: 204, headers: corsHeaders(e) });
