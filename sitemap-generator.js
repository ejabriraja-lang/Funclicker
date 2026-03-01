const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const firebaseKey = JSON.parse(process.env.FIREBASE_KEY);

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(firebaseKey) });
}
const db = admin.firestore();

async function generate() {
    try {
        // تأكد من المسار الصحيح للألعاب في قاعدة بياناتك
        const snapshot = await db.collection('artifacts').doc('gaming-hub-pro')
                                 .collection('public').doc('data')
                                 .collection('games').get();

        const baseUrl = 'https://funclickergame.com';
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        xml += `  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>\n`;

        snapshot.docs.forEach(doc => {
            xml += `  <url><loc>${baseUrl}/game/${doc.data().slug}</loc><priority>0.8</priority></url>\n`;
        });
        xml += `</urlset>`;

        const publicDir = path.join(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
        
        fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), xml);
        console.log("✅ Sitemap.xml generated!");
        process.exit(0);
    } catch (e) { console.error(e); process.exit(1); }
}
generate();
