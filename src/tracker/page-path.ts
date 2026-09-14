const TRACKING_PARAMETER =
  /^(umami-editor|utm_.+|gclid|dclid|fbclid|msclkid|twclid|ttclid|yclid|gbraid|wbraid|igshid|_ga|_gl)$/i;

function removeTrackingParameters(search: string) {
  // Keep the original spelling: PHP-style routes such as ?products/ have no equals sign.
  const parameters = search
    .replace(/^\?/, '')
    .split('&')
    .filter(parameter => {
      const key = parameter.split('=', 1)[0];

      try {
        return !TRACKING_PARAMETER.test(decodeURIComponent(key.replace(/\+/g, ' ')));
      } catch {
        return true;
      }
    });
  const query = parameters.filter(Boolean).join('&');

  return query ? `?${query}` : '';
}

/** Identifies a recorded page without collapsing query-based or hash-based routes. */
export function getRecorderPagePath(href: unknown): string | null {
  if (typeof href !== 'string' || !href || !/^(https?:\/\/|\/|\?|#)/i.test(href)) {
    return null;
  }

  try {
    const url = new URL(href, 'https://recorder.invalid');
    const hashIndex = url.hash.indexOf('?');
    const hash =
      hashIndex < 0
        ? url.hash
        : url.hash.slice(0, hashIndex) + removeTrackingParameters(url.hash.slice(hashIndex));

    return `${url.pathname || '/'}${removeTrackingParameters(url.search)}${hash}`;
  } catch {
    return null;
  }
}
