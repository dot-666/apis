const { fetch } = require('undici');
const cheerio = require('cheerio');
const url = require('url');

const BASE_URL = 'https://dadaya.co.zw';

// Mapping of category names to URLs on dadaya.co.zw
const CATEGORY_URLS = {
    'Form 1': 'https://dadaya.co.zw/dadaya-form-1-library/',
    'Form 2': 'https://dadaya.co.zw/form-2-library/',
    'Form 3': 'https://dadaya.co.zw/library/',
    'O Level Combined Science': 'https://dadaya.co.zw/o-level-combined-science/',
    'O Level English': 'https://dadaya.co.zw/o-level-english/',
    'O Level Biology': 'https://dadaya.co.zw/o-level-biology/',
    'O Level Mathematics': 'https://dadaya.co.zw/o-level-mathematics/',
    'O Level Geography': 'https://dadaya.co.zw/o-level-geography/',
    'O Level Chemistry': 'https://dadaya.co.zw/o-level-chemistry/',
    'A Level Mathematics & Science': 'https://dadaya.co.zw/advanced-level-2/mathematics/',
    'Library': 'https://dadaya.co.zw/library/'
};

module.exports = {
    name: 'High School Edu',
    desc: 'Get educational pdfs',
    category: 'Education',
    params: ['category'], // optional: scrape specified category only
    async run(req, res) {
        try {
            const { category } = req.query;
            let categoriesToScrape;

            if (category) {
                // Case-insensitive match category key
                const matchedKey = Object.keys(CATEGORY_URLS).find(
                    key => key.toLowerCase() === category.toLowerCase()
                );
                if (!matchedKey) {
                    return res.status(400).json({
                        status: false,
                        error: `Unknown category '${category}'. Available categories: ${Object.keys(CATEGORY_URLS).join(', ')}`
                    });
                }
                categoriesToScrape = { [matchedKey]: CATEGORY_URLS[matchedKey] };
            } else {
                categoriesToScrape = CATEGORY_URLS;
            }

            const results = [];
            for (const [cat, catUrl] of Object.entries(categoriesToScrape)) {
                const pdfs = await scrapeCategory(cat, catUrl);
                results.push(...pdfs);
            }

            return res.status(200).json({
                status: true,
                category: category || 'All',
                count: results.length,
                pdfs: results
            });

        } catch (error) {
            console.error('DadayaPDFScraper Error:', error.message);
            return res.status(500).json({
                status: false,
                error: 'Internal Server Error'
            });
        }
    }
};

async function scrapeCategory(category, categoryUrl) {
    const res = await fetch(categoryUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; dadaya-pdf-scraper/1.0)'
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch ${categoryUrl}: ${res.statusText}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const pdfs = [];

    $('a').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href && href.toLowerCase().endsWith('.pdf')) {
            const fullUrl = url.resolve(BASE_URL, href);
            const title = $(elem).text().trim() || 'Untitled PDF';
            pdfs.push({ title, url: fullUrl, category });
        }
    });

    return pdfs;
}
