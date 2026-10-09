const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },

        password: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user"
        },

        name: {
            type: String,
            default: "",
            trim: true
        },

        bio: {
            type: String,
            default: "Book lover 📚 | Always learning | Exploring new stories",
            trim: true
        },

        followers: {
            type: Number,
            default: 0
        },

        following: {
            type: Number,
            default: 0
        },

        booksRead: {
            type: Number,
            default: 0
        },

        savedBooks: [
            {
                bookId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Book"
                },

                status: {
                    type: String,
                    enum: [
                        "Want to Read",
                        "Currently Reading",
                        "Finished"
                    ],
                    default: "Want to Read"
                },

                savedAt: {
                    type: Date,
                    default: Date.now
                }
            }
        ],

        createdAt: {
            type: Date,
            default: Date.now
        }
    }
);

module.exports = mongoose.model("User", userSchema);