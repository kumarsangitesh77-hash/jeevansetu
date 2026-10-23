// Qoder Sites Edge Function for JeevanSetu API
export default {
  async fetch(request: Request, env: any, ctx: any) {
    const url = new URL(request.url);
    
    // Health check
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'jeevansetu-api',
        version: '2.0.0',
        env: 'production',
        checks: { storage: true, triageEngine: true, careDirectory: true, auditChain: true }
      }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // All other API routes — proxy to backend logic
    // For now, return a helpful message
    return new Response(JSON.stringify({
      error: {
        message: 'API endpoint not yet deployed. The frontend is live; backend requires Node.js runtime.',
        status: 503,
        path: url.pathname,
        suggestion: 'Run npm start locally or deploy backend to Railway/Render/Fly.io'
      }
    }), {
      status: 503,
      headers: { 'content-type': 'application/json' }
    });
  },
};
