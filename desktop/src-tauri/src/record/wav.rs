//! 16 kHz mono 16-bit PCM, in a WAV container.
//!
//! The same format `src/lib/audio/wav.ts` produces in the browser, for the
//! same reason: `/api/listen` accepts one shape of audio, and a server that
//! accepts a moving target fails as a transcript that quietly never arrives.
//! Two encoders exist because there are two capture paths — a browser tab and
//! this window — and neither can call the other.
//!
//! Deliberately not a crate. This is a header of forty-four bytes and a loop,
//! it has not changed since 1991, and the release profile is tuned for size.

/// What a recogniser is trained at. Above 8 kHz there is almost no phonetic
/// information, so 48 kHz would be three times the bytes for nothing.
pub const HZ: u32 = 16_000;

/// Average every channel into one.
///
/// Not "take the first channel", which is the shorter version of this and is
/// wrong on any recording where the speaker sits to the right of a laptop with
/// two microphones.
pub fn to_mono(interleaved: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return interleaved.to_vec();
    }
    let channels = channels as usize;
    interleaved
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect()
}

/// Linear interpolation down to `HZ`.
///
/// A windowed-sinc resampler is better and it is not better here: the aliasing
/// it avoids lives above 8 kHz, which is exactly the band being discarded.
/// What matters is that this has no dependency and cannot fail on a device
/// rate it has not seen — and microphones report all sorts, 44100 and 48000
/// most often but 32000 and 16000 too.
pub fn resample(input: &[f32], from: u32) -> Vec<f32> {
    if from == HZ || input.is_empty() {
        return input.to_vec();
    }
    let ratio = from as f64 / HZ as f64;
    let length = ((input.len() as f64) / ratio).floor().max(1.0) as usize;
    (0..length)
        .map(|i| {
            let at = i as f64 * ratio;
            let low = at.floor() as usize;
            let high = (low + 1).min(input.len() - 1);
            let part = (at - low as f64) as f32;
            input[low] * (1.0 - part) + input[high] * part
        })
        .collect()
}

/// The loudest sample, 0..1.
///
/// This number is why the route can refuse to be lied to. A model handed
/// silence does not say "I heard nothing" — it writes a plausible meeting —
/// and this is arithmetic over samples that the model never sees and cannot
/// talk its way around. See the note at the top of `src/app/api/listen/route.ts`.
pub fn peak(samples: &[f32]) -> f32 {
    samples
        .iter()
        .fold(0.0_f32, |loudest, s| loudest.max(s.abs()))
        .min(1.0)
}

/// Forty-four bytes of header, then the samples.
pub fn encode(samples: &[f32]) -> Vec<u8> {
    let data_bytes = samples.len() * 2;
    let mut out = Vec::with_capacity(44 + data_bytes);

    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&((36 + data_bytes) as u32).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // PCM header length
    out.extend_from_slice(&1u16.to_le_bytes()); // uncompressed
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&HZ.to_le_bytes());
    out.extend_from_slice(&(HZ * 2).to_le_bytes()); // bytes per second
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(data_bytes as u32).to_le_bytes());

    for sample in samples {
        // Clamped before scaling: a decoded overshoot of 1.2 scaled and
        // truncated wraps to a large negative, which is an audible click, and
        // a recogniser hears a click as a consonant.
        let clamped = sample.clamp(-1.0, 1.0);
        out.extend_from_slice(&((clamped * 32767.0) as i16).to_le_bytes());
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_header_says_what_the_body_is() {
        let wav = encode(&[0.0; 100]);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(wav.len(), 44 + 200);
        // Channels, rate and bit depth, read back out of the bytes rather than
        // out of the constants that wrote them.
        assert_eq!(u16::from_le_bytes([wav[22], wav[23]]), 1);
        assert_eq!(u32::from_le_bytes([wav[24], wav[25], wav[26], wav[27]]), HZ);
        assert_eq!(u16::from_le_bytes([wav[34], wav[35]]), 16);
    }

    #[test]
    fn resampling_lands_on_the_right_length() {
        // One second at 48 kHz is one second at 16 kHz.
        assert_eq!(resample(&vec![0.0; 48_000], 48_000).len(), 16_000);
        assert_eq!(resample(&vec![0.0; 44_100], 44_100).len(), 16_000);
        // A device already at the target rate is left alone, byte for byte.
        assert_eq!(resample(&vec![0.5; 1_000], HZ).len(), 1_000);
    }

    #[test]
    fn both_channels_are_heard() {
        // Somebody on the right of a laptop: silence on the left channel.
        // Taking the first channel would report an empty room.
        let interleaved = vec![0.0, 0.8, 0.0, 0.8];
        let mono = to_mono(&interleaved, 2);
        assert_eq!(mono, vec![0.4, 0.4]);
        assert!(peak(&mono) > 0.3, "a speaker on one side would be dropped");
    }

    #[test]
    fn a_loud_sample_cannot_wrap_to_a_quiet_one() {
        // A decoder handing back 1.4 must not become a large negative.
        let wav = encode(&[1.4]);
        let sample = i16::from_le_bytes([wav[44], wav[45]]);
        assert!(sample > 32_000, "overshoot wrapped: {sample}");
    }

    #[test]
    fn silence_measures_as_silence() {
        assert_eq!(peak(&[0.0; 50]), 0.0);
        assert!(peak(&[0.0, -0.6, 0.2]) > 0.59);
    }
}
