const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const FAQ = require('../models/faqModel');

dotenv.config({ path: path.join(__dirname, '../.env') });

const faqs = [
    {
        question: "How to create a new SkillDad account",
        answer: "Welcome to SkillDad! Creating an account is quick and simple:\n\n1. Click on the 'Register' button located at the top-right corner of the website.\n2. Enter your Full Name, Email Address, and create a strong Password.\n3. Verify your phone number with the OTP code sent via SMS.\n4. Select your role as 'Student' to access course materials.\n5. Click 'Create Account'.\n\nYou will instantly receive a welcome email with your credentials and a quick-start guide to navigate the platform.",
        category: "Getting Started",
        demo_video_link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Template URL to display UI
        help_link: "/support" // Internal redirect
    },
    {
        question: "How to enroll in courses and learning tracks",
        answer: "To start learning, you need to enroll in a course or learning track:\n\n1. From your Dashboard or the main menu, navigate to the 'Course Catalog'.\n2. Browse through our available programs or use the search bar to find a specific topic.\n3. Click on the course card to view detailed information, curriculum, and instructor details.\n4. Click the 'Enroll Now' button on the course page.\n5. You will be redirected to the secure payment gateway. Complete your transaction using a Card or UPI.\n6. Once payment is successful, the course will instantly appear under 'My Courses' in your Student Dashboard.",
        category: "Course Enrollment",
        demo_video_link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    },
    {
        question: "How to join live classes and Zoom sessions",
        answer: "Live sessions are deeply integrated into the SkillDad platform. You do not need the Zoom app installed.\n\n1. Log into your Student Dashboard.\n2. On the left sidebar, click on 'Live Classes'.\n3. Here you will see all 'Upcoming Sessions' for courses you are enrolled in.\n4. When a session is within 15 minutes of its scheduled start time, the 'Join Session' button will light up and turn purple.\n5. Click 'Join Session'. You will be redirected to our integrated Web Viewer where you can participate without leaving the platform.",
        category: "Live Classes",
        help_link: "/support"
    },
    {
        question: "Payment is failing or declining",
        answer: "If your payment is failing during checkout, try these steps:\n\n1. Double-check your card details (Expiry Date, CVV).\n2. Ensure your card is authorized for online and international transactions.\n3. If using UPI, ensure your UPI app is actively running and you approve the request within the 5-minute window.\n4. Sometimes banks decline transactions due to security flags. Try using a different browser or another payment method.\n\nIf the money was deducted but the course is not showing in your dashboard, please DO NOT pay again. Contact our Support team immediately with your Transaction ID, and we will manually reconcile your account within 2 hours.",
        category: "Payments"
    },
    {
        question: "Where can I find invoice and billing history?",
        answer: "You can download all your transaction receipts directly from your dashboard:\n\n1. Go to your Student Dashboard.\n2. Click on the 'Settings' gear icon on the left sidebar.\n3. Navigate to the 'Billing & Payments' tab.\n4. Here you will see a list of all your past transactions.\n5. Click the 'Download PDF' button next to any transaction to save a professional invoice for your records.",
        category: "Payments"
    },
    {
        question: "I forgot my password / How to reset?",
        answer: "If you cannot log into your account, you can easily restore access:\n\n1. Go to the SkillDad Login page.\n2. Underneath the password field, click the 'Forgot Password?' link.\n3. Enter the email address associated with your account and click 'Send Reset Link'.\n4. Check your inbox (and spam folder) for an email from SkillDad.\n5. Click the secure link contained in the email. You will be redirected to a page where you can set a brand new password.",
        category: "Account & Login"
    },
    {
        question: "How do I change my profile picture or name?",
        answer: "To update your personal details:\n\n1. Log into your Student Dashboard.\n2. Click on 'Settings' in the left sidebar.\n3. Under the 'Profile' tab, you can upload a new avatar image, update your display name, and add a brief bio.\n4. Click 'Save Changes' at the bottom of the page.\n\nNote: For security reasons, you cannot change your primary email address yourself. If you need to migrate your account to a new email address, please submit a Support Ticket.",
        category: "Account & Login"
    },
    {
        question: "Video playback is stuttering or buffering",
        answer: "SkillDad uses an advanced streaming network (Bunny.net) to deliver content globally. If you face buffering:\n\n1. The player automatically adjusts to your internet speed. However, you can manually click the 'Gear' icon on the video player and lower the resolution from 1080p to 720p or 480p.\n2. Clear your browser cache and cookies, then refresh the page.\n3. Ensure you do not have multiple heavy downloads running on your network simultaneously.\n4. If the issue persists across multiple devices, try temporarily disabling any VPN or proxy extensions running in your browser.",
        category: "Technical Issues"
    },
    {
        question: "The website says 'Not Authorized' when I click a course",
        answer: "This error occurs when your session expires or you try to access content you haven't purchased.\n\n1. Try logging out completely, and then log back in. This will refresh your authentication tokens.\n2. Verify that the course appears in your 'My Courses' tab. If the enrollment failed or expired, you won't have access.\n3. If you just purchased the course, sometimes it takes 2-3 minutes for the system to assign permissions. Please wait a moment and refresh.",
        category: "Technical Issues"
    },
    {
        question: "Accessing Zoom recorded sessions after a live class",
        answer: "All our Live Sessions are automatically recorded and processed by our servers.\n\n1. Wait at least 12-24 hours after the live session finishes. The video takes time to render and upload to our secure cloud.\n2. Once ready, log into your Student Dashboard and click on 'My Courses'.\n3. Open the specific course the session belonged to.\n4. Navigate to the 'Live Sessions' or 'Materials' module for that week.\n5. You will see a 'Watch Recording' button next to the completed session.",
        category: "Live Classes"
    },
    {
        question: "How do assignments and project submissions work?",
        answer: "Throughout your course, instructors will assign projects to test your knowledge.\n\n1. Navigate to your course and open the 'Projects' tab.\n2. Click on an active project to view the instructions, deadlines, and requirements.\n3. Once you complete your work (e.g., coding files, PDFs, essays), click 'Submit Project'.\n4. You can upload files directly or provide GitHub/Drive URLs depending on the settings.\n5. Once graded, you will receive an email notification, and you can see your grade and the instructor's feedback in the same 'Projects' tab.",
        category: "Getting Started"
    },
    {
        question: "When will I receive my course certificate?",
        answer: "Certificates are automatically generated once you complete 100% of the course content and pass all mandatory quizzes with a minimum score of 70%.\n\n1. Go to 'My Courses' and select the completed course.\n2. Look for the 'Download Certificate' button at the top of the curriculum list.\n3. Your certificate will be a high-resolution PDF with a unique QR code for verification on LinkedIn or by employers.",
        category: "Certificates & Graduation"
    },
    {
        question: "What is your refund policy?",
        answer: "At SkillDad, we offer a 100% money-back guarantee within the first 7 days of purchase, provided that you have watched less than 25% of the course content. This gives you time to evaluate the course quality without risk.\n\nTo request a refund, go to Settings > Billing and click 'Request Refund' next to your transaction. Refunds are processed within 5-7 business days to your original payment method.",
        category: "Refunds & Cancellations"
    },
    {
        question: "Can I watch courses on my mobile phone?",
        answer: "Yes! The SkillDad platform is fully responsive and optimized for mobile browsers (Chrome, Safari, Firefox). You can watch videos, participate in live classes, and even take quizzes on your smartphone. While we are currently developing a dedicated iOS and Android app, you can already add the SkillDad website to your home screen for an app-like experience (PWA).",
        category: "Mobile & Compatibility"
    }
];

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
        await FAQ.deleteMany();
        await FAQ.insertMany(faqs);
        console.log('Test FAQs seeded successfully');
        process.exit();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

connectDB();
