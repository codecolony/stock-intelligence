const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// Initialize providers if keys exist
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendVerificationCode(email, code) {
    const smtpUser = process.env.EMAIL_USER;
    const smtpPass = process.env.EMAIL_PASS;
    const postmarkToken = process.env.POSTMARK_TOKEN;
    const sendgridApiKey = process.env.SENDGRID_API_KEY;

    // Fallback logic for specialized providers
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    console.log(`\n📧 [MAILER] Destination: ${email} | Code: ${code}`);

    try {
        // 1. Try Resend API
        if (resend) {
            console.log('🚀 Sending via Resend...');
            const { data, error } = await resend.emails.send({
                from: `Stock Intelligence <${fromEmail}>`,
                to: email,
                subject: 'Account Verification Code',
                html: `<div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                        <h2 style="color: #2563eb;">Verify your account</h2>
                        <p style="color: #666;">Enter this code to complete your registration:</p>
                        <h1 style="background: #f8fafc; padding: 20px; text-align: center; letter-spacing: 5px; color: #1e293b; border-radius: 8px;">${code}</h1>
                       </div>`
            });

            if (error) {
                console.error('❌ Resend Error Details:', error);
                // Continue to try other methods if Resend fails
            } else {
                console.log('✅ Resend success:', data);
                return;
            }
        }

        // 2. Try Postmark (if connected via Netlify Emails)
        if (postmarkToken) {
            console.log('📬 Using Postmark SMTP...');
            const transporter = nodemailer.createTransport({
                host: 'smtp.postmarkapp.com',
                port: 587,
                auth: { user: postmarkToken, pass: postmarkToken }
            });
            await transporter.sendMail({
                from: fromEmail,
                to: email,
                subject: "Account Verification Code",
                text: `Your code is ${code}`,
                html: `<strong>${code}</strong>`
            });
            console.log('✅ Postmark success');
            return;
        }

        // 3. Fallback to Standard SMTP (Gmail, SendGrid, etc.)
        let transporter;
        if (smtpUser && smtpPass) {
            console.log('📡 Using SMTP...');
            transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST || 'smtp.gmail.com',
                port: process.env.EMAIL_PORT || 587,
                auth: { user: smtpUser, pass: smtpPass },
            });
        } else {
            console.log('🧪 Using Ethereal Dev Fallback...');
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                auth: { user: testAccount.user, pass: testAccount.pass },
            });
        }

        const info = await transporter.sendMail({
            from: `"Stock Intelligence" <${fromEmail}>`,
            to: email,
            subject: "Verification Code",
            html: `Your code: <b>${code}</b>`
        });

        if (!smtpUser) console.log(`🌐 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        console.log('✅ Method completion');

    } catch (err) {
        console.error('🔥 FINAL Mailer failure:', err.message);
    }
}

module.exports = { sendVerificationCode };
