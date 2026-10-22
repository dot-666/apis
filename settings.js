module.exports = {
    name: {
        main: 'Supreme Media Apis',
        copyright: 'Supreme(vinpink2)'
    },
    description: 'Integrated API solution for your modern application development needs. Fast, secure, and reliable access.',
    icon: '/image/icon.png',
    author: 'Supreme(vinpink2)',
    info_url: 'https://whatsapp.com/channel/0029Vb5lvXDCMY0EyIW8Yf19',
    links: [
        {
            name: 'WhatsApp Channel',
            url: 'https://whatsapp.com/channel/0029Vb5lvXDCMY0EyIW8Yf19'
        },
        {
            name: 'Change Log',
            url: '/changelog/'  
        }
    ],

    requireApikey: true,
    apikeys: {
        'supreme': { enabled: true, rateLimit: '1000/day' }
    }
};
