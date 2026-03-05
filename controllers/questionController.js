const Question = require('../models/questionModel');
const Exam = require('../models/examModel');
const ExamSubmission = require('../models/examSubmissionModel');

/**
 * @desc    Create online questions for an exam (bulk creation)
 * @route   POST /api/exams/:examId/questions
 * @access  Private (University/Admin)
 */
const createOnlineQuestions = async (req, res) => {
    try {
        const { examId } = req.params;
        const { questions } = req.body;

        // Validate request body
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ 
                message: 'Questions array is required and must not be empty' 
            });
        }

        // Verify exam exists
        const exam = await Exam.findById(examId);
        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        // Check authorization - user must be the exam creator or admin
        if (exam.university?.toString() !== req.user._id.toString() && 
            req.user.role?.toLowerCase() !== 'admin') {
            return res.status(403).json({ 
                message: 'Not authorized to add questions to this exam' 
            });
        }

        // Validate exam type supports online questions
        if (exam.examType === 'pdf-based') {
            return res.status(400).json({ 
                message: 'Cannot add online questions to PDF-based exam' 
            });
        }

        // Get existing questions to check for order conflicts
        const existingQuestions = await Question.find({ exam: examId });
        const existingOrders = new Set(existingQuestions.map(q => q.order));

        // Validate each question
        const validationErrors = [];
        const orderSet = new Set();

        questions.forEach((q, index) => {
            const errors = [];

            // Validate required fields
            if (!q.questionText || q.questionText.trim() === '') {
                errors.push('questionText is required');
            }
            if (!q.questionType || !['mcq', 'descriptive'].includes(q.questionType)) {
                errors.push('questionType must be either "mcq" or "descriptive"');
            }
            if (q.marks === undefined || q.marks === null || q.marks <= 0) {
                errors.push('marks must be a positive number');
            }
            if (q.order === undefined || q.order === null) {
                errors.push('order is required');
            }

            // Validate MCQ-specific fields
            if (q.questionType === 'mcq') {
                if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
                    errors.push('MCQ questions must have at least 2 options');
                }
                if (q.options) {
                    const correctOptions = q.options.filter(opt => opt.isCorrect);
                    if (correctOptions.length !== 1) {
                        errors.push('MCQ questions must have exactly one correct option');
                    }
                }
            }

            // Validate negative marks
            if (q.negativeMarks !== undefined && q.negativeMarks !== null) {
                if (q.negativeMarks < 0) {
                    errors.push('negativeMarks must be non-negative');
                }
                if (q.negativeMarks >= q.marks) {
                    errors.push('negativeMarks must be less than marks');
                }
            }

            // Check for duplicate orders within the batch
            if (orderSet.has(q.order)) {
                errors.push(`duplicate order ${q.order} within the batch`);
            }
            orderSet.add(q.order);

            // Check for order conflicts with existing questions
            if (existingOrders.has(q.order)) {
                errors.push(`order ${q.order} already exists in the exam`);
            }

            if (errors.length > 0) {
                validationErrors.push({
                    questionIndex: index,
                    errors: errors
                });
            }
        });

        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                message: 'Validation failed for one or more questions',
                errors: validationErrors
            });
        }

        // Create questions
        const questionsToCreate = questions.map(q => ({
            exam: examId,
            questionType: q.questionType,
            questionText: q.questionText,
            questionImage: q.questionImage || undefined,
            options: q.questionType === 'mcq' ? q.options : undefined,
            marks: q.marks,
            negativeMarks: q.negativeMarks || 0,
            order: q.order,
            difficulty: q.difficulty || undefined,
            tags: q.tags || []
        }));

        const createdQuestions = await Question.insertMany(questionsToCreate);

        // Update exam's totalMarks if needed
        const allQuestions = await Question.find({ exam: examId });
        const totalMarks = allQuestions.reduce((sum, q) => sum + q.marks, 0);
        exam.totalMarks = totalMarks;
        await exam.save();

        res.status(201).json({
            message: `Successfully created ${createdQuestions.length} question(s)`,
            questions: createdQuestions,
            totalMarks: totalMarks
        });

    } catch (error) {
        console.error('[Create Online Questions Error]:', error);
        
        // Handle duplicate key error for order uniqueness
        if (error.code === 11000 && error.keyPattern?.order) {
            return res.status(400).json({ 
                message: 'Question order must be unique within the exam',
                error: error.message
            });
        }

        res.status(500).json({ 
            message: 'Failed to create questions',
            error: error.message 
        });
    }
};

/**
 * @desc    Update a question
 * @route   PUT /api/questions/:questionId
 * @access  Private (University/Admin)
 */
const updateQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        const updates = req.body;

        // Find the question
        const question = await Question.findById(questionId).populate('exam');
        if (!question) {
            return res.status(404).json({ message: 'Question not found' });
        }

        // Check authorization
        if (question.exam.university?.toString() !== req.user._id.toString() && 
            req.user.role?.toLowerCase() !== 'admin') {
            return res.status(403).json({ 
                message: 'Not authorized to update this question' 
            });
        }

        // Validate updates
        if (updates.questionText !== undefined && updates.questionText.trim() === '') {
            return res.status(400).json({ message: 'questionText cannot be empty' });
        }

        if (updates.questionType !== undefined && 
            !['mcq', 'descriptive'].includes(updates.questionType)) {
            return res.status(400).json({ 
                message: 'questionType must be either "mcq" or "descriptive"' 
            });
        }

        if (updates.marks !== undefined && updates.marks <= 0) {
            return res.status(400).json({ message: 'marks must be a positive number' });
        }

        if (updates.negativeMarks !== undefined) {
            if (updates.negativeMarks < 0) {
                return res.status(400).json({ message: 'negativeMarks must be non-negative' });
            }
            const marks = updates.marks !== undefined ? updates.marks : question.marks;
            if (updates.negativeMarks >= marks) {
                return res.status(400).json({ 
                    message: 'negativeMarks must be less than marks' 
                });
            }
        }

        // Validate MCQ-specific updates
        const newType = updates.questionType || question.questionType;
        if (newType === 'mcq' && updates.options !== undefined) {
            if (!Array.isArray(updates.options) || updates.options.length < 2) {
                return res.status(400).json({ 
                    message: 'MCQ questions must have at least 2 options' 
                });
            }
            const correctOptions = updates.options.filter(opt => opt.isCorrect);
            if (correctOptions.length !== 1) {
                return res.status(400).json({ 
                    message: 'MCQ questions must have exactly one correct option' 
                });
            }
        }

        // Check for order conflicts if order is being updated
        if (updates.order !== undefined && updates.order !== question.order) {
            const existingQuestion = await Question.findOne({
                exam: question.exam._id,
                order: updates.order,
                _id: { $ne: questionId }
            });
            if (existingQuestion) {
                return res.status(400).json({ 
                    message: `Order ${updates.order} is already used by another question` 
                });
            }
        }

        // Apply updates
        Object.keys(updates).forEach(key => {
            if (key !== 'exam') { // Don't allow changing the exam
                question[key] = updates[key];
            }
        });

        const updatedQuestion = await question.save();

        // Update exam's totalMarks if marks changed
        if (updates.marks !== undefined) {
            const allQuestions = await Question.find({ exam: question.exam._id });
            const totalMarks = allQuestions.reduce((sum, q) => sum + q.marks, 0);
            await Exam.findByIdAndUpdate(question.exam._id, { totalMarks });
        }

        res.json({
            message: 'Question updated successfully',
            question: updatedQuestion
        });

    } catch (error) {
        console.error('[Update Question Error]:', error);
        
        // Handle duplicate key error for order uniqueness
        if (error.code === 11000 && error.keyPattern?.order) {
            return res.status(400).json({ 
                message: 'Question order must be unique within the exam',
                error: error.message
            });
        }

        res.status(500).json({ 
            message: 'Failed to update question',
            error: error.message 
        });
    }
};

/**
 * @desc    Delete a question
 * @route   DELETE /api/questions/:questionId
 * @access  Private (University/Admin)
 */
const deleteQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;

        // Find the question
        const question = await Question.findById(questionId).populate('exam');
        if (!question) {
            return res.status(404).json({ message: 'Question not found' });
        }

        // Check authorization
        if (question.exam.university?.toString() !== req.user._id.toString() && 
            req.user.role?.toLowerCase() !== 'admin') {
            return res.status(403).json({ 
                message: 'Not authorized to delete this question' 
            });
        }

        // Check if question is referenced by any submissions
        const submissionWithQuestion = await ExamSubmission.findOne({
            exam: question.exam._id,
            'answers.questionId': questionId
        });

        if (submissionWithQuestion) {
            return res.status(400).json({ 
                message: 'Cannot delete question that is referenced by existing submissions',
                submissionCount: await ExamSubmission.countDocuments({
                    exam: question.exam._id,
                    'answers.questionId': questionId
                })
            });
        }

        // Delete the question
        await question.deleteOne();

        // Update exam's totalMarks
        const remainingQuestions = await Question.find({ exam: question.exam._id });
        const totalMarks = remainingQuestions.reduce((sum, q) => sum + q.marks, 0);
        await Exam.findByIdAndUpdate(question.exam._id, { totalMarks });

        res.json({
            message: 'Question deleted successfully',
            deletedQuestionId: questionId,
            newTotalMarks: totalMarks
        });

    } catch (error) {
        console.error('[Delete Question Error]:', error);
        res.status(500).json({ 
            message: 'Failed to delete question',
            error: error.message 
        });
    }
};

/**
 * @desc    Get all questions for an exam
 * @route   GET /api/exams/:examId/questions
 * @access  Private
 */
const getExamQuestions = async (req, res) => {
    try {
        const { examId } = req.params;

        // Verify exam exists
        const exam = await Exam.findById(examId);
        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        // Get questions sorted by order
        const questions = await Question.find({ exam: examId }).sort({ order: 1 });

        res.json({
            examId: examId,
            totalQuestions: questions.length,
            totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
            questions: questions
        });

    } catch (error) {
        console.error('[Get Exam Questions Error]:', error);
        res.status(500).json({ 
            message: 'Failed to fetch questions',
            error: error.message 
        });
    }
};

module.exports = {
    createOnlineQuestions,
    updateQuestion,
    deleteQuestion,
    getExamQuestions
};
