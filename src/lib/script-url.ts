/** Keep query-route spelling and custom parameters intact when adding a build version. */
export function withScriptVersion(url: string, version?: string) {
  if (!version) return url;
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex < 0 ? '' : url.slice(hashIndex);
  const source = hashIndex < 0 ? url : url.slice(0, hashIndex);
  const queryIndex = source.indexOf('?');
  const pathname = queryIndex < 0 ? source : source.slice(0, queryIndex);
  const query = queryIndex < 0 ? '' : source.slice(queryIndex + 1);
  const parameters = (query ? query.split('&') : []).filter(parameter => {
    try {
      return decodeURIComponent(parameter.split('=', 1)[0]) !== 'v';
    } catch {
      return true;
    }
  });
  parameters.push(`v=${encodeURIComponent(version)}`);
  return `${pathname}?${parameters.join('&')}${fragment}`;
}
