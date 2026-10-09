const mongoose = require('mongoose');
require('dotenv').config();

const Book = require('./models/Book');

async function clearChapters() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('Connected to MongoDB');

        const result = await Book.updateMany(
            {},
            {
                $set: {
                    chapters: []
                }
            }
        );

        console.log('Old chapters removed!');
        console.log('Books updated:', result.modifiedCount);

        await mongoose.disconnect();

        console.log('Done.');
    } catch (error) {
        console.error(error);
    }
}

clearChapters();