const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // Check if configuration is present
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.warn('Email configuration missing in .env file. Email will not be sent.');
        throw new Error('Email configuration missing. Please set EMAIL_HOST, EMAIL_USER, and EMAIL_PASSWORD in your .env file.');
    }

    try {
        const port = parseInt(process.env.EMAIL_PORT || '587');
        const secure = port === 465; // true for 465, false for 587/other

        // Create a transporter
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port,
            secure,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
            tls: {
                rejectUnauthorized: false // allow self-signed certs in dev
            }
        });

        // Define email options
        const mailOptions = {
            from: `SkillDad <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: options.email,
            subject: options.subject,
            text: options.message,
            html: options.html,
            attachments: options.attachments || [],
        };

        // Send the email
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending email:', error.message);
        throw new Error(`Email could not be sent: ${error.message}`);
    }
};

module.exports = sendEmail;
