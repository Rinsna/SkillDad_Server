const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from server directory
dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/userModel');
const Course = require('./models/courseModel');
const InteractiveContent = require('./models/interactiveContentModel');

const createDemoCourse = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Find Sara Wilson
        const saraWilson = await User.findOne({ email: 'sara.wilson@university.edu' });
        if (!saraWilson) {
            console.error('Sara Wilson not found. Please create the user first.');
            process.exit(1);
        }
        console.log('Found Sara Wilson:', saraWilson.email);

        // Create the demo course
        const demoCourse = new Course({
            title: 'Complete Web Development Bootcamp 2024',
            description: 'Master modern web development from scratch. Learn HTML, CSS, JavaScript, React, Node.js, MongoDB, and build real-world projects. Perfect for beginners and intermediate developers.',
            instructor: saraWilson._id,
            price: 4999,
            category: 'Web Development',
            level: 'Beginner',
            thumbnail: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800',
            modules: []
        });

        console.log('Creating course...');
        await demoCourse.save();
        console.log('Course created:', demoCourse.title);

        // Module 1: HTML & CSS Fundamentals
        const module1 = {
            title: 'HTML & CSS Fundamentals',
            description: 'Learn the building blocks of web development',
            videos: [
                {
                    title: 'Introduction to HTML',
                    url: 'https://www.youtube.com/embed/qz0aGYrrlhU',
                    duration: '15:30'
                },
                {
                    title: 'HTML Elements and Structure',
                    url: 'https://www.youtube.com/embed/salY_Sm6mv4',
                    duration: '22:45'
                },
                {
                    title: 'CSS Basics and Styling',
                    url: 'https://www.youtube.com/embed/1PnVor36_40',
                    duration: '18:20'
                },
                {
                    title: 'CSS Flexbox Layout',
                    url: 'https://www.youtube.com/embed/JJSoEo8JSnc',
                    duration: '25:15'
                }
            ]
        };

        demoCourse.modules.push(module1);
        await demoCourse.save();
        console.log('Module 1 created');

        // Create interactive content for Module 1
        const module1Id = demoCourse.modules[0]._id;

        const htmlQuiz = new InteractiveContent({
            course: demoCourse._id,
            module: module1Id,
            title: 'HTML Fundamentals Quiz',
            description: 'Test your knowledge of HTML basics',
            contentType: 'quiz',
            timeLimit: 15,
            attemptLimit: 3,
            passingScore: 70,
            showSolutionAfter: 'submission',
            questions: [
                {
                    questionType: 'multiple-choice',
                    questionText: 'What does HTML stand for?',
                    points: 10,
                    options: [
                        'Hyper Text Markup Language',
                        'High Tech Modern Language',
                        'Home Tool Markup Language',
                        'Hyperlinks and Text Markup Language'
                    ],
                    correctAnswer: 'Hyper Text Markup Language',
                    explanation: 'HTML stands for Hyper Text Markup Language, which is the standard markup language for creating web pages.'
                },
                {
                    questionType: 'multiple-choice',
                    questionText: 'Which HTML tag is used for the largest heading?',
                    points: 10,
                    options: ['<h1>', '<h6>', '<heading>', '<head>'],
                    correctAnswer: '<h1>',
                    explanation: '<h1> is used for the largest heading, while <h6> is the smallest.'
                },
                {
                    questionType: 'true-false',
                    questionText: 'HTML tags are case-sensitive.',
                    points: 10,
                    correctAnswer: 'false',
                    explanation: 'HTML tags are not case-sensitive, but it\'s best practice to use lowercase.'
                }
            ]
        });
        await htmlQuiz.save();
        console.log('HTML Quiz created');

        const cssExercise = new InteractiveContent({
            course: demoCourse._id,
            module: module1Id,
            title: 'CSS Styling Exercise',
            description: 'Practice CSS selectors and properties',
            contentType: 'exercise',
            timeLimit: 0,
            attemptLimit: -1,
            showSolutionAfter: 'immediate',
            questions: [
                {
                    questionType: 'short-answer',
                    questionText: 'What CSS property is used to change the text color?',
                    points: 10,
                    acceptedAnswers: ['color'],
                    explanation: 'The "color" property is used to set the text color in CSS.'
                },
                {
                    questionType: 'short-answer',
                    questionText: 'What CSS property is used to change the background color?',
                    points: 10,
                    acceptedAnswers: ['background-color', 'background'],
                    explanation: 'The "background-color" or "background" property sets the background color.'
                }
            ]
        });
        await cssExercise.save();
        console.log('CSS Exercise created');

        // Module 2: JavaScript Essentials
        const module2 = {
            title: 'JavaScript Essentials',
            description: 'Master JavaScript programming fundamentals',
            videos: [
                {
                    title: 'JavaScript Introduction',
                    url: 'https://www.youtube.com/embed/W6NZfCO5SIk',
                    duration: '20:00'
                },
                {
                    title: 'Variables and Data Types',
                    url: 'https://www.youtube.com/embed/edlFjlzxkSI',
                    duration: '18:30'
                },
                {
                    title: 'Functions and Scope',
                    url: 'https://www.youtube.com/embed/N8ap4k_1QEQ',
                    duration: '24:15'
                },
                {
                    title: 'Arrays and Objects',
                    url: 'https://www.youtube.com/embed/W6NZfCO5SIk',
                    duration: '22:40'
                }
            ]
        };

        demoCourse.modules.push(module2);
        await demoCourse.save();
        console.log('Module 2 created');

        const module2Id = demoCourse.modules[1]._id;

        const jsQuiz = new InteractiveContent({
            course: demoCourse._id,
            module: module2Id,
            title: 'JavaScript Basics Quiz',
            description: 'Test your JavaScript fundamentals',
            contentType: 'quiz',
            timeLimit: 20,
            attemptLimit: 3,
            passingScore: 75,
            showSolutionAfter: 'submission',
            questions: [
                {
                    questionType: 'multiple-choice',
                    questionText: 'Which keyword is used to declare a constant in JavaScript?',
                    points: 10,
                    options: ['var', 'let', 'const', 'constant'],
                    correctAnswer: 'const',
                    explanation: 'The "const" keyword is used to declare constants that cannot be reassigned.'
                },
                {
                    questionType: 'multiple-choice',
                    questionText: 'What is the correct way to write a JavaScript array?',
                    points: 10,
                    options: [
                        'var colors = ["red", "green", "blue"]',
                        'var colors = (1:"red", 2:"green", 3:"blue")',
                        'var colors = "red", "green", "blue"',
                        'var colors = 1 = ("red"), 2 = ("green"), 3 = ("blue")'
                    ],
                    correctAnswer: 'var colors = ["red", "green", "blue"]',
                    explanation: 'Arrays in JavaScript are declared using square brackets [].'
                },
                {
                    questionType: 'true-false',
                    questionText: 'JavaScript is the same as Java.',
                    points: 10,
                    correctAnswer: 'false',
                    explanation: 'JavaScript and Java are completely different programming languages.'
                }
            ]
        });
        await jsQuiz.save();
        console.log('JavaScript Quiz created');

        const jsPractice = new InteractiveContent({
            course: demoCourse._id,
            module: module2Id,
            title: 'JavaScript Functions Practice',
            description: 'Practice writing JavaScript functions',
            contentType: 'practice',
            timeLimit: 0,
            attemptLimit: -1,
            showSolutionAfter: 'submission',
            questions: [
                {
                    questionType: 'code-submission',
                    questionText: 'Write a function called "greet" that takes a name parameter and returns "Hello, [name]!"',
                    points: 20,
                    language: 'javascript',
                    explanation: 'Example solution: function greet(name) { return "Hello, " + name + "!"; }'
                },
                {
                    questionType: 'code-submission',
                    questionText: 'Write a function called "sum" that takes two numbers and returns their sum.',
                    points: 20,
                    language: 'javascript',
                    explanation: 'Example solution: function sum(a, b) { return a + b; }'
                }
            ]
        });
        await jsPractice.save();
        console.log('JavaScript Practice created');

        // Module 3: React Fundamentals
        const module3 = {
            title: 'React Fundamentals',
            description: 'Build modern user interfaces with React',
            videos: [
                {
                    title: 'Introduction to React',
                    url: 'https://www.youtube.com/embed/Ke90Tje7VS0',
                    duration: '25:00'
                },
                {
                    title: 'Components and Props',
                    url: 'https://www.youtube.com/embed/Cla1WwguArA',
                    duration: '20:30'
                },
                {
                    title: 'State and Hooks',
                    url: 'https://www.youtube.com/embed/O6P86uwfdR0',
                    duration: '28:15'
                }
            ]
        };

        demoCourse.modules.push(module3);
        await demoCourse.save();
        console.log('Module 3 created');

        const module3Id = demoCourse.modules[2]._id;

        const reactQuiz = new InteractiveContent({
            course: demoCourse._id,
            module: module3Id,
            title: 'React Fundamentals Quiz',
            description: 'Test your React knowledge',
            contentType: 'quiz',
            timeLimit: 25,
            attemptLimit: 3,
            passingScore: 70,
            showSolutionAfter: 'submission',
            questions: [
                {
                    questionType: 'multiple-choice',
                    questionText: 'What is JSX?',
                    points: 10,
                    options: [
                        'A JavaScript extension that allows writing HTML in React',
                        'A CSS framework',
                        'A database query language',
                        'A testing library'
                    ],
                    correctAnswer: 'A JavaScript extension that allows writing HTML in React',
                    explanation: 'JSX is a syntax extension for JavaScript that allows you to write HTML-like code in React.'
                },
                {
                    questionType: 'multiple-choice',
                    questionText: 'Which hook is used to manage state in functional components?',
                    points: 10,
                    options: ['useState', 'useEffect', 'useContext', 'useReducer'],
                    correctAnswer: 'useState',
                    explanation: 'useState is the primary hook for managing state in functional components.'
                },
                {
                    questionType: 'true-false',
                    questionText: 'Props can be modified inside a component.',
                    points: 10,
                    correctAnswer: 'false',
                    explanation: 'Props are read-only and cannot be modified by the component receiving them.'
                }
            ]
        });
        await reactQuiz.save();
        console.log('React Quiz created');

        const reactProject = new InteractiveContent({
            course: demoCourse._id,
            module: module3Id,
            title: 'Build a Todo App Project',
            description: 'Create a fully functional Todo application using React',
            contentType: 'practice',
            timeLimit: 0,
            attemptLimit: -1,
            showSolutionAfter: 'never',
            questions: [
                {
                    questionType: 'essay',
                    questionText: 'Build a Todo App with the following features: Add todos, Mark todos as complete, Delete todos, Filter todos (All/Active/Completed). Submit your GitHub repository link and a brief description of your implementation.',
                    points: 100,
                    wordLimit: 500,
                    rubric: 'Grading criteria: Functionality (40 points), Code quality (30 points), UI/UX (20 points), Documentation (10 points)'
                }
            ]
        });
        await reactProject.save();
        console.log('React Project created');

        // Module 4: Backend Development
        const module4 = {
            title: 'Backend Development with Node.js',
            description: 'Build server-side applications with Node.js and Express',
            videos: [
                {
                    title: 'Introduction to Node.js',
                    url: 'https://www.youtube.com/embed/TlB_eWDSMt4',
                    duration: '22:00'
                },
                {
                    title: 'Express.js Basics',
                    url: 'https://www.youtube.com/embed/L72fhGm1tfE',
                    duration: '26:30'
                },
                {
                    title: 'RESTful API Design',
                    url: 'https://www.youtube.com/embed/0oXYLzuucwE',
                    duration: '30:15'
                }
            ]
        };

        demoCourse.modules.push(module4);
        await demoCourse.save();
        console.log('Module 4 created');

        const module4Id = demoCourse.modules[3]._id;

        const nodeQuiz = new InteractiveContent({
            course: demoCourse._id,
            module: module4Id,
            title: 'Node.js & Express Quiz',
            description: 'Test your backend development knowledge',
            contentType: 'quiz',
            timeLimit: 20,
            attemptLimit: 3,
            passingScore: 75,
            showSolutionAfter: 'submission',
            questions: [
                {
                    questionType: 'multiple-choice',
                    questionText: 'What is Node.js?',
                    points: 10,
                    options: [
                        'A JavaScript runtime built on Chrome\'s V8 engine',
                        'A front-end framework',
                        'A database management system',
                        'A CSS preprocessor'
                    ],
                    correctAnswer: 'A JavaScript runtime built on Chrome\'s V8 engine',
                    explanation: 'Node.js is a JavaScript runtime that allows you to run JavaScript on the server.'
                },
                {
                    questionType: 'multiple-choice',
                    questionText: 'Which HTTP method is used to retrieve data from a server?',
                    points: 10,
                    options: ['GET', 'POST', 'PUT', 'DELETE'],
                    correctAnswer: 'GET',
                    explanation: 'GET is used to retrieve data from a server without modifying it.'
                },
                {
                    questionType: 'short-answer',
                    questionText: 'What npm command is used to install Express.js?',
                    points: 10,
                    acceptedAnswers: ['npm install express', 'npm i express'],
                    explanation: 'Use "npm install express" or "npm i express" to install Express.js.'
                }
            ]
        });
        await nodeQuiz.save();
        console.log('Node.js Quiz created');

        const apiProject = new InteractiveContent({
            course: demoCourse._id,
            module: module4Id,
            title: 'Build a REST API Project',
            description: 'Create a RESTful API for a blog application',
            contentType: 'practice',
            timeLimit: 0,
            attemptLimit: -1,
            showSolutionAfter: 'never',
            questions: [
                {
                    questionType: 'essay',
                    questionText: 'Build a REST API for a blog with the following endpoints: GET /posts (list all posts), GET /posts/:id (get single post), POST /posts (create post), PUT /posts/:id (update post), DELETE /posts/:id (delete post). Include authentication and validation. Submit your GitHub repository link and API documentation.',
                    points: 100,
                    wordLimit: 500,
                    rubric: 'Grading criteria: API functionality (40 points), Authentication (20 points), Validation (20 points), Documentation (20 points)'
                }
            ]
        });
        await apiProject.save();
        console.log('API Project created');

        console.log('\n✅ Demo course created successfully!');
        console.log('Course ID:', demoCourse._id);
        console.log('Course Title:', demoCourse.title);
        console.log('Modules:', demoCourse.modules.length);
        console.log('Interactive Content Items:', 9);
        console.log('\nBreakdown:');
        console.log('- Quizzes: 4');
        console.log('- Exercises: 1');
        console.log('- Practice/Projects: 4');
        console.log('- Videos: 14');

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

createDemoCourse();
