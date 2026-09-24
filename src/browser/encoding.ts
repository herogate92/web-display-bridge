import type { StreamConfig } from '../shared';

export interface VideoCodec {
  mimeType: string;
  sdpFmtpLine?: string;
}
export interface EncodingSupport { supported: boolean; smooth: boolean; powerEfficient: boolean }
export type EncodingProbe = (configuration: {
  type: 'webrtc';
  video: { contentType: string; width: number; height: number; bitrate: number; framerate: number };
}) => Promise<EncodingSupport>;

const auxiliary = (codec: VideoCodec) => /\/(rtx|red|ulpfec|flexfec-03)$/i.test(codec.mimeType);

/** Query each exact codec/profile. Power efficiency is a preference hint, not proof of GPU use. */
export async function preferHardwareCodecs<T extends VideoCodec>(
  codecs: readonly T[], config: StreamConfig, probe?: EncodingProbe, timeoutMs = 1500
) {
  const results = await Promise.all(codecs.map(async codec => {
    if (!probe || auxiliary(codec)) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        probe({ type: 'webrtc', video: {
          contentType: codec.mimeType + (codec.sdpFmtpLine ? ';' + codec.sdpFmtpLine : ''),
          width: config.width, height: config.height, bitrate: config.bitrate, framerate: config.fps
        } }),
        new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), timeoutMs); })
      ]);
    } catch { return undefined; }
    finally { clearTimeout(timer); }
  }));
  const score = (index: number) => {
    const codec = codecs[index], support = results[index];
    if (auxiliary(codec)) return -100;
    // Chromium's powerEfficient hint reflects its available encoding implementation.
    // Keep H.264 first among equally ranked choices for Safari compatibility.
    return (support?.supported && support.powerEfficient ? 100 : 0)
      + (support?.supported && support.smooth ? 10 : 0)
      + (/\/h264$/i.test(codec.mimeType) ? 2 : /\/vp8$/i.test(codec.mimeType) ? 1 : 0);
  };
  return {
    codecs: codecs.map((codec, index) => ({ codec, index }))
      .sort((a, b) => score(b.index) - score(a.index) || a.index - b.index).map(item => item.codec),
    probes: codecs.filter(codec => !auxiliary(codec)).map(codec => ({
      codec: codec.mimeType, fmtp: codec.sdpFmtpLine ?? '', ...results[codecs.indexOf(codec)]
    }))
  };
}

export type EncoderKind = 'hardware' | 'software' | 'unknown';

/** Only identify implementations we know. A codec name or a power-efficiency hint is not enough. */
export function encoderKind(implementation: unknown): EncoderKind {
  if (typeof implementation !== 'string') return 'unknown';
  const software = /openh264|libvpx|libaom|libsvt|svt-av1|x264|x265|software/i.test(implementation);
  const hardware = /nvenc|nvidia.*encoder|intel.*encoder|quick\s*sync|\bqsv\b|amd.*encoder|\bamf\b|VideoToolbox|VideoEncodeAccelerator/i.test(implementation);
  if (software && hardware) return 'unknown'; // Wrappers may report both implementations.
  return software ? 'software' : hardware ? 'hardware' : 'unknown';
}
