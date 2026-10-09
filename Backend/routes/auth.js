const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const auth = require("../middleware/auth");


// =====================================================
// REGISTER
// POST /api/auth/register
// =====================================================

router.post("/register", async (req, res) => {

    try {

        const {
            username,
            email,
            password,
            role
        } = req.body;


        if (!username || !email || !password) {

            return res.status(400).json({
                message: "Username, email and password are required."
            });

        }


        const existingEmail =
            await User.findOne({ email });


        if (existingEmail) {

            return res.status(400).json({
                message: "User already exists"
            });

        }


        const existingUsername =
            await User.findOne({ username });


        if (existingUsername) {

            return res.status(400).json({
                message: "Username already exists"
            });

        }


        const salt =
            await bcrypt.genSalt(10);


        const hashedPassword =
            await bcrypt.hash(
                password,
                salt
            );


        const user =
            new User({

                username: username,

                email: email,

                password: hashedPassword,

                role: role || "user",

                name: username,

                bio:
                    "Book lover 📚 | Always learning | Exploring new stories",

                followers: 0,

                following: 0,

                booksRead: 0

            });


        await user.save();


        console.log(
            "✅ User registered:",
            user.username
        );


        res.status(201).json({

            message:
                "User registered successfully!"

        });


    } catch (err) {

        console.error(
            "❌ Register error:",
            err
        );


        res.status(500).json({

            message: "Server error"

        });

    }

});


// =====================================================
// LOGIN
// POST /api/auth/login
// =====================================================

router.post("/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        if (!email || !password) {

            return res.status(400).json({

                message:
                    "Email and password are required."

            });

        }


        const user =
            await User.findOne({ email });


        if (!user) {

            return res.status(400).json({

                message:
                    "Invalid credentials"

            });

        }


        const isMatch =
            await bcrypt.compare(
                password,
                user.password
            );


        if (!isMatch) {

            return res.status(400).json({

                message:
                    "Invalid credentials"

            });

        }


        const token =
            jwt.sign(

                {
                    userId: user._id,
                    role: user.role
                },

                process.env.JWT_SECRET ||
                    "secretkey123",

                {
                    expiresIn: "7d"
                }

            );


        const userData = {

            id: user._id,

            username: user.username,

            email: user.email,

            role: user.role,

            name:
                user.name ||
                user.username,

            bio:
                user.bio ||
                "Book lover 📚 | Always learning | Exploring new stories",

            followers:
                user.followers || 0,

            following:
                user.following || 0,

            booksRead:
                user.booksRead || 0

        };


        console.log(
            "✅ User logged in:",
            user.username
        );


        res.json({

            message:
                "Login successful!",

            token: token,

            user: userData

        });


    } catch (err) {

        console.error(
            "❌ Login error:",
            err
        );


        res.status(500).json({

            message:
                "Server error"

        });

    }

});


// =====================================================
// GET CURRENT USER
// GET /api/auth/me
// =====================================================

router.get(
    "/me",
    auth,
    async (req, res) => {

        try {

            const user =
                await User
                    .findById(
                        req.user.userId
                    )
                    .select("-password");


            if (!user) {

                return res.status(404).json({

                    message:
                        "User not found"

                });

            }


            res.json({

                id: user._id,

                username:
                    user.username,

                email:
                    user.email,

                role:
                    user.role,

                name:
                    user.name ||
                    user.username,

                bio:
                    user.bio ||
                    "Book lover 📚 | Always learning | Exploring new stories",

                followers:
                    user.followers || 0,

                following:
                    user.following || 0,

                booksRead:
                    user.booksRead || 0

            });


        } catch (err) {

            console.error(
                "❌ Get current user error:",
                err
            );


            res.status(500).json({

                message:
                    "Server error"

            });

        }

    }
);


// =====================================================
// UPDATE PROFILE
// PUT /api/auth/me
// =====================================================

router.put(
    "/me",
    auth,
    async (req, res) => {

        try {

            const {
                name,
                username,
                bio
            } = req.body;


            if (!name || !username) {

                return res.status(400).json({

                    message:
                        "Name and username are required."

                });

            }


            const currentUser =
                await User.findById(
                    req.user.userId
                );


            if (!currentUser) {

                return res.status(404).json({

                    message:
                        "User not found"

                });

            }


            const usernameTaken =
                await User.findOne({

                    username: username,

                    _id: {
                        $ne:
                            req.user.userId
                    }

                });


            if (usernameTaken) {

                return res.status(400).json({

                    message:
                        "Username already exists."

                });

            }


            currentUser.name =
                name.trim();


            currentUser.username =
                username.trim();


            currentUser.bio =
                (bio || "").trim();


            await currentUser.save();


            const updatedUser = {

                id:
                    currentUser._id,

                username:
                    currentUser.username,

                email:
                    currentUser.email,

                role:
                    currentUser.role,

                name:
                    currentUser.name,

                bio:
                    currentUser.bio,

                followers:
                    currentUser.followers || 0,

                following:
                    currentUser.following || 0,

                booksRead:
                    currentUser.booksRead || 0

            };


            console.log(
                "✅ Profile updated:",
                currentUser.username
            );


            res.json({

                message:
                    "Profile updated successfully.",

                user:
                    updatedUser

            });


        } catch (err) {

            console.error(
                "❌ Update profile error:",
                err
            );


            res.status(500).json({

                message:
                    "Server error"

            });

        }

    }
);


module.exports = router;