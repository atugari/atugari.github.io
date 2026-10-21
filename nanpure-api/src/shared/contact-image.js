// Only small raster images are accepted. URLs, SVG and arbitrary files are never stored.
export const maxImageBytes = 600_000;
export function parseContactImage(value) {
    if (!value || typeof value !== 'object')
        return null;
    const { data, source } = value;
    if ((source !== 'capture' && source !== 'upload') || typeof data !== 'string' || data.length > maxImageBytes * 4 / 3 + 50)
        return null;
    const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
    if (!m)
        return null;
    let bytes;
    try {
        if (typeof Uint8Array.fromBase64 === 'function') bytes = Uint8Array.fromBase64(m[2]);
        else { const raw = atob(m[2]); bytes = new Uint8Array(raw.length); for (let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i); }
    }
    catch {
        return null;
    }
    if (bytes.length < 24 || bytes.length > maxImageBytes)
        return null;
    let width = 0, height = 0;
    if (m[1] === 'png') {
        if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR')
            return null;
        const view = new DataView(bytes.buffer);
        width = view.getUint32(16);
        height = view.getUint32(20);
    }
    else {
        if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
            return null;
        for (let p = 2; p + 8 < bytes.length;) {
            if (bytes[p++] !== 255)
                break;
            while (bytes[p] === 255)
                p++;
            const marker = bytes[p++];
            if (marker === 0xda || marker === 0xd9)
                break;
            const len = (bytes[p] << 8) | bytes[p + 1];
            if (len < 2 || p + len > bytes.length)
                break;
            if ([0xc0, 0xc1, 0xc2].includes(marker)) {
                height = (bytes[p + 3] << 8) | bytes[p + 4];
                width = (bytes[p + 5] << 8) | bytes[p + 6];
                break;
            }
            p += len;
        }
    }
    if (width < 1 || height < 1 || width > 1600 || height > 1600)
        return null;
    return { bytes, mime: 'image/' + m[1], source, width, height };
}
