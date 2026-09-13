import type { Signal } from './shared';
export function validateSignal(value: unknown, direction: 'host' | 'viewer'): value is Signal {
  if (!value || typeof value !== 'object') return false;
  const v = value as Signal;
  if (v.type === 'restart') return direction === 'viewer';
  if (v.type === 'offer' || v.type === 'answer') {
    if (!Number.isSafeInteger(v.negotiation) || v.negotiation! < 1) return false;
    const d = v.data as RTCSessionDescriptionInit;
    return v.type === (direction === 'host' ? 'offer' : 'answer') && !!d && d.type === v.type && typeof d.sdp === 'string' && d.sdp.length < 100_000;
  }
  if (v.type === 'candidate') {
    if (!Number.isSafeInteger(v.negotiation) || v.negotiation! < 1) return false;
    const c = v.data as RTCIceCandidateInit;
    return !!c && typeof c.candidate === 'string' && c.candidate.length < 4096 &&
      (c.sdpMid == null || typeof c.sdpMid === 'string') && (c.sdpMLineIndex == null || Number.isInteger(c.sdpMLineIndex));
  }
  if (v.type === 'stats') return direction === 'viewer' && !!v.data && typeof v.data === 'object' && JSON.stringify(v.data).length < 4096;
  return false;
}
