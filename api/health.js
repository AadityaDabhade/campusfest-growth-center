module.exports = (req, res) => { res.setHeader('cache-control', 'no-store'); res.status(200).json({ ok: !!process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'auto' }); };
