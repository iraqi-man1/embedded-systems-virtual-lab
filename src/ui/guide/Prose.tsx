/** Latin terms joined by a hyphen, slash or dash ("Pull-up/Pull-down", "GP26–GP28", "1.8–5.5"). */
const COMPOUND = /([A-Za-z0-9][A-Za-z0-9.+]*(?:[-/–][A-Za-z0-9][A-Za-z0-9.+]*)+)/;
const ARABIC = /[؀-ۿ]/;

/** In Arabic text a compound Latin term stays in one piece, left to right (it must not wrap at its hyphen). */
function Plain({ text }: { text: string }) {
  if (!ARABIC.test(text)) return <>{text}</>;
  return (
    <>
      {text.split(COMPOUND).map((part, i) =>
        i % 2 ? (
          <span key={i} className="ltr nobr">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Guide text: `code` between backticks is shown as code, kept left-to-right inside Arabic. */
export function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) =>
        i % 2 ? (
          <code key={i} className="ltr inline-code">
            {part}
          </code>
        ) : (
          <Plain key={i} text={part} />
        ),
      )}
    </>
  );
}
