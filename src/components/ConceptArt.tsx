// Abstract template illustrations, never presented as generated output.
export function ConceptArt({ name }: { name: string }) {
  return (
    <div className={`concept-art ${name}`} aria-hidden="true">
      <span className="shape one" />
      <span className="shape two" />
      <span className="shape three" />
      <span className="shape four" />
    </div>
  );
}
