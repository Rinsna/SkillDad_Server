const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

const sendEmail = async (options) => {
    // Check if SendGrid is configured
    if (process.env.SENDGRID_API_KEY && process.env.EMAIL_SERVICE === 'sendgrid') {
        return await sendEmailWithSendGrid(options);
    }
    
    // Fallback to SMTP (Gmail, etc.)
    return await sendEmailWithSMTP(options);
};

// SendGrid implementation
const sendEmailWithSendGrid = async (options) => {
    try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        const msg = {
            to: options.email,
            from: process.env.EMAIL_FROM || 'noreply@skilldad.com',
            subject: options.subject,
            text: options.message,
            html: options.html,
        };
        
        console.log('[SendGrid] Sending email to:', options.email);
        const response = await sgMail.send(msg);
        console.log('[SendGrid] Email sent successfully:', response[0].statusCode);
        
        return { success: true, messageId: response[0].headers['x-message-id'] };
    } catch (error) {
        console.error('[SendGrid] Error sending email:', error.message);
        if (error.response) {
            console.error('[SendGrid] Error details:', error.response.body);
        }
        throw new Error(`SendGrid email could not be sent: ${error.message}`);
    }
};

// SMTP implementation (Gmail, etc.)
const sendEmailWithSMTP = async (options) => {
    // Check if configuration is present
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.warn('Email configuration missing in .env file. Email will not be sent.');
        throw new Error('Email configuration missing. Please set EMAIL_HOST, EMAIL_USER, and EMAIL_PASSWORD in your .env file.');
    }

    try {
        const port = parseInt(process.env.EMAIL_PORT || '587');
        const secure = port === 465;

        // Configuration for Gmail
        const transporterConfig = {
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
            tls: {
                rejectUnauthorized: false
            },
            // Force IPv4 to avoid IPv6 connectivity issues on some servers
            family: 4
        };

        // If HOST is gmail, simpler to use service:'gmail'
        if (process.env.EMAIL_HOST?.includes('gmail')) {
            transporterConfig.service = 'gmail';
        } else {
            transporterConfig.host = process.env.EMAIL_HOST;
            transporterConfig.port = port;
            transporterConfig.secure = secure;
        }

        const transporter = nodemailer.createTransport(transporterConfig);

        // Verify transporter configuration before sending
        await transporter.verify();
        console.log('[SMTP] Email transporter verified successfully');

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
        console.log('[SMTP] Email sent successfully: %s', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[SMTP] Error sending email:', error.message);
        console.error('[SMTP] Email error details:', {
            code: error.code,
            command: error.command,
            response: error.response,
            responseCode: error.responseCode
        });
        throw new Error(`SMTP email could not be sent: ${error.message}`);
    }
};

module.exports = sendEmail;
