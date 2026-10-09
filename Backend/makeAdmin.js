const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./models/User");

async function makeAdmin() {

    try {

        await mongoose.connect(process.env.MONGODB_URI);

        console.log("Connected to MongoDB");

        const email = "rahul@gmail.com";

        // PUT THE SAME PASSWORD YOU USE FOR RAHUL LOGIN HERE
        const password = "YOUR_PASSWORD_HERE";

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const user = await User.findOneAndUpdate(
            { email: email },
            {
                $set: {
                    password: "raj123",
                    role: "admin"
                }
            },
            {
                new: true
            }
        );

        if (!user) {

            console.log("❌ Rahul account was not found.");

        } else {

            console.log("✅ Rahul is now an ADMIN!");
            console.log("Email:", user.email);
            console.log("Role:", user.role);

        }

    } catch (error) {

        console.error("❌ Error:", error);

    } finally {

        await mongoose.connection.close();

    }

}

makeAdmin();