const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema({

    title: {
        type: String,
        required: true
    },

    author: {
        type: String,
        required: true
    },

    description: {
        type: String,
        default: ""
    },

    category: {
        type: String,
        default: "Fiction"
    },

    coverImage: {
        type: String,
        default: ""
    },

    source: {
        type: String,
        default: "Standard Ebooks"
    },

    sourceUrl: {
        type: String,
        default: ""
    },

    githubRepository: {
        type: String,
        default: ""
    },

    rightsStatus: {
        type: String,
        default: ""
    },

    savedBy: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],

    /* =====================================================
       TABLE OF CONTENTS
    ===================================================== */

    toc: [
        {
            title: {
                type: String,
                default: ""
            },

            chapterNumber: {
                type: Number
            },

            href: {
                type: String,
                default: ""
            }
        }
    ],

    /* =====================================================
       CHAPTERS
    ===================================================== */

    chapters: [
        {
            chapterNumber: {
                type: Number
            },

            title: {
                type: String,
                default: ""
            },

            href: {
                type: String,
                default: ""
            },

            content: {
                type: String,
                default: ""
            }
        }
    ],

    createdAt: {
        type: Date,
        default: Date.now
    }

});

module.exports =
    mongoose.model(
        "Book",
        bookSchema
    );