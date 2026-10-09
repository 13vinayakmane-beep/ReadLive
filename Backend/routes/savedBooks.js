const express = require('express');
const router = express.Router();

const Book = require('../models/Book');
const auth = require('../middleware/auth');


// ===============================
// SAVE BOOK
// ===============================
router.post('/:bookId', auth, async (req, res) => {
    try {

        const book = await Book.findById(req.params.bookId);

        if (!book) {
            return res.status(404).json({
                message: 'Book not found'
            });
        }

        // Check if already saved
        if (book.savedBy.includes(req.user.userId)) {
            return res.status(400).json({
                message: 'Book already saved'
            });
        }

        book.savedBy.push(req.user.userId);

        await book.save();

        res.json({
            message: 'Book saved successfully',
            book
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: 'Server error'
        });
    }
});


// ===============================
// REMOVE SAVED BOOK
// ===============================
router.delete('/:bookId', auth, async (req, res) => {
    try {

        const book = await Book.findById(req.params.bookId);

        if (!book) {
            return res.status(404).json({
                message: 'Book not found'
            });
        }

        book.savedBy = book.savedBy.filter(
            userId => userId.toString() !== req.user.userId.toString()
        );

        await book.save();

        res.json({
            message: 'Book removed from saved books'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: 'Server error'
        });
    }
});


// ===============================
// GET MY SAVED BOOKS
// ===============================
router.get('/', auth, async (req, res) => {
    try {

        const books = await Book.find({
            savedBy: req.user.userId
        });

        res.json(books);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: 'Server error'
        });
    }
});


// IMPORTANT
// Export the router
module.exports = router;