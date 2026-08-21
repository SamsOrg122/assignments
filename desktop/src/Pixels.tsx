/**
 * A little grid of squares that thinks.
 *
 * The status pill's icon: sixteen cells whose opacity ripples across the
 * grid, the same visual language as the loaders this was modelled on. Pure
 * CSS animation — each cell gets a stagger delay from its position — so it
 * costs nothing while idle and respects `prefers-reduced-motion` from the
 * stylesheet without any JS knowing.
 */

export function Pixels({ tone }: { tone: "amber" | "green" | "brass" | "red" }) {
  return (
    <span className={`pixels pixels-${tone}`} aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        return (
          <span
            key={i}
            className="pixel"
            // A diagonal ripple: cells light up along row+col, which reads as
            // motion across the grid rather than a blink.
            style={{ animationDelay: `${(row + col) * 90}ms` }}
          />
        );
      })}
    </span>
  );
}
