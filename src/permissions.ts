/** Only the local control page may capture its already-verified virtual display. */
export function mayRequestPermission(active: boolean, ownContents: boolean, mainFrame: boolean, permission: string, requestingUrl: string | undefined, controlUrl: string, mediaTypes?: readonly string[]) {
  const ownPage = active && ownContents && mainFrame && !!controlUrl && requestingUrl === controlUrl;
  if (!ownPage) return false;
  if (['display-capture', 'local-network', 'local-network-access', 'loopback-network'].includes(permission)) return true;
  // Chromium classifies Electron's selected desktop video stream as `media`.
  // Reject audio explicitly; the display-media handler still pins video to the VDD source.
  return permission === 'media' && !mediaTypes?.includes('audio');
}
