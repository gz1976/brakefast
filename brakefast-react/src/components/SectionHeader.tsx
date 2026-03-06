interface Props {
  id: string;
  icon: string;
  title: string;
  tag?: { text: string; colorClass: string };
}

export function SectionHeader({ id, icon, title, tag }: Props) {
  return (
    <div className="section-header" id={id}>
      <h2>
        <span className="section-icon">{icon}</span> {title}
      </h2>
      <div className="line" />
      {tag && <span className={`section-tag ${tag.colorClass}`}>{tag.text}</span>}
    </div>
  );
}
