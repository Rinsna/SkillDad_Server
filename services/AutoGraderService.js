/**
 * AutoGrader Service
 * 
 * Automatically evaluates objective questions and provides immediate feedback.
 * Supports multiple-choice, true-false, and short-answer question types.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9
 */

class AutoGraderService {
    /**
     * Grade a multiple-choice question with exact case-sensitive matching
     * 
     * @param {string} answer - Student's answer
     * @param {string|string[]} correctAnswer - Correct answer(s)
     * @param {number} points - Points for the question
     * @param {string} explanation - Optional explanation for incorrect answers
     * @returns {Object} GradeResult with isCorrect, pointsEarned, feedback
     * 
     * Requirement 6.2: Exact case-sensitive matching with correct answer
     */
    gradeMultipleChoice(answer, correctAnswer, points, explanation = '') {
        if (!answer || answer === '') {
            return {
                isCorrect: false,
                pointsEarned: 0,
                feedback: 'No answer provided.'
            };
        }

        let isCorrect = false;

        // Handle both single and multiple correct answers
        if (Array.isArray(correctAnswer)) {
            isCorrect = correctAnswer.includes(answer);
        } else {
            isCorrect = answer === correctAnswer;
        }

        const pointsEarned = isCorrect ? points : 0;
        const feedback = isCorrect 
            ? 'Correct!' 
            : explanation 
                ? `Incorrect. ${explanation}` 
                : 'Incorrect.';

        return {
            isCorrect,
            pointsEarned,
            feedback
        };
    }

    /**
     * Grade a true-false question with boolean comparison
     * 
     * @param {boolean} answer - Student's answer
     * @param {boolean} correctAnswer - Correct answer
     * @param {number} points - Points for the question
     * @param {string} explanation - Optional explanation for incorrect answers
     * @returns {Object} GradeResult with isCorrect, pointsEarned, feedback
     * 
     * Requirement 6.3: Boolean comparison with correct answer
     */
    gradeTrueFalse(answer, correctAnswer, points, explanation = '') {
        if (answer === undefined || answer === null) {
            return {
                isCorrect: false,
                pointsEarned: 0,
                feedback: 'No answer provided.'
            };
        }

        // Convert to boolean if string
        const studentAnswer = typeof answer === 'string' 
            ? answer.toLowerCase() === 'true' 
            : Boolean(answer);
        
        const correctBool = typeof correctAnswer === 'string'
            ? correctAnswer.toLowerCase() === 'true'
            : Boolean(correctAnswer);

        const isCorrect = studentAnswer === correctBool;
        const pointsEarned = isCorrect ? points : 0;
        const feedback = isCorrect 
            ? 'Correct!' 
            : explanation 
                ? `Incorrect. ${explanation}` 
                : 'Incorrect.';

        return {
            isCorrect,
            pointsEarned,
            feedback
        };
    }

    /**
     * Grade a short-answer question with case-insensitive matching
     * 
     * @param {string} answer - Student's answer
     * @param {string[]} acceptedAnswers - Array of accepted answers
     * @param {number} points - Points for the question
     * @param {string} explanation - Optional explanation for incorrect answers
     * @returns {Object} GradeResult with isCorrect, pointsEarned, feedback
     * 
     * Requirement 6.4: Case-insensitive matching against accepted answers
     */
    gradeShortAnswer(answer, acceptedAnswers, points, explanation = '') {
        if (!answer || answer === '') {
            return {
                isCorrect: false,
                pointsEarned: 0,
                feedback: 'No answer provided.'
            };
        }

        if (!acceptedAnswers || acceptedAnswers.length === 0) {
            throw new Error('Short-answer questions must have at least one accepted answer');
        }

        // Normalize student answer: trim whitespace and convert to lowercase
        const normalizedAnswer = answer.trim().toLowerCase();

        // Check against all accepted answers (case-insensitive)
        const isCorrect = acceptedAnswers.some(acceptedAnswer => {
            const normalizedAccepted = acceptedAnswer.trim().toLowerCase();
            return normalizedAnswer === normalizedAccepted;
        });

        const pointsEarned = isCorrect ? points : 0;
        const feedback = isCorrect 
            ? 'Correct!' 
            : explanation 
                ? `Incorrect. ${explanation}` 
                : 'Incorrect.';

        return {
            isCorrect,
            pointsEarned,
            feedback
        };
    }

    /**
     * Calculate percentage score from points earned vs total points
     * 
     * @param {Array} gradeResults - Array of grade results with pointsEarned
     * @param {number} maxPoints - Total possible points
     * @returns {number} Percentage score (0-100)
     * 
     * Requirement 6.5: Calculate percentage score from points earned
     */
    calculateScore(gradeResults, maxPoints) {
        if (!gradeResults || gradeResults.length === 0) {
            return 0;
        }

        if (maxPoints <= 0) {
            return 0;
        }

        // Sum all points earned
        const totalPointsEarned = gradeResults.reduce((sum, result) => {
            return sum + (result.pointsEarned || 0);
        }, 0);

        // Ensure points earned never exceeds max points
        const cappedPoints = Math.min(totalPointsEarned, maxPoints);

        // Calculate percentage
        const percentage = (cappedPoints / maxPoints) * 100;

        // Round to 2 decimal places
        return Math.round(percentage * 100) / 100;
    }

    /**
     * Generate feedback message based on correctness
     * 
     * @param {boolean} isCorrect - Whether the answer is correct
     * @param {string} explanation - Optional explanation
     * @returns {string} Feedback message
     * 
     * Requirement 6.8: Generate feedback messages for each answer
     * Requirement 6.9: Include explanations in feedback for incorrect answers
     */
    generateFeedback(isCorrect, explanation = '') {
        if (isCorrect) {
            return 'Correct!';
        }

        if (explanation && explanation.trim() !== '') {
            return `Incorrect. ${explanation}`;
        }

        return 'Incorrect.';
    }

    /**
     * Grade an objective question based on its type
     * 
     * @param {Object} question - Question object with type and correct answer
     * @param {*} answer - Student's answer
     * @returns {Object} GradeResult with isCorrect, pointsEarned, feedback
     * 
     * Requirement 6.1: Evaluate answers and assign scores immediately
     * Requirement 6.6: Award full question points when correct
     * Requirement 6.7: Award zero points when incorrect
     */
    gradeQuestion(question, answer) {
        const { questionType, points, correctAnswer, acceptedAnswers, explanation } = question;

        switch (questionType) {
            case 'multiple-choice':
                return this.gradeMultipleChoice(answer, correctAnswer, points, explanation);
            
            case 'true-false':
                return this.gradeTrueFalse(answer, correctAnswer, points, explanation);
            
            case 'short-answer':
                return this.gradeShortAnswer(answer, acceptedAnswers, points, explanation);
            
            default:
                throw new Error(`Unsupported question type for auto-grading: ${questionType}`);
        }
    }

    /**
     * Check if a question type is objective (can be auto-graded)
     * 
     * @param {string} questionType - Type of question
     * @returns {boolean} True if objective, false if subjective
     */
    isObjectiveQuestion(questionType) {
        const objectiveTypes = ['multiple-choice', 'true-false', 'short-answer'];
        return objectiveTypes.includes(questionType);
    }
}

module.exports = new AutoGraderService();
