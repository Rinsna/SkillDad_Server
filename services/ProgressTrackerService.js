const Progress = require('../models/progressModel');
const Course = require('../models/courseModel');
const InteractiveContent = require('../models/interactiveContentModel');

/**
 * ProgressTracker Service
 * 
 * Manages student progress tracking for interactive content
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */
class ProgressTrackerService {
    /**
     * Record completion after a submission is graded
     * Requirements: 9.1, 9.2, 9.3, 9.4
     * 
     * @param {Object} submission - The graded submission object
     * @returns {Promise<Object>} Updated progress record
     */
    async recordCompletion(submission) {
        try {
            // Find or create progress record
            let progress = await Progress.findOne({
                user: submission.user,
                course: submission.course
            });

            if (!progress) {
                progress = await Progress.create({
                    user: submission.user,
                    course: submission.course,
                    completedVideos: [],
                    completedExercises: [],
                    completedPractices: [],
                    completedQuizzes: [],
                    projectSubmissions: []
                });
            }

            const contentId = submission.content._id || submission.content;

            // Update progress based on content type
            if (submission.contentType === 'exercise') {
                // Requirement 9.2: Track exercises with attempts, best score, completion
                await this._updateExerciseProgress(progress, contentId, submission);
            } else if (submission.contentType === 'practice') {
                // Requirement 9.3: Track practices - record completion when submitted
                await this._updatePracticeProgress(progress, contentId);
            } else if (submission.contentType === 'quiz') {
                // Requirement 9.4: Track quizzes with attempts, best score, passing status
                await this._updateQuizProgress(progress, contentId, submission);
            }

            await progress.save();
            return progress;
        } catch (error) {
            console.error('Error recording completion:', error);
            throw error;
        }
    }

    /**
     * Update exercise progress (internal helper)
     * Requirement 9.2: Track best scores and completion status
     */
    async _updateExerciseProgress(progress, contentId, submission) {
        const existingIndex = progress.completedExercises.findIndex(
            ex => ex.content.toString() === contentId.toString()
        );

        if (existingIndex >= 0) {
            // Update existing exercise progress
            const existing = progress.completedExercises[existingIndex];
            existing.attempts += 1;
            // Requirement 9.2: Track best score across multiple attempts
            existing.bestScore = Math.max(existing.bestScore, submission.score);
            existing.lastAttemptAt = submission.submittedAt;
            // Requirement 9.2: Update completion flag (70% threshold)
            existing.isCompleted = existing.bestScore >= 70;
        } else {
            // Add new exercise progress
            progress.completedExercises.push({
                content: contentId,
                attempts: submission.attemptNumber,
                bestScore: submission.score,
                lastAttemptAt: submission.submittedAt,
                isCompleted: submission.score >= 70
            });
        }
    }

    /**
     * Update practice progress (internal helper)
     * Requirement 9.3: Record completion when submitted
     */
    async _updatePracticeProgress(progress, contentId) {
        if (!progress.completedPractices.some(id => id.toString() === contentId.toString())) {
            progress.completedPractices.push(contentId);
        }
    }

    /**
     * Update quiz progress (internal helper)
     * Requirement 9.4: Track best scores and passing status
     */
    async _updateQuizProgress(progress, contentId, submission) {
        const existingIndex = progress.completedQuizzes.findIndex(
            qz => qz.content.toString() === contentId.toString()
        );

        if (existingIndex >= 0) {
            // Update existing quiz progress
            const existing = progress.completedQuizzes[existingIndex];
            existing.attempts += 1;
            // Requirement 9.4: Track best score across multiple attempts
            existing.bestScore = Math.max(existing.bestScore, submission.score);
            // Requirement 9.4: Update passing status (once passed, stays passed)
            existing.isPassing = existing.isPassing || submission.isPassing;
            existing.lastAttemptAt = submission.submittedAt;
        } else {
            // Add new quiz progress
            progress.completedQuizzes.push({
                content: contentId,
                attempts: submission.attemptNumber,
                bestScore: submission.score,
                isPassing: submission.isPassing,
                lastAttemptAt: submission.submittedAt
            });
        }
    }

    /**
     * Get user progress for a course
     * Requirements: 9.1, 9.5, 9.6, 9.7
     * 
     * @param {String} userId - User ID
     * @param {String} courseId - Course ID
     * @returns {Promise<Object>} Progress summary with all details
     */
    async getProgress(userId, courseId) {
        try {
            // Find progress record
            const progress = await Progress.findOne({
                user: userId,
                course: courseId
            })
                .populate('completedExercises.content', 'title type')
                .populate('completedPractices', 'title type')
                .populate('completedQuizzes.content', 'title type');

            if (!progress) {
                // Return empty progress if not found
                return {
                    user: userId,
                    course: courseId,
                    completedVideos: [],
                    completedExercises: [],
                    completedPractices: [],
                    completedQuizzes: [],
                    moduleProgress: [],
                    courseProgress: 0,
                    isCompleted: false
                };
            }

            // Calculate module and course progress
            const moduleProgress = await this.calculateModuleProgress(userId, courseId);
            const courseProgress = await this.calculateCourseProgress(userId, courseId);

            return {
                user: progress.user,
                course: progress.course,
                completedVideos: progress.completedVideos,
                completedExercises: progress.completedExercises,
                completedPractices: progress.completedPractices,
                completedQuizzes: progress.completedQuizzes,
                projectSubmissions: progress.projectSubmissions,
                moduleProgress,
                courseProgress,
                isCompleted: progress.isCompleted,
                createdAt: progress.createdAt,
                updatedAt: progress.updatedAt
            };
        } catch (error) {
            console.error('Error getting progress:', error);
            throw error;
        }
    }

    /**
     * Calculate module-level progress
     * Requirement 9.5: Calculate completion percentage for a module
     * 
     * @param {String} userId - User ID
     * @param {String} courseId - Course ID
     * @returns {Promise<Array>} Array of module progress objects
     */
    async calculateModuleProgress(userId, courseId) {
        try {
            const course = await Course.findById(courseId).populate('modules.interactiveContent');
            if (!course) {
                throw new Error('Course not found');
            }

            const progress = await Progress.findOne({
                user: userId,
                course: courseId
            });

            if (!progress) {
                // Return 0% for all modules if no progress
                return course.modules.map(module => ({
                    moduleId: module._id,
                    moduleTitle: module.title,
                    completionPercentage: 0,
                    completedItems: 0,
                    totalItems: module.videos.length + (module.interactiveContent?.length || 0)
                }));
            }

            // Calculate progress for each module
            const moduleProgressArray = course.modules.map(module => {
                let completedItems = 0;
                let totalItems = 0;

                // Count videos
                totalItems += module.videos.length;
                const completedVideosInModule = module.videos.filter(video =>
                    progress.completedVideos.some(id => id.toString() === video._id.toString())
                ).length;
                completedItems += completedVideosInModule;

                // Count interactive content
                if (module.interactiveContent && module.interactiveContent.length > 0) {
                    module.interactiveContent.forEach(content => {
                        totalItems += 1;
                        const contentId = content._id || content;

                        // Check if content is completed based on type
                        if (content.type === 'exercise') {
                            const exerciseProgress = progress.completedExercises.find(
                                ex => ex.content.toString() === contentId.toString()
                            );
                            if (exerciseProgress && exerciseProgress.isCompleted) {
                                completedItems += 1;
                            }
                        } else if (content.type === 'practice') {
                            if (progress.completedPractices.some(id => id.toString() === contentId.toString())) {
                                completedItems += 1;
                            }
                        } else if (content.type === 'quiz') {
                            const quizProgress = progress.completedQuizzes.find(
                                qz => qz.content.toString() === contentId.toString()
                            );
                            if (quizProgress && quizProgress.isPassing) {
                                completedItems += 1;
                            }
                        }
                    });
                }

                // Requirement 9.5: Calculate percentage of completed items
                const completionPercentage = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

                return {
                    moduleId: module._id,
                    moduleTitle: module.title,
                    completionPercentage: Math.round(completionPercentage * 100) / 100, // Round to 2 decimals
                    completedItems,
                    totalItems
                };
            });

            return moduleProgressArray;
        } catch (error) {
            console.error('Error calculating module progress:', error);
            throw error;
        }
    }

    /**
     * Calculate overall course progress with weighted averages
     * Requirements: 9.6, 9.7, 9.8
     * 
     * Weights: Videos 40%, Exercises 20%, Practices 15%, Quizzes 25%
     * 
     * @param {String} userId - User ID
     * @param {String} courseId - Course ID
     * @returns {Promise<Number>} Overall course progress percentage (0-100)
     */
    async calculateCourseProgress(userId, courseId) {
        try {
            const course = await Course.findById(courseId).populate('modules.interactiveContent');
            if (!course) {
                throw new Error('Course not found');
            }

            const progress = await Progress.findOne({
                user: userId,
                course: courseId
            });

            if (!progress) {
                return 0;
            }

            // Count total items by type
            let totalVideos = 0;
            let totalExercises = 0;
            let totalPractices = 0;
            let totalQuizzes = 0;

            course.modules.forEach(module => {
                totalVideos += module.videos.length;

                if (module.interactiveContent && module.interactiveContent.length > 0) {
                    module.interactiveContent.forEach(content => {
                        if (content.type === 'exercise') {
                            totalExercises += 1;
                        } else if (content.type === 'practice') {
                            totalPractices += 1;
                        } else if (content.type === 'quiz') {
                            totalQuizzes += 1;
                        }
                    });
                }
            });

            // Calculate completion percentages for each type
            // Requirement 9.6: Calculate completion percentage for each content type
            const videoProgress = totalVideos > 0
                ? (progress.completedVideos.length / totalVideos) * 100
                : 0;

            const completedExercisesCount = progress.completedExercises.filter(ex => ex.isCompleted).length;
            const exerciseProgress = totalExercises > 0
                ? (completedExercisesCount / totalExercises) * 100
                : 0;

            const practiceProgress = totalPractices > 0
                ? (progress.completedPractices.length / totalPractices) * 100
                : 0;

            const passedQuizzesCount = progress.completedQuizzes.filter(qz => qz.isPassing).length;
            const quizProgress = totalQuizzes > 0
                ? (passedQuizzesCount / totalQuizzes) * 100
                : 0;

            // Requirement 9.7: Calculate weighted average
            // Videos: 40%, Exercises: 20%, Practices: 15%, Quizzes: 25%
            const overallProgress = (videoProgress * 0.4) +
                (exerciseProgress * 0.2) +
                (practiceProgress * 0.15) +
                (quizProgress * 0.25);

            // Requirement 9.8: Ensure progress is between 0 and 100
            const clampedProgress = Math.max(0, Math.min(100, overallProgress));

            return Math.round(clampedProgress * 100) / 100; // Round to 2 decimals
        } catch (error) {
            console.error('Error calculating course progress:', error);
            throw error;
        }
    }
}

module.exports = new ProgressTrackerService();
