const nodemailer = require('nodemailer');

async function sendVerificationCode(email, code) {
    const isDev = process.env.NODE_ENV !== 'production';
    const smtpUser = process.env.EMAIL_USER;
    const smtpPass = process.env.EMAIL_PASS;
    const smtpHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const smtpPort = process.env.EMAIL_PORT || 587;

    console.log(`\n📧 [MAILER] Verification for ${email}`);
    //console.log(`🔑 CODE: ${code}`);
    //console.log(`📌 Check this terminal for codes during development.`);

    try {
        let transporter;

        if (smtpUser && smtpPass) {
            // Real SMTP Configuration
            transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort == 465,
                auth: { user: smtpUser, pass: smtpPass },
            });
        } else {
            // Development / Ethereal Fallback
            let testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass },
            });
        }

        let info = await transporter.sendMail({
            from: '"Stock Intelligence" <no-reply@stockintel.com>',
            to: email,
            subject: "Account Verification Code",
            text: `Your verification code is: ${code}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2>Welcome to Stock Intelligence</h2>
                    <p>Use the following code to verify your account:</p>
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #2563eb; margin: 20px 0;">
                        ${code}
                    </div>
                </div>
            `,
        });

        if (!smtpUser) {
            console.log(`🌐 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        }
    } catch (err) {
        console.error('❌ Mailer error:', err.message);
    }
}

module.exports = { sendVerificationCode };
