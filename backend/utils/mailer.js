const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendVerificationCode(email, code) {
    const smtpUser = process.env.EMAIL_USER;
    const smtpPass = process.env.EMAIL_PASS;
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev'; // Resend default for testing

    console.log(`\n📧 [MAILER] Sending verification to ${email} (Code: ${code})`);

    try {
        // 1. Try Resend API first (Fastest/Reliable for Serverless)
        if (resend) {
            console.log('🚀 Attempting to send via Resend API...');

            // Note: If domain is not verified, Resend only allows sending from onboarding@resend.dev
            // AND only to the email address used to sign up for Resend.
            const { data, error } = await resend.emails.send({
                from: `Stock Intelligence <${fromEmail}>`,
                to: email,
                subject: 'Account Verification Code',
                html: `<strong>Your verification code is: ${code}</strong>`
            });

            if (error) {
                console.error('❌ Resend API Error:', error);
                // Fallback to SMTP if Resend fails
            } else {
                console.log('✅ Resend API success:', data);
                return;
            }
        }

        // 2. Fallback to SMTP
        let transporter;
        if (smtpUser && smtpPass) {
            console.log('📡 Using Real SMTP');
            transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST || 'smtp.gmail.com',
                port: process.env.EMAIL_PORT || 587,
                secure: process.env.EMAIL_PORT == 465,
                auth: { user: smtpUser, pass: smtpPass },
            });
        } else {
            // 3. Development / Ethereal Fallback
            console.log('🧪 Using Ethereal (Dev Fallback)');
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
            console.log(`🌐 Ethereal Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        }
    } catch (err) {
        console.error('❌ Mailer error:', err.message);
    }
}

module.exports = { sendVerificationCode };
