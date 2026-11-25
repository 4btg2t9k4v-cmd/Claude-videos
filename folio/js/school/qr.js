// QR code reading for the Pronote login: live camera, or a photo / screenshot.
import { h, sheet, pickFile, loadImage, readFileAs } from '../util.js';

class QRError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
let jsqr;
const decoder = async () => (jsqr ||= (await import('../../vendor/jsqr.mjs')).default);

async function decodeCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const read = await decoder();
  return read(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || null;
}

/** Opens the camera and resolves with the text of the first QR code it sees. */
export function scanQR() {
  return new Promise(async (resolve, reject) => {
    if (!navigator.mediaDevices?.getUserMedia) { reject(new QRError('camera', 'This browser can’t use the camera. Use a photo or screenshot of the QR code instead.')); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    } catch {
      reject(new QRError('camera', 'The camera isn’t available. Allow camera access, or use a photo or screenshot of the QR code.'));
      return;
    }
    const video = h('video', { playsinline: true, muted: true, style: { width: '100%', borderRadius: '12px', background: '#000', aspectRatio: '1', objectFit: 'cover' } });
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    const canvas = document.createElement('canvas');
    let done = false;
    const stop = () => { done = true; stream.getTracks().forEach((t) => t.stop()); };
    const s = sheet({
      title: 'Scan the Pronote QR code',
      body: h('div', video, h('p.muted', { style: { textAlign: 'center', margin: '10px 0 0' } }, 'Point the camera at the QR code on the computer screen.')),
      onClose: () => { if (!done) { stop(); reject(new QRError('cancelled', 'Cancelled')); } },
    });
    await video.play().catch(() => {});
    const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    const tick = async () => {
      if (done) return;
      if (video.videoWidth) {
        let text = null;
        try {
          if (detector) text = (await detector.detect(video))[0]?.rawValue || null;
          else {
            const size = Math.min(video.videoWidth, video.videoHeight, 900);
            canvas.width = size; canvas.height = size;
            const sx = (video.videoWidth - Math.min(video.videoWidth, video.videoHeight)) / 2;
            const sy = (video.videoHeight - Math.min(video.videoWidth, video.videoHeight)) / 2;
            const side = Math.min(video.videoWidth, video.videoHeight);
            canvas.getContext('2d').drawImage(video, sx, sy, side, side, 0, 0, size, size);
            text = await decodeCanvas(canvas);
          }
        } catch { /* keep trying */ }
        if (text) { stop(); s.close(); resolve(text); return; }
      }
      setTimeout(tick, 180);
    };
    tick();
  });
}

/** Lets the student pick a photo or screenshot of the QR code. */
export async function qrFromImage() {
  const file = await pickFile('image/*');
  if (!file) throw new QRError('cancelled', 'Cancelled');
  const img = await loadImage(await readFileAs(file));
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const text = await decodeCanvas(canvas);
  if (!text) throw new QRError('notfound', 'No QR code found in that picture. Try a sharper photo or a screenshot.');
  return text;
}
