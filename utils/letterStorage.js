/**
 * Letter PDF upload / download helpers (Cloudinary).
 * PDFs should be uploaded as image + format=pdf (Cloudinary recommended).
 */

const sanitizeFilename = (name) => {
  const base = String(name || 'letter')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return base || 'letter';
};

/**
 * Force browser download via Cloudinary fl_attachment.
 * Works for /image/upload/ and /raw/upload/ delivery URLs.
 */
const toDownloadUrl = (fileUrl, filename) => {
  const url = String(fileUrl || '').trim();
  if (!url) return '';
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return url;
  }
  if (url.includes('fl_attachment')) return url;

  const safe = sanitizeFilename(filename);
  return url.replace('/upload/', `/upload/fl_attachment:${safe}/`);
};

const ensurePdfFilename = (name) => {
  const raw = String(name || 'letter.pdf').trim() || 'letter.pdf';
  return /\.pdf$/i.test(raw) ? raw : `${raw}.pdf`;
};

module.exports = {
  sanitizeFilename,
  toDownloadUrl,
  ensurePdfFilename,
};
