// The consent to load from Google Fonts. The fonts of Google load from
// Google's servers, which see the IP address of the visitor: no request goes
// to Google before the visitor starts the app on the start page, where a note
// says so. Libre families load from this site and do not wait.

let grant!: () => void;

/** Resolves when the visitor has started the app (see allowGoogle). */
export const googleAllowed = new Promise<void>((resolve) => { grant = resolve; });

/** Lets requests to Google Fonts go out. */
export const allowGoogle = () => grant();

/** fetch for URLs of Google Fonts: waits for the consent. */
export const fetchGoogle = (url: string) => googleAllowed.then(() => fetch(url));
