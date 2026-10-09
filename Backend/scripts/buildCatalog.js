require("dotenv").config();

const standardEbooks = require("../services/standardEbooks");

async function buildCatalog() {
    try {
        console.log("======================================");
        console.log("📚 Standard Ebooks Catalog Builder");
        console.log("======================================");

        const books =
            await standardEbooks.refreshCatalog();

        console.log("");
        console.log(
            `✅ Catalog successfully built!`
        );

        console.log(
            `📚 Total books: ${books.length}`
        );

        console.log("======================================");

        process.exit(0);

    } catch (error) {

        console.error("");
        console.error(
            "❌ Catalog build failed:"
        );

        console.error(
            error.response?.status ||
            error.message
        );

        console.error("");

        process.exit(1);
    }
}

buildCatalog();