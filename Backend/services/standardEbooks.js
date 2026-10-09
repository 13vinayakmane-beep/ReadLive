const axios = require("axios");
const AdmZip = require("adm-zip");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const ORG = "standardebooks";

const DATA_DIR =
    path.join(__dirname, "..", "data");

const CACHE_FILE =
    path.join(DATA_DIR, "se-catalog.json");

const CACHE_TTL =
    24 * 60 * 60 * 1000;


/* =========================================================
   GITHUB CLIENT
========================================================= */

const github = axios.create({

    timeout: 60000,

    headers: {
        "User-Agent": "ReadLive-College-Project",
        "Accept": "application/vnd.github+json"
    }

});


/* =========================================================
   BASIC HELPERS
========================================================= */

function normalize(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

}


function slugToWords(slug) {

    return String(slug || "")
        .replace(/_/g, " ")
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, char =>
            char.toUpperCase()
        );

}


function repoFromInput(repo) {

    if (!repo) {
        throw new Error(
            "Repository is required"
        );
    }

    let value =
        String(repo).trim();

    value =
        value
            .replace(
                /^https?:\/\/github\.com\//i,
                ""
            )
            .replace(
                /^github\.com\//i,
                ""
            )
            .replace(
                /\.git$/i,
                ""
            )
            .replace(
                /^\/+|\/+$/g,
                ""
            );

    /*
     * If value is:
     * standardebooks/dracula
     *
     * keep only:
     * dracula
     */

    if (value.includes("/")) {

        const parts =
            value.split("/");

        if (
            parts.length >= 2 &&
            parts[0].toLowerCase() === ORG
        ) {

            return parts[1];

        }

    }

    return value;

}


/* =========================================================
   CATALOG
========================================================= */

async function fetchAllRepos() {

    console.log(
        "📚 Downloading Standard Ebooks catalog..."
    );

    const repositories = [];

    for (
        let page = 1;
        page <= 40;
        page++
    ) {

        console.log(
            `📄 Reading repository page ${page}...`
        );

        try {

            const response =
                await github.get(
                    `/orgs/${ORG}/repos`,
                    {
                        params: {
                            per_page: 100,
                            page,
                            type: "all"
                        }
                    }
                );

            const repos =
                response.data || [];

            console.log(
                `   Found ${repos.length} repositories`
            );

            if (
                repos.length === 0
            ) {
                break;
            }

            repositories.push(
                ...repos
            );

            if (
                repos.length < 100
            ) {
                break;
            }

        } catch (error) {

            console.error(
                "❌ GitHub repository error:",
                error.response?.status ||
                error.message
            );

            throw error;

        }

    }

    return repositories;

}


/* =========================================================
   BUILD CATALOG
========================================================= */

async function refreshCatalog() {

    console.log(
        "🔄 Refreshing Standard Ebooks catalog..."
    );

    const repositories =
        await fetchAllRepos();

    const books = [];

    for (
        const repo of repositories
    ) {

        if (
            !repo ||
            !repo.name
        ) {
            continue;
        }


        /*
         * Standard Ebooks book repositories
         * normally use:
         *
         * author_title
         *
         * Examples:
         *
         * bram-stoker_dracula
         * jane-austen_pride-and-prejudice
         * lewis-carroll_alices-adventures-in-wonderland
         */

        if (
            !repo.name.includes("_")
        ) {
            continue;
        }


        const parts =
            repo.name.split("_");


        const authorSlug =
            parts.shift();


        const titleSlug =
            parts.join("_");


        if (
            !authorSlug ||
            !titleSlug
        ) {
            continue;
        }


        const author =
            slugToWords(
                authorSlug
            );


        const title =
            slugToWords(
                titleSlug
            );


        const sourceUrl =
            `https://standardebooks.org/ebooks/${authorSlug}/${titleSlug}`;


        /*
         * Standard Ebooks cover URL.
         *
         * This is only the catalog URL.
         * The actual importer also extracts
         * the real cover from the EPUB.
         */

        const coverImage =
            `${sourceUrl}/images/cover.jpg`;


        books.push({

            repository:
                repo.name,

            title,

            author,

            description:
                "",

            category:
                "Fiction",

            coverImage,

            source:
                "Standard Ebooks",

            sourceUrl,

            githubRepository:
                `https://github.com/${ORG}/${repo.name}`,

            rightsStatus:
                "allowed",

            searchText:
                normalize(
                    `${title} ${author} ${repo.name}`
                )

        });

    }


    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );


    fs.writeFileSync(

        CACHE_FILE,

        JSON.stringify(
            books,
            null,
            2
        ),

        "utf8"

    );


    console.log(
        `✅ Catalog saved: ${books.length} books`
    );


    console.log(
        `📁 Location: ${CACHE_FILE}`
    );


    return books;

}


/* =========================================================
   GET CATALOG
========================================================= */

async function getCatalog() {

    try {

        if (
            fs.existsSync(
                CACHE_FILE
            )
        ) {

            const stats =
                fs.statSync(
                    CACHE_FILE
                );


            const age =
                Date.now() -
                stats.mtimeMs;


            if (
                age < CACHE_TTL
            ) {

                const data =
                    fs.readFileSync(
                        CACHE_FILE,
                        "utf8"
                    );


                return JSON.parse(
                    data
                );

            }

        }

    } catch (error) {

        console.log(
            "⚠️ Catalog cache could not be read."
        );

    }


    return await refreshCatalog();

}


/* =========================================================
   SEARCH BOOKS
========================================================= */

async function searchBooks(
    query,
    limit = 30
) {

    const catalog =
        await getCatalog();


    const search =
        normalize(query);


    if (!search) {
        return [];
    }


    const words =
        search.split(" ");


    const results =
        catalog

            .map(book => {

                const text =
                    book.searchText ||
                    normalize(
                        `${book.title} ${book.author} ${book.repository}`
                    );


                let score = 0;


                /*
                 * Exact complete match
                 */

                if (
                    text === search
                ) {

                    score += 100;

                }


                /*
                 * Complete phrase match
                 */

                if (
                    text.includes(search)
                ) {

                    score += 50;

                }


                /*
                 * Individual word match
                 */

                for (
                    const word of words
                ) {

                    if (
                        word &&
                        text.includes(word)
                    ) {

                        score += 10;

                    }

                }


                return {

                    ...book,

                    score

                };

            })


            .filter(
                book =>
                    book.score > 0
            )


            .sort(
                (a, b) =>
                    b.score - a.score
            )


            .slice(
                0,
                limit
            );


    return results;

}


/* =========================================================
   DOWNLOAD STANDARD EBOOK
========================================================= */

async function downloadZip(
    repo
) {

    const repository =
        repoFromInput(repo);


    const branches = [
        "master",
        "main"
    ];


    let lastError =
        null;


    for (
        const branch of branches
    ) {

        const url =
            `https://codeload.github.com/${ORG}/${repository}/zip/refs/heads/${branch}`;


        try {

            console.log(
                `📦 Downloading ${repository} (${branch})...`
            );


            const response =
                await github.get(
                    url,
                    {

                        responseType:
                            "arraybuffer",

                        maxContentLength:
                            Infinity,

                        maxBodyLength:
                            Infinity

                    }
                );


            console.log(
                `✅ Download complete (${Math.round(response.data.length / 1024 / 1024)} MB)`
            );


            return Buffer.from(
                response.data
            );

        } catch (error) {

            lastError =
                error;


            console.log(
                `⚠️ ${branch} branch failed`
            );

        }

    }


    throw (
        lastError ||
        new Error(
            `Unable to download repository: ${repository}`
        )
    );

}


/* =========================================================
   ZIP HELPERS
========================================================= */

function readZipEntry(
    entry
) {

    if (!entry) {
        return "";
    }


    return entry
        .getData()
        .toString("utf8");

}


function findZipEntry(
    zip,
    fileName
) {

    if (!fileName) {
        return null;
    }


    const target =
        fileName
            .replace(/\\/g, "/")
            .replace(/^\/+/, "")
            .toLowerCase();


    return zip
        .getEntries()
        .find(
            entry => {

                const name =
                    entry.entryName
                        .replace(/\\/g, "/")
                        .replace(/^\/+/, "")
                        .toLowerCase();


                return (
                    name === target ||
                    name.endsWith(
                        "/" + target
                    )
                );

            }
        );

}


/* =========================================================
   CLEAN HTML
========================================================= */

function cleanChapterContent(
    html
) {

    if (!html) {
        return "";
    }


    const $ =
        cheerio.load(
            html,
            {
                decodeEntities: false
            }
        );


    $("script").remove();

    $("style").remove();

    $("noscript").remove();

    $("nav").remove();


    const body =
        $("body");


    if (
        body.length
    ) {

        return (
            body.html() ||
            ""
        ).trim();

    }


    return (
        $.html() ||
        ""
    ).trim();

}


/* =========================================================
   CHAPTER TITLE
========================================================= */

function getChapterTitle(
    html,
    fallback
) {

    if (!html) {
        return fallback;
    }


    const $ =
        cheerio.load(
            html
        );


    let title =
        $("h1")
            .first()
            .text()
            .trim();


    if (!title) {

        title =
            $("h2")
                .first()
                .text()
                .trim();

    }


    if (!title) {

        title =
            $("h3")
                .first()
                .text()
                .trim();

    }


    if (!title) {

        title =
            $("title")
                .first()
                .text()
                .trim();

    }


    return (
        title
            .replace(/\s+/g, " ")
            .trim() ||
        fallback
    );

}


/* =========================================================
   DESCRIPTION
========================================================= */

function extractDescription(
    opfHtml
) {

    if (!opfHtml) {
        return "";
    }


    const $ =
        cheerio.load(
            opfHtml,
            {
                xmlMode: true
            }
        );


    let description =
        "";


    $("dc\\:description, description")
        .each(
            (_, element) => {

                if (
                    !description
                ) {

                    description =
                        $(element)
                            .text()
                            .trim();

                }

            }
        );


    return description;

}


/* =========================================================
   AUTHOR CLEANING
========================================================= */

function cleanAuthor(
    author
) {

    if (!author) {
        return "";
    }


    return String(author)
        .replace(/\s+/g, " ")
        .trim();

}


/* =========================================================
   FRONT MATTER
========================================================= */

const SKIP_WORDS = [

    "cover",
    "titlepage",
    "halftitlepage",
    "imprint",
    "colophon",
    "copyright",
    "uncopyright",
    "toc",
    "frontispiece",
    "dedication",
    "epigraph",
    "introduction",
    "preface",
    "foreword",
    "afterword",
    "notes",
    "bibliography",
    "index",
    "list-of-illustrations",
    "list-of-figures",
    "list-of-plates",
    "acknowledgments",
    "acknowledgements"

];


function shouldSkipFile(
    href
) {

    if (!href) {
        return true;
    }


    const clean =
        decodeURIComponent(
            href
        )
            .split("#")[0]
            .split("?")[0]
            .replace(/\\/g, "/")
            .toLowerCase();


    const fileName =
        path.posix.basename(
            clean
        );


    const withoutExtension =
        fileName.replace(
            /\.x?html?$/i,
            ""
        );


    return SKIP_WORDS.some(
        word =>
            fileName === word ||
            withoutExtension === word ||
            fileName.includes(word)
    );

}


/* =========================================================
   READING FILE
========================================================= */

function isLikelyReadingFile(
    href
) {

    if (!href) {
        return false;
    }


    if (
        shouldSkipFile(href)
    ) {
        return false;
    }


    const lower =
        href.toLowerCase();


    return (
        lower.endsWith(".xhtml") ||
        lower.endsWith(".html") ||
        lower.endsWith(".htm")
    );

}


/* =========================================================
   EXTRACT TOC
========================================================= */

function extractToc(
    tocHtml,
    chapters
) {

    const toc = [];


    if (
        tocHtml
    ) {

        const $ =
            cheerio.load(
                tocHtml
            );


        $("a[href]")
            .each(
                (_, element) => {

                    const title =
                        $(element)
                            .text()
                            .replace(
                                /\s+/g,
                                " "
                            )
                            .trim();


                    let href =
                        $(element)
                            .attr("href") ||
                        "";


                    href =
                        href
                            .split("#")[0]
                            .replace(
                                /\\/g,
                                "/"
                            )
                            .replace(
                                /^\.?\//,
                                ""
                            );


                    if (
                        !title ||
                        !href
                    ) {
                        return;
                    }


                    if (
                        shouldSkipFile(
                            href
                        )
                    ) {
                        return;
                    }


                    const matchingChapter =
                        chapters.find(
                            chapter => {

                                const chapterHref =
                                    chapter.href
                                        .split("#")[0]
                                        .replace(
                                            /\\/g,
                                            "/"
                                        );


                                return (
                                    chapterHref === href ||
                                    chapterHref.endsWith(
                                        "/" + href
                                    ) ||
                                    href.endsWith(
                                        "/" + chapterHref
                                    )
                                );

                            }
                        );


                    if (
                        !matchingChapter
                    ) {
                        return;
                    }


                    const alreadyExists =
                        toc.some(
                            item =>
                                item.chapterNumber ===
                                matchingChapter.chapterNumber
                        );


                    if (
                        alreadyExists
                    ) {
                        return;
                    }


                    toc.push({

                        title,

                        chapterNumber:
                            matchingChapter.chapterNumber,

                        href:
                            matchingChapter.href

                    });

                }
            );

    }


    /*
     * Fallback:
     * create TOC directly from chapters.
     */

    if (
        !toc.length
    ) {

        chapters.forEach(
            chapter => {

                toc.push({

                    title:
                        chapter.title,

                    chapterNumber:
                        chapter.chapterNumber,

                    href:
                        chapter.href

                });

            }
        );

    }


    return toc;

}


/* =========================================================
   EXTRACT BOOK
========================================================= */

async function extractBook(
    repository
) {

    const repo =
        repoFromInput(
            repository
        );


    console.log(
        `📖 Extracting Standard Ebooks book: ${repo}`
    );


    const zipBuffer =
        await downloadZip(
            repo
        );


    const zip =
        new AdmZip(
            zipBuffer
        );


    const entries =
        zip.getEntries();


    if (
        !entries.length
    ) {

        throw new Error(
            "Downloaded ZIP is empty"
        );

    }


    /* =====================================================
       FIND OPF
    ===================================================== */

    const opfEntry =
        entries.find(
            entry =>
                entry.entryName
                    .replace(/\\/g, "/")
                    .toLowerCase()
                    .endsWith(".opf")
        );


    if (!opfEntry) {

        throw new Error(
            "EPUB OPF file not found"
        );

    }


    const opfPath =
        opfEntry.entryName
            .replace(
                /\\/g,
                "/"
            );


    const opfDirectory =
        path.posix.dirname(
            opfPath
        );


    const opfHtml =
        readZipEntry(
            opfEntry
        );


    const $opf =
        cheerio.load(
            opfHtml,
            {
                xmlMode: true,
                decodeEntities: false
            }
        );


    /* =====================================================
       TITLE
    ===================================================== */

    let title =
        $opf("dc\\:title")
            .first()
            .text()
            .trim();


    if (!title) {

        title =
            $opf("title")
                .first()
                .text()
                .trim();

    }


    if (!title) {

        title =
            slugToWords(
                repo
            );

    }


    /* =====================================================
       AUTHOR
    ===================================================== */

    let author =
        $opf("dc\\:creator")
            .first()
            .text()
            .trim();


    if (!author) {

        author =
            $opf("creator")
                .first()
                .text()
                .trim();

    }


    author =
        cleanAuthor(
            author
        );


    /* =====================================================
       DESCRIPTION
    ===================================================== */

    const description =
        extractDescription(
            opfHtml
        );


    /* =====================================================
       MANIFEST
    ===================================================== */

    const manifest = {};


    $opf("manifest item")
        .each(
            (_, element) => {

                const id =
                    $opf(element)
                        .attr("id");


                const href =
                    $opf(element)
                        .attr("href");


                const mediaType =
                    $opf(element)
                        .attr("media-type");


                const properties =
                    $opf(element)
                        .attr("properties") ||
                    "";


                if (
                    id &&
                    href
                ) {

                    manifest[id] = {

                        href,

                        mediaType:
                            mediaType || "",

                        properties

                    };

                }

            }
        );


    /* =====================================================
       SPINE
    ===================================================== */

    const spine = [];


    $opf("spine itemref")
        .each(
            (_, element) => {

                const idref =
                    $opf(element)
                        .attr("idref");


                if (
                    !idref ||
                    !manifest[idref]
                ) {
                    return;
                }


                spine.push({

                    idref,

                    href:
                        manifest[idref]
                            .href,

                    mediaType:
                        manifest[idref]
                            .mediaType

                });

            }
        );


    /* =====================================================
       RELATIVE ZIP ENTRY
    ===================================================== */

    function findRelativeEntry(
        href
    ) {

        if (!href) {
            return null;
        }


        const decoded =
            decodeURIComponent(
                href
            )
                .split("#")[0];


        const fullPath =
            path.posix.normalize(
                path.posix.join(
                    opfDirectory,
                    decoded
                )
            );


        const exact =
            entries.find(
                entry =>
                    entry.entryName
                        .replace(
                            /\\/g,
                            "/"
                        )
                        .toLowerCase() ===
                    fullPath.toLowerCase()
            );


        if (
            exact
        ) {
            return exact;
        }


        return findZipEntry(
            zip,
            decoded
        );

    }


    /* =====================================================
       CHAPTERS
    ===================================================== */

    const chapters = [];


    for (
        const spineItem of spine
    ) {

        if (
            !isLikelyReadingFile(
                spineItem.href
            )
        ) {
            continue;
        }


        const entry =
            findRelativeEntry(
                spineItem.href
            );


        if (!entry) {

            console.log(
                `⚠️ Could not find chapter file: ${spineItem.href}`
            );

            continue;

        }


        const html =
            readZipEntry(
                entry
            );


        if (!html) {
            continue;
        }


        const content =
            cleanChapterContent(
                html
            );


        if (
            !content ||
            content.trim().length < 20
        ) {
            continue;
        }


        const chapterNumber =
            chapters.length + 1;


        let chapterTitle =
            getChapterTitle(
                html,
                `Chapter ${chapterNumber}`
            );


        chapterTitle =
            chapterTitle
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();


        chapters.push({

            chapterNumber,

            title:
                chapterTitle,

            href:
                entry.entryName
                    .replace(
                        /\\/g,
                        "/"
                    ),

            content

        });


        /*
         * Safety limit.
         */

        if (
            chapters.length >= 100
        ) {

            console.log(
                "⚠️ Chapter limit reached."
            );

            break;

        }

    }


    /* =====================================================
       TOC FILE
    ===================================================== */

    let tocHtml = "";


    const tocEntry =
        entries.find(
            entry =>
                entry.entryName
                    .replace(
                        /\\/g,
                        "/"
                    )
                    .toLowerCase()
                    .endsWith(
                        "/toc.xhtml"
                    )
        );


    if (
        tocEntry
    ) {

        tocHtml =
            readZipEntry(
                tocEntry
            );

    }


    const toc =
        extractToc(
            tocHtml,
            chapters
        );


    /* =====================================================
       COVER EXTRACTION
    ===================================================== */

    let coverImage = "";

    let coverHref = "";


    /*
     * METHOD 1
     * EPUB metadata:
     *
     * <meta name="cover"
     *       content="cover-image"/>
     */

    $opf("metadata meta")
        .each(
            (_, element) => {

                if (
                    coverHref
                ) {
                    return;
                }


                const name =
                    $opf(element)
                        .attr("name");


                const content =
                    $opf(element)
                        .attr("content");


                if (
                    name &&
                    name.toLowerCase() ===
                    "cover" &&
                    content &&
                    manifest[content]
                ) {

                    coverHref =
                        manifest[content]
                            .href;

                }

            }
        );


    /*
     * METHOD 2
     * EPUB3 properties="cover-image"
     */

    if (
        !coverHref
    ) {

        for (
            const id
            of Object.keys(manifest)
        ) {

            const item =
                manifest[id];


            const properties =
                String(
                    item.properties ||
                    ""
                )
                    .toLowerCase();


            if (
                properties
                    .split(/\s+/)
                    .includes(
                        "cover-image"
                    )
            ) {

                coverHref =
                    item.href;

                break;

            }

        }

    }


    /*
     * METHOD 3
     * Search the ZIP for common cover names.
     */

    if (
        !coverHref
    ) {

        const coverCandidates = [

            "cover.jpg",
            "cover.jpeg",
            "cover.png",
            "cover.webp",

            "images/cover.jpg",
            "images/cover.jpeg",
            "images/cover.png",
            "images/cover.webp"

        ];


        for (
            const candidate
            of coverCandidates
        ) {

            const entry =
                findZipEntry(
                    zip,
                    candidate
                );


            if (
                entry
            ) {

                coverHref =
                    entry.entryName
                        .replace(
                            /\\/g,
                            "/"
                        );

                break;

            }

        }

    }


    /*
     * METHOD 4
     * Search every image in the EPUB.
     *
     * This is the important fallback for
     * books such as Dracula/Alice where
     * the cover is not named exactly cover.jpg.
     */

    if (
        !coverHref
    ) {

        const imageEntries =
            entries.filter(
                entry => {

                    const name =
                        entry.entryName
                            .replace(
                                /\\/g,
                                "/"
                            )
                            .toLowerCase();


                    return (

                        name.endsWith(".jpg") ||
                        name.endsWith(".jpeg") ||
                        name.endsWith(".png") ||
                        name.endsWith(".webp")

                    );

                }
            );


        const coverEntry =
            imageEntries.find(
                entry => {

                    const name =
                        entry.entryName
                            .replace(
                                /\\/g,
                                "/"
                            )
                            .toLowerCase();


                    return (
                        name.includes(
                            "cover"
                        ) ||
                        name.includes(
                            "title"
                        )
                    );

                }
            );


        if (
            coverEntry
        ) {

            coverHref =
                coverEntry.entryName
                    .replace(
                        /\\/g,
                        "/"
                    );

        }

    }


    /*
     * Convert cover path to a
     * jsDelivr URL.
     *
     * IMPORTANT:
     * The path must be relative to
     * the repository root.
     */

    if (
        coverHref
    ) {

        let cleanCoverHref =
            decodeURIComponent(
                coverHref
            )
                .replace(
                    /\\/g,
                    "/"
                )
                .replace(
                    /^\/+/,
                    ""
                );


        /*
         * Standard Ebooks images normally
         * live inside:
         *
         * src/epub/images/...
         */

        const srcIndex =
            cleanCoverHref
                .toLowerCase()
                .indexOf(
                    "src/epub/"
                );


        if (
            srcIndex !== -1
        ) {

            const repoPath =
                cleanCoverHref
                    .substring(
                        srcIndex
                    );


            coverImage =
                `https://cdn.jsdelivr.net/gh/${ORG}/${repo}@master/${repoPath}`;

        } else {

            /*
             * If the ZIP path is only:
             *
             * images/cover.jpg
             *
             * add src/epub/
             */

            if (
                cleanCoverHref
                    .toLowerCase()
                    .startsWith(
                        "images/"
                    )
            ) {

                coverImage =
                    `https://cdn.jsdelivr.net/gh/${ORG}/${repo}@master/src/epub/${cleanCoverHref}`;

            }

        }

    }


    /*
     * FINAL FALLBACK
     *
     * Standard Ebooks usually stores the
     * cover at:
     *
     * src/epub/images/cover.jpg
     *
     * If extraction did not find it,
     * still create the expected URL.
     */

    if (
        !coverImage
    ) {

        coverImage =
            `https://cdn.jsdelivr.net/gh/${ORG}/${repo}@master/src/epub/images/cover.jpg`;

    }


    /* =====================================================
       LOGGING
    ===================================================== */

    console.log(
        `📚 Book extracted: ${title}`
    );


    console.log(
        `👤 Author: ${author}`
    );


    console.log(
        `📖 Actual reading chapters: ${chapters.length}`
    );


    console.log(
        `📑 TOC entries: ${toc.length}`
    );


    console.log(
        `🖼️ Cover URL: ${coverImage}`
    );


    /* =====================================================
       RESULT
    ===================================================== */

    return {

        title,

        author,

        description,

        category:
            "Fiction",

        coverImage,

        source:
            "Standard Ebooks",

        sourceUrl:
            `https://standardebooks.org/ebooks/${repo.split("_")[0]}/${repo.substring(repo.indexOf("_") + 1)}`,

        githubRepository:
            `https://github.com/${ORG}/${repo}`,

        rightsStatus:
            "allowed",

        toc,

        chapters,

        contentVersion:
            5

    };

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    refreshCatalog,

    getCatalog,

    searchBooks,

    downloadZip,

    extractBook

};