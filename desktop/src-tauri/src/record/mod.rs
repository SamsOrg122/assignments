//! Recording a conversation from the bar.
//!
//! ── WHY THE MICROPHONE IS HERE AND NOT IN THE WINDOW ─────────────────────
//!
//! The system webview has `MediaRecorder` and `getUserMedia` — measured, not
//! assumed; see docs/desktop.md — so capturing inside the window looked like
//! the short way round. Two things rule it out, and only the first is obvious.
//!
//! The window's content policy is `default-src 'self'; connect-src 'self' ipc:`
//! with no exceptions, and `config_check.rs::the_webview_can_only_reach_what_it_needs`
//! asserts there is no wildcard in it. Audio captured in the webview could not
//! be *sent* anywhere without widening that policy, and the policy is worth
//! more than the convenience: it is the reason a bug in this window cannot
//! exfiltrate anything at all.
//!
//! The second is worse because it is silent. wry connects no
//! `permission-request` handler on WebKitGTK, so what `getUserMedia` does
//! there on a machine with a real microphone is unverified — with a credible
//! report that the promise simply never settles. A hang is not a throw: a
//! `try/catch` around it never fires, and the bar would sit saying
//! "starting…" forever with no error to show.
//!
//! cpal talks to ALSA, CoreAudio and WASAPI directly. The audio never enters
//! JavaScript, which is the same architecture `assistant/mod.rs` already uses
//! for the model and for the same reason: *"the window never holds a token and
//! never learns an address"*.
//!
//! ── AND WHY IT CANNOT INVENT A MEETING ───────────────────────────────────
//!
//! `desktop/eslint.config.mjs` forbids anything here importing the web app's
//! speech module, because that module falls back to a provider which does not
//! transcribe but *recites* — a scripted monologue with invented figures. This
//! module is the reason that ban costs nothing: it posts real audio to
//! `/api/listen`, with the peak measured from the samples themselves, and that
//! route drops anything a model returns that the arithmetic contradicts.
//!
//! Nothing here ever writes text it did not receive from that route.

pub mod commands;
pub mod wav;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;

/// How much speech goes in one request.
///
/// The same thirty seconds `lib/speech/server.ts` uses, and the trade is the
/// same: shorter keeps up with the speaker but gives the recogniser less
/// context to disambiguate with; longer is cheaper, more accurate and further
/// behind. Half a minute is about a paragraph of speech.
const SLICE_SECS: u64 = 30;

/// A slice this quiet had nobody talking into it, so it is never sent.
///
/// The route applies the same floor. Both exist: this one saves the upload and
/// the round trip, that one is the one that cannot be bypassed by a client.
const SILENCE: f32 = 0.02;

/// Longer than the note's, because an hour of speech is a large prompt.
const READ_BACK_SECS: u64 = 180;

/// What the window is told while this runs.
pub const HEARD_EVENT: &str = "record:heard";
pub const LEVEL_EVENT: &str = "record:level";
pub const PROBLEM_EVENT: &str = "record:problem";
pub const DONE_EVENT: &str = "record:done";

/// The live recording, or nothing.
///
/// Tauri-managed, so `record_stop` reaches the same one `record_start` made.
#[derive(Default)]
pub struct Recorder(pub Mutex<Option<Live>>);

pub struct Live {
    /// Set to stop both the audio thread and the slicing task.
    pub stop: Arc<AtomicBool>,
    /// Samples as the device gives them: interleaved, at the device's rate.
    pub buffer: Arc<Mutex<Vec<f32>>>,
    pub rate: u32,
    pub channels: u16,
    /// Everything heard so far, in order.
    pub heard: Arc<Mutex<String>>,
    pub started: i64,
}

#[derive(Serialize, Clone)]
pub struct Done {
    /// The document that was made, or none when nothing was said.
    pub name: Option<String>,
    pub words: usize,
    pub seconds: i64,
    /// Said out loud rather than hidden — see `stop`.
    pub note: String,
}

/// Open the microphone and keep the samples coming.
///
/// The cpal `Stream` is not `Send` on every platform, so it cannot be stored
/// in state that crosses threads. It lives on its own thread instead, which
/// builds it, plays it, and then parks until `stop` is set — the standard
/// shape, and the reason this function returns the description of a stream
/// rather than the stream itself.
fn open(buffer: Arc<Mutex<Vec<f32>>>, stop: Arc<AtomicBool>) -> Result<(u32, u16), String> {
    let (ready, answer) = std::sync::mpsc::channel::<Result<(u32, u16), String>>();

    std::thread::spawn(move || {
        let host = cpal::default_host();
        let Some(device) = host.default_input_device() else {
            let _ = ready.send(Err(
                "No microphone. Plug one in, or check this machine's sound settings.".into(),
            ));
            return;
        };
        let config = match device.default_input_config() {
            Ok(config) => config,
            Err(error) => {
                let _ = ready.send(Err(format!("The microphone refused to open: {error}")));
                return;
            }
        };

        let rate = config.sample_rate().0;
        let channels = config.channels();
        let keeping = buffer.clone();

        let stream = device.build_input_stream(
            &config.config(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                // The audio callback runs on a real-time thread: it appends
                // and returns. Everything expensive — mixing, resampling,
                // encoding, the network — happens in the slicing task.
                if let Ok(mut held) = keeping.lock() {
                    held.extend_from_slice(data);
                }
            },
            move |error| eprintln!("Tougather: microphone dropped out: {error}"),
            None,
        );

        let stream = match stream {
            Ok(stream) => stream,
            Err(error) => {
                let _ = ready.send(Err(format!("Could not start recording: {error}")));
                return;
            }
        };
        if let Err(error) = stream.play() {
            let _ = ready.send(Err(format!("Could not start recording: {error}")));
            return;
        }

        let _ = ready.send(Ok((rate, channels)));

        // The stream stops when it is dropped, so this thread has to outlive
        // the recording. Parked rather than spinning.
        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(120));
        }
        drop(stream);
    });

    answer
        .recv_timeout(std::time::Duration::from_secs(8))
        .map_err(|_| "The microphone did not answer. Nothing was recorded.".to_string())?
}

/// Take everything captured so far, and leave the buffer empty.
fn drain(live: &Live) -> Vec<f32> {
    let mut held = match live.buffer.lock() {
        Ok(held) => held,
        Err(poisoned) => poisoned.into_inner(),
    };
    std::mem::take(&mut held)
}

/// One slice: mix, resample, measure, and ask the server what was said.
///
/// Returns the words, or an empty string for silence. The peak goes with the
/// audio because the route treats it as the fact that outranks anything the
/// model claims.
async fn hear(
    client: &reqwest::Client,
    site: &str,
    token: &str,
    raw: &[f32],
    rate: u32,
    channels: u16,
    before: &str,
) -> Result<String, String> {
    use base64::Engine as _;

    let mono = wav::to_mono(raw, channels);
    let samples = wav::resample(&mono, rate);
    let seconds = samples.len() as f64 / wav::HZ as f64;
    let loudest = wav::peak(&samples);

    if seconds < 0.4 || loudest < SILENCE {
        return Ok(String::new());
    }

    let audio = base64::engine::general_purpose::STANDARD.encode(wav::encode(&samples));

    let response = client
        .post(format!("{}/api/listen", site.trim_end_matches('/')))
        .bearer_auth(token)
        .json(&serde_json::json!({
            "audio": audio,
            "seconds": seconds,
            "peak": loudest,
            "before": before.chars().rev().take(240).collect::<String>()
                .chars().rev().collect::<String>(),
        }))
        .send()
        .await
        .map_err(|e| format!("Could not reach the site: {e}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "The site answered with something unreadable.".to_string())?;

    if !status.is_success() {
        return Err(body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("The site could not read that.")
            .to_string());
    }

    if body.get("speech").and_then(|v| v.as_bool()) == Some(false) {
        return Ok(String::new());
    }
    Ok(body
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

/// Ask the site to read the whole thing back: a title, a summary, the points.
///
/// This is `/api/transcript`, unchanged and already tested — the endpoint that
/// checks every quoted fact really appears in the transcript before it passes
/// it on. Nothing about the reading is done here, on purpose: a second
/// implementation of "what did this meeting decide" would drift from the first
/// and only one of them would be the one with the quote check in it.
async fn read_back(
    client: &reqwest::Client,
    site: &str,
    token: &str,
    text: &str,
    today: &str,
) -> Result<serde_json::Value, String> {
    let response = client
        .post(format!("{}/api/transcript", site.trim_end_matches('/')))
        .bearer_auth(token)
        .json(&serde_json::json!({ "text": text, "today": today }))
        .timeout(std::time::Duration::from_secs(READ_BACK_SECS))
        .send()
        .await
        .map_err(|e| format!("Could not reach the site: {e}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "The site answered with something unreadable.".to_string())?;

    if !status.is_success() {
        return Err(body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("The site could not read that back.")
            .to_string());
    }
    Ok(body)
}

/// Today, as the *speaker's* day rather than the server's.
///
/// `/api/transcript` requires this and refuses without it, and its own comment
/// says why: a meeting recorded at 00:30 in Amsterdam happens on a date UTC has
/// not reached yet, so every "tomorrow" in it would resolve one day early.
fn today_here() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (year, month, day) = crate::sync::civil_from_days(now.div_euclid(86_400));
    format!("{year:04}-{month:02}-{day:02}")
}
