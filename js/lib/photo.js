/**
 * Turning a pasted link into something an <img> can actually load.
 *
 * The links people have to hand are share links, not image links. A Google
 * Drive "share" URL points at a *viewer page* — HTML, not a JPEG — so putting
 * it in an <img> produces a broken image every time. Drive does expose a
 * direct endpoint for the same file; this rewrites to it.
 *
 * Anything unrecognised is passed through untouched.
 */

export function photoSrc(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // https://drive.google.com/open?id=FILE_ID
  // https://drive.google.com/uc?export=view&id=FILE_ID
  const drive = raw.match(
    /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^&]*&)*id=|thumbnail\?(?:[^&]*&)*id=)([\w-]{10,})/,
  );
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w600`;

  // Dropbox share links serve a preview page unless asked for the raw file.
  if (/dropbox\.com/.test(raw)) {
    return raw.replace(/[?&]dl=\d/, "").concat(raw.includes("?") ? "&raw=1" : "?raw=1");
  }

  return raw;
}

/**
 * True when a link will *never* load as an image, so the member form can say
 * so at the moment it is pasted rather than leaving a silent broken avatar.
 */
export function photoWarning(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    return "That doesn’t look like a web address — it should start with https://";
  }
  if (/drive\.google\.com\/drive\/folders/.test(raw)) {
    return "That’s a link to a Drive folder, not to a single image.";
  }
  if (/photos\.app\.goo\.gl|photos\.google\.com/.test(raw)) {
    return (
      "Google Photos share links can’t be used as image addresses. Put the photo in Google Drive " +
      "instead, share it as “Anyone with the link”, and paste that link."
    );
  }
  if (/drive\.google\.com/.test(raw)) {
    return (
      "Drive links work, but only if the file is shared as “Anyone with the link → Viewer”. " +
      "Otherwise it will show initials instead."
    );
  }
  return null;
}
