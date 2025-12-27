const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { sendVerificationCode } = require('../utils/mailer');

const JWT_SECRET = process.env.JWT_SECRET;

// Register
router.post('/register', async (req, res) => {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        await db.run('INSERT INTO users (email, password, verification_code) VALUES (?, ?, ?)', [email, hashedPassword, verificationCode]);

        await sendVerificationCode(email, verificationCode);

        res.status(201).json({ message: 'Registration successful. Please verify your email.' });
    } catch (err) {
        console.error('❌ Registration Error:', err);
        if (err.message.includes('UNIQUE constraint failed') || err.code === '23505') {
            return res.status(400).json({ error: 'Email already registered' });
        }
        res.status(500).json({ error: 'Server error during registration', details: err.message });
    }
});

// Verify Email
router.post('/verify', async (req, res) => {
    const { email, code } = req.body;

    try {
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.verification_code === code) {
            await db.run('UPDATE users SET is_verified = 1, verification_code = NULL WHERE id = ?', [user.id]);
            res.json({ message: 'Email verified successfully. You can now login.' });
        } else {
            res.status(400).json({ error: 'Invalid verification code' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Server error during verification' });
    }
});

// Resend Verification Code
router.post('/resend-code', async (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            return res.status(404).json({ error: 'No account found with this email' });
        }

        if (user.is_verified) {
            return res.status(400).json({ error: 'Email is already verified' });
        }

        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        await db.run('UPDATE users SET verification_code = ? WHERE id = ?', [newCode, user.id]);

        await sendVerificationCode(email, newCode);

        res.json({ message: 'A new verification code has been sent to your email.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error while resending code' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(`🔑 Login attempt for: ${email}`);

    try {
        if (!JWT_SECRET) {
            console.error('❌ CRITICAL: JWT_SECRET is not defined in environment variables.');
            return res.status(500).json({ error: 'Server configuration error (JWT)' });
        }

        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            console.warn(`⚠️ User not found: ${email}`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.is_verified) {
            return res.status(403).json({ error: 'Email not verified' });
        }

        if (user.is_disabled) {
            return res.status(403).json({ error: 'Account disabled by admin' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.warn(`⚠️ Password mismatch for: ${email}`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, isAdmin: !!user.is_admin },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: true, // Always true for Netlify (HTTPS)
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        console.log(`✅ Login successful: ${email}`);
        res.json({
            message: 'Login successful',
            user: {
                email: user.email,
                isAdmin: !!user.is_admin
            }
        });
    } catch (err) {
        console.error('❌ Login Error:', err);
        res.status(500).json({
            error: 'Server error during login',
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

// Get Current User (Session check)
router.get('/me', (req, res) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ user: decoded });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
