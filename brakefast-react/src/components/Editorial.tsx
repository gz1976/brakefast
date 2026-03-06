interface Props {
  text: string;
}

export function Editorial({ text }: Props) {
  return (
    <section className="editorial" id="editorial">
      <div className="editorial-inner">
        <div className="editorial-label">🤖 Ottos Briefing</div>
        <p className="editorial-text">{text}</p>
        <p className="editorial-sig">— Otto, dein persönlicher Kurator</p>
      </div>
    </section>
  );
}
