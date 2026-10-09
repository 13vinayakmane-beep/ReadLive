const mongoose = require("mongoose");

const liveSessionSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true
        },

        book: {
            type: String,
            default: "Book Discussion",
            trim: true
        },

        bookId: {
            type: String,
            default: null
        },

        description: {
            type: String,
            default: "",
            trim: true
        },

        host: {
            type: String,
            required: true,
            trim: true
        },

        hostId: {
            type: String,
            default: null
        },

        status: {
            type: String,
            enum: ["upcoming", "live", "ended"],
            default: "live"
        },

        scheduledDate: {
            type: String,
            default: ""
        },

        scheduledTime: {
            type: String,
            default: ""
        },

        participants: {
            type: Number,
            default: 0
        },

        maxParticipants: {
            type: Number,
            default: 10
        },

        startedAt: {
            type: Date,
            default: Date.now
        },

        endedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "LiveSession",
    liveSessionSchema
);