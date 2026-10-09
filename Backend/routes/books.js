const express = require("express");
const router = express.Router();

const Book = require("../models/Book");
const auth = require("../middleware/auth");

// ======================================================
// OPTIONAL OLD STANDARD EBOOKS SERVICE
// Kept only for older books already imported
// ======================================================

let standardEbooks = null;

try {
    standardEbooks = require("../services/standardEbooks");
} catch (error) {
    console.log("ℹ️ Standard Ebooks service not available.");
}


// ======================================================
// GUTENBERG HELPERS
// ======================================================

const GUTENDEX_API =
    "https://gutendex.com/books/";


// ------------------------------------------------------
// Fetch JSON safely
// ------------------------------------------------------

async function fetchJSON(url) {

    const response = await fetch(url);

    if (!response.ok) {

        throw new Error(
            `Request failed: ${response.status}`
        );

    }

    return await response.json();

}


// ------------------------------------------------------
// Get Gutenberg book text
// ------------------------------------------------------

async function getGutenbergText(bookId) {

    const urls = [

        `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`,

        `https://www.gutenberg.org/files/${bookId}/${bookId}-8.txt`,

        `https://www.gutenberg.org/files/${bookId}/${bookId}.txt`

    ];


    for (const url of urls) {

        try {

            const response =
                await fetch(url);

            if (response.ok) {

                const text =
                    await response.text();

                if (text && text.length > 500) {

                    return text;

                }

            }

        }

        catch (error) {

            console.log(
                `⚠️ Gutenberg text failed: ${url}`
            );

        }

    }


    throw new Error(
        "Unable to download Gutenberg book text."
    );

}


// ======================================================
// CLEAN GUTENBERG TEXT
// ======================================================

function cleanGutenbergText(text) {

    if (!text) {
        return "";
    }


    // Remove BOM
    text =
        text.replace(/^\uFEFF/, "");


    // Normalize line endings
    text =
        text.replace(/\r\n/g, "\n");


    // Find Gutenberg START marker
    const startPatterns = [

        /\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i,

        /\*\*\* START OF THE PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i

    ];


    for (const pattern of startPatterns) {

        const match =
            text.match(pattern);

        if (match) {

            text =
                text.substring(
                    match.index + match[0].length
                );

            break;

        }

    }


    // Remove Gutenberg footer
    const endPatterns = [

        /\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i,

        /\*\*\* END OF THE PROJECT GUTENBERG EBOOK/i

    ];


    for (const pattern of endPatterns) {

        const match =
            text.match(pattern);

        if (match) {

            text =
                text.substring(
                    0,
                    match.index
                );

            break;

        }

    }


    return text.trim();

}


// ======================================================
// CHAPTER EXTRACTION
// ======================================================

function extractChapters(text) {

    const cleaned =
        cleanGutenbergText(text);


    if (!cleaned) {
        return [];
    }


    const lines =
        cleaned.split("\n");


    const chapters = [];

    let currentTitle =
        "Book";

    let currentContent = [];


    // --------------------------------------------------
    // Chapter patterns
    // --------------------------------------------------

    const chapterRegex = [

        /^\s*CHAPTER\s+[IVXLCDM0-9]+\.?\s*$/i,

        /^\s*CHAPTER\s+[A-Z]+\.?\s*$/i,

        /^\s*Chapter\s+\d+\.?\s*$/i,

        /^\s*CHAPTER\s+\d+\s*$/i

    ];


    function saveCurrentChapter() {

        const content =
            currentContent
                .join("\n")
                .trim();


        if (
            content.length > 100
        ) {

            chapters.push({

                title:
                    currentTitle,

                content:
                    content

            });

        }

    }


    for (let i = 0; i < lines.length; i++) {

        const line =
            lines[i].trim();


        let isChapter =
            false;


        for (const regex of chapterRegex) {

            if (regex.test(line)) {

                isChapter = true;

                break;

            }

        }


        if (isChapter) {

            saveCurrentChapter();


            currentTitle =
                line
                    .replace(/\.+$/, "")
                    .trim();


            currentContent = [];


            continue;

        }


        currentContent.push(
            lines[i]
        );

    }


    // Save final chapter
    saveCurrentChapter();


    // --------------------------------------------------
    // If no chapters were detected
    // create one complete chapter
    // --------------------------------------------------

    if (chapters.length === 0) {

        return [

            {

                title:
                    "Full Book",

                content:
                    cleaned

            }

        ];

    }


    return chapters;

}


// ======================================================
// GUTENBERG BOOK IMPORT
// ======================================================

async function importGutenbergBook(bookId) {

    console.log(
        `📖 Importing Gutenberg book ID: ${bookId}`
    );


    // Get metadata
    const data =
        await fetchJSON(
            `${GUTENDEX_API}${bookId}/`
        );


    const title =
        data.title ||
        "Unknown Title";


    const author =
        data.authors &&
        data.authors.length > 0

            ? data.authors
                .map(author => author.name)
                .join(", ")

            : "Unknown Author";


    const description =
        data.subjects &&
        data.subjects.length > 0

            ? data.subjects
                .slice(0, 5)
                .join(", ")

            : "";


    const formats =
        data.formats || {};


    const coverImage =
        formats["image/jpeg"] ||
        `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.cover.medium.jpg`;


    const sourceUrl =
        `https://www.gutenberg.org/ebooks/${bookId}`;


    // Download full text
    const rawText =
        await getGutenbergText(
            bookId
        );


    // Extract chapters
    const chapters =
        extractChapters(
            rawText
        );


    const toc =
        chapters.map(
            (chapter, index) => ({

                title:
                    chapter.title,

                index:
                    index

            })
        );


    return {

        title,

        author,

        description,

        coverImage,

        source:
            "Project Gutenberg",

        sourceUrl,

        githubRepository:
            `gutenberg:${bookId}`,

        rightsStatus:
            "Public Domain - verify applicable local law",

        toc,

        chapters

    };

}


// ======================================================
// ADMIN CHECK
// ======================================================

function adminOnly(req, res, next) {

    if (!req.user) {

        return res.status(401).json({

            message:
                "Authentication required"

        });

    }


    if (req.user.role !== "admin") {

        return res.status(403).json({

            message:
                "Admin access required"

        });

    }


    next();

}


// ======================================================
// GUTENBERG SEARCH
// ======================================================

// We keep the OLD endpoint name so your
// existing frontend does not need to change.
//
// /api/books/search/standardebooks
//
// But it now searches Project Gutenberg.

router.get(
    "/search/standardebooks",
    async (req, res) => {

        try {

            const query =
                (
                    req.query.q ||
                    req.query.query ||
                    ""
                ).trim();


            if (query.length < 2) {

                return res.status(400).json({

                    message:
                        "Please enter at least 2 characters."

                });

            }


            console.log(
                `🔎 Gutenberg search: ${query}`
            );


            const data =
                await fetchJSON(

                    `${GUTENDEX_API}?search=${encodeURIComponent(query)}&page=1`

                );


            const results =
                (data.results || [])
                    .slice(0, 20)
                    .map(book => {

                        const author =
                            book.authors &&
                            book.authors.length > 0

                                ? book.authors
                                    .map(
                                        author =>
                                            author.name
                                    )
                                    .join(", ")

                                : "Unknown Author";


                        const formats =
                            book.formats || {};


                        const coverImage =
                            formats["image/jpeg"] ||
                            `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.cover.medium.jpg`;


                        return {

                            id:
                                book.id,

                            title:
                                book.title,

                            author:
                                author,

                            description:
                                book.subjects &&
                                book.subjects.length > 0

                                    ? book.subjects
                                        .slice(0, 5)
                                        .join(", ")

                                    : "",

                            coverImage:
                                coverImage,

                            source:
                                "Project Gutenberg",

                            sourceUrl:
                                `https://www.gutenberg.org/ebooks/${book.id}`,

                            githubRepository:
                                `gutenberg:${book.id}`,

                            rightsStatus:
                                "Public Domain - verify applicable local law"

                        };

                    });


            console.log(
                `✅ Gutenberg search results: ${results.length}`
            );


            return res.json({

                results

            });

        }

        catch (error) {

            console.error(
                "❌ Gutenberg search error:",
                error
            );


            return res.status(503).json({

                message:
                    "Project Gutenberg is temporarily unavailable."

            });

        }

    }
);


// ======================================================
// ADDITIONAL GUTENBERG SEARCH ENDPOINT
// ======================================================

router.get(
    "/search/gutenberg",
    async (req, res) => {

        try {

            const query =
                (
                    req.query.q ||
                    ""
                ).trim();


            if (query.length < 2) {

                return res.status(400).json({

                    message:
                        "Please enter at least 2 characters."

                });

            }


            const data =
                await fetchJSON(

                    `${GUTENDEX_API}?search=${encodeURIComponent(query)}`

                );


            const results =
                (data.results || [])
                    .slice(0, 20);


            return res.json({

                results

            });

        }

        catch (error) {

            console.error(
                "❌ Gutenberg search error:",
                error
            );


            return res.status(503).json({

                message:
                    "Project Gutenberg search unavailable."

            });

        }

    }
);


// ======================================================
// GET ALL BOOKS
// ======================================================

router.get("/", async (req, res) => {

    try {

        const books =
            await Book.find()
                .select("-chapters -toc")
                .sort({
                    createdAt: -1
                });


        return res.json(books);

    }

    catch (error) {

        console.error(
            "❌ Load books error:",
            error
        );


        return res.status(500).json({

            message:
                "Server error"

        });

    }

});


// ======================================================
// READER DATA
// PUBLIC ROUTE
// ======================================================

router.get(
    "/:id/reader-data",
    async (req, res) => {

        try {

            const book =
                await Book.findById(
                    req.params.id
                );


            if (!book) {

                return res.status(404).json({

                    message:
                        "Book not found"

                });

            }


            // ==================================================
            // GUTENBERG BOOK
            // ==================================================

            if (
                book.githubRepository &&
                book.githubRepository.startsWith(
                    "gutenberg:"
                ) &&
                (
                    !book.chapters ||
                    book.chapters.length === 0
                )
            ) {

                const bookId =
                    book.githubRepository
                        .replace(
                            "gutenberg:",
                            ""
                        );


                console.log(
                    `🔄 Reader extracting Gutenberg book: ${book.title}`
                );


                const imported =
                    await importGutenbergBook(
                        bookId
                    );


                book.toc =
                    imported.toc || [];


                book.chapters =
                    imported.chapters || [];


                await book.save();

            }


            // ==================================================
            // OLD STANDARD EBOOK BOOK
            // ==================================================

            else if (
                book.githubRepository &&
                !book.githubRepository.startsWith(
                    "gutenberg:"
                ) &&
                standardEbooks &&
                (
                    !book.chapters ||
                    book.chapters.length === 0
                )
            ) {

                console.log(
                    `🔄 Old Standard Ebooks reader extraction: ${book.title}`
                );


                try {

                    const extracted =
                        await standardEbooks.extractBook(
                            book.githubRepository
                        );


                    book.toc =
                        extracted.toc || [];


                    book.chapters =
                        extracted.chapters || [];


                    await book.save();

                }

                catch (error) {

                    console.error(
                        "⚠️ Old Standard Ebooks extraction failed:",
                        error.message
                    );

                }

            }


            return res.json({

                _id:
                    book._id,

                title:
                    book.title,

                author:
                    book.author,

                description:
                    book.description || "",

                category:
                    book.category || "Fiction",

                coverImage:
                    book.coverImage || "",

                source:
                    book.source || "",

                sourceUrl:
                    book.sourceUrl || "",

                githubRepository:
                    book.githubRepository || "",

                toc:
                    book.toc || [],

                chapters:
                    book.chapters || []

            });

        }

        catch (error) {

            console.error(
                "❌ Reader data error:",
                error
            );


            return res.status(500).json({

                message:
                    error.message ||
                    "Unable to load reader data."

            });

        }

    }
);


// ======================================================
// GET SINGLE BOOK
// ======================================================

router.get(
    "/:id",
    async (req, res) => {

        try {

            const book =
                await Book.findById(
                    req.params.id
                );


            if (!book) {

                return res.status(404).json({

                    message:
                        "Book not found"

                });

            }


            return res.json(book);

        }

        catch (error) {

            console.error(
                "❌ Get book error:",
                error
            );


            return res.status(500).json({

                message:
                    "Server error"

            });

        }

    }
);


// ======================================================
// ADD BOOK
// ADMIN ONLY
// ======================================================

router.post(
    "/",
    auth,
    adminOnly,
    async (req, res) => {

        try {

            const {

                title,

                author,

                description,

                category,

                coverImage,

                source,

                sourceUrl,

                githubRepository,

                rightsStatus

            } = req.body;


            if (!title || !author) {

                return res.status(400).json({

                    message:
                        "Title and author are required."

                });

            }


            let toc = [];

            let chapters = [];


            let finalTitle =
                title;


            let finalAuthor =
                author;


            let finalDescription =
                description || "";


            let finalCover =
                coverImage || "";


            let finalSource =
                source ||
                "Project Gutenberg";


            let finalSourceUrl =
                sourceUrl || "";


            let finalRights =
                rightsStatus || "";


            // ==================================================
            // GUTENBERG IMPORT
            // ==================================================

            if (
                githubRepository &&
                githubRepository.startsWith(
                    "gutenberg:"
                )
            ) {

                const bookId =
                    githubRepository
                        .replace(
                            "gutenberg:",
                            ""
                        );


                const imported =
                    await importGutenbergBook(
                        bookId
                    );


                finalTitle =
                    imported.title ||
                    finalTitle;


                finalAuthor =
                    imported.author ||
                    finalAuthor;


                finalDescription =
                    imported.description ||
                    finalDescription;


                finalCover =
                    imported.coverImage ||
                    finalCover;


                finalSource =
                    imported.source;


                finalSourceUrl =
                    imported.sourceUrl;


                finalRights =
                    imported.rightsStatus;


                toc =
                    imported.toc || [];


                chapters =
                    imported.chapters || [];

            }


            // ==================================================
            // OLD STANDARD EBOOK IMPORT
            // ==================================================

            else if (
                githubRepository &&
                standardEbooks
            ) {

                console.log(
                    `📖 Importing old Standard Ebooks book: ${githubRepository}`
                );


                try {

                    const extracted =
                        await standardEbooks.extractBook(
                            githubRepository
                        );


                    toc =
                        extracted.toc || [];


                    chapters =
                        extracted.chapters || [];


                    finalTitle =
                        extracted.title ||
                        finalTitle;


                    finalAuthor =
                        extracted.author ||
                        finalAuthor;


                    finalDescription =
                        extracted.description ||
                        finalDescription;

                }

                catch (error) {

                    console.error(
                        "⚠️ Standard Ebooks import failed:",
                        error.message
                    );

                }

            }


            // ==================================================
            // CREATE DATABASE BOOK
            // ==================================================

            const book =
                new Book({

                    title:
                        finalTitle,

                    author:
                        finalAuthor,

                    description:
                        finalDescription,

                    category:
                        category ||
                        "Fiction",

                    coverImage:
                        finalCover,

                    source:
                        finalSource,

                    sourceUrl:
                        finalSourceUrl,

                    githubRepository:
                        githubRepository ||
                        "",

                    rightsStatus:
                        finalRights,

                    toc,

                    chapters

                });


            await book.save();


            console.log(
                `✅ Book imported successfully: ${book.title}`
            );


            return res.status(201).json({

                message:
                    "Book added successfully!",

                book,

                chapterCount:
                    chapters.length,

                tocCount:
                    toc.length

            });

        }

        catch (error) {

            console.error(
                "❌ Add book error:",
                error
            );


            return res.status(500).json({

                message:
                    error.message ||
                    "Server error"

            });

        }

    }
);


// ======================================================
// UPDATE BOOK
// ADMIN ONLY
// ======================================================

router.put(
    "/:id",
    auth,
    adminOnly,
    async (req, res) => {

        try {

            const {

                title,

                author,

                description,

                category,

                coverImage,

                source,

                sourceUrl,

                githubRepository,

                rightsStatus

            } = req.body;


            const book =
                await Book.findById(
                    req.params.id
                );


            if (!book) {

                return res.status(404).json({

                    message:
                        "Book not found"

                });

            }


            book.title =
                title ||
                book.title;


            book.author =
                author ||
                book.author;


            book.description =
                description !== undefined

                    ? description

                    : book.description;


            book.category =
                category ||
                book.category ||
                "Fiction";


            book.coverImage =
                coverImage ||
                book.coverImage ||
                "";


            book.source =
                source ||
                book.source ||
                "Project Gutenberg";


            book.sourceUrl =
                sourceUrl ||
                book.sourceUrl ||
                "";


            book.githubRepository =
                githubRepository ||
                book.githubRepository ||
                "";


            book.rightsStatus =
                rightsStatus ||
                book.rightsStatus ||
                "";


            // ==================================================
            // RE-IMPORT GUTENBERG
            // ==================================================

            if (
                githubRepository &&
                githubRepository.startsWith(
                    "gutenberg:"
                )
            ) {

                const bookId =
                    githubRepository
                        .replace(
                            "gutenberg:",
                            ""
                        );


                console.log(
                    `🔄 Re-importing Gutenberg book: ${bookId}`
                );


                const imported =
                    await importGutenbergBook(
                        bookId
                    );


                book.title =
                    imported.title ||
                    book.title;


                book.author =
                    imported.author ||
                    book.author;


                book.description =
                    imported.description ||
                    book.description ||
                    "";


                book.coverImage =
                    imported.coverImage ||
                    book.coverImage ||
                    "";


                book.source =
                    imported.source;


                book.sourceUrl =
                    imported.sourceUrl;


                book.rightsStatus =
                    imported.rightsStatus;


                book.toc =
                    imported.toc || [];


                book.chapters =
                    imported.chapters || [];

            }


            await book.save();


            return res.json({

                message:
                    "Book updated successfully!",

                book,

                chapterCount:
                    book.chapters?.length ||
                    0,

                tocCount:
                    book.toc?.length ||
                    0

            });

        }

        catch (error) {

            console.error(
                "❌ Update book error:",
                error
            );


            return res.status(500).json({

                message:
                    error.message ||
                    "Server error"

            });

        }

    }
);


// ======================================================
// DELETE BOOK
// ADMIN ONLY
// ======================================================

router.delete(
    "/:id",
    auth,
    adminOnly,
    async (req, res) => {

        try {

            const book =
                await Book.findById(
                    req.params.id
                );


            if (!book) {

                return res.status(404).json({

                    message:
                        "Book not found"

                });

            }


            await Book.findByIdAndDelete(
                req.params.id
            );


            return res.json({

                message:
                    "Book deleted successfully!"

            });

        }

        catch (error) {

            console.error(
                "❌ Delete book error:",
                error
            );


            return res.status(500).json({

                message:
                    "Server error"

            });

        }

    }
);


// ======================================================
// OLD CHAPTER ROUTE
// ======================================================

router.get(
    "/:id/chapters",
    auth,
    async (req, res) => {

        try {

            const book =
                await Book.findById(
                    req.params.id
                );


            if (!book) {

                return res.status(404).json({

                    message:
                        "Book not found"

                });

            }


            // ==================================================
            // GUTENBERG
            // ==================================================

            if (
                book.githubRepository &&
                book.githubRepository.startsWith(
                    "gutenberg:"
                ) &&
                (
                    !book.chapters ||
                    book.chapters.length === 0
                )
            ) {

                const bookId =
                    book.githubRepository
                        .replace(
                            "gutenberg:",
                            ""
                        );


                const imported =
                    await importGutenbergBook(
                        bookId
                    );


                book.toc =
                    imported.toc || [];


                book.chapters =
                    imported.chapters || [];


                await book.save();

            }


            // ==================================================
            // OLD STANDARD EBOOK
            // ==================================================

            else if (
                book.githubRepository &&
                standardEbooks &&
                (
                    !book.chapters ||
                    book.chapters.length === 0
                )
            ) {

                try {

                    const extracted =
                        await standardEbooks.extractBook(
                            book.githubRepository
                        );


                    book.toc =
                        extracted.toc || [];


                    book.chapters =
                        extracted.chapters || [];


                    await book.save();

                }

                catch (error) {

                    console.error(
                        "⚠️ Standard Ebooks extraction failed:",
                        error.message
                    );

                }

            }


            return res.json({

                bookId:
                    book._id,

                title:
                    book.title,

                author:
                    book.author,

                toc:
                    book.toc || [],

                chapters:
                    book.chapters || []

            });

        }

        catch (error) {

            console.error(
                "❌ Get chapters error:",
                error
            );


            return res.status(500).json({

                message:
                    error.message ||
                    "Server error"

            });

        }

    }
);


// ======================================================
// EXPORT
// ======================================================

module.exports = router;