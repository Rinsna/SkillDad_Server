const SkillDadUniversity = require('../models/skillDadUniversityModel');

// @desc    Get all SkillDad universities
// @route   GET /api/admin/skilldad-universities
// @access  Private (Admin)
const getSkillDadUniversities = async (req, res) => {
    try {
        const universities = await SkillDadUniversity.find().sort({ createdAt: -1 });
        res.json(universities);
    } catch (error) {
        console.error('Error fetching SkillDad universities:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new SkillDad university
// @route   POST /api/admin/skilldad-universities
// @access  Private (Admin)
const createSkillDadUniversity = async (req, res) => {
    try {
        const { name, location, website, phone, email, description } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'University name is required' });
        }

        const university = await SkillDadUniversity.create({
            name,
            location,
            website,
            phone,
            email,
            description,
        });

        res.status(201).json(university);
    } catch (error) {
        console.error('Error creating SkillDad university:', error);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update a SkillDad university
// @route   PUT /api/admin/skilldad-universities/:id
// @access  Private (Admin)
const updateSkillDadUniversity = async (req, res) => {
    try {
        const university = await SkillDadUniversity.findById(req.params.id);

        if (!university) {
            return res.status(404).json({ message: 'University not found' });
        }

        const { name, location, website, phone, email, description, isActive } = req.body;

        university.name = name || university.name;
        university.location = location !== undefined ? location : university.location;
        university.website = website !== undefined ? website : university.website;
        university.phone = phone !== undefined ? phone : university.phone;
        university.email = email !== undefined ? email : university.email;
        university.description = description !== undefined ? description : university.description;
        university.isActive = isActive !== undefined ? isActive : university.isActive;

        const updatedUniversity = await university.save();
        res.json(updatedUniversity);
    } catch (error) {
        console.error('Error updating SkillDad university:', error);
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete a SkillDad university
// @route   DELETE /api/admin/skilldad-universities/:id
// @access  Private (Admin)
const deleteSkillDadUniversity = async (req, res) => {
    try {
        const university = await SkillDadUniversity.findById(req.params.id);

        if (!university) {
            return res.status(404).json({ message: 'University not found' });
        }

        await SkillDadUniversity.findByIdAndDelete(req.params.id);
        res.json({ message: 'University deleted successfully' });
    } catch (error) {
        console.error('Error deleting SkillDad university:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getSkillDadUniversities,
    createSkillDadUniversity,
    updateSkillDadUniversity,
    deleteSkillDadUniversity,
};
