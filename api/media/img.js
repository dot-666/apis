const gis = require('g-i-s');

module.exports = {
    name: 'Img',
    desc: 'Search for Google Images',
    category: 'Downloader',
    params: ['apikey','text'],
    async run(req, res) {
        try {
            const { text } = req.query;
            if (!text) return res.status(400).json({ status: false, error: 'Text is required' });

            gis(text, (error, results) => {
                if (error) {
                    return res.status(500).json({ status: false, error: error.message });
                }

                if (!results || results.length === 0) {
                    return res.status(404).json({ status: false, error: 'No results found' });
                }

                res.status(200).json({
                    status: true,
                    result: {
                        query: text,
                        topImage: results[0].url,
                        all: results.map(img => img.url)
                    }
                });
            });
        } catch (err) {
            res.status(500).json({ status: false, error: err.message });
        }
    }
};
