/**
 * What Drop says when you press it rather than drag onto it.
 *
 * Pressing this slot cannot open a file picker, and the reason is worth
 * writing down because "add a file dialog" is the obvious next thought. The
 * webview holds four permissions — dragging, listening for events, and the
 * two halves of the event bus — and a dialog plugin would be a fifth, guarded
 * by a test whose whole job is to make widening that list loud. Dropping needs
 * none of it: the OS hands Rust the paths natively, which is why this has
 * worked since the drop target was built.
 *
 * So the sheet is not a control. It is the answer to "what is this for and
 * where did my file go", which is the question somebody who just dragged
 * something onto a strip of screen actually has.
 */

export function DropSheet({ waiting }: { waiting: number }) {
  return (
    <div className="sheet">
      <h2>Drop</h2>
      <p>
        Drag a file onto the bar — a PDF, a screenshot, a photo of a whiteboard.
        It is kept on this computer first and sent up when there is a
        connection, so dropping something with the wifi off is not a lost file.
      </p>
      <p className="quiet">
        It lands in your library under <strong>From your desktop</strong>, where
        you can use it in a document.
      </p>
      <p className="quiet">
        {waiting === 0
          ? "Nothing waiting to be sent."
          : waiting === 1
            ? "1 file still waiting to be sent."
            : `${waiting} files still waiting to be sent.`}
      </p>
      {/*
        * The size limit is stated before it is hit rather than after.
        *
        * `store/files.rs` refuses above 8 MB with a written message, and that
        * refusal is correct — but a person who has just dragged a 40 MB video
        * onto a bar and been told "no" has already lost the ten seconds it
        * took. Saying it here costs one line.
        */}
      <p className="quiet">Up to 8 MB each. Bigger files are refused, and say so.</p>
    </div>
  );
}
