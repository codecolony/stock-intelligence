const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
const db = require('../database/db');

const authMiddleware = async (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Please login to access this feature' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Re-verify against database to catch disabled accounts immediately
        const user = await db.get('SELECT is_disabled FROM users WHERE id = ?', [decoded.id]);

        if (!user || user.is_disabled) {
            res.clearCookie('token');
            return res.status(403).json({ error: 'Account disabled or not found' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie('token');
        res.status(401).json({ error: 'Session expired. Please login again.' });
    }
};

module.exports = authMiddleware;
