//! The note's assistant.
//!
//! Everything here runs in Rust for the reason the rest of this crate does:
//! the webview never touches the network. Its content policy is
//! `default-src 'self'` with `connect-src` limited to itself and the IPC
//! bridge, and the capability file grants no HTTP permission at all — so a
//! `fetch` from the window would not merely be discouraged, it would be
//! refused. The window sends a question over the bridge and receives frames
//! back as events; it never holds a token and never learns an address.
//!
//! The model is not asked directly either. A key compiled into a downloadable
//! binary is a key everybody has, so the request goes to the site the person
//! is already signed in to, carrying the same access token sync uses. The key
//! stays where it already was.
//!
//! What comes back is a stream of frames, and two of them do something:
//! `note` changes what is written, and `artefact` is a document to be made.
//! An artefact is written into the file queue like any dropped file and
//! reaches the account on the next round — which is deliberate. Writing a
//! `projects` row from here would mean resolving a workspace id, and this
//! app has never had one; getting that wrong makes duplicate workspaces per
//! machine, which is a data-integrity bug with no clean repair. The web app
//! already knows how to make a project, and picks the artefact up there.

pub mod commands;

use std::sync::Mutex;

/// One question at a time.
///
/// Not a rate limit — the site has one of those, and it is the one that
/// matters because it is the one guarding the spend. This is a guard against
/// the window asking twice because somebody pressed the button twice, which
/// would interleave two answers into one transcript.
#[derive(Default)]
pub struct Assistant(pub Mutex<Busy>);

#[derive(Default)]
pub struct Busy {
    /// The session id currently in flight, if any.
    pub session: Option<String>,
}

/// A frame on its way to the window.
///
/// The names match the web app's own AI wire format on purpose, so the two
/// read loops are the same loop and cannot drift apart.
pub const FRAME_EVENT: &str = "assistant:frame";

/// What a file looks like to the model: a name, a type, a size, and its text
/// if it has any.
#[derive(serde::Serialize)]
pub struct FileForModel {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub bytes: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// How much of one file's text is worth sending.
///
/// A spreadsheet's first few thousand rows say what its columns are and what
/// the numbers look like, which is what an analysis needs. Sending all of a
/// 8 MB CSV would cost more than the answer is worth and would be refused by
/// the endpoint's own body cap anyway.
const TEXT_BUDGET: usize = 60_000;

/// Whether this file's bytes are worth trying to read as words.
///
/// Mirrors the extension map in `lib.rs` rather than guessing: those are the
/// only mimes this app ever assigns, and an empty string — which is what it
/// assigns to anything unrecognised — is honestly unknown, so its bytes are
/// sniffed instead.
fn looks_like_text(mime: &str, name: &str) -> bool {
    if mime.starts_with("text/") {
        return true;
    }
    if matches!(
        mime,
        "application/json" | "application/xml" | "application/csv"
    ) {
        return true;
    }
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    matches!(
        ext.as_str(),
        "txt" | "md" | "csv" | "tsv" | "json" | "xml" | "yml" | "yaml" | "log" | "rtf"
    )
}

/// The text of a file, if it has any that can be read.
///
/// Lossy on purpose: a CSV exported from a spreadsheet on Windows is full of
/// bytes that are not valid UTF-8, and refusing to read it because of one
/// smart quote would be refusing the exact file people most want analysed.
/// What is not done is pretending: a PDF's bytes decode to noise, so PDFs are
/// not offered as text at all and the model is told so.
pub fn text_of(file: &crate::store::files::DroppedFile) -> Option<String> {
    if !looks_like_text(&file.mime, &file.name) {
        return None;
    }
    let end = file.content.len().min(TEXT_BUDGET);
    // Never split a multi-byte character: walk back to a boundary.
    let mut cut = end;
    while cut > 0 && !file.content.is_char_boundary_at(cut) {
        cut -= 1;
    }
    let text = String::from_utf8_lossy(&file.content[..cut]).into_owned();
    if text.trim().is_empty() {
        return None;
    }
    Some(if file.content.len() > cut {
        format!("{text}\n… (truncated; the file is longer)")
    } else {
        text
    })
}

/// `str::is_char_boundary` for a byte slice we have not yet decoded.
trait Boundary {
    fn is_char_boundary_at(&self, index: usize) -> bool;
}

impl Boundary for Vec<u8> {
    fn is_char_boundary_at(&self, index: usize) -> bool {
        // A continuation byte is 0b10xxxxxx; anything else starts a
        // character, and the end of the slice is always a boundary.
        index >= self.len() || (self[index] & 0xC0) != 0x80
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::files::DroppedFile;

    fn file(name: &str, mime: &str, content: Vec<u8>) -> DroppedFile {
        DroppedFile {
            id: "abcdefghij".into(),
            name: name.into(),
            mime: mime.into(),
            content,
            updated_at: 1,
        }
    }

    #[test]
    fn text_files_offer_their_words() {
        let f = file("notes.txt", "text/plain", b"hello there".to_vec());
        assert_eq!(text_of(&f).as_deref(), Some("hello there"));
    }

    #[test]
    fn a_csv_is_text_even_when_the_mime_is_empty() {
        // The desktop assigns "" to anything its extension map does not
        // know, so the extension has to be able to answer on its own.
        let f = file("sales.csv", "", b"a,b\n1,2".to_vec());
        assert!(text_of(&f).is_some());
    }

    #[test]
    fn a_pdf_is_not_offered_as_text() {
        let f = file("brief.pdf", "application/pdf", b"%PDF-1.4 binary".to_vec());
        assert!(text_of(&f).is_none());
    }

    #[test]
    fn an_empty_file_offers_nothing() {
        let f = file("blank.txt", "text/plain", b"   \n  ".to_vec());
        assert!(text_of(&f).is_none());
    }

    #[test]
    fn invalid_utf8_is_read_rather_than_refused() {
        // A CSV out of Excel, with one byte that is not valid UTF-8.
        let f = file("x.csv", "text/csv", vec![b'a', b',', 0xFF, b'\n', b'1']);
        let text = text_of(&f).expect("a mostly-readable file should be read");
        assert!(text.starts_with("a,"));
    }

    #[test]
    fn a_long_file_is_cut_at_a_character_boundary() {
        // Two-byte characters, so a naive cut lands mid-character.
        let content = "é".repeat(TEXT_BUDGET).into_bytes();
        let f = file("long.txt", "text/plain", content);
        let text = text_of(&f).expect("a long file is still readable");
        assert!(text.ends_with("(truncated; the file is longer)"));
        // The give-away for a bad cut is the replacement character.
        assert!(!text.contains('\u{FFFD}'));
    }
}
