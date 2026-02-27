/**
 * Email Templates Utility
 * Consistent, premium styling for all SkillDad notifications
 */

const baseStyle = {
    container: 'font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px 20px; color: #1F2937; background-color: #F9FAFB; line-height: 1.6;',
    card: 'max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);',
    header: 'padding: 32px 40px; background: linear-gradient(135deg, #7C3AED 0%, #C026D3 100%); text-align: center; color: #FFFFFF;',
    body: 'padding: 40px;',
    footer: 'padding: 32px; background-color: #F3F4F6; text-align: center; font-size: 13px; color: #6B7280;',
    button: 'display: inline-block; padding: 14px 32px; background-color: #7C3AED; color: #FFFFFF; text-decoration: none; border-radius: 10px; font-weight: 700; margin-top: 24px; box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3); transition: all 0.3s ease;',
    h1: 'margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;',
    h2: 'margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #111827;',
    p: 'margin: 0 0 16px 0; font-size: 16px; color: #4B5563;',
    highlight: 'background-color: #F5F3FF; border: 1px solid #DDD6FE; padding: 24px; border-radius: 12px; margin: 24px 0;',
    label: 'display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #7C3AED; margin-bottom: 4px;',
    value: 'font-family: "JetBrains Mono", monospace; font-size: 16px; font-weight: 600; color: #111827;'
};

const layout = (title, content, button = null) => `
    <div style="${baseStyle.container}">
        <div style="${baseStyle.card}">
            <div style="${baseStyle.header}">
                <h1 style="${baseStyle.h1}">SkillDad</h1>
                <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9; font-weight: 500;">Transforming Your Skills</p>
            </div>
            <div style="${baseStyle.body}">
                <h2 style="${baseStyle.h2}">${title}</h2>
                ${content}
                ${button ? `
                    <div style="text-align: center; margin-top: 8px;">
                        <a href="${button.url}" style="${baseStyle.button}">${button.text}</a>
                    </div>
                ` : ''}
            </div>
            <div style="${baseStyle.footer}">
                <p style="margin: 0 0 12px 0;">&copy; ${new Date().getFullYear()} SkillDad. All rights reserved.</p>
                <div style="margin-bottom: 12px;">
                    <a href="#" style="color: #7C3AED; text-decoration: none; margin: 0 10px;">Privacy Policy</a>
                    <a href="#" style="color: #7C3AED; text-decoration: none; margin: 0 10px;">Terms of Service</a>
                </div>
                <p style="margin: 0;">If you have any questions, contact us at support@skilldad.com</p>
            </div>
        </div>
    </div>
`;

const getClientUrl = (path = '') => {
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    // Ensure base doesn't have trailing slash and path has leading slash
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
};

const templates = {
    welcome: (name, role) => {
        const content = `
            <p style="${baseStyle.p}">Hello <strong>${name}</strong>,</p>
            <p style="${baseStyle.p}">Welcome to the network. Your account as a <strong>${role}</strong> is now initialized and ready for deployment.</p>
            <p style="${baseStyle.p}">Explore our curriculum matrix and start expanding your neural horizons today.</p>
        `;
        return layout('Integration Successful', content, {
            text: 'Launch Dashboard',
            url: getClientUrl('/login')
        });
    },

    invitation: (name, role, email, password) => {
        const content = `
            <p style="${baseStyle.p}">Hello <strong>${name}</strong>,</p>
            <p style="${baseStyle.p}">You have been invited to join the SkillDad platform as a <strong>${role}</strong>.</p>
            <div style="${baseStyle.highlight}">
                <span style="${baseStyle.label}">Access Credentials</span>
                <p style="margin: 0 0 8px 0;"><strong style="font-size: 14px;">Email:</strong> <span style="${baseStyle.value}">${email}</span></p>
                <p style="margin: 0;"><strong style="font-size: 14px;">Temp Password:</strong> <span style="${baseStyle.value}">${password}</span></p>
            </div>
            <p style="${baseStyle.p}">Please secure your account by changing your passphrase upon initial login.</p>
        `;
        return layout('System Access Granted', content, {
            text: 'Authenticate Now',
            url: getClientUrl('/login')
        });
    },

    passwordReset: (name, url) => {
        const content = `
            <p style="${baseStyle.p}">Hello <strong>${name}</strong>,</p>
            <p style="${baseStyle.p}">A neural sync reset was requested for your account. If this wasn't you, please disregard this message.</p>
            <p style="${baseStyle.p}">This link is valid for 10 cycles (10 minutes).</p>
        `;
        return layout('Security Protocol: Password Reset', content, {
            text: 'Reset Passphrase',
            url: url // URL passed from controller which already has host
        });
    },

    supportResponse: (name, subject, response, status) => {
        const content = `
            <p style="${baseStyle.p}">Hello <strong>${name}</strong>,</p>
            <p style="${baseStyle.p}">An administrator has processed your inquiry regarding: <strong>${subject}</strong></p>
            <div style="${baseStyle.highlight}">
                <span style="${baseStyle.label}">Administrator Response</span>
                <p style="margin: 0; font-style: italic; color: #111827;">"${response}"</p>
            </div>
            <p style="${baseStyle.p}"><strong>Current Status:</strong> <span style="font-weight: 700; color: #7C3AED;">${status}</span></p>
        `;
        return layout('Support Update', content);
    },

    liveAlert: (name, topic, startTime) => {
        const content = `
            <p style="${baseStyle.p}">Hello <strong>${name}</strong>,</p>
            <p style="${baseStyle.p}">A live session you are enrolled in is about to go online.</p>
            <div style="${baseStyle.highlight}">
                <p style="margin: 0 0 4px 0;"><strong style="color: #7C3AED;">Topic:</strong> ${topic}</p>
                <p style="margin: 0;"><strong style="color: #7C3AED;">Scheduled Time:</strong> ${new Date(startTime).toLocaleString()}</p>
            </div>
            <p style="${baseStyle.p}">Establish connection to the live room from your dashboard.</p>
        `;
        return layout('Live Session Alert', content, {
            text: 'Establish Connection',
            url: getClientUrl('/dashboard/live-classes')
        });
    },

    sessionUpdate: (name, topic, startTime, changes) => {
        let updates = 'The following parameters have been recalibrated:';
        if (changes.topicChanged) updates += `<br/>• Topic: ${topic}`;
        if (changes.timeChanged) updates += `<br/>• New Time: ${new Date(startTime).toLocaleString()}`;
        if (changes.linkChanged) updates += `<br/>• Access link has been updated.`;

        const content = `
            <p style="${baseStyle.p}">Hello <strong>${name}</strong>,</p>
            <p style="${baseStyle.p}">Crucial updates have been made to your scheduled live session.</p>
            <div style="${baseStyle.highlight}">
                <p style="margin: 0;">${updates}</p>
            </div>
        `;
        return layout('Session Recalibration', content, {
            text: 'Review Schedule',
            url: getClientUrl('/dashboard/live-classes')
        });
    },

    examScheduled: (universityName, examTitle, courseTitle, scheduledDate) => {
        const content = `
            <p style="${baseStyle.p}">Hello <strong>${universityName}</strong>,</p>
            <p style="${baseStyle.p}">This is to notify you that an administrator has scheduled a new exam for one of your courses.</p>
            <div style="${baseStyle.highlight}">
                <p style="margin: 0 0 4px 0;"><strong style="color: #7C3AED;">Exam:</strong> ${examTitle}</p>
                <p style="margin: 0 0 4px 0;"><strong style="color: #7C3AED;">Course:</strong> ${courseTitle}</p>
                <p style="margin: 0;"><strong style="color: #7C3AED;">Scheduled Time:</strong> ${new Date(scheduledDate).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}</p>
            </div>
            <p style="${baseStyle.p}">Please review the exam details in your management console.</p>
        `;
        return layout('New Exam Scheduled', content, {
            text: 'Manage Exams',
            url: getClientUrl('/university/exams')
        });
    },

    liveSessionScheduled: (name, topic, startTime, description) => {
        const content = `
            <p style="${baseStyle.p}">Hello <strong>${name}</strong>,</p>
            <p style="${baseStyle.p}">A new live session has been scheduled for your study track.</p>
            <div style="${baseStyle.highlight}">
                <p style="margin: 0 0 4px 0;"><strong style="color: #7C3AED;">Topic:</strong> ${topic}</p>
                <p style="margin: 0 0 8px 0;"><strong style="color: #7C3AED;">Time:</strong> ${new Date(startTime).toLocaleString()}</p>
                ${description ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #6B7280; border-top: 1px solid #E5E7EB; padding-top: 8px;">${description}</p>` : ''}
            </div>
            <p style="${baseStyle.p}">Mark your calendar and ensure you're ready to join at the scheduled time.</p>
        `;
        return layout('New Live Session Scheduled', content, {
            text: 'View Session Details',
            url: getClientUrl('/dashboard/live-classes')
        });
    },

    examScheduledStudent: (name, examTitle, courseTitle, scheduledDate) => {
        const content = `
            <p style="${baseStyle.p}">Hello <strong>${name}</strong>,</p>
            <p style="${baseStyle.p}">A new exam has been scheduled for your course: <strong>${courseTitle}</strong>.</p>
            <div style="${baseStyle.highlight}">
                <p style="margin: 0 0 4px 0;"><strong style="color: #7C3AED;">Exam:</strong> ${examTitle}</p>
                <p style="margin: 0;"><strong style="color: #7C3AED;">Scheduled Time:</strong> ${new Date(scheduledDate).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}</p>
            </div>
            <p style="${baseStyle.p}">Make sure to prepare and be online at the scheduled time.</p>
        `;
        return layout('New Exam Scheduled', content, {
            text: 'View My Exams',
            url: getClientUrl('/dashboard/exams')
        });
    },

    examResultAnnounced: (name, examTitle, score, percentage, passed) => {
        const statusColor = passed ? '#059669' : '#DC2626';
        const content = `
            <p style="${baseStyle.p}">Hello <strong>${name}</strong>,</p>
            <p style="${baseStyle.p}">Your results for the exam <strong>${examTitle}</strong> are now available.</p>
            <div style="${baseStyle.highlight}">
                <p style="margin: 0 0 4px 0;"><strong style="color: #7C3AED;">Score:</strong> ${score}</p>
                <p style="margin: 0 0 8px 0;"><strong style="color: #7C3AED;">Percentage:</strong> ${percentage.toFixed(2)}%</p>
                <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 800; color: ${statusColor}; border-top: 1px solid #E5E7EB; padding-top: 8px;">
                    STATUS: ${passed ? 'PASSED' : 'RECALIBRATION REQUIRED'}
                </p>
            </div>
            <p style="${baseStyle.p}">You can view the detailed breakdown and feedback on your dashboard.</p>
        `;
        return layout('Exam Results Available', content, {
            text: 'View Result Breakdown',
            url: getClientUrl('/dashboard/exams')
        });
    },

    courseCompletion: (name, courseTitle, certUrl) => {
        const content = `
            <p style="${baseStyle.p}">Congratulations <strong>${name}</strong>!</p>
            <p style="${baseStyle.p}">You have officially completed the course: <strong>${courseTitle}</strong>.</p>
            <div style="${baseStyle.highlight}">
                <p style="margin: 0; text-align: center;">
                    <span style="font-size: 24px;">🏆</span><br/>
                    <strong>Your expertise has been validated.</strong>
                </p>
            </div>
            <p style="${baseStyle.p}">Your official certificate of completion is attached to this email and is also available for download in your student portal.</p>
        `;
        return layout('Course Completion Confirmed!', content, {
            text: 'Download Certificate',
            url: getClientUrl(certUrl)
        });
    }
};

module.exports = templates;
