const express = require('express');
const router = express.Router();
const db = require('../database/db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.isAdmin) return res.status(403).json({ error: 'Admin access required' });
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Get all users
router.get('/users', isAdmin, async (req, res) => {
    try {
        const users = await db.all('SELECT id, email, is_verified, is_admin, is_disabled, created_at FROM users');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Toggle user status (enable/disable)
router.post('/users/:id/toggle', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);

        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.is_admin) return res.status(400).json({ error: 'Cannot disable admin' });

        const newStatus = user.is_disabled ? 0 : 1;
        await db.run('UPDATE users SET is_disabled = ? WHERE id = ?', [newStatus, id]);

        res.json({ message: `User ${newStatus ? 'disabled' : 'enabled'} successfully` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

// Delete user permanently
router.delete('/users/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own admin account' });
        }

        const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Delete user's stocks first
        await db.run('DELETE FROM user_stocks WHERE user_id = ?', [id]);

        // Delete user
        await db.run('DELETE FROM users WHERE id = ?', [id]);

        res.json({ message: 'User and all associated data deleted permanently' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
