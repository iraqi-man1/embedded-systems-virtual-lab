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
          part
        ),
      )}
    </>
  );
}
