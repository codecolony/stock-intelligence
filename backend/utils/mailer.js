const nodemailer = require('nodemailer');

async function sendVerificationCode(email, code) {
    const smtpUser = process.env.EMAIL_USER;
    const smtpPass = process.env.EMAIL_PASS;
    const smtpHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.EMAIL_PORT || '587');
    const fromEmail = process.env.EMAIL_FROM || smtpUser;

    console.log(`\n📧 [MAILER] Target: ${email} | Code: ${code} | Host: ${smtpHost}`);

    try {
        let transporter;

        if (smtpUser && smtpPass) {
            console.log('📡 Attempting Secure SMTP Connection...');
            transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465, // True for 465, false for 587
                auth: {
                    user: smtpUser,
                    pass: smtpPass,
                },
                tls: {
                    // Do not fail on invalid certs (common with some SMTP servers)
                    rejectUnauthorized: false
                }
            });
        } else {
            console.log('🧪 Using Ethereal Dev Fallback (Wait for it...)');
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass },
            });
        }

        const info = await transporter.sendMail({
            from: `"Stock Intelligence" <${fromEmail}>`,
            to: email,
            subject: "Your Account Verification Code",
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 500px;">
                    <h2 style="color: #1e293b; margin-top: 0;">Welcome to Stock Intelligence</h2>
                    <p style="color: #64748b; font-size: 16px;">Please use the code below to complete your registration:</p>
                    <div style="background: #f8fafc; padding: 30px; text-align: center; border-radius: 10px; border: 2px dashed #cbd5e1; margin: 20px 0;">
                        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #3b82f6;">${code}</span>
                    </div>
                    <p style="color: #94a3b8; font-size: 12px;">If you didn't request this code, you can safely ignore this email.</p>
                </div>
            `,
        });

        console.log('✅ Email sent successfully!');
        if (!smtpUser) {
            console.log(`🌐 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        }

    } catch (err) {
        console.error('❌ Mailer error:', err.message);
        // Special diagnostic for Gmail/SMTP failures
        if (err.message.includes('Username and Password not accepted')) {
            console.error('👉 TIP: This means your App Password is wrong or you haven\'t enabled "App Passwords" in Google.');
        }
    }
}

module.exports = { sendVerificationCode };
