const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/userModel');
const Course = require('./models/courseModel');

dotenv.config({ path: './server/.env' });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const courses = [
    {
        title: 'Mastering Generative AI & LLMs',
        description: 'Deep dive into the architecture of Transformers, GPT-4, and how to build production-ready AI agents using LangChain and Vector Databases.',
        thumbnail: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200',
        category: 'AI & Machine Learning',
        price: 349,
        instructorName: 'Dr. Evelyn Richards',
        universityName: 'Global AI Institute',
        isPublished: true,
        modules: [
            {
                title: 'Introduction to Transformers',
                videos: [
                    {
                        title: 'How GPT Works',
                        url: 'https://www.youtube.com/embed/aircAruvnKk',
                        duration: '18:45',
                        exercises: [{ question: 'What is the "Self-Attention" mechanism?', correctAnswer: 'A way for models to weigh the importance of different words in a sequence', type: 'mcq' }]
                    }
                ]
            }
        ]
    },
    {
        title: 'Cybersecurity Red Team Essentials',
        description: 'Advanced penetration testing, social engineering, and network exploitation techniques used by elite cybersecurity professionals.',
        thumbnail: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200',
        category: 'Cybersecurity',
        price: 299,
        instructorName: 'Marcus Thorne',
        universityName: 'Cyber Alliance',
        isPublished: true,
        modules: [
            {
                title: 'Network Reconnaissance',
                videos: [
                    {
                        title: 'Enumeration Techniques',
                        url: 'https://www.youtube.com/embed/6mCanG1vNo0',
                        duration: '22:10',
                        exercises: [{ question: 'Which tool is primarily used for network scanning?', options: ['Nmap', 'React', 'Excel', 'Word'], correctAnswer: 'Nmap', type: 'mcq' }]
                    }
                ]
            }
        ]
    },
    {
        title: 'UX/UI Strategy: From Research to High Fidelity',
        description: 'Learn the psychology of user experience, interactive prototyping in Figma, and how to build design systems that scale.',
        thumbnail: 'https://images.unsplash.com/photo-1586717791821-3f44a563eb4c?w=1200',
        category: 'Design',
        price: 189,
        instructorName: 'Sarah Jenkins',
        universityName: 'Creative Arts Academy',
        isPublished: true,
        modules: [
            {
                title: 'Design Psychology',
                videos: [
                    {
                        title: 'Hick\'s Law in Modern UI',
                        url: 'https://www.youtube.com/embed/8yWvE4U_p_k',
                        duration: '12:30',
                        exercises: [{ question: 'What does Hick\'s Law state?', correctAnswer: 'The time it takes to make a decision increases with the number and complexity of choices', type: 'mcq' }]
                    }
                ]
            }
        ]
    },
    {
        title: 'Cloud Architecture with AWS & Azure',
        description: 'Design highly available, fault-tolerant systems in the cloud. Master serverless, kubernetes, and multi-region deployments.',
        thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200',
        category: 'Cloud Computing',
        price: 399,
        instructorName: 'David Chen',
        universityName: 'Cloud Academy',
        isPublished: true,
        modules: [
            {
                title: 'Serverless Fundamentals',
                videos: [
                    {
                        title: 'AWS Lambda Deep Dive',
                        url: 'https://www.youtube.com/embed/eOBq__h4OJ4',
                        duration: '15:55',
                        exercises: [{ question: 'What is a benefit of Serverless?', correctAnswer: 'No server management and automatic scaling', type: 'mcq' }]
                    }
                ]
            }
        ]
    },
    {
        title: 'Blockchain & Smart Contract Audit',
        description: 'In-depth security analysis of Solidity smart contracts. Learn to identify re-entrancy, overflow, and logic bugs in DeFi protocols.',
        thumbnail: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200',
        category: 'Web3',
        price: 499,
        instructorName: 'Ethereum Security Group',
        universityName: 'Web3 Foundation',
        isPublished: true,
        modules: [
            {
                title: 'Solidity Vulns',
                videos: [
                    {
                        title: 'Re-entrancy Attacks',
                        url: 'https://www.youtube.com/embed/4Mm3BCyHtDY',
                        duration: '20:15',
                        exercises: [{ question: 'How do you prevent re-entrancy?', correctAnswer: 'Using checks-effects-interactions pattern or ReentrancyGuard', type: 'mcq' }]
                    }
                ]
            }
        ]
    }
];

const seedDemoCourses = async () => {
    try {
        await connectDB();

        // Get an existing university user to be the instructor ID if needed
        // but we're mostly using instructorName and universityName overrides
        const instructor = await User.findOne({ role: 'university' }) || await User.findOne({ role: 'admin' });

        const coursesToInsert = courses.map(course => ({
            ...course,
            instructor: instructor ? instructor._id : null
        }));

        await Course.insertMany(coursesToInsert);

        console.log('✅ Demo courses added successfully!');
        process.exit();
    } catch (error) {
        console.error('Error seeding demo courses:', error);
        process.exit(1);
    }
};

seedDemoCourses();
