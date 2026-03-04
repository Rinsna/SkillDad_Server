const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const Course = require('./models/courseModel');

const addReactDemoContent = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Find the React course
        const reactCourse = await Course.findOne({ 
            title: { $regex: /react/i } 
        });

        if (!reactCourse) {
            console.error('React course not found. Please run seeder first.');
            process.exit(1);
        }

        console.log('Found React course:', reactCourse.title);

        // Add more videos to Module 1: React Fundamentals
        if (reactCourse.modules[0]) {
            const module1 = reactCourse.modules[0];
            console.log(`Adding videos to ${module1.title}...`);
            
            module1.videos.push(
                {
                    title: 'Props Deep Dive',
                    url: 'https://www.youtube.com/embed/m7OWXtbiXX8',
                    duration: '16:45',
                    exercises: [
                        {
                            question: 'How do you pass props to a child component?',
                            options: [
                                'Using attributes in JSX',
                                'Using global variables',
                                'Using localStorage',
                                'Using cookies'
                            ],
                            correctAnswer: 'Using attributes in JSX',
                            type: 'mcq'
                        }
                    ]
                },
                {
                    title: 'React Events and Event Handling',
                    url: 'https://www.youtube.com/embed/0XSDAup85SA',
                    duration: '14:20',
                    exercises: [
                        {
                            question: 'What is the correct way to handle a click event in React?',
                            options: [
                                'onClick={handleClick}',
                                'onclick="handleClick()"',
                                'onClick="handleClick"',
                                'click={handleClick}'
                            ],
                            correctAnswer: 'onClick={handleClick}',
                            type: 'mcq'
                        }
                    ]
                },
                {
                    title: 'Conditional Rendering in React',
                    url: 'https://www.youtube.com/embed/4ORZ1GmjaMc',
                    duration: '12:30',
                    exercises: []
                }
            );
        }

        // Add more videos to Module 2: State and Props
        if (reactCourse.modules[1]) {
            const module2 = reactCourse.modules[1];
            console.log(`Adding videos to ${module2.title}...`);
            
            module2.videos.push(
                {
                    title: 'Props vs State',
                    url: 'https://www.youtube.com/embed/IYvD9oBCuJI',
                    duration: '11:15',
                    exercises: [
                        {
                            question: 'What is the main difference between props and state?',
                            options: [
                                'Props are immutable, state is mutable',
                                'Props are mutable, state is immutable',
                                'Both are immutable',
                                'Both are mutable'
                            ],
                            correctAnswer: 'Props are immutable, state is mutable',
                            type: 'mcq'
                        }
                    ]
                },
                {
                    title: 'useState Hook Explained',
                    url: 'https://www.youtube.com/embed/O6P86uwfdR0',
                    duration: '19:40',
                    exercises: []
                },
                {
                    title: 'Lifting State Up',
                    url: 'https://www.youtube.com/embed/szTmZHZvUkI',
                    duration: '15:25',
                    exercises: []
                }
            );
        }

        // Add a new module: React Hooks
        reactCourse.modules.push({
            title: 'React Hooks',
            videos: [
                {
                    title: 'Introduction to React Hooks',
                    url: 'https://www.youtube.com/embed/cF2lQ_gZeA8',
                    duration: '13:50',
                    exercises: [
                        {
                            question: 'Which hook is used for side effects in React?',
                            options: ['useEffect', 'useState', 'useContext', 'useReducer'],
                            correctAnswer: 'useEffect',
                            type: 'mcq'
                        }
                    ]
                },
                {
                    title: 'useEffect Hook Deep Dive',
                    url: 'https://www.youtube.com/embed/0ZJgIjIuY7U',
                    duration: '22:15',
                    exercises: []
                },
                {
                    title: 'useContext Hook',
                    url: 'https://www.youtube.com/embed/5LrDIWkK_Bc',
                    duration: '17:30',
                    exercises: []
                },
                {
                    title: 'useReducer Hook',
                    url: 'https://www.youtube.com/embed/kK_Wqx3RnHk',
                    duration: '20:45',
                    exercises: []
                }
            ]
        });

        // Add a new module: Advanced React Patterns
        reactCourse.modules.push({
            title: 'Advanced React Patterns',
            videos: [
                {
                    title: 'Custom Hooks',
                    url: 'https://www.youtube.com/embed/6ThXsUwLWvc',
                    duration: '18:20',
                    exercises: []
                },
                {
                    title: 'React Context API',
                    url: 'https://www.youtube.com/embed/35lXWvCuM8o',
                    duration: '25:10',
                    exercises: []
                },
                {
                    title: 'React Performance Optimization',
                    url: 'https://www.youtube.com/embed/uojLJFt9SzY',
                    duration: '21:35',
                    exercises: []
                }
            ]
        });

        await reactCourse.save();
        console.log('✅ Successfully added demo content to React course!');
        console.log(`Total modules: ${reactCourse.modules.length}`);
        reactCourse.modules.forEach((module, index) => {
            console.log(`  Module ${index + 1}: ${module.title} (${module.videos.length} videos)`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

addReactDemoContent();
